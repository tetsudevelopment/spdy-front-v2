<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useAuth } from '~/composables/useAuth'
import { useAppToast } from '~/composables/useToast'
import { useCommerceStore } from '~/modules/commerce/store/commerce.store'
import { useScheduleStore } from '~/modules/schedule/store/schedule.store'
import TemplateShiftEditor from '~/modules/schedule/components/TemplateShiftEditor.vue'
import { isValidTimeRange } from '~/modules/schedule/utils/schedule.utils'
import type {
  CreateTemplateDto,
  TemplateShift,
} from '~/modules/schedule/types/schedule.types'

definePageMeta({
  layout: 'default',
  allowedRoles: ['SuperAdmin', 'CommerceAdmin', 'Supervisor'],
})

interface CommerceOption {
  commerceId: string
  commerceName: string
}

const router = useRouter()
const { user: authUser } = useAuth()
const toast = useAppToast()
const commerceStore = useCommerceStore()
const scheduleStore = useScheduleStore()

type TemplateShiftDraft = Omit<TemplateShift, 'id'>

interface FormState {
  commerceId: string | null
  name: string
  description: string
  shifts: TemplateShiftDraft[]
}

const form = reactive<FormState>({
  commerceId: null,
  name: '',
  description: '',
  shifts: [],
})

const submitError = ref<string | null>(null)
const nameError = ref<string | null>(null)
const commerceError = ref<string | null>(null)
const shiftErrors = ref<Array<Partial<Record<keyof TemplateShiftDraft, string>>>>([])
const isSaving = computed<boolean>(() => scheduleStore.isSaving)

const commerceOptions = computed<CommerceOption[]>(
  () => scheduleStore.accessibleCommerces,
)

const showCommerceSelector = computed<boolean>(
  () => commerceOptions.value.length > 1,
)

const schema = z.object({
  commerceId: z.string().min(1, 'Selecciona un comercio'),
  name: z.string().trim().min(1, 'El nombre es requerido').max(120),
  description: z.string().max(500).optional(),
  shifts: z.array(
    z.object({
      dayOfWeek: z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']),
      startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido'),
      endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido'),
      zoneId: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
})

async function bootstrap(): Promise<void> {
  let commerces: CommerceOption[] = []
  if (authUser.value?.role === 'SuperAdmin') {
    if (commerceStore.commerces.length === 0) await commerceStore.fetchCommerces()
    commerces = commerceStore.commerces.map((c) => ({
      commerceId: c.id,
      commerceName: c.name,
    }))
  } else {
    commerces = [...(authUser.value?.commerces ?? [])]
  }
  scheduleStore.configureAccess({
    isSuperAdmin: authUser.value?.role === 'SuperAdmin',
    commerces,
  })
  // Default: primer commerce accesible.
  if (!form.commerceId) {
    const first = commerces[0]
    if (first) form.commerceId = first.commerceId
  }
  if (form.commerceId) {
    await scheduleStore.loadCatalogsForCommerce(form.commerceId)
  }
}

onMounted(async () => {
  await bootstrap()
})

// Si el SA cambia de commerce, recargamos PdVs/zonas que alimentan los Selects
// del editor de filas.
watch(() => form.commerceId, async (id) => {
  if (id) await scheduleStore.loadCatalogsForCommerce(id)
})

function validate(): { ok: true; data: z.infer<typeof schema> } | { ok: false } {
  submitError.value = null
  nameError.value = null
  commerceError.value = null
  const rowErrors: Array<Partial<Record<keyof TemplateShiftDraft, string>>> = form.shifts.map(() => ({}))

  const parsed = schema.safeParse(form)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'commerceId') commerceError.value = issue.message
      if (issue.path[0] === 'name') nameError.value = issue.message
      if (issue.path[0] === 'shifts' && typeof issue.path[1] === 'number') {
        const key = issue.path[2]
        if (typeof key === 'string') {
          const idx = issue.path[1] as number
          rowErrors[idx] = { ...rowErrors[idx], [key as keyof TemplateShiftDraft]: issue.message }
        }
      }
    }
    shiftErrors.value = rowErrors
    return { ok: false }
  }
  for (let i = 0; i < form.shifts.length; i++) {
    const row = form.shifts[i] as TemplateShiftDraft
    if (!isValidTimeRange(row.startTime, row.endTime)) {
      rowErrors[i] = { ...rowErrors[i], endTime: 'Fin debe ser mayor a inicio' }
    }
  }
  shiftErrors.value = rowErrors
  if (rowErrors.some((e) => Object.keys(e).length > 0)) return { ok: false }
  return { ok: true, data: parsed.data }
}

async function handleSave(): Promise<void> {
  const result = validate()
  if (!result.ok) return
  try {
    const dto: CreateTemplateDto = {
      name: result.data.name,
      description: result.data.description?.trim() || undefined,
      shifts: result.data.shifts,
    }
    await scheduleStore.createTemplate(result.data.commerceId, dto)
    toast.success('Modelo creado correctamente')
    router.push('/schedule')
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo crear el modelo'
  }
}

function cancel(): void {
  router.push('/schedule')
}
</script>

<template>
  <div class="page">
    <Toast />

    <header class="page__header">
      <div>
        <button type="button" class="back" @click="cancel">
          <i class="pi pi-arrow-left" aria-hidden="true" />
          Volver a mallas
        </button>
        <h1 class="page__title">Nuevo modelo de malla</h1>
        <p class="page__subtitle">
          Define los turnos base. Después podrás crear mallas programadas a
          partir de este modelo y asignarles riders.
        </p>
      </div>
      <div class="page__actions">
        <Button label="Cancelar" text severity="secondary" :disabled="isSaving" @click="cancel" />
        <Button label="Guardar modelo" :loading="isSaving" @click="handleSave" />
      </div>
    </header>

    <div v-if="submitError" class="alert">{{ submitError }}</div>

    <div class="form-grid" :class="{ 'form-grid--three': showCommerceSelector }">
      <div v-if="showCommerceSelector" class="field">
        <label class="field__label">Comercio <span class="field__req">*</span></label>
        <Select
          v-model="form.commerceId"
          :options="[...commerceOptions]"
          option-label="commerceName"
          option-value="commerceId"
          placeholder="Selecciona el comercio dueño del modelo"
          :class="{ 'field__input--error': commerceError }"
        />
        <span v-if="commerceError" class="field__error">{{ commerceError }}</span>
      </div>
      <div class="field">
        <label class="field__label">Nombre <span class="field__req">*</span></label>
        <InputText
          v-model="form.name"
          placeholder="Ej: Turnos matutinos · lunes a viernes"
          :class="{ 'field__input--error': nameError }"
        />
        <span v-if="nameError" class="field__error">{{ nameError }}</span>
      </div>
      <div class="field">
        <label class="field__label">Descripción</label>
        <Textarea
          v-model="form.description"
          rows="2"
          auto-resize
          placeholder="Contexto del modelo, a quién aplica, consideraciones…"
        />
      </div>
    </div>

    <section class="shifts">
      <header class="shifts__header">
        <h2 class="shifts__title">Turnos base</h2>
        <span class="shifts__count">
          {{ form.shifts.length }} {{ form.shifts.length === 1 ? 'turno' : 'turnos' }}
        </span>
      </header>
      <TemplateShiftEditor v-model="form.shifts" :errors="shiftErrors" />
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--color-muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
}

.back:hover { color: var(--color-text); }

.page__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.page__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-muted);
  max-width: 620px;
  line-height: 1.5;
}

.page__actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.alert {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 12px;
}

.form-grid--three {
  grid-template-columns: 1fr 1fr 2fr;
}

@media (max-width: 900px) {
  .form-grid,
  .form-grid--three { grid-template-columns: 1fr; }
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

.field__req { color: var(--color-error); }

.field :deep(.p-inputtext),
.field :deep(.p-textarea),
.field :deep(.p-select) {
  width: 100%;
}

.field__input--error :deep(.p-inputtext),
.field__input--error :deep(.p-select) {
  border-color: var(--color-error) !important;
}

.field__error {
  font-size: 11px;
  color: var(--color-error);
}

.shifts { display: flex; flex-direction: column; gap: 12px; }
.shifts__header { display: flex; align-items: baseline; justify-content: space-between; }
.shifts__title { margin: 0; font-size: 14px; font-weight: 700; color: var(--color-text); }
.shifts__count { font-size: 11px; color: var(--color-muted); font-weight: 600; }
</style>
