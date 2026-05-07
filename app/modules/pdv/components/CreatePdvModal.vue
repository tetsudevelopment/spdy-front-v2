<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import { usePdvStore } from '../store/pdv.store'
import type {
  CreatePdvDto,
  PointOfSale,
  UpdatePdvDto,
} from '../types/pdv.types'

interface Props {
  visible: boolean
  pdv?: PointOfSale | null
}
const props = withDefaults(defineProps<Props>(), { pdv: null })

const emit = defineEmits<{
  'update:visible': [value: boolean]
  created: []
  updated: []
}>()

const store = usePdvStore()

const isEditMode = computed<boolean>(() => props.pdv !== null)
const modalTitle = computed<string>(() =>
  isEditMode.value ? 'Editar punto de venta' : 'Nuevo punto de venta',
)
const submitLabel = computed<string>(() =>
  isEditMode.value ? 'Guardar cambios' : 'Crear punto de venta',
)
const isBusy = computed<boolean>(() => store.isCreating || store.isUpdating)

interface FormState {
  name: string
  address: string
  lat: number | null
  lng: number | null
  phone: string
  email: string
}

function emptyForm(): FormState {
  return {
    name: '',
    address: '',
    lat: null,
    lng: null,
    phone: '',
    email: '',
  }
}

function formFromPdv(p: PointOfSale): FormState {
  // location.x = lng, location.y = lat  (PostGIS)
  return {
    name: p.name,
    address: p.address,
    lat: p.location?.y ?? null,
    lng: p.location?.x ?? null,
    phone: p.phone ?? '',
    email: p.email ?? '',
  }
}

const form = reactive<FormState>(emptyForm())
const submitError = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<keyof FormState, string>>>({})

const schema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es requerido'),
    address: z.string().trim().min(1, 'La dirección es requerida'),
    lat: z
      .number()
      .min(-90, 'Latitud fuera de rango')
      .max(90, 'Latitud fuera de rango')
      .nullable(),
    lng: z
      .number()
      .min(-180, 'Longitud fuera de rango')
      .max(180, 'Longitud fuera de rango')
      .nullable(),
    phone: z.string().optional(),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
  })
  // Si se especifica una coordenada, deben venir ambas.
  .refine(
    (v) => (v.lat === null && v.lng === null) || (v.lat !== null && v.lng !== null),
    {
      message: 'Debes indicar latitud y longitud juntas, o dejar ambas vacías',
      path: ['lat'],
    },
  )

function resetForm(): void {
  if (props.pdv) {
    Object.assign(form, formFromPdv(props.pdv))
  } else {
    Object.assign(form, emptyForm())
  }
  fieldErrors.value = {}
  submitError.value = null
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

  const parsed = schema.safeParse(form)
  if (!parsed.success) {
    applyZodErrors(parsed.error)
    return
  }

  const data = parsed.data
  if (isEditMode.value && props.pdv) {
    await handleUpdate(data)
  } else {
    await handleCreate(data)
  }
}

async function handleCreate(data: z.infer<typeof schema>): Promise<void> {
  const dto: CreatePdvDto = {
    name: data.name,
    address: data.address,
  }
  if (data.lat !== null) dto.lat = data.lat
  if (data.lng !== null) dto.lng = data.lng
  if (data.phone) dto.phone = data.phone
  if (data.email) dto.email = data.email

  try {
    await store.createPdv(dto)
    emit('created')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo crear el punto de venta'
  }
}

async function handleUpdate(data: z.infer<typeof schema>): Promise<void> {
  if (!props.pdv) return
  const dto: UpdatePdvDto = {}
  const current = props.pdv

  if (data.name !== current.name) dto.name = data.name
  if (data.address !== current.address) dto.address = data.address
  const currentLat = current.location?.y ?? null
  const currentLng = current.location?.x ?? null
  if (data.lat !== currentLat && data.lat !== null) dto.lat = data.lat
  if (data.lng !== currentLng && data.lng !== null) dto.lng = data.lng
  if (data.phone !== (current.phone ?? '')) dto.phone = data.phone ?? ''
  if (data.email !== (current.email ?? '')) dto.email = data.email ?? ''

  try {
    await store.updatePdv(current.id, dto)
    emit('updated')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo actualizar el punto de venta'
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
      <div v-if="submitError" class="alert">{{ submitError }}</div>

      <div class="field">
        <label class="field__label">Nombre <span class="field__req">*</span></label>
        <InputText
          v-model="form.name"
          placeholder="Sucursal Chapinero"
          :class="{ 'field__input--error': fieldErrors.name }"
        />
        <span v-if="fieldErrors.name" class="field__error">{{ fieldErrors.name }}</span>
      </div>

      <div class="field">
        <label class="field__label">Dirección <span class="field__req">*</span></label>
        <InputText
          v-model="form.address"
          placeholder="Cra 10 #20-30, Bogotá"
          :class="{ 'field__input--error': fieldErrors.address }"
        />
        <span v-if="fieldErrors.address" class="field__error">{{ fieldErrors.address }}</span>
      </div>

      <div class="hint">
        <i class="pi pi-info-circle" aria-hidden="true" />
        <span>
          Si no especificas coordenadas, se calcularán automáticamente desde la dirección.
        </span>
      </div>

      <div class="row">
        <div class="field">
          <label class="field__label">Latitud</label>
          <InputNumber
            v-model="form.lat"
            :min-fraction-digits="0"
            :max-fraction-digits="8"
            placeholder="4.6097"
            :class="{ 'field__input--error': fieldErrors.lat }"
          />
          <span v-if="fieldErrors.lat" class="field__error">{{ fieldErrors.lat }}</span>
        </div>
        <div class="field">
          <label class="field__label">Longitud</label>
          <InputNumber
            v-model="form.lng"
            :min-fraction-digits="0"
            :max-fraction-digits="8"
            placeholder="-74.0817"
            :class="{ 'field__input--error': fieldErrors.lng }"
          />
          <span v-if="fieldErrors.lng" class="field__error">{{ fieldErrors.lng }}</span>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label class="field__label">Teléfono</label>
          <InputText v-model="form.phone" placeholder="+57 300 0000000" />
        </div>
        <div class="field">
          <label class="field__label">Email</label>
          <InputText
            v-model="form.email"
            type="email"
            placeholder="contacto@dominio.com"
            :class="{ 'field__input--error': fieldErrors.email }"
          />
          <span v-if="fieldErrors.email" class="field__error">{{ fieldErrors.email }}</span>
        </div>
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
          :label="submitLabel"
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
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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
.field :deep(.p-inputnumber),
.field :deep(.p-inputnumber-input) {
  width: 100%;
}

.field__input--error :deep(.p-inputtext),
.field__input--error :deep(.p-inputnumber-input) {
  border-color: var(--color-error) !important;
}

.field__error {
  font-size: 11px;
  color: var(--color-error);
}

.hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: color-mix(in srgb, var(--color-brand) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-brand) 35%, transparent);
  color: var(--color-text);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 12px;
  line-height: 1.5;
}

.hint i {
  color: var(--color-brand);
  font-size: 14px;
  margin-top: 1px;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
