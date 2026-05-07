<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import { useScheduleStore } from '../store/schedule.store'
import type { CreateMeshDto } from '../types/schedule.types'
import { getWeekRange, toIsoDate } from '../utils/schedule.utils'

interface Props {
  visible: boolean
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  created: [payload: { meshId: string; warnings: string[] }]
}>()

const store = useScheduleStore()

const isBusy = computed<boolean>(() => store.isSaving)

interface FormState {
  name: string
  weekRange: Date[] | null
  zoneId: string | null
  templateId: string | null
}

function defaultWeekRange(): Date[] {
  const { start, end } = getWeekRange(new Date())
  return [start, end]
}

// Bloquea semanas pasadas — el usuario sólo puede crear mallas para la
// semana actual o futuras. El min es el domingo de la semana en curso.
const minSelectableDate = computed<Date>(() => {
  const { start } = getWeekRange(new Date())
  return start
})

function emptyForm(): FormState {
  return {
    name: '',
    weekRange: defaultWeekRange(),
    zoneId: null,
    templateId: null,
  }
}

const form = reactive<FormState>(emptyForm())
const submitError = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<keyof FormState, string>>>({})

// Snap del DatePicker a la semana completa (domingo-sábado).
function onWeekChange(value: unknown): void {
  if (!value) {
    form.weekRange = null
    return
  }
  const arr = Array.isArray(value) ? value : [value]
  const first = arr[0]
  if (!(first instanceof Date)) {
    form.weekRange = null
    return
  }
  const { start, end } = getWeekRange(first)
  form.weekRange = [start, end]
}

const schema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es requerido').max(120),
    weekRange: z.array(z.date()).length(2).nullable(),
    zoneId: z.string().min(1, 'Debes seleccionar una zona'),
    templateId: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.weekRange || data.weekRange.length !== 2) {
      ctx.addIssue({
        path: ['weekRange'],
        code: 'custom',
        message: 'Selecciona una semana',
      })
      return
    }
    const [start, end] = data.weekRange
    if (!start || !end || end.getTime() < start.getTime()) {
      ctx.addIssue({
        path: ['weekRange'],
        code: 'custom',
        message: 'Rango de fechas inválido',
      })
    }
  })

// Opciones de zona con "pill" y commerce — el template del Select las pinta.
interface ZoneOption {
  label: string
  value: string
  color: string
  isGlobal: boolean
  commerceName: string | null
}

const zoneOptions = computed<ZoneOption[]>(() => {
  return store.availableZones.map((z) => ({
    label: z.name,
    value: z.id,
    color: z.color,
    isGlobal: z.isGlobal,
    commerceName: z.commerceId
      ? (store.commerceNameById.get(z.commerceId) ?? null)
      : null,
  }))
})

// Los modelos disponibles dependen del commerce que aparezca detrás de la
// zona elegida — un modelo pertenece a un commerce. Si la zona es global, no
// hay modelos aplicables (sería ambiguo de qué commerce).
const templateOptions = computed(() => {
  if (!form.zoneId) return []
  const zone = store.availableZones.find((z) => z.id === form.zoneId)
  if (!zone || zone.isGlobal || !zone.commerceId) return []
  const commerceId = zone.commerceId
  return store.templates
    .filter((t) => t.commerceId === commerceId)
    .map((t) => ({ label: t.name, value: t.id, shiftCount: t.shifts.length }))
})

function resetForm(): void {
  Object.assign(form, emptyForm())
  submitError.value = null
  fieldErrors.value = {}
}

watch(
  () => props.visible,
  async (isVisible) => {
    if (!isVisible) return
    resetForm()
    if (store.availableZones.length === 0) {
      await store.fetchAvailableZones()
    }
    if (store.templates.length === 0) {
      await store.fetchAllTemplates()
    }
  },
)

// Si el usuario cambia la zona, limpiamos el templateId — el catálogo de
// modelos depende del commerce de la zona y puede dejar de aplicar.
watch(
  () => form.zoneId,
  () => { form.templateId = null },
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
  const parsed = schema.safeParse(form)
  if (!parsed.success) {
    applyZodErrors(parsed.error)
    return
  }
  const data = parsed.data
  if (!data.weekRange) return
  const [start, end] = data.weekRange
  if (!start || !end) return

  const dto: CreateMeshDto = {
    name: data.name,
    zoneId: data.zoneId,
    weekStart: toIsoDate(start),
    weekEnd: toIsoDate(end),
  }
  if (data.templateId) dto.fromTemplateId = data.templateId

  try {
    const { mesh, warnings } = await store.createMesh(dto)
    emit('created', { meshId: mesh.id, warnings })
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo crear la malla'
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '640px' }"
    header="Nueva malla programada"
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
        <label class="field__label">Nombre <span class="field__req">*</span></label>
        <InputText
          v-model="form.name"
          placeholder="Ej: Malla semana 14 — Bogotá Norte"
          :class="{ 'field__input--error': fieldErrors.name }"
        />
        <span v-if="fieldErrors.name" class="field__error">{{ fieldErrors.name }}</span>
      </div>

      <div class="field">
        <label class="field__label">Zona <span class="field__req">*</span></label>
        <Select
          v-model="form.zoneId"
          :options="zoneOptions"
          option-label="label"
          option-value="value"
          filter
          placeholder="Selecciona una zona"
          :class="{ 'field__input--error': fieldErrors.zoneId }"
        >
          <template #option="{ option }: { option: ZoneOption }">
            <div class="zone-opt">
              <span class="zone-opt__dot" :style="{ background: option.color }" />
              <span class="zone-opt__name">{{ option.label }}</span>
              <span
                class="zone-opt__pill"
                :class="option.isGlobal ? 'zone-opt__pill--global' : 'zone-opt__pill--private'"
              >{{ option.isGlobal ? 'Global' : 'Privada' }}</span>
              <span v-if="option.commerceName" class="zone-opt__commerce">
                · {{ option.commerceName }}
              </span>
            </div>
          </template>
          <template #value="{ value }: { value: string | null }">
            <template v-if="value">
              <span class="zone-value">
                <span
                  class="zone-value__dot"
                  :style="{
                    background: zoneOptions.find((z) => z.value === value)?.color ?? 'transparent',
                  }"
                />
                {{ zoneOptions.find((z) => z.value === value)?.label ?? '—' }}
              </span>
            </template>
            <span v-else class="zone-value zone-value--placeholder">Selecciona una zona</span>
          </template>
        </Select>
        <span v-if="fieldErrors.zoneId" class="field__error">{{ fieldErrors.zoneId }}</span>
      </div>

      <div class="field">
        <label class="field__label">Semana <span class="field__req">*</span></label>
        <DatePicker
          :model-value="form.weekRange"
          selection-mode="range"
          :manual-input="false"
          :min-date="minSelectableDate"
          date-format="dd/mm/yy"
          placeholder="Selecciona una semana"
          show-icon
          :class="{ 'field__input--error': fieldErrors.weekRange }"
          @update:model-value="onWeekChange"
        />
        <span v-if="fieldErrors.weekRange" class="field__error">{{ fieldErrors.weekRange }}</span>
        <span v-else class="field__hint">
          Las mallas cubren una semana completa, de domingo a sábado.
        </span>
      </div>

      <div class="field">
        <label class="field__label">Basar en modelo (opcional)</label>
        <Select
          v-model="form.templateId"
          :options="templateOptions"
          option-label="label"
          option-value="value"
          :placeholder="templateOptions.length === 0
            ? 'No hay modelos aplicables para esta zona'
            : 'Arrancar sin modelo'"
          :disabled="templateOptions.length === 0"
          show-clear
        >
          <template #option="{ option }: { option: typeof templateOptions.value[number] }">
            <div class="tpl-opt">
              <i class="pi pi-th-large" aria-hidden="true" />
              <span class="tpl-opt__name">{{ option.label }}</span>
              <span class="tpl-opt__count">{{ option.shiftCount }} turnos</span>
            </div>
          </template>
        </Select>
        <span v-if="!form.zoneId" class="field__hint">
          Elige la zona primero — los modelos dependen del comercio al que pertenece la zona.
        </span>
      </div>

    </form>

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
          label="Crear malla"
          :loading="isBusy"
          @click="handleSubmit"
        />
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

.field__hint {
  font-size: 11px;
  color: var(--color-muted);
}

.field :deep(.p-inputtext),
.field :deep(.p-select),
.field :deep(.p-datepicker-input),
.field :deep(.p-datepicker) {
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

.zone-opt {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  width: 100%;
  min-width: 0;
}

.zone-opt__dot {
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.zone-opt__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.zone-opt__pill {
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  border: 1px solid transparent;
}

.zone-opt__pill--global {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-brand) 40%, transparent);
}

.zone-opt__pill--private {
  color: #60a5fa;
  background: color-mix(in srgb, #60a5fa 15%, transparent);
  border-color: color-mix(in srgb, #60a5fa 40%, transparent);
}

.zone-opt__commerce {
  font-size: 11px;
  color: var(--color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.zone-value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.zone-value__dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
}

.zone-value--placeholder {
  color: var(--color-muted);
}

.tpl-opt {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  width: 100%;
}

.tpl-opt i {
  color: var(--color-muted);
  font-size: 12px;
}

.tpl-opt__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-opt__count {
  font-size: 11px;
  color: var(--color-muted);
  font-weight: 600;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
