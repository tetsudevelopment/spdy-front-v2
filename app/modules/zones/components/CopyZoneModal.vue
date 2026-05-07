<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import { useActiveCommerceStore } from '~/stores/active-commerce.store'
import { useZonesStore } from '../store/zones.store'
import type { CommerceRef, Zone } from '../types/zone.types'

interface Props {
  visible: boolean
  zone: Zone | null
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  copied: [count: number]
}>()

const store = useZonesStore()
const activeCommerceStore = useActiveCommerceStore()

const selectedCommerceIds = ref<string[]>([])
const submitError = ref<string | null>(null)

const isBusy = computed<boolean>(() => store.isCopying)

const hasSelection = computed<boolean>(() => selectedCommerceIds.value.length > 0)

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      selectedCommerceIds.value = []
      submitError.value = null
    }
  },
)

function closeModal(): void {
  emit('update:visible', false)
}

async function handleCopy(): Promise<void> {
  if (!props.zone || !hasSelection.value) return
  submitError.value = null
  try {
    await store.copyZone(props.zone.id, selectedCommerceIds.value)
    emit('copied', selectedCommerceIds.value.length)
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo copiar la zona'
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '520px' }"
    header="Copiar zona a comercios"
    :pt="{
      root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
      header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text);' },
      footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <div v-if="props.zone" class="copy">
      <div v-if="submitError" class="alert">{{ submitError }}</div>

      <div class="zone-ref">
        <span
          class="zone-ref__dot"
          :style="{
            background: props.zone.color,
            borderColor: `color-mix(in srgb, ${props.zone.color} 50%, transparent)`,
          }"
        />
        <div class="zone-ref__info">
          <span class="zone-ref__name">{{ props.zone.name }}</span>
          <span class="zone-ref__kind">Zona global</span>
        </div>
      </div>

      <p class="hint">
        Se creará una copia privada de esta zona en cada comercio seleccionado.
        El KML, color y prioridad se replican tal cual; luego podrás ajustarlos
        en cada comercio.
      </p>

      <div class="field">
        <label class="field__label">Comercios destino <span class="field__req">*</span></label>
        <MultiSelect
          v-model="selectedCommerceIds"
          :options="[...activeCommerceStore.accessibleCommerces]"
          option-label="commerceName"
          option-value="commerceId"
          placeholder="Selecciona uno o más comercios"
          filter
          display="chip"
          :pt="{ root: { style: 'width: 100%;' } }"
        >
          <template #option="{ option }: { option: CommerceRef }">
            <div class="commerce-option">
              <i class="pi pi-building" aria-hidden="true" />
              <span>{{ option.commerceName }}</span>
            </div>
          </template>
        </MultiSelect>
      </div>
    </div>

    <template #footer>
      <div class="footer">
        <Button
          label="Cancelar"
          text
          severity="secondary"
          :disabled="isBusy"
          @click="closeModal"
        />
        <Button
          :label="`Copiar${hasSelection ? ` (${selectedCommerceIds.length})` : ''}`"
          icon="pi pi-copy"
          :disabled="!hasSelection"
          :loading="isBusy"
          @click="handleCopy"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.copy {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 6px;
}

.alert {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}

.zone-ref {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 9px;
}

.zone-ref__dot {
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  border: 2px solid;
  flex-shrink: 0;
}

.zone-ref__info {
  display: flex;
  flex-direction: column;
}

.zone-ref__name {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}

.zone-ref__kind {
  font-size: 11px;
  color: var(--color-brand);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-muted);
  line-height: 1.5;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 12px;
  color: var(--color-muted);
  font-weight: 500;
}

.field__req {
  color: var(--color-error);
}

.field :deep(.p-multiselect) {
  width: 100%;
}

.commerce-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.commerce-option i {
  color: var(--color-muted);
  font-size: 12px;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
