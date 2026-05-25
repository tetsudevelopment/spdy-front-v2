<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMonitoringStore } from '../store/monitoring.store'
import type { CreateOrderWithQuoteRequest } from '../types/quote.types'
import DeliveryRouteMap from './DeliveryRouteMap.vue'
import QuoteBreakdown from './QuoteBreakdown.vue'
import QuoteDegradedBanner from './QuoteDegradedBanner.vue'

// Props & emits
const props = defineProps<{
  visible: boolean
  commerceId: string
  pickupPdvId?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'created'): void
}>()

const store = useMonitoringStore()

// ── State machine ────────────────────────────────────────────────────────────
// idle → quoting → quoted → submitting → success | quote_error | submit_error
type ModalState = 'idle' | 'quoting' | 'quoted' | 'submitting' | 'success' | 'quote_error' | 'submit_error'
const state = ref<ModalState>('idle')

// ── Form fields ──────────────────────────────────────────────────────────────
const deliveryAddress = ref('')
const customerName = ref('')
const customerPhone = ref('')
const codAmountCents = ref(0)
const specialNotes = ref('')

const addressError = ref<string | null>(null)

// ── Computed ─────────────────────────────────────────────────────────────────
const isVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const quote = computed(() => store.lastQuote)

const canSubmit = computed(
  () => state.value === 'quoted' && customerName.value.trim().length > 0 && customerPhone.value.trim().length >= 7,
)

// ── Quote action ─────────────────────────────────────────────────────────────
async function handleGetQuote(): Promise<void> {
  const address = deliveryAddress.value.trim()
  if (!address) {
    addressError.value = 'Enter a delivery address'
    return
  }
  addressError.value = null
  state.value = 'quoting'

  const result = await store.quoteOrder(props.commerceId, {
    pickupPdvId: props.pickupPdvId,
    deliveryAddress: address,
  })

  if (result) {
    state.value = 'quoted'
  } else {
    state.value = 'quote_error'
  }
}

// ── Create action ─────────────────────────────────────────────────────────────
async function handleCreate(): Promise<void> {
  if (!canSubmit.value) return
  state.value = 'submitting'

  const body: CreateOrderWithQuoteRequest = {
    pickupPdvId: props.pickupPdvId,
    customerName: customerName.value.trim(),
    customerPhone: customerPhone.value.trim(),
    deliveryAddress: deliveryAddress.value.trim(),
    codAmountCents: codAmountCents.value,
    ...(specialNotes.value.trim() && { specialNotes: specialNotes.value.trim() }),
    ...(quote.value && {
      quote: { expectedTotalCents: quote.value.pricing.totalCents },
    }),
  }

  const order = await store.createOrder(props.commerceId, body)
  if (order) {
    state.value = 'success'
    emit('created')
    setTimeout(() => handleClose(), 1500)
  } else {
    state.value = 'submit_error'
  }
}

// ── Close ─────────────────────────────────────────────────────────────────────
function handleClose(): void {
  store.clearQuote()
  state.value = 'idle'
  deliveryAddress.value = ''
  customerName.value = ''
  customerPhone.value = ''
  codAmountCents.value = 0
  specialNotes.value = ''
  addressError.value = null
  emit('update:visible', false)
}

// Reset when dialog opens
watch(
  () => props.visible,
  (v) => {
    if (v) {
      store.clearQuote()
      state.value = 'idle'
    }
  },
)
</script>

<template>
  <Dialog
    v-model:visible="isVisible"
    modal
    header="Nueva entrega"
    :style="{ width: '640px', maxWidth: '95vw' }"
    @hide="handleClose"
  >
    <div class="space-y-4">
      <!-- Success state -->
      <div
        v-if="state === 'success'"
        class="flex flex-col items-center justify-center py-8 text-center"
      >
        <i class="pi pi-check-circle text-5xl text-green-500 mb-3" aria-hidden="true" />
        <p class="text-lg font-semibold text-gray-800">Order created successfully</p>
      </div>

      <template v-else>
        <!-- Address + quote section -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700" for="delivery-address">
            Delivery address *
          </label>
          <div class="flex gap-2">
            <InputText
              id="delivery-address"
              v-model="deliveryAddress"
              class="flex-1"
              placeholder="Enter full delivery address"
              :disabled="state === 'quoting' || state === 'submitting'"
              @keyup.enter="handleGetQuote"
            />
            <Button
              label="Get quote"
              :loading="state === 'quoting'"
              :disabled="state === 'submitting' || !deliveryAddress.trim()"
              @click="handleGetQuote"
            />
          </div>
          <p v-if="addressError" class="text-xs text-red-500">{{ addressError }}</p>
          <p v-if="state === 'quote_error'" class="text-xs text-red-500">
            {{ store.quoteError ?? 'Could not get quote. Please check the address.' }}
          </p>
        </div>

        <!-- Degraded banner -->
        <QuoteDegradedBanner v-if="quote?.degraded" />

        <!-- Quote breakdown + map -->
        <template v-if="quote">
          <QuoteBreakdown :quote="quote" />
          <DeliveryRouteMap
            :origin="quote.origin"
            :destination="quote.destination"
            :polyline="quote.polyline"
            :degraded="quote.degraded"
          />
        </template>

        <!-- Customer fields (visible once quoted) -->
        <template v-if="state === 'quoted' || state === 'submitting' || state === 'submit_error'">
          <div class="border-t pt-4 space-y-3">
            <h4 class="text-sm font-semibold text-gray-700">Customer information</h4>

            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="text-xs text-gray-600" for="customer-name">Name *</label>
                <InputText
                  id="customer-name"
                  v-model="customerName"
                  placeholder="Customer full name"
                  :disabled="state === 'submitting'"
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs text-gray-600" for="customer-phone">Phone *</label>
                <InputText
                  id="customer-phone"
                  v-model="customerPhone"
                  placeholder="e.g. 3001234567"
                  :disabled="state === 'submitting'"
                />
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-xs text-gray-600" for="special-notes">Notes</label>
              <Textarea
                id="special-notes"
                v-model="specialNotes"
                placeholder="Delivery instructions (optional)"
                :rows="2"
                :disabled="state === 'submitting'"
              />
            </div>

            <p v-if="state === 'submit_error'" class="text-xs text-red-500">
              {{ store.error ?? 'Failed to create order. Please try again.' }}
            </p>
          </div>
        </template>
      </template>
    </div>

    <!-- Footer -->
    <template #footer>
      <div class="flex justify-end gap-2">
        <Button
          label="Cancel"
          severity="secondary"
          text
          :disabled="state === 'submitting'"
          @click="handleClose"
        />
        <Button
          label="Confirm"
          :loading="state === 'submitting'"
          :disabled="!canSubmit"
          @click="handleCreate"
        />
      </div>
    </template>
  </Dialog>
</template>
