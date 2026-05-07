<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import { useAuth } from '~/composables/useAuth'
import { useUsersStore } from '../store/users.store'
import type { CreateUserDto, UpdateUserDto, User, UserRole } from '../types/user.types'

interface Props {
  visible: boolean
  user?: User | null
}
const props = withDefaults(defineProps<Props>(), { user: null })

const emit = defineEmits<{
  'update:visible': [value: boolean]
  created: []
  updated: []
}>()

const store = useUsersStore()
const { user: authUser } = useAuth()

const isEditMode = computed<boolean>(() => props.user !== null)
const modalTitle = computed<string>(() => isEditMode.value ? 'Editar usuario' : 'Nuevo usuario')
const submitLabel = computed<string>(() => isEditMode.value ? 'Guardar cambios' : 'Crear usuario')
const isBusy = computed<boolean>(() => store.isCreating || store.isUpdating)

const ALL_ROLES: ReadonlyArray<{ label: string; value: UserRole }> = [
  { label: 'SuperAdmin',    value: 'SuperAdmin' },
  { label: 'CommerceAdmin', value: 'CommerceAdmin' },
  { label: 'PointSaleUser', value: 'PointSaleUser' },
  { label: 'Rider',         value: 'Rider' },
  { label: 'Supervisor',    value: 'Supervisor' },
]

const roleOptions = computed(() => {
  if (authUser.value?.role === 'SuperAdmin') return [...ALL_ROLES]
  return ALL_ROLES.filter((r) => r.value !== 'SuperAdmin')
})

interface FormState {
  username: string
  password: string
  fullName: string
  email: string
  phone: string
  role: UserRole | null
  commerceIds: string[]
}

function emptyForm(): FormState {
  return {
    username: '',
    password: '',
    fullName: '',
    email: '',
    phone: '',
    role: null,
    commerceIds: [],
  }
}

function formFromUser(u: User): FormState {
  return {
    username: u.username,
    password: '',
    fullName: u.fullName ?? '',
    email: u.email ?? '',
    phone: u.phone ?? '',
    role: u.role,
    commerceIds: (u.commerces ?? []).map((c) => c.commerceId),
  }
}

const form = reactive<FormState>(emptyForm())
const showPassword = ref<boolean>(false)
const submitError = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<keyof FormState, string>>>({})

interface PasswordRule {
  key: string
  label: string
  test: (v: string) => boolean
}

const passwordRules: PasswordRule[] = [
  { key: 'length',  label: 'Mínimo 8 caracteres', test: (v) => v.length >= 8 },
  { key: 'upper',   label: 'Una mayúscula',       test: (v) => /[A-Z]/.test(v) },
  { key: 'number',  label: 'Un número',           test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'Un carácter especial', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

const ruleStatus = computed<Record<string, boolean>>(() => {
  const result: Record<string, boolean> = {}
  for (const rule of passwordRules) result[rule.key] = rule.test(form.password)
  return result
})

const allRulesPassed = computed<boolean>(() =>
  passwordRules.every((r) => ruleStatus.value[r.key] === true),
)

const canSubmit = computed<boolean>(() => {
  if (isEditMode.value) return true
  return allRulesPassed.value
})

const commerceOptions = computed(() =>
  store.availableCommerces.map((c) => ({ label: c.name, value: c.id })),
)

// Validación Zod — create
const usernameSchema = z
  .string()
  .min(3, 'El usuario debe tener al menos 3 caracteres')
  .max(30, 'El usuario no puede superar 30 caracteres')
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Formato de usuario inválido')

const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
  .regex(/[0-9]/, 'Debe contener al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial')

const emailSchema = z.string().email('Email inválido').optional().or(z.literal(''))

const createSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  fullName: z.string().optional(),
  email: emailSchema,
  phone: z.string().optional(),
  role: z.enum(['SuperAdmin', 'CommerceAdmin', 'PointSaleUser', 'Rider', 'Supervisor']),
  commerceIds: z.array(z.string()),
}).superRefine((val, ctx) => {
  if (val.role !== 'SuperAdmin' && val.commerceIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['commerceIds'],
      message: 'Selecciona al menos un comercio',
    })
  }
})

// Validación Zod — edit (sin username ni password)
const editSchema = z.object({
  fullName: z.string().optional(),
  email: emailSchema,
  phone: z.string().optional(),
  role: z.enum(['SuperAdmin', 'CommerceAdmin', 'PointSaleUser', 'Rider', 'Supervisor']),
  commerceIds: z.array(z.string()),
}).superRefine((val, ctx) => {
  if (val.role !== 'SuperAdmin' && val.commerceIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['commerceIds'],
      message: 'Selecciona al menos un comercio',
    })
  }
})

function resetForm(): void {
  if (props.user) {
    Object.assign(form, formFromUser(props.user))
  } else {
    Object.assign(form, emptyForm())
    prefillCommercesForAdmin()
  }
  fieldErrors.value = {}
  submitError.value = null
  showPassword.value = false
}

function prefillCommercesForAdmin(): void {
  if (authUser.value?.role === 'CommerceAdmin') {
    const owned = authUser.value.commerces ?? []
    form.commerceIds = owned.map((c) => c.commerceId)
  }
}

watch(
  () => props.visible,
  async (isVisible) => {
    if (isVisible) {
      resetForm()
      if (store.availableCommerces.length === 0) {
        await store.fetchAvailableCommerces()
      }
    }
  },
)

function closeModal(): void {
  emit('update:visible', false)
}

async function handleSubmit(): Promise<void> {
  submitError.value = null
  fieldErrors.value = {}

  if (isEditMode.value) {
    await handleUpdate()
  } else {
    await handleCreate()
  }
}

async function handleCreate(): Promise<void> {
  const parsed = createSchema.safeParse(form)
  if (!parsed.success) {
    applyZodErrors(parsed.error)
    return
  }

  const dto: CreateUserDto = {
    username: parsed.data.username,
    password: parsed.data.password,
    role: parsed.data.role,
  }
  if (parsed.data.fullName) dto.fullName = parsed.data.fullName
  if (parsed.data.email) dto.email = parsed.data.email
  if (parsed.data.phone) dto.phone = parsed.data.phone
  if (parsed.data.commerceIds.length > 0) dto.commerceIds = parsed.data.commerceIds

  try {
    await store.createUser(dto)
    emit('created')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo crear el usuario'
  }
}

async function handleUpdate(): Promise<void> {
  if (!props.user) return

  const parsed = editSchema.safeParse({
    fullName: form.fullName,
    email: form.email,
    phone: form.phone,
    role: form.role,
    commerceIds: form.commerceIds,
  })
  if (!parsed.success) {
    applyZodErrors(parsed.error)
    return
  }

  const dto: UpdateUserDto = {}
  if (parsed.data.fullName !== (props.user.fullName ?? '')) dto.fullName = parsed.data.fullName || undefined
  if (parsed.data.email !== (props.user.email ?? '')) dto.email = parsed.data.email || undefined
  if (parsed.data.phone !== (props.user.phone ?? '')) dto.phone = parsed.data.phone || undefined
  if (parsed.data.role !== props.user.role) dto.role = parsed.data.role

  try {
    await store.updateUser(props.user.id, dto)
    emit('updated')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo actualizar el usuario'
  }
}

function applyZodErrors(error: z.ZodError): void {
  const errors: Partial<Record<keyof FormState, string>> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string') {
      errors[key as keyof FormState] = issue.message
    }
  }
  fieldErrors.value = errors
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '560px' }"
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

      <!-- Username: editable solo en creación -->
      <div class="field">
        <label class="field__label">Usuario <span v-if="!isEditMode" class="field__req">*</span></label>
        <InputText
          v-if="!isEditMode"
          v-model="form.username"
          placeholder="usuario"
          autocomplete="off"
          :class="{ 'field__input--error': fieldErrors.username }"
        />
        <div v-else class="field__readonly">{{ form.username }}</div>
        <span v-if="fieldErrors.username" class="field__error">{{ fieldErrors.username }}</span>
      </div>

      <!-- Contraseña: solo en creación -->
      <div v-if="!isEditMode" class="field">
        <label class="field__label">Contraseña <span class="field__req">*</span></label>
        <div class="field__wrap">
          <InputText
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="••••••••"
            autocomplete="new-password"
            :class="{ 'field__input--error': fieldErrors.password }"
          />
          <button
            type="button"
            class="field__eye"
            :class="{ 'field__eye--active': showPassword }"
            :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            @click="showPassword = !showPassword"
          >
            <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" aria-hidden="true" />
          </button>
        </div>
        <ul class="rules">
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
        <span v-if="fieldErrors.password" class="field__error">{{ fieldErrors.password }}</span>
      </div>

      <div class="row">
        <div class="field">
          <label class="field__label">Nombre completo</label>
          <InputText v-model="form.fullName" placeholder="Juan Pérez" />
        </div>
        <div class="field">
          <label class="field__label">Email</label>
          <InputText
            v-model="form.email"
            type="email"
            placeholder="correo@dominio.com"
            :class="{ 'field__input--error': fieldErrors.email }"
          />
          <span v-if="fieldErrors.email" class="field__error">{{ fieldErrors.email }}</span>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label class="field__label">Teléfono</label>
          <InputText v-model="form.phone" placeholder="+57 300 0000000" />
        </div>
        <div class="field">
          <label class="field__label">Rol <span class="field__req">*</span></label>
          <Select
            v-model="form.role"
            :options="roleOptions"
            option-label="label"
            option-value="value"
            placeholder="Selecciona un rol"
            :class="{ 'field__input--error': fieldErrors.role }"
          />
          <span v-if="fieldErrors.role" class="field__error">{{ fieldErrors.role }}</span>
        </div>
      </div>

      <div class="field">
        <label class="field__label">
          Comercios
          <span v-if="form.role && form.role !== 'SuperAdmin'" class="field__req">*</span>
        </label>
        <MultiSelect
          v-model="form.commerceIds"
          :options="commerceOptions"
          option-label="label"
          option-value="value"
          :loading="store.isLoadingCommerces"
          placeholder="Selecciona uno o más comercios"
          :class="{ 'field__input--error': fieldErrors.commerceIds }"
          display="chip"
        />
        <span v-if="fieldErrors.commerceIds" class="field__error">{{ fieldErrors.commerceIds }}</span>
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
          :disabled="!canSubmit"
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

.field__readonly {
  font-size: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--color-muted);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 9px;
  padding: 12px 16px;
}

.field__wrap {
  position: relative;
}

.field__wrap :deep(.p-inputtext) {
  padding-right: 42px;
  width: 100%;
}

.field__eye {
  position: absolute;
  right: 13px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  outline: none;
  cursor: pointer;
  padding: 4px;
  color: #4a4a49;
  display: flex;
  align-items: center;
  justify-content: center;
}

.field__eye:hover { color: #8A8A88; }
.field__eye--active { opacity: 0.35; }

.field :deep(.p-inputtext),
.field :deep(.p-select),
.field :deep(.p-multiselect) {
  width: 100%;
}

.field__input--error :deep(.p-inputtext),
.field__input--error :deep(.p-select),
.field__input--error :deep(.p-multiselect),
:deep(.p-inputtext.field__input--error) {
  border-color: var(--color-error) !important;
}

.field__error {
  font-size: 11px;
  color: var(--color-error);
}

.rules {
  list-style: none;
  padding: 10px 12px;
  margin: 4px 0 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 9px;
}

.rules__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-muted);
}

.rules__dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: var(--color-border);
}

.rules__item--ok {
  color: var(--color-brand);
}

.rules__item--ok .rules__dot {
  background: var(--color-brand);
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
