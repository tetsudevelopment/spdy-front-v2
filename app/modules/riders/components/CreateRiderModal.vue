<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useAppToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { useActiveCommerceStore } from '~/stores/active-commerce.store'
import { useRidersStore } from '../store/riders.store'
import type {
  CreateRiderDto,
  Rider,
  UpdateRiderDto,
  VehicleType,
} from '../types/rider.types'

type RiderTypeOption = 'private' | 'global'

const PHOTO_ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']
const PHOTO_MAX_BYTES = 10 * 1024 * 1024  // 10 MB

interface Props {
  visible: boolean
  rider?: Rider | null
}
const props = withDefaults(defineProps<Props>(), {
  rider: null,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  created: []
  updated: []
}>()

const store = useRidersStore()
const activeCommerceStore = useActiveCommerceStore()
const toast = useAppToast()
const { user: authUser } = useAuth()

const isSuperAdmin = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')
const isEditMode = computed<boolean>(() => props.rider !== null)

// Selector interno del tipo de rider — solo visible y mutable para SuperAdmin
// en creación. CommerceAdmin queda fijo en 'private' (su único caso). En edición
// el tipo viene del rider y no se toca desde aquí.
const selectedType = ref<RiderTypeOption>('private')
const showRiderTypeSelector = computed<boolean>(() => {
  return !isEditMode.value && isSuperAdmin.value
})
const isGlobalMode = computed<boolean>(() => !isEditMode.value && selectedType.value === 'global')
// SA + creación de Privado puede elegir commerce destino. CA usa siempre el
// suyo (= activeCommerceStore.activeCommerceId), por eso ni ve este campo.
const showCommerceSelector = computed<boolean>(() => {
  return !isEditMode.value && selectedType.value === 'private' && isSuperAdmin.value
})
const modalTitle = computed<string>(() => {
  if (isEditMode.value) return 'Editar domiciliario'
  return isGlobalMode.value ? 'Nuevo domiciliario global' : 'Nuevo domiciliario'
})
const submitLabel = computed<string>(() =>
  isEditMode.value ? 'Guardar cambios' : 'Crear domiciliario',
)
const isBusy = computed<boolean>(() => store.isCreating || store.isUpdating)

// Labels amigables, values reales que espera el backend.
const VEHICLE_OPTIONS: ReadonlyArray<{ label: string; value: VehicleType }> = [
  { label: 'Moto',       value: 'moto' },
  { label: 'Bicicleta',  value: 'bicicleta' },
  { label: 'Auto',       value: 'auto' },
  { label: 'Caminando',  value: 'caminando' },
]

function needsPlate(v: VehicleType | null): boolean {
  return v === 'moto' || v === 'auto'
}

// Reglas de contraseña — idénticas a las del login para consistencia visual.
interface PasswordRule {
  key: string
  label: string
  test: (value: string) => boolean
}

const passwordRules: ReadonlyArray<PasswordRule> = [
  { key: 'length',  label: 'Mínimo 8 caracteres',   test: (v) => v.length >= 8 },
  { key: 'upper',   label: 'Una mayúscula',         test: (v) => /[A-Z]/.test(v) },
  { key: 'number',  label: 'Un número',             test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'Un carácter especial',  test: (v) => /[^A-Za-z0-9]/.test(v) },
]

interface FormState {
  fullName: string
  email: string
  password: string
  phone: string
  cedula: string
  vehicleType: VehicleType | null
  licensePlate: string
  // Solo se usa en SA + creación de Privado. Para CA viene implícito
  // (su único commerce), para creación de Global queda vacío.
  targetCommerceId: string | null
}

function emptyForm(): FormState {
  return {
    fullName: '',
    email: '',
    password: '',
    phone: '',
    cedula: '',
    vehicleType: null,
    licensePlate: '',
    // Prellenamos con el commerce activo del sidebar cuando lo hay; en
    // "Todos los comercios" (activeCommerceId === null) queda vacío y el SA
    // debe elegir uno del dropdown antes de enviar (validación abajo).
    targetCommerceId: activeCommerceStore.activeCommerceId,
  }
}

function formFromRider(r: Rider): FormState {
  return {
    fullName: r.fullName,
    email: r.email ?? '',
    password: '',
    phone: r.phone,
    cedula: r.cedula ?? '',
    vehicleType: r.vehicleType,
    licensePlate: r.licensePlate ?? '',
    targetCommerceId: r.commerceId,
  }
}

const form = reactive<FormState>(emptyForm())
const showPassword = ref<boolean>(false)
const submitError = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<keyof FormState, string>>>({})

// Foto obligatoria al crear; en edición se gestiona por el flujo PATCH /photo
// del panel de detalle, así que aquí ni se exige ni se muestra. El backend
// acepta el campo `photo` vía multipart en POST. La preview se genera con
// createObjectURL y se libera al cambiar/remover la foto y al desmontar.
const photoFile = ref<File | null>(null)
const photoPreviewUrl = ref<string | null>(null)
const photoInputRef = ref<HTMLInputElement | null>(null)
const photoError = ref<string | null>(null)

// El submit queda deshabilitado mientras no haya foto en creación. Funciona
// como gating visual; aún así handleSubmit re-valida por si el usuario evita
// el botón (Enter en un input dispara submit del form).
const isPhotoMissing = computed<boolean>(
  () => !isEditMode.value && photoFile.value === null,
)

function setPhoto(file: File | null): void {
  if (photoPreviewUrl.value) URL.revokeObjectURL(photoPreviewUrl.value)
  photoFile.value = file
  photoPreviewUrl.value = file ? URL.createObjectURL(file) : null
  if (file) {
    photoError.value = null
  } else if (!isEditMode.value) {
    // El usuario quitó la foto manualmente — marcamos el error para que sepa
    // por qué el botón se deshabilitó.
    photoError.value = 'La foto es obligatoria'
  }
}

function onPhotoSelected(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file) return
  if (!PHOTO_ACCEPTED.includes(file.type)) {
    toast.error('Formato no válido — usa PNG, JPEG o WebP')
    input.value = ''
    return
  }
  if (file.size > PHOTO_MAX_BYTES) {
    toast.error('La foto supera los 10 MB')
    input.value = ''
    return
  }
  setPhoto(file)
  input.value = ''
}

function removePhoto(): void {
  setPhoto(null)
}

function triggerPhotoPicker(): void {
  photoInputRef.value?.click()
}

onUnmounted(() => {
  if (photoPreviewUrl.value) URL.revokeObjectURL(photoPreviewUrl.value)
})

// Schema de creación — incluye password con las 4 reglas.
const createSchema = z
  .object({
    fullName: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(100),
    email: z.string().email('Email inválido'),
    password: z
      .string()
      .min(8, 'La contraseña debe tener al menos 8 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número')
      .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
    phone: z.string().trim().min(5, 'Teléfono inválido').max(20),
    vehicleType: z.enum(['moto', 'bicicleta', 'auto', 'caminando'], {
      errorMap: () => ({ message: 'Selecciona un tipo de vehículo' }),
    }),
    cedula: z.string().optional(),
    licensePlate: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (['moto', 'auto'].includes(data.vehicleType) && !data.licensePlate?.trim()) {
      ctx.addIssue({
        path: ['licensePlate'],
        code: 'custom',
        message: 'La placa es requerida para este tipo de vehículo',
      })
    }
  })

// Schema de edición — mismo shape pero sin password.
const updateSchema = z
  .object({
    fullName: z.string().trim().min(3).max(100),
    email: z.string().email('Email inválido'),
    phone: z.string().trim().min(5).max(20),
    vehicleType: z.enum(['moto', 'bicicleta', 'auto', 'caminando'], {
      errorMap: () => ({ message: 'Selecciona un tipo de vehículo' }),
    }),
    cedula: z.string().optional(),
    licensePlate: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (['moto', 'auto'].includes(data.vehicleType) && !data.licensePlate?.trim()) {
      ctx.addIssue({
        path: ['licensePlate'],
        code: 'custom',
        message: 'La placa es requerida para este tipo de vehículo',
      })
    }
  })

const ruleStatus = computed<Record<string, boolean>>(() => {
  const result: Record<string, boolean> = {}
  for (const rule of passwordRules) result[rule.key] = rule.test(form.password)
  return result
})

function resetForm(): void {
  if (props.rider) {
    Object.assign(form, formFromRider(props.rider))
    // En edición no usamos selectedType — derivamos del rider para coherencia.
    selectedType.value = props.rider.fleetType === 'Global' ? 'global' : 'private'
  } else {
    Object.assign(form, emptyForm())
    selectedType.value = 'private'
  }
  showPassword.value = false
  fieldErrors.value = {}
  submitError.value = null
  // setPhoto(null) dispararía photoError en creación; lo reseteamos a mano.
  if (photoPreviewUrl.value) URL.revokeObjectURL(photoPreviewUrl.value)
  photoFile.value = null
  photoPreviewUrl.value = null
  photoError.value = null
}

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) resetForm()
  },
)

// Si el usuario cambia a un vehículo que no lleva placa, limpiamos el campo.
watch(
  () => form.vehicleType,
  (next) => {
    if (!needsPlate(next)) form.licensePlate = ''
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

  if (isEditMode.value && props.rider) {
    const parsed = updateSchema.safeParse(form)
    if (!parsed.success) {
      applyZodErrors(parsed.error)
      return
    }
    await handleUpdate(parsed.data)
    return
  }

  // Foto obligatoria en creación — la valida el handler porque es un File,
  // no parte del payload Zod. Se chequea antes que el schema para que el
  // usuario no tenga que llenar todo el form si le falta la foto.
  if (isPhotoMissing.value) {
    photoError.value = 'La foto es obligatoria'
    return
  }

  // SA creando Privado debe elegir commerce destino. Validamos antes del
  // schema para mostrar un mensaje claro en el campo correcto.
  if (showCommerceSelector.value && !form.targetCommerceId) {
    fieldErrors.value = { targetCommerceId: 'Selecciona el comercio destino' }
    return
  }

  const parsed = createSchema.safeParse(form)
  if (!parsed.success) {
    applyZodErrors(parsed.error)
    return
  }
  await handleCreate(parsed.data)
}

async function handleCreate(data: z.infer<typeof createSchema>): Promise<void> {
  const dto: CreateRiderDto = {
    fullName: data.fullName,
    email: data.email,
    password: data.password,
    phone: data.phone,
    vehicleType: data.vehicleType,
  }
  if (data.cedula?.trim()) dto.cedula = data.cedula.trim()
  if (needsPlate(data.vehicleType) && data.licensePlate) {
    dto.licensePlate = data.licensePlate
  }

  try {
    if (isGlobalMode.value) {
      await store.createGlobalRider(dto, photoFile.value)
    } else if (showCommerceSelector.value && form.targetCommerceId) {
      await store.createRider(dto, photoFile.value, form.targetCommerceId)
    } else {
      await store.createRider(dto, photoFile.value)
    }
    emit('created')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo crear el domiciliario'
  }
}

async function handleUpdate(data: z.infer<typeof updateSchema>): Promise<void> {
  if (!props.rider) return
  const dto: UpdateRiderDto = {}
  const current = props.rider

  if (data.fullName !== current.fullName) dto.fullName = data.fullName
  if (data.email !== (current.email ?? '')) dto.email = data.email
  if (data.phone !== current.phone) dto.phone = data.phone
  if (data.vehicleType !== current.vehicleType) dto.vehicleType = data.vehicleType
  const currentCedula = current.cedula ?? ''
  const nextCedula = data.cedula?.trim() ?? ''
  if (nextCedula !== currentCedula) dto.cedula = nextCedula
  const currentPlate = current.licensePlate ?? ''
  const nextPlate = needsPlate(data.vehicleType) ? (data.licensePlate ?? '') : ''
  if (nextPlate !== currentPlate) dto.licensePlate = nextPlate

  try {
    await store.updateRider(current.id, dto)
    emit('updated')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo actualizar el domiciliario'
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
      <div v-if="submitError" class="alert">{{ submitError }}</div>

      <div v-if="showRiderTypeSelector" class="rider-type-selector">
        <label class="rider-type-selector__label">
          Tipo de domiciliario <span class="field__req">*</span>
        </label>
        <div class="rider-type-selector__options" role="radiogroup" aria-label="Tipo de domiciliario">
          <button
            type="button"
            role="radio"
            class="rider-type-card"
            :class="{ 'rider-type-card--active': selectedType === 'private' }"
            :aria-checked="selectedType === 'private'"
            @click="selectedType = 'private'"
          >
            <i class="pi pi-building" aria-hidden="true" />
            <div class="rider-type-card__text">
              <span class="rider-type-card__title">Privado</span>
              <span class="rider-type-card__desc">Solo para un comercio</span>
            </div>
          </button>

          <button
            type="button"
            role="radio"
            class="rider-type-card"
            :class="{ 'rider-type-card--active': selectedType === 'global' }"
            :aria-checked="selectedType === 'global'"
            @click="selectedType = 'global'"
          >
            <i class="pi pi-globe" aria-hidden="true" />
            <div class="rider-type-card__text">
              <span class="rider-type-card__title">Global</span>
              <span class="rider-type-card__desc">Flota compartida</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Foto + Comercio destino en una fila de 2 columnas. La foto va a la
           izquierda y siempre se renderiza en creación; el comercio solo
           cuando aplica (SuperAdmin + Privado). Cuando solo está la foto,
           el row colapsa a una sola columna gracias a
           `:has(> .field:only-child)`. -->
      <div v-if="!isEditMode" class="row row--commerce-photo">
        <div class="field">
          <label class="field__label">Foto <span class="field__req">*</span></label>
          <div
            class="photo"
            :class="{ 'photo--error': photoError }"
          >
            <div class="photo__preview" :class="{ 'photo__preview--empty': !photoPreviewUrl }">
              <img v-if="photoPreviewUrl" :src="photoPreviewUrl" alt="Preview" />
              <i v-else class="pi pi-user photo__preview-icon" aria-hidden="true" />
            </div>
            <div class="photo__actions">
              <Button
                :label="photoFile ? 'Cambiar foto' : 'Subir foto'"
                icon="pi pi-upload"
                severity="secondary"
                outlined
                size="small"
                type="button"
                @click="triggerPhotoPicker"
              />
              <Button
                v-if="photoFile"
                label="Quitar"
                icon="pi pi-times"
                severity="danger"
                text
                size="small"
                type="button"
                @click="removePhoto"
              />
              <span class="photo__hint">JPG, PNG o WebP · máx 10 MB</span>
            </div>
            <input
              ref="photoInputRef"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="photo__input"
              @change="onPhotoSelected"
            />
          </div>
          <span v-if="photoError" class="field__error">{{ photoError }}</span>
        </div>

        <div v-if="showCommerceSelector" class="field">
          <label class="field__label">Comercio destino <span class="field__req">*</span></label>
          <Select
            v-model="form.targetCommerceId"
            :options="[...activeCommerceStore.accessibleCommerces]"
            option-label="commerceName"
            option-value="commerceId"
            placeholder="Selecciona un comercio"
            :class="{ 'field__input--error': fieldErrors.targetCommerceId }"
          />
          <span v-if="fieldErrors.targetCommerceId" class="field__error">
            {{ fieldErrors.targetCommerceId }}
          </span>
        </div>
      </div>

      <div class="field">
        <label class="field__label">Nombre completo <span class="field__req">*</span></label>
        <InputText
          v-model="form.fullName"
          placeholder="Juan Pérez"
          :class="{ 'field__input--error': fieldErrors.fullName }"
        />
        <span v-if="fieldErrors.fullName" class="field__error">{{ fieldErrors.fullName }}</span>
      </div>

      <div class="row">
        <div class="field">
          <label class="field__label">Email <span class="field__req">*</span></label>
          <InputText
            v-model="form.email"
            type="email"
            placeholder="rider@dominio.com"
            :class="{ 'field__input--error': fieldErrors.email }"
          />
          <span v-if="fieldErrors.email" class="field__error">{{ fieldErrors.email }}</span>
        </div>
        <div class="field">
          <label class="field__label">Teléfono <span class="field__req">*</span></label>
          <InputText
            v-model="form.phone"
            placeholder="+57 300 0000000"
            :class="{ 'field__input--error': fieldErrors.phone }"
          />
          <span v-if="fieldErrors.phone" class="field__error">{{ fieldErrors.phone }}</span>
        </div>
      </div>

      <!-- Cédula + Contraseña en la misma fila. Las reglas de password se
           expanden a todo el ancho del row para no romper el grid. -->
      <div v-if="!isEditMode" class="row row--password">
        <div class="field">
          <label class="field__label">Cédula</label>
          <InputText
            v-model="form.cedula"
            placeholder="1.234.567.890"
            :class="{ 'field__input--error': fieldErrors.cedula }"
          />
          <span v-if="fieldErrors.cedula" class="field__error">{{ fieldErrors.cedula }}</span>
        </div>
        <div class="field">
          <label class="field__label">Contraseña <span class="field__req">*</span></label>
          <div class="password">
            <InputText
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Mínimo 8 caracteres"
              autocomplete="new-password"
              class="password__input"
              :class="{ 'field__input--error': fieldErrors.password }"
            />
            <button
              type="button"
              class="password__eye"
              :class="{ 'password__eye--active': showPassword }"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" aria-hidden="true" />
            </button>
          </div>
          <span v-if="fieldErrors.password" class="field__error">{{ fieldErrors.password }}</span>
        </div>
        <ul class="rules row__rules">
          <li
            v-for="rule in passwordRules"
            :key="rule.key"
            class="rules__item"
            :class="{ 'rules__item--ok': ruleStatus[rule.key] }"
          >
            <span class="rules__dot" />
            {{ rule.label }}
          </li>
        </ul>
      </div>

      <!-- En edición, cédula vive sola — no hay campo de contraseña aquí. -->
      <div v-else class="field">
        <label class="field__label">Cédula</label>
        <InputText
          v-model="form.cedula"
          placeholder="1.234.567.890"
          :class="{ 'field__input--error': fieldErrors.cedula }"
        />
        <span v-if="fieldErrors.cedula" class="field__error">{{ fieldErrors.cedula }}</span>
      </div>

      <div class="row">
        <div class="field">
          <label class="field__label">Tipo de vehículo <span class="field__req">*</span></label>
          <Select
            v-model="form.vehicleType"
            :options="[...VEHICLE_OPTIONS]"
            option-label="label"
            option-value="value"
            placeholder="Selecciona un vehículo"
            :class="{ 'field__input--error': fieldErrors.vehicleType }"
          />
          <span v-if="fieldErrors.vehicleType" class="field__error">{{ fieldErrors.vehicleType }}</span>
        </div>

        <div v-if="needsPlate(form.vehicleType)" class="field">
          <label class="field__label">Placa <span class="field__req">*</span></label>
          <InputText
            v-model="form.licensePlate"
            placeholder="ABC-123"
            :class="{ 'field__input--error': fieldErrors.licensePlate }"
          />
          <span v-if="fieldErrors.licensePlate" class="field__error">{{ fieldErrors.licensePlate }}</span>
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
          :disabled="isPhotoMissing"
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

.rider-type-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rider-type-selector__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-muted);
}

.rider-type-selector__options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.rider-type-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 9px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  text-align: left;
  color: var(--color-muted);
  font-family: inherit;
}

.rider-type-card:hover:not(.rider-type-card--active) {
  border-color: color-mix(in srgb, var(--color-brand) 50%, var(--color-border));
  background: color-mix(in srgb, var(--color-brand) 5%, var(--color-bg));
}

.rider-type-card--active {
  border-color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 12%, var(--color-bg));
  color: var(--color-text);
}

.rider-type-card i {
  font-size: 18px;
  color: var(--color-brand);
  flex-shrink: 0;
}

.rider-type-card__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rider-type-card__title {
  font-weight: 600;
  font-size: 14px;
}

.rider-type-card__desc {
  font-size: 12px;
  opacity: 0.75;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* La fila de Cédula + Contraseña deja que las reglas se expandan al ancho
   total para que no se aplasten en una sola columna. */
.row--password {
  row-gap: 8px;
}

.row__rules {
  grid-column: 1 / -1;
}

/* Comercio destino + Foto: alineamos al inicio para que el card de la foto
   (más alto que el Select) no estire al Select por contagio de altura. Si
   solo queda la foto (no hay commerce selector), colapsa a una columna y la
   foto ocupa el ancho razonable sin estirarse a 50% del row. */
.row--commerce-photo {
  align-items: start;
}

.row--commerce-photo:has(> .field:only-child) {
  grid-template-columns: 1fr;
  max-width: 50%;
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
.field__input--error :deep(.p-select) {
  border-color: var(--color-error) !important;
}

.field__error {
  font-size: 11px;
  color: var(--color-error);
}

.password {
  position: relative;
}

.password__input :deep(input),
.password :deep(.p-inputtext) {
  width: 100%;
  padding-right: 42px !important;
}

.password__eye {
  position: absolute;
  right: 13px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  outline: none;
  color: var(--color-muted);
  font-size: 15px;
  cursor: pointer;
  padding: 0;
  opacity: 0.7;
  transition: opacity 0.15s ease, color 0.15s ease;
}

.password__eye:hover,
.password__eye--active {
  color: var(--color-text);
  opacity: 1;
}

.rules {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 14px;
}

.rules__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-muted);
  transition: color 0.15s ease;
}

.rules__dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--color-muted);
  transition: background 0.15s ease;
}

.rules__item--ok {
  color: var(--color-brand);
}

.rules__item--ok .rules__dot {
  background: var(--color-brand);
}

.photo {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  transition: border-color 0.15s ease;
}

.photo--error {
  border-color: var(--color-error);
}

.photo__preview {
  width: 64px;
  height: 64px;
  border-radius: 9999px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-brand) 12%, transparent);
  color: var(--color-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.photo__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo__preview-icon {
  font-size: 22px;
  opacity: 0.5;
}

.photo__preview--empty {
  background: transparent;
}

.photo__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-width: 0;
}

.photo__hint {
  font-size: 11px;
  color: var(--color-muted);
  flex-basis: 100%;
}

.photo__input {
  display: none;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
