<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import { usePdvStore } from '../store/pdv.store'
import { PdvService } from '../services/pdv.service'
import { humanizeAuthError } from '~/utils/error.utils'
import type { PdvZoneRef, PointOfSale, ZoneSummary } from '../types/pdv.types'

interface Props {
  visible: boolean
  pdv: PointOfSale | null
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

const store = usePdvStore()

const availableZones = ref<ZoneSummary[]>([])
const isLoadingZones = ref<boolean>(false)
const isSaving = ref<boolean>(false)
const submitError = ref<string | null>(null)

// IDs seleccionados actualmente en el MultiSelect — arranca con las zonas
// ya asignadas al PdV. El listado de PdVs puede no incluir zones, así que
// siempre refrescamos el detalle al abrir el modal.
const detailZones = ref<PdvZoneRef[] | null>(null)
const selectedZoneIds = ref<string[]>([])

const currentAssigned = computed<PdvZoneRef[]>(() => {
  if (detailZones.value !== null) return detailZones.value
  return props.pdv?.zones ?? []
})

const hasChanges = computed<boolean>(() => {
  const current = new Set(currentAssigned.value.map((z) => z.id))
  const next = new Set(selectedZoneIds.value)
  if (current.size !== next.size) return true
  for (const id of current) if (!next.has(id)) return true
  return false
})

async function loadZones(): Promise<void> {
  // Usamos el commerceId del propio PdV — siempre presente en el tipo y
  // correcto incluso cuando el SA está en "Todos los comercios" (cada PdV
  // pertenece a su tenant, independiente del sidebar).
  if (!props.pdv) return
  isLoadingZones.value = true
  submitError.value = null
  try {
    const list = await PdvService.listZonesForCommerce(props.pdv.commerceId)
    availableZones.value = list.filter((z) => z.isActive)
  } catch (e) {
    submitError.value = humanizeAuthError(e)
  } finally {
    isLoadingZones.value = false
  }
}

async function hydrateDetail(): Promise<void> {
  if (!props.pdv) return
  // Refrescamos el detalle para tener la lista fiable de zones — el endpoint
  // de listado puede devolverla parcial o vacía. Pasamos commerceId explícito
  // por si el PdV no está aún en el listado del store (ej: SA en "Todos" que
  // todavía no abrió el commerce dueño).
  const fresh = await store.fetchById(props.pdv.id, { commerceId: props.pdv.commerceId })
  detailZones.value = fresh?.zones ?? []
  selectedZoneIds.value = (fresh?.zones ?? []).map((z) => z.id)
}

watch(
  () => props.visible,
  async (isVisible) => {
    if (!isVisible) {
      detailZones.value = null
      selectedZoneIds.value = []
      return
    }
    submitError.value = null
    await Promise.all([hydrateDetail(), loadZones()])
  },
)

function closeModal(): void {
  emit('update:visible', false)
}

async function removeAssigned(zoneId: string): Promise<void> {
  if (!props.pdv) return
  submitError.value = null
  try {
    await store.removeZone(props.pdv.id, zoneId)
    selectedZoneIds.value = selectedZoneIds.value.filter((id) => id !== zoneId)
    if (detailZones.value) {
      detailZones.value = detailZones.value.filter((z) => z.id !== zoneId)
    }
    emit('saved')
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo quitar la zona'
  }
}

async function handleSave(): Promise<void> {
  if (!props.pdv) return
  if (!hasChanges.value) {
    closeModal()
    return
  }
  isSaving.value = true
  submitError.value = null
  try {
    await store.assignZones(props.pdv.id, selectedZoneIds.value)
    emit('saved')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudieron guardar las zonas'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '560px' }"
    header="Asignar zonas"
    :pt="{
      root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
      header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text);' },
      footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <div v-if="props.pdv" class="zones">
      <div v-if="submitError" class="alert">{{ submitError }}</div>

      <div class="pdv-ref">
        <span class="pdv-ref__label">Punto de venta</span>
        <span class="pdv-ref__name">{{ props.pdv.name }}</span>
      </div>

      <section v-if="currentAssigned.length > 0" class="current">
        <h3 class="section-title">Zonas asignadas</h3>
        <div class="chips">
          <span
            v-for="z in currentAssigned"
            :key="z.id"
            class="chip"
            :style="{
              color: z.color,
              background: `color-mix(in srgb, ${z.color} 15%, transparent)`,
              borderColor: `color-mix(in srgb, ${z.color} 40%, transparent)`,
            }"
          >
            {{ z.name }}
            <button
              type="button"
              class="chip__remove"
              aria-label="Quitar zona"
              :style="{ color: z.color }"
              @click="removeAssigned(z.id)"
            >
              <i class="pi pi-times" aria-hidden="true" />
            </button>
          </span>
        </div>
      </section>
      <section v-else class="current current--empty">
        <h3 class="section-title">Zonas asignadas</h3>
        <p class="muted">Este PdV aún no tiene zonas.</p>
      </section>

      <section class="picker">
        <h3 class="section-title">Seleccionar zonas</h3>
        <MultiSelect
          v-model="selectedZoneIds"
          :options="availableZones"
          option-label="name"
          option-value="id"
          :loading="isLoadingZones"
          placeholder="Elige zonas para asignar"
          filter
          display="chip"
          :pt="{
            root: { style: 'width: 100%; background: transparent;' },
          }"
        >
          <template #option="{ option }: { option: ZoneSummary }">
            <div class="zone-option">
              <span
                class="zone-option__dot"
                :style="{ background: option.color }"
              />
              <span>{{ option.name }}</span>
            </div>
          </template>
        </MultiSelect>
        <p class="hint">
          Al guardar, se asignarán las nuevas y se removerán las que ya no estén seleccionadas.
        </p>
      </section>
    </div>

    <template #footer>
      <div class="footer">
        <Button
          label="Cancelar"
          text
          severity="secondary"
          :disabled="isSaving"
          @click="closeModal"
        />
        <Button
          label="Guardar"
          :loading="isSaving"
          :disabled="!hasChanges"
          @click="handleSave"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.zones {
  display: flex;
  flex-direction: column;
  gap: 18px;
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

.pdv-ref {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pdv-ref__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-muted);
  font-weight: 700;
}

.pdv-ref__name {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
}

.section-title {
  margin: 0 0 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-muted);
  font-weight: 700;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 10px;
  border-radius: 9999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.chip__remove {
  background: transparent;
  border: none;
  cursor: pointer;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  padding: 0;
  opacity: 0.7;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.chip__remove:hover {
  opacity: 1;
  background: color-mix(in srgb, currentColor 20%, transparent);
}

.current--empty .muted {
  font-size: 12px;
  color: var(--color-muted);
  margin: 0;
}

.picker :deep(.p-multiselect) {
  width: 100%;
}

.zone-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.zone-option__dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--color-muted);
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
