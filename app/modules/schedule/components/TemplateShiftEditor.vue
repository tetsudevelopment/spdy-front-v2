<script setup lang="ts">
import { computed } from 'vue'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import { useScheduleStore } from '../store/schedule.store'
import type { DayOfWeek, TemplateShift } from '../types/schedule.types'
import { DAYS, DAY_LABELS, isValidTimeRange } from '../utils/schedule.utils'

// Cada fila representa un turno base del modelo (sin rider). El padre maneja
// el array completo vía v-model — esta forma es más simple que emitir mutaciones
// individuales y funciona bien con la validación Zod del padre.
type TemplateShiftDraft = Omit<TemplateShift, 'id'>

interface Props {
  modelValue: TemplateShiftDraft[]
  // Errores por fila + campo, indexado por posición. Ej: errors[2].endTime
  errors?: Array<Partial<Record<keyof TemplateShiftDraft, string>>>
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  errors: () => [],
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: TemplateShiftDraft[]]
}>()

const store = useScheduleStore()

const DAY_OPTIONS = DAYS.map((d) => ({ label: DAY_LABELS[d], value: d }))

const zoneOptions = computed(() =>
  store.zoneSummaries.map((z) => ({ label: z.name, value: z.id, color: z.color })),
)

function emitUpdate(rows: TemplateShiftDraft[]): void {
  emit('update:modelValue', rows)
}

function updateRow<K extends keyof TemplateShiftDraft>(
  index: number,
  key: K,
  value: TemplateShiftDraft[K],
): void {
  const next = props.modelValue.map((row, i) =>
    i === index ? { ...row, [key]: value } : row,
  )
  emitUpdate(next)
}

function addRow(): void {
  const draft: TemplateShiftDraft = {
    dayOfWeek: 'monday',
    startTime: '08:00',
    endTime: '16:00',
  }
  emitUpdate([...props.modelValue, draft])
}

function removeRow(index: number): void {
  emitUpdate(props.modelValue.filter((_, i) => i !== index))
}

function rowError(
  index: number,
  key: keyof TemplateShiftDraft,
): string | undefined {
  return props.errors[index]?.[key]
}

function rowInvalid(index: number): boolean {
  const row = props.modelValue[index]
  if (!row) return false
  return !isValidTimeRange(row.startTime, row.endTime)
}

// Bridge entre el DatePicker (Date) y el modelo (string 'HH:mm').
// Mantenemos 'HH:mm' como formato de almacenamiento — sólo cambia la UX.
function timeStringToDate(time: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return null
  const d = new Date()
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d
}

function dateToTimeString(d: Date | Date[] | null | undefined): string {
  if (!d || Array.isArray(d)) return ''
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}
</script>

<template>
  <div class="editor">
    <div v-if="props.modelValue.length === 0" class="empty">
      <p>Aún no hay turnos en este modelo.</p>
      <p class="empty__hint">
        Agrega los turnos base del modelo. Los riders se asignarán después al
        crear la malla programada.
      </p>
    </div>

    <div v-else class="rows">
      <div class="rows__header">
        <div class="rows__cell">Día</div>
        <div class="rows__cell">Inicio</div>
        <div class="rows__cell">Fin</div>
        <div class="rows__cell">Zona</div>
        <div class="rows__cell rows__cell--actions" />
      </div>

      <div
        v-for="(row, i) in props.modelValue"
        :key="i"
        class="row"
        :class="{ 'row--invalid': rowInvalid(i) }"
      >
        <Select
          :model-value="row.dayOfWeek"
          :options="DAY_OPTIONS"
          option-label="label"
          option-value="value"
          :disabled="props.disabled"
          :pt="{ root: { style: 'width: 100%;' } }"
          @update:model-value="(v: DayOfWeek) => updateRow(i, 'dayOfWeek', v)"
        />

        <DatePicker
          :model-value="timeStringToDate(row.startTime)"
          time-only
          hour-format="12"
          :step-minute="15"
          show-icon
          icon-display="input"
          placeholder="08:00 a. m."
          :disabled="props.disabled"
          :class="{ 'field--error': rowError(i, 'startTime') }"
          @update:model-value="(v: Date | Date[] | null) => updateRow(i, 'startTime', dateToTimeString(v))"
        />

        <DatePicker
          :model-value="timeStringToDate(row.endTime)"
          time-only
          hour-format="12"
          :step-minute="15"
          show-icon
          icon-display="input"
          placeholder="04:00 p. m."
          :disabled="props.disabled"
          :class="{ 'field--error': rowError(i, 'endTime') || rowInvalid(i) }"
          @update:model-value="(v: Date | Date[] | null) => updateRow(i, 'endTime', dateToTimeString(v))"
        />

        <Select
          :model-value="row.zoneId ?? null"
          :options="zoneOptions"
          option-label="label"
          option-value="value"
          placeholder="Sin zona"
          show-clear
          :disabled="props.disabled"
          :pt="{ root: { style: 'width: 100%;' } }"
          @update:model-value="(v: string | null) => updateRow(i, 'zoneId', v ?? undefined)"
        >
          <template #option="{ option }: { option: typeof zoneOptions.value[number] }">
            <div class="zone-opt">
              <span class="zone-opt__dot" :style="{ background: option.color }" />
              <span>{{ option.label }}</span>
            </div>
          </template>
        </Select>

        <Button
          icon="pi pi-trash"
          text
          rounded
          severity="danger"
          aria-label="Quitar turno"
          :disabled="props.disabled"
          @click="removeRow(i)"
        />
      </div>
    </div>

    <button
      type="button"
      class="add-row"
      :disabled="props.disabled"
      @click="addRow"
    >
      <i class="pi pi-plus" aria-hidden="true" />
      Añadir turno base
    </button>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty {
  padding: 28px 18px;
  text-align: center;
  background: var(--color-surface);
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  color: var(--color-muted);
}

.empty p {
  margin: 0;
}

.empty__hint {
  margin-top: 6px;
  font-size: 12px;
}

.rows {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
}

.rows__header,
.row {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr 0.9fr 1.4fr 40px;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
}

.rows__header {
  padding: 10px 12px 6px;
  border-bottom: 1px solid var(--color-border);
}

.rows__cell {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  color: var(--color-muted);
}

.rows__cell--actions {
  width: 40px;
}

.row {
  border-top: 1px solid var(--color-border);
}

.row:first-of-type {
  border-top: none;
}

.row--invalid {
  background: color-mix(in srgb, var(--color-error) 6%, transparent);
}

.row :deep(.p-inputtext),
.row :deep(.p-select),
.row :deep(.p-datepicker),
.row :deep(.p-datepicker-input) {
  width: 100%;
}

.field--error :deep(.p-inputtext),
.field--error :deep(.p-datepicker-input) {
  border-color: var(--color-error) !important;
}

.zone-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.zone-opt__dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.add-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  background: transparent;
  border: 1px dashed var(--color-border);
  border-radius: 9px;
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.add-row:hover:not(:disabled) {
  border-color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 6%, transparent);
}

.add-row:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .rows__header { display: none; }
  .row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
