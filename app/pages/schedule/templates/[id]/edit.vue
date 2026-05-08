<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { z } from 'zod'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useAppToast } from '~/composables/useToast'
import { useActiveCommerceStore } from '~/stores/active-commerce.store'
import { useScheduleStore } from '~/modules/schedule/store/schedule.store'
import TemplateShiftEditor from '~/modules/schedule/components/TemplateShiftEditor.vue'
import { isValidTimeRange } from '~/modules/schedule/utils/schedule.utils'
import type {
  TemplateShift,
  UpdateTemplateDto,
} from '~/modules/schedule/types/schedule.types'

definePageMeta({
  layout: 'default',
  allowedRoles: ['SuperAdmin', 'CommerceAdmin', 'Supervisor'],
})

const route = useRoute()
const router = useRouter()
const toast = useAppToast()
const activeCommerceStore = useActiveCommerceStore()
const scheduleStore = useScheduleStore()

const templateId = computed<string>(() => String(route.params.id ?? ''))

type TemplateShiftDraft = Omit<TemplateShift, 'id'>

interface FormState {
  name: string
  description: string
  shifts: TemplateShiftDraft[]
}

const form = reactive<FormState>({
  name: '',
  description: '',
  shifts: [],
})

const templateCommerceId = ref<string | null>(null)
const templateCommerceName = ref<string>('')

const isLoading = ref<boolean>(true)
const notFound = ref<boolean>(false)
const submitError = ref<string | null>(null)
const nameError = ref<string | null>(null)
const shiftErrors = ref<Array<Partial<Record<keyof TemplateShiftDraft, string>>>>([])
const isSaving = computed<boolean>(() => scheduleStore.isSaving)

const schema = z.object({
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

async function load(): Promise<void> {
  isLoading.value = true
  notFound.value = false

  // El endpoint del backend es /commerce/:cId/shift-templates/:tId — necesitamos
  // el commerceId para construir la URL. Cuando entramos por deep-link no lo
  // tenemos en el route, así que probamos secuencialmente cada commerce
  // ACCESIBLE (no scoped — el deep-link puede apuntar a un template fuera del
  // commerce activo del sidebar y aun así el usuario tiene acceso) hasta que
  // uno responda 200. La 404 en el resto es esperada.
  for (const c of activeCommerceStore.accessibleCommerces) {
    const tpl = await scheduleStore.fetchTemplateById(c.commerceId, templateId.value)
    if (tpl) {
      form.name = tpl.name
      form.description = tpl.description ?? ''
      form.shifts = tpl.shifts.map(({ dayOfWeek, startTime, endTime, zoneId, notes }) => ({
        dayOfWeek, startTime, endTime, zoneId, notes,
      }))
      templateCommerceId.value = tpl.commerceId
      templateCommerceName.value = c.commerceName
      await scheduleStore.loadCatalogsForCommerce(tpl.commerceId)
      isLoading.value = false
      return
    }
  }
  notFound.value = true
  isLoading.value = false
}

onMounted(async () => {
  await load()
})

function validate(): { ok: true; data: z.infer<typeof schema> } | { ok: false } {
  submitError.value = null
  nameError.value = null
  const rowErrors: Array<Partial<Record<keyof TemplateShiftDraft, string>>> = form.shifts.map(() => ({}))

  const parsed = schema.safeParse(form)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
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
  if (!templateCommerceId.value) return
  const result = validate()
  if (!result.ok) return
  try {
    const dto: UpdateTemplateDto = {
      name: result.data.name,
      description: result.data.description?.trim() || undefined,
      shifts: result.data.shifts,
    }
    await scheduleStore.updateTemplate(templateCommerceId.value, templateId.value, dto)
    toast.success('Modelo guardado correctamente')
    router.push('/schedule')
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo guardar el modelo'
  }
}

async function handleDelete(): Promise<void> {
  if (!templateCommerceId.value) return
  if (!confirm(`¿Eliminar el modelo "${form.name}"? Las mallas creadas desde él no se ven afectadas.`)) return
  try {
    await scheduleStore.deleteTemplate(templateCommerceId.value, templateId.value)
    toast.success('Modelo eliminado')
    router.push('/schedule')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el modelo')
  }
}

function cancel(): void {
  router.push('/schedule')
}
</script>

<template>
  <div class="page">
    <Toast />

    <div v-if="isLoading" class="status">
      <i class="pi pi-spin pi-spinner" aria-hidden="true" />
      Cargando modelo…
    </div>

    <div v-else-if="notFound" class="empty">
      <i class="pi pi-exclamation-triangle empty__icon" aria-hidden="true" />
      <h2 class="empty__title">Modelo no encontrado</h2>
      <p class="empty__hint">
        Puede haber sido eliminado o pertenece a un comercio al que no tienes acceso.
      </p>
      <Button label="Volver a mallas" @click="cancel" />
    </div>

    <template v-else>
      <header class="page__header">
        <div>
          <button type="button" class="back" @click="cancel">
            <i class="pi pi-arrow-left" aria-hidden="true" />
            Volver a mallas
          </button>
          <h1 class="page__title">Editar modelo</h1>
          <p class="page__subtitle">
            Modifica los turnos base. Los cambios no afectan a mallas ya creadas
            desde este modelo.
            <span v-if="templateCommerceName" class="commerce-hint">
              · Pertenece a <strong>{{ templateCommerceName }}</strong>
            </span>
          </p>
        </div>
        <div class="page__actions">
          <Button
            label="Eliminar"
            icon="pi pi-trash"
            text
            severity="danger"
            :disabled="isSaving"
            @click="handleDelete"
          />
          <Button label="Cancelar" text severity="secondary" :disabled="isSaving" @click="cancel" />
          <Button label="Guardar cambios" :loading="isSaving" @click="handleSave" />
        </div>
      </header>

      <div v-if="submitError" class="alert">{{ submitError }}</div>

      <div class="form-grid">
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
    </template>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }

.status {
  display: flex; align-items: center; gap: 10px; padding: 40px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 12px; color: var(--color-muted); font-size: 13px;
  justify-content: center;
}

.empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 64px 32px; background: var(--color-surface);
  border: 1px dashed var(--color-border); border-radius: 12px; text-align: center;
}

.empty__icon { font-size: 40px; color: var(--color-muted); margin-bottom: 6px; }
.empty__title { margin: 0; font-size: 16px; font-weight: 700; color: var(--color-text); }
.empty__hint { margin: 0 0 10px; font-size: 13px; color: var(--color-muted); max-width: 380px; line-height: 1.5; }

.page__header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
}

.back {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: none; color: var(--color-muted);
  font-size: 11px; font-weight: 600; cursor: pointer; padding: 0; margin-bottom: 8px;
}

.back:hover { color: var(--color-text); }

.page__title { margin: 0; font-size: 20px; font-weight: 700; color: var(--color-text); }

.page__subtitle {
  margin: 4px 0 0; font-size: 13px; color: var(--color-muted);
  max-width: 620px; line-height: 1.5;
}

.commerce-hint strong { color: var(--color-text); font-weight: 600; }

.page__actions { display: flex; gap: 10px; flex-shrink: 0; }

.alert {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error); padding: 10px 14px; border-radius: 9px; font-size: 13px;
}

.form-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 12px; }

@media (max-width: 900px) {
  .form-grid { grid-template-columns: 1fr; }
}

.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.field__label { font-size: 12px; color: var(--color-muted); font-weight: 500; }
.field__req { color: var(--color-error); }

.field :deep(.p-inputtext),
.field :deep(.p-textarea) { width: 100%; }

.field__input--error :deep(.p-inputtext) { border-color: var(--color-error) !important; }

.field__error { font-size: 11px; color: var(--color-error); }

.shifts { display: flex; flex-direction: column; gap: 12px; }
.shifts__header { display: flex; align-items: baseline; justify-content: space-between; }
.shifts__title { margin: 0; font-size: 14px; font-weight: 700; color: var(--color-text); }
.shifts__count { font-size: 11px; color: var(--color-muted); font-weight: 600; }
</style>
