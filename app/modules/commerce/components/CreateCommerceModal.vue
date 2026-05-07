<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useCommerceStore } from '../store/commerce.store'
import type {
  Commerce,
  CreateCommerceDto,
  FleetType,
  UpdateCommerceDto,
} from '../types/commerce.types'

interface Props {
  visible: boolean
  commerce?: Commerce | null
}
const props = withDefaults(defineProps<Props>(), { commerce: null })

const emit = defineEmits<{
  'update:visible': [value: boolean]
  created: []
  updated: []
}>()

const store = useCommerceStore()

const isEditMode = computed<boolean>(() => props.commerce !== null)
const modalTitle = computed<string>(() =>
  isEditMode.value ? 'Editar comercio' : 'Nuevo comercio',
)
const submitLabel = computed<string>(() =>
  isEditMode.value ? 'Guardar cambios' : 'Crear comercio',
)
const isBusy = computed<boolean>(() => store.isCreating || store.isUpdating)

const FLEET_OPTIONS: ReadonlyArray<{ label: string; value: FleetType }> = [
  { label: 'Privada', value: 'Privada' },
  { label: 'Global',  value: 'Global' },
  { label: 'Híbrida', value: 'Hibrida' },
]

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_LOGO_BYTES = 5 * 1024 * 1024

interface FormState {
  name: string
  fleetType: FleetType | null
  nit: string
  razonSocial: string
  email: string
  phone: string
  address: string
  website: string
  currency: string
  timezone: string
}

function emptyForm(): FormState {
  return {
    name: '',
    fleetType: null,
    nit: '',
    razonSocial: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    currency: 'COP',
    timezone: 'America/Bogota',
  }
}

function formFromCommerce(c: Commerce): FormState {
  return {
    name: c.name,
    fleetType: c.fleetType,
    nit: c.nit ?? '',
    razonSocial: c.razonSocial ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    address: c.address ?? '',
    website: c.website ?? '',
    currency: c.currency ?? 'COP',
    timezone: c.timezone ?? 'America/Bogota',
  }
}

const form = reactive<FormState>(emptyForm())
const logoFile = ref<File | null>(null)
const logoPreview = ref<string | null>(null)
const submitError = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<keyof FormState | 'logo', string>>>({})

const schema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido'),
  fleetType: z.enum(['Privada', 'Global', 'Hibrida'], {
    errorMap: () => ({ message: 'Selecciona un tipo de flota' }),
  }),
  nit: z.string().optional(),
  razonSocial: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  website: z.string().url('URL inválida').optional().or(z.literal('')),
  currency: z.string().optional(),
  timezone: z.string().optional(),
})

function resetForm(): void {
  if (props.commerce) {
    Object.assign(form, formFromCommerce(props.commerce))
    logoPreview.value = props.commerce.logoUrl ?? null
  } else {
    Object.assign(form, emptyForm())
    logoPreview.value = null
  }
  logoFile.value = null
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

function onLogoChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  fieldErrors.value = { ...fieldErrors.value, logo: undefined }

  if (!file) {
    logoFile.value = null
    logoPreview.value = props.commerce?.logoUrl ?? null
    return
  }

  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    fieldErrors.value = { ...fieldErrors.value, logo: 'Formato no válido. Usa PNG, JPEG o WebP' }
    input.value = ''
    return
  }

  if (file.size > MAX_LOGO_BYTES) {
    fieldErrors.value = { ...fieldErrors.value, logo: 'El archivo supera los 5 MB' }
    input.value = ''
    return
  }

  logoFile.value = file
  const reader = new FileReader()
  reader.onload = () => {
    logoPreview.value = typeof reader.result === 'string' ? reader.result : null
  }
  reader.readAsDataURL(file)
}

function removeLogo(): void {
  logoFile.value = null
  logoPreview.value = null
}

function applyZodErrors(err: z.ZodError): void {
  const errors: Partial<Record<keyof FormState | 'logo', string>> = {}
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
  if (isEditMode.value && props.commerce) {
    await handleUpdate(data)
  } else {
    await handleCreate(data)
  }
}

async function handleCreate(data: z.infer<typeof schema>): Promise<void> {
  const dto: CreateCommerceDto = {
    name: data.name,
    fleetType: data.fleetType,
  }
  if (logoFile.value) dto.logo = logoFile.value
  if (data.nit) dto.nit = data.nit
  if (data.razonSocial) dto.razonSocial = data.razonSocial
  if (data.email) dto.email = data.email
  if (data.phone) dto.phone = data.phone
  if (data.address) dto.address = data.address
  if (data.website) dto.website = data.website
  if (data.currency) dto.currency = data.currency
  if (data.timezone) dto.timezone = data.timezone

  try {
    await store.createCommerce(dto)
    emit('created')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo crear el comercio'
  }
}

async function handleUpdate(data: z.infer<typeof schema>): Promise<void> {
  if (!props.commerce) return
  const dto: UpdateCommerceDto = {}
  const c = props.commerce

  if (data.name !== c.name) dto.name = data.name
  if (data.fleetType !== c.fleetType) dto.fleetType = data.fleetType
  if (data.nit !== (c.nit ?? '')) dto.nit = data.nit ?? ''
  if (data.razonSocial !== (c.razonSocial ?? '')) dto.razonSocial = data.razonSocial ?? ''
  if (data.email !== (c.email ?? '')) dto.email = data.email ?? ''
  if (data.phone !== (c.phone ?? '')) dto.phone = data.phone ?? ''
  if (data.address !== (c.address ?? '')) dto.address = data.address ?? ''
  if (data.website !== (c.website ?? '')) dto.website = data.website ?? ''
  if (data.currency && data.currency !== c.currency) dto.currency = data.currency
  if (data.timezone && data.timezone !== c.timezone) dto.timezone = data.timezone
  if (logoFile.value) dto.logo = logoFile.value

  try {
    await store.updateCommerce(c.id, dto)
    emit('updated')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo actualizar el comercio'
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

      <!-- Logo -->
      <div class="field">
        <label class="field__label">Logo</label>
        <div class="logo-row">
          <div class="logo-row__preview">
            <img v-if="logoPreview" :src="logoPreview" alt="Logo" class="logo-row__img" />
            <div v-else class="logo-row__placeholder">
              <i class="pi pi-image" aria-hidden="true" />
            </div>
          </div>
          <div class="logo-row__actions">
            <label class="btn-secondary">
              <i class="pi pi-upload" aria-hidden="true" />
              {{ logoPreview ? 'Cambiar logo' : 'Subir logo' }}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="logo-row__input"
                @change="onLogoChange"
              />
            </label>
            <button
              v-if="logoPreview"
              type="button"
              class="btn-link"
              @click="removeLogo"
            >
              Quitar
            </button>
            <span class="logo-row__hint">PNG, JPEG o WebP · máx 5 MB</span>
          </div>
        </div>
        <span v-if="fieldErrors.logo" class="field__error">{{ fieldErrors.logo }}</span>
      </div>

      <div class="row">
        <div class="field">
          <label class="field__label">Nombre <span class="field__req">*</span></label>
          <InputText
            v-model="form.name"
            placeholder="Restaurante La Plaza"
            :class="{ 'field__input--error': fieldErrors.name }"
          />
          <span v-if="fieldErrors.name" class="field__error">{{ fieldErrors.name }}</span>
        </div>

        <div class="field">
          <label class="field__label">Tipo de flota <span class="field__req">*</span></label>
          <Select
            v-model="form.fleetType"
            :options="[...FLEET_OPTIONS]"
            option-label="label"
            option-value="value"
            placeholder="Selecciona una flota"
            :class="{ 'field__input--error': fieldErrors.fleetType }"
          />
          <span v-if="fieldErrors.fleetType" class="field__error">{{ fieldErrors.fleetType }}</span>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label class="field__label">NIT</label>
          <InputText v-model="form.nit" placeholder="900.123.456-7" />
        </div>
        <div class="field">
          <label class="field__label">Razón social</label>
          <InputText v-model="form.razonSocial" placeholder="Comercial XYZ SAS" />
        </div>
      </div>

      <div class="row">
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
        <div class="field">
          <label class="field__label">Teléfono</label>
          <InputText v-model="form.phone" placeholder="+57 300 0000000" />
        </div>
      </div>

      <div class="field">
        <label class="field__label">Dirección</label>
        <InputText v-model="form.address" placeholder="Cra 10 #20-30, Bogotá" />
      </div>

      <div class="row">
        <div class="field">
          <label class="field__label">Sitio web</label>
          <InputText
            v-model="form.website"
            placeholder="https://…"
            :class="{ 'field__input--error': fieldErrors.website }"
          />
          <span v-if="fieldErrors.website" class="field__error">{{ fieldErrors.website }}</span>
        </div>
        <div class="field">
          <label class="field__label">Moneda</label>
          <InputText v-model="form.currency" placeholder="COP" />
        </div>
      </div>

      <div class="field">
        <label class="field__label">Zona horaria</label>
        <InputText v-model="form.timezone" placeholder="America/Bogota" />
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
.field :deep(.p-select) {
  width: 100%;
}

.field__input--error :deep(.p-inputtext),
.field__input--error :deep(.p-select),
:deep(.p-inputtext.field__input--error) {
  border-color: var(--color-error) !important;
}

.field__error {
  font-size: 11px;
  color: var(--color-error);
}

.logo-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo-row__preview {
  flex-shrink: 0;
}

.logo-row__img {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid var(--color-border);
  background: #1a1a19;
}

.logo-row__placeholder {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  border: 1px dashed var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
  font-size: 22px;
}

.logo-row__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.logo-row__hint {
  font-size: 11px;
  color: var(--color-muted);
}

.logo-row__input {
  display: none;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.btn-secondary:hover {
  border-color: var(--color-brand);
  color: var(--color-brand);
}

.btn-link {
  background: transparent;
  border: none;
  color: var(--color-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.btn-link:hover {
  color: var(--color-error);
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
