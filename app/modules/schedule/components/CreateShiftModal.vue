<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import { useScheduleStore } from '../store/schedule.store'
import type { Rider } from '~/modules/riders/types/rider.types'
import type {
  CreateMeshShiftDto,
  DayOfWeek,
  MeshShift,
  UpdateMeshShiftDto,
} from '../types/schedule.types'
import {
  DAYS,
  DAY_LABELS,
  isValidTimeRange,
  shiftsOverlap,
} from '../utils/schedule.utils'

interface Props {
  visible: boolean
  meshId: string | null
  // zoneId heredada de la malla — los turnos nuevos lo toman automáticamente.
  // Al editar un turno preservamos su zoneId original (puede diferir del de
  // la malla si la zona cambió después de crear el turno).
  meshZoneId?: string | null
  shift?: MeshShift | null
  defaultDay?: DayOfWeek | null
}
const props = withDefaults(defineProps<Props>(), {
  meshZoneId: null,
  shift: null,
  defaultDay: null,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  created: [warnings: string[]]
  updated: [warnings: string[]]
  deleted: []
}>()

const store = useScheduleStore()

const isEditMode = computed<boolean>(() => props.shift !== null)
const modalTitle = computed<string>(() =>
  isEditMode.value ? 'Editar turno' : 'Nuevo turno',
)

// El Select de día se oculta siempre que el día venga determinado por el
// contexto, evitando bugs de migración entre días:
//   - Edición: el día queda fijo al del shift (cambiarlo desde un modal
//     abierto en el contexto de un día expandido genera incoherencias).
//   - Creación contextual ("+ Añadir turno en {día}"): el día está implícito
//     por el botón que abrió el modal.
// Solo se muestra en creación desde topbar (defaultDay null + create mode),
// donde el usuario sí elige libremente.
const hideDayField = computed<boolean>(
  () => isEditMode.value || props.defaultDay !== null,
)
const submitLabel = computed<string>(() =>
  isEditMode.value ? 'Guardar cambios' : 'Crear turno',
)
const isBusy = computed<boolean>(() => store.isSaving)

const DAY_OPTIONS = DAYS.map((d) => ({ label: DAY_LABELS[d], value: d }))

interface FormState {
  riderId: string | null
  dayOfWeek: DayOfWeek | null
  startTime: string
  endTime: string
}

// El form pide solo lo mínimo operativo: rider + horario + día. La zona viene
// heredada de la malla; PdV y notas quedaron fuera por decisión de producto
// (`notes` y `pdv` se mantienen en el response type por compat — viejos
// turnos podrían traerlos, los respetamos en lectura).
function emptyForm(): FormState {
  return {
    riderId: null,
    dayOfWeek: props.defaultDay ?? 'monday',
    startTime: '08:00',
    endTime: '16:00',
  }
}

function formFromShift(s: MeshShift): FormState {
  return {
    riderId: s.riderId,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
  }
}

const form = reactive<FormState>(emptyForm())
const submitError = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<keyof FormState, string>>>({})

const schema = z
  .object({
    riderId: z.string().min(1, 'Selecciona un domiciliario'),
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], {
      errorMap: () => ({ message: 'Selecciona un día' }),
    }),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido (HH:mm)'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido (HH:mm)'),
  })
  .superRefine((data, ctx) => {
    if (!isValidTimeRange(data.startTime, data.endTime)) {
      ctx.addIssue({
        path: ['endTime'],
        code: 'custom',
        message: 'La hora de fin debe ser mayor a la de inicio',
      })
    }
  })

// Sólo los riders con la zona de la malla asignada pueden tomar turnos.
// En edición preservamos el rider original aunque ya no esté en la zona —
// la asignación pudo cambiar después de crear el turno y no queremos que
// "desaparezca" del select dejando el campo vacío.
const eligibleRiders = computed<Rider[]>(() => {
  const base = props.meshZoneId
    ? store.riders.filter((r) => r.zones?.some((z) => z.id === props.meshZoneId))
    : store.riders
  if (props.shift && !base.some((r) => r.id === props.shift?.riderId)) {
    const original = store.riders.find((r) => r.id === props.shift?.riderId)
    if (original) return [...base, original]
  }
  return base
})

const riderOptions = computed(() =>
  eligibleRiders.value.map((r) => ({
    label: r.fullName,
    value: r.id,
    photoUrl: r.photoUrl,
    vehicleType: r.vehicleType,
  })),
)

const noEligibleRidersHint = computed<string | null>(() => {
  if (!props.meshZoneId) return null
  if (eligibleRiders.value.length > 0) return null
  return 'No hay domiciliarios asignados a esta zona. Asigna riders a la zona desde el módulo de Domiciliarios.'
})

// Bridge entre el DatePicker (Date) y el form (string 'HH:mm').
// El DatePicker time-only necesita Date; el resto del flujo (validación Zod,
// DTO, store, backend) trabaja con 'HH:mm'.
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

const overlapWarning = computed<string | null>(() => {
  if (!form.riderId || !form.dayOfWeek) return null
  if (!isValidTimeRange(form.startTime, form.endTime)) return null
  const currentShifts = store.currentMesh?.shifts ?? []
  const existing = currentShifts.filter(
    (s) => s.riderId === form.riderId && s.id !== props.shift?.id,
  )
  const candidate = {
    dayOfWeek: form.dayOfWeek,
    startTime: form.startTime,
    endTime: form.endTime,
  }
  const collides = existing.find((s) => shiftsOverlap(s, candidate))
  if (!collides) return null
  return `Este turno se solapa con otro del mismo domiciliario el ${DAY_LABELS[collides.dayOfWeek]} (${collides.startTime}–${collides.endTime}).`
})

function resetForm(): void {
  if (props.shift) {
    Object.assign(form, formFromShift(props.shift))
  } else {
    Object.assign(form, emptyForm())
  }
  submitError.value = null
  fieldErrors.value = {}
}

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) resetForm()
  },
)

function closeModal(): void {
  emit('update:visible', false)
}

function applyZodErrors(err: z.ZodError): void {
  const errors: Partial<Record<keyof FormState, string>> = {}
  for (const issue of err.issues) {
    const key = issue.path[0]
    if (typeof key === 'string') {
      errors[key as keyof FormState] = issue.message
    }
  }
  fieldErrors.value = errors
}

async function handleSubmit(): Promise<void> {
  submitError.value = null
  fieldErrors.value = {}

  if (!props.meshId) {
    submitError.value = 'No hay una malla activa'
    return
  }

  const parsed = schema.safeParse(form)
  if (!parsed.success) {
    applyZodErrors(parsed.error)
    return
  }
  const data = parsed.data

  if (isEditMode.value && props.shift) {
    await handleUpdate(data)
  } else {
    await handleCreate(data)
  }
}

async function handleCreate(data: z.infer<typeof schema>): Promise<void> {
  if (!props.meshId) return
  const dto: CreateMeshShiftDto = {
    riderId: data.riderId,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
  }
  // La zona se hereda automáticamente de la malla — no es configurable aquí.
  if (props.meshZoneId) dto.zoneId = props.meshZoneId

  try {
    const { warnings } = await store.addShift(props.meshId, dto)
    emit('created', warnings)
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo crear el turno'
  }
}

async function handleUpdate(data: z.infer<typeof schema>): Promise<void> {
  if (!props.shift || !props.meshId) return
  const dto: UpdateMeshShiftDto = {}
  const current = props.shift

  if (data.riderId !== current.riderId) dto.riderId = data.riderId
  if (data.dayOfWeek !== current.dayOfWeek) dto.dayOfWeek = data.dayOfWeek
  if (data.startTime !== current.startTime) dto.startTime = data.startTime
  if (data.endTime !== current.endTime) dto.endTime = data.endTime
  // En edición preservamos la zona y las notas originales del turno — aunque
  // no se muestren en el form. La zona puede diferir de la malla; las notas
  // pueden venir de turnos viejos creados antes de retirar el campo.

  try {
    const { warnings } = await store.updateShift(props.meshId, current.id, dto)
    emit('updated', warnings)
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo actualizar el turno'
  }
}

async function handleDelete(): Promise<void> {
  if (!props.shift || !props.meshId) return
  if (!confirm('¿Eliminar este turno? Esta acción no se puede deshacer.')) return
  try {
    await store.removeShift(props.meshId, props.shift.id)
    emit('deleted')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo eliminar el turno'
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '620px' }"
    :header="modalTitle"
    :pt="{
      root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
      header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text);' },
      footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <form class="form" @submit.prevent="handleSubmit">
      <div v-if="submitError" class="alert alert--error">{{ submitError }}</div>

      <div class="field">
        <label class="field__label">Domiciliario <span class="field__req">*</span></label>
        <Select
          v-model="form.riderId"
          :options="riderOptions"
          option-label="label"
          option-value="value"
          filter
          placeholder="Busca por nombre"
          :empty-message="noEligibleRidersHint ?? 'Sin domiciliarios disponibles'"
          :empty-filter-message="noEligibleRidersHint ?? 'Sin coincidencias'"
          :class="{ 'field__input--error': fieldErrors.riderId }"
        >
          <template #option="{ option }: { option: typeof riderOptions.value[number] }">
            <div class="rider-opt">
              <span class="rider-opt__avatar">
                <img v-if="option.photoUrl" :src="option.photoUrl" :alt="option.label" />
                <span v-else class="rider-opt__initials">
                  {{ option.label.charAt(0).toUpperCase() }}
                </span>
              </span>
              <span class="rider-opt__name">{{ option.label }}</span>
              <span class="rider-opt__vehicle">{{ option.vehicleType }}</span>
            </div>
          </template>
          <template #empty>
            <div class="rider-empty">
              <i class="pi pi-users" aria-hidden="true" />
              <span>{{ noEligibleRidersHint ?? 'Sin domiciliarios disponibles' }}</span>
            </div>
          </template>
        </Select>
        <span v-if="fieldErrors.riderId" class="field__error">{{ fieldErrors.riderId }}</span>
        <span v-else-if="noEligibleRidersHint" class="field__hint">{{ noEligibleRidersHint }}</span>
      </div>

      <div class="row" :class="{ 'row--no-day': hideDayField }">
        <div v-if="!hideDayField" class="field">
          <label class="field__label">Día <span class="field__req">*</span></label>
          <Select
            v-model="form.dayOfWeek"
            :options="DAY_OPTIONS"
            option-label="label"
            option-value="value"
            placeholder="Selecciona un día"
            :class="{ 'field__input--error': fieldErrors.dayOfWeek }"
          />
          <span v-if="fieldErrors.dayOfWeek" class="field__error">{{ fieldErrors.dayOfWeek }}</span>
        </div>

        <div class="field">
          <label class="field__label">Hora inicio <span class="field__req">*</span></label>
          <DatePicker
            :model-value="timeStringToDate(form.startTime)"
            time-only
            hour-format="12"
            :step-minute="15"
            show-icon
            icon-display="input"
            placeholder="08:00 a. m."
            :class="{ 'field__input--error': fieldErrors.startTime }"
            @update:model-value="(v: Date | Date[] | null) => { form.startTime = dateToTimeString(v) }"
          />
          <span v-if="fieldErrors.startTime" class="field__error">{{ fieldErrors.startTime }}</span>
        </div>

        <div class="field">
          <label class="field__label">Hora fin <span class="field__req">*</span></label>
          <DatePicker
            :model-value="timeStringToDate(form.endTime)"
            time-only
            hour-format="12"
            :step-minute="15"
            show-icon
            icon-display="input"
            placeholder="04:00 p. m."
            :class="{ 'field__input--error': fieldErrors.endTime }"
            @update:model-value="(v: Date | Date[] | null) => { form.endTime = dateToTimeString(v) }"
          />
          <span v-if="fieldErrors.endTime" class="field__error">{{ fieldErrors.endTime }}</span>
        </div>
      </div>

      <div v-if="overlapWarning" class="alert alert--warn">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        <span>{{ overlapWarning }}</span>
      </div>
    </form>

    <template #footer>
      <div class="footer">
        <Button
          v-if="isEditMode"
          label="Eliminar"
          icon="pi pi-trash"
          text
          severity="danger"
          :disabled="isBusy"
          @click="handleDelete"
        />
        <div class="footer__right">
          <Button
            label="Cancelar"
            text
            severity="secondary"
            :disabled="isBusy"
            @click="closeModal"
          />
          <Button
            :label="submitLabel"
            :loading="isBusy"
            @click="handleSubmit"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 6px;
}

.alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 12px;
  line-height: 1.45;
  border: 1px solid transparent;
}

.alert--error {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-error) 45%, transparent);
}

.alert--warn {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-warning) 40%, transparent);
}

.alert--warn i {
  font-size: 13px;
  margin-top: 1px;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

/* Cuando el día queda implícito (se abrió desde "+ Añadir turno en {día}"),
   el row colapsa a 2 columnas para las horas. */
.row--no-day {
  grid-template-columns: 1fr 1fr;
}

@media (max-width: 560px) {
  .row,
  .row--no-day {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field__label {
  font-size: 12px;
  color: var(--color-muted);
  font-weight: 500;
}

.field__req {
  color: var(--color-error);
}

.field :deep(.p-inputtext),
.field :deep(.p-textarea),
.field :deep(.p-select),
.field :deep(.p-datepicker),
.field :deep(.p-datepicker-input) {
  width: 100%;
}

.field__input--error :deep(.p-inputtext),
.field__input--error :deep(.p-select),
.field__input--error :deep(.p-datepicker-input) {
  border-color: var(--color-error) !important;
}

.field__error {
  font-size: 11px;
  color: var(--color-error);
}

.field__hint {
  font-size: 11px;
  color: var(--color-muted);
  line-height: 1.4;
}

.rider-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  font-size: 12px;
  color: var(--color-muted);
  line-height: 1.45;
}

.rider-empty i {
  font-size: 14px;
  color: var(--color-muted);
  flex-shrink: 0;
}

.rider-opt {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  width: 100%;
}

.rider-opt__avatar {
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-brand) 12%, transparent);
  color: var(--color-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.rider-opt__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rider-opt__initials {
  line-height: 1;
}

.rider-opt__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rider-opt__vehicle {
  font-size: 10px;
  color: var(--color-muted);
  text-transform: capitalize;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}

.footer__right {
  display: flex;
  gap: 10px;
  margin-left: auto;
}
</style>
