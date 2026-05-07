<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useAppToast } from '~/composables/useToast'
import { useRidersStore } from '../store/riders.store'
import type { Rider } from '../types/rider.types'

interface Props {
  visible: boolean
  rider: Rider | null
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  reset: []
}>()

const store = useRidersStore()
const toast = useAppToast()

const isBusy = ref<boolean>(false)

interface PasswordRule {
  key: string
  label: string
  test: (value: string) => boolean
}

// Mismas 4 reglas que CreateRiderModal y el flujo de cambio en login —
// el backend valida lo mismo en `riders:reset-password`.
const passwordRules: ReadonlyArray<PasswordRule> = [
  { key: 'length',  label: 'Mínimo 8 caracteres',   test: (v) => v.length >= 8 },
  { key: 'upper',   label: 'Una mayúscula',         test: (v) => /[A-Z]/.test(v) },
  { key: 'number',  label: 'Un número',             test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'Un carácter especial',  test: (v) => /[^A-Za-z0-9]/.test(v) },
]

interface FormState {
  newPassword: string
}

const form = reactive<FormState>({ newPassword: '' })
const showPassword = ref<boolean>(false)
const submitError = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<keyof FormState, string>>>({})

const schema = z.object({
  newPassword: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
})

const ruleStatus = computed<Record<string, boolean>>(() => {
  const result: Record<string, boolean> = {}
  for (const rule of passwordRules) result[rule.key] = rule.test(form.newPassword)
  return result
})

const allRulesPassed = computed<boolean>(
  () => passwordRules.every((r) => ruleStatus.value[r.key] === true),
)

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] as string).charAt(0).toUpperCase()
  return `${(parts[0] as string).charAt(0)}${(parts[parts.length - 1] as string).charAt(0)}`.toUpperCase()
}

function resetForm(): void {
  form.newPassword = ''
  showPassword.value = false
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
  if (!props.rider) return
  submitError.value = null
  fieldErrors.value = {}
  const parsed = schema.safeParse(form)
  if (!parsed.success) {
    applyZodErrors(parsed.error)
    return
  }
  isBusy.value = true
  try {
    await store.resetPassword(props.rider.id, parsed.data.newPassword)
    toast.success('Contraseña actualizada')
    emit('reset')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo cambiar la contraseña'
  } finally {
    isBusy.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '520px' }"
    header="Cambiar contraseña del domiciliario"
    :pt="{
      root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
      header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text);' },
      footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <div v-if="rider" class="form">
      <header class="rider-card">
        <div class="rider-card__avatar">
          <img v-if="rider.photoUrl" :src="rider.photoUrl" :alt="rider.fullName" />
          <span v-else class="rider-card__initials">{{ initials(rider.fullName) }}</span>
        </div>
        <div class="rider-card__info">
          <span class="rider-card__name">{{ rider.fullName }}</span>
          <span v-if="rider.cedula" class="rider-card__cedula">{{ rider.cedula }}</span>
          <span v-else class="rider-card__cedula rider-card__cedula--muted">Sin cédula</span>
        </div>
      </header>

      <div class="info">
        <i class="pi pi-info-circle" aria-hidden="true" />
        <span>
          Esta contraseña reemplazará la actual. Entrégasela al domiciliario
          para que la use en la app móvil.
        </span>
      </div>

      <div v-if="submitError" class="alert">{{ submitError }}</div>

      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label class="field__label">Nueva contraseña <span class="field__req">*</span></label>
          <div class="password">
            <InputText
              v-model="form.newPassword"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Mínimo 8 caracteres"
              autocomplete="new-password"
              class="password__input"
              :class="{ 'field__input--error': fieldErrors.newPassword }"
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
          <span v-if="fieldErrors.newPassword" class="field__error">{{ fieldErrors.newPassword }}</span>
        </div>
      </form>
    </div>

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
          label="Cambiar contraseña"
          :loading="isBusy"
          :disabled="!allRulesPassed"
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
  gap: 16px;
  padding-top: 6px;
}

.rider-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.rider-card__avatar {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  border: 2px solid var(--color-border);
  background: color-mix(in srgb, var(--color-brand) 12%, transparent);
  color: var(--color-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.rider-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rider-card__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rider-card__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}

.rider-card__cedula {
  font-size: 12px;
  color: var(--color-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.rider-card__cedula--muted {
  font-style: italic;
  font-family: inherit;
}

.info {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--color-brand) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-brand) 30%, transparent);
  border-radius: 9px;
  font-size: 12px;
  color: var(--color-text);
  line-height: 1.45;
}

.info i {
  color: var(--color-brand);
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.alert {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
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

.field :deep(.p-inputtext) {
  width: 100%;
}

.field__input--error :deep(.p-inputtext) {
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

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
