<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'auth',
  auth: false,
})

type Stage = 'login' | 'change-password'

const { login, changePasswordWithTempToken } = useAuth()

const stage = ref<Stage>('login')
const isSubmitting = ref<boolean>(false)
const errorMessage = ref<string | null>(null)

// Login state
const username = ref<string>('')
const password = ref<string>('')
const showPassword = ref<boolean>(false)

// Change password state
const newPassword = ref<string>('')
const confirmPassword = ref<string>('')
const showNewPassword = ref<boolean>(false)
const showConfirmPassword = ref<boolean>(false)

interface PasswordRule {
  key: string
  label: string
  test: (value: string) => boolean
}

const passwordRules: PasswordRule[] = [
  { key: 'length',  label: 'Mínimo 8 caracteres', test: (v) => v.length >= 8 },
  { key: 'upper',   label: 'Una mayúscula',       test: (v) => /[A-Z]/.test(v) },
  { key: 'number',  label: 'Un número',           test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'Un carácter especial', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

const ruleStatus = computed<Record<string, boolean>>(() => {
  const result: Record<string, boolean> = {}
  for (const rule of passwordRules) result[rule.key] = rule.test(newPassword.value)
  return result
})

const allRulesPassed = computed<boolean>(() =>
  passwordRules.every((r) => ruleStatus.value[r.key] === true),
)

const passwordsMatch = computed<boolean>(
  () => confirmPassword.value.length > 0 && newPassword.value === confirmPassword.value,
)

// Hard reload deliberado en lugar de navigateTo: si el usuario anterior dejó
// stores de Pinia con datos suyos (monitoring/riders/zones/etc.), esos datos
// + watchers + polling sobreviven a una transición SPA y disparan requests
// con contexto viejo bajo el token nuevo, que terminan 401/403 → el
// interceptor llama auth.clear() y rebota a /login. Reload garantiza arranque
// limpio (igual que un Ctrl+R) y deja que `auth.client.ts` rehidrate la
// sesión con los tokens recién persistidos en localStorage.
function redirectToMonitoring(): void {
  if (import.meta.client) {
    window.location.assign('/monitoring')
  }
}

async function handleLogin(): Promise<void> {
  if (isSubmitting.value) return
  errorMessage.value = null
  isSubmitting.value = true
  try {
    const result = await login({ username: username.value, password: password.value })
    if (result.requiresPasswordChange) {
      stage.value = 'change-password'
      isSubmitting.value = false
    } else {
      // Mantenemos isSubmitting=true durante el reload para que el botón
      // siga deshabilitado y no pueda re-enviarse el formulario.
      redirectToMonitoring()
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Credenciales inválidas'
    isSubmitting.value = false
  }
}

async function handleChangePassword(): Promise<void> {
  if (isSubmitting.value) return
  errorMessage.value = null
  if (!allRulesPassed.value) {
    errorMessage.value = 'La contraseña no cumple los requisitos'
    return
  }
  if (!passwordsMatch.value) {
    errorMessage.value = 'Las contraseñas no coinciden'
    return
  }
  isSubmitting.value = true
  try {
    await changePasswordWithTempToken(newPassword.value)
    redirectToMonitoring()
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'No se pudo actualizar la contraseña'
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="card">
    <div class="card__logo">
      <div class="card__logo-mark">
        <i class="pi pi-check" />
      </div>
      <div class="card__logo-title">SPDY</div>
      <div class="card__logo-subtitle">Monitoreo operacional</div>
    </div>

    <!-- Stage 1: Login -->
    <template v-if="stage === 'login'">
      <h1 class="card__title">Bienvenido de nuevo</h1>
      <p class="card__subtitle">Ingresa tus credenciales para continuar</p>

      <div v-if="errorMessage" class="alert">{{ errorMessage }}</div>

      <form class="form" @submit.prevent="handleLogin">
        <label class="field">
          <span class="field__label">Usuario</span>
          <input
            v-model="username"
            type="text"
            class="field__input"
            placeholder="usuario"
            autocomplete="username"
            required
          />
        </label>

        <label class="field">
          <span class="field__label">Contraseña</span>
          <div class="field__wrap">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="field__input"
              placeholder="••••••••"
              autocomplete="current-password"
              required
            />
            <button
              type="button"
              class="field__eye"
              :class="{ 'field__eye--active': showPassword }"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" aria-hidden="true" />
            </button>
          </div>
        </label>

        <button type="submit" class="btn-primary" :disabled="isSubmitting">
          {{ isSubmitting ? 'Ingresando…' : 'Iniciar sesión' }}
        </button>
      </form>
    </template>

    <!-- Stage 2: Change password -->
    <template v-else>
      <div class="steps">
        <div class="steps__item steps__item--done">
          <span class="steps__dot"><i class="pi pi-check" /></span>
          <span>Autenticado</span>
        </div>
        <div class="steps__bar" />
        <div class="steps__item steps__item--active">
          <span class="steps__dot">2</span>
          <span>Nueva contraseña</span>
        </div>
      </div>

      <h1 class="card__title">Crea tu contraseña</h1>
      <p class="card__subtitle">Es tu primer acceso, establece una nueva contraseña</p>

      <div v-if="errorMessage" class="alert">{{ errorMessage }}</div>

      <form class="form" @submit.prevent="handleChangePassword">
        <label class="field">
          <span class="field__label">Nueva contraseña</span>
          <div class="field__wrap">
            <input
              v-model="newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              class="field__input"
              placeholder="••••••••"
              autocomplete="new-password"
              required
            />
            <button
              type="button"
              class="field__eye"
              :class="{ 'field__eye--active': showNewPassword }"
              :aria-label="showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="showNewPassword"
              @click="showNewPassword = !showNewPassword"
            >
              <i :class="showNewPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" aria-hidden="true" />
            </button>
          </div>
        </label>

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

        <label class="field">
          <span class="field__label">Confirmar contraseña</span>
          <div class="field__wrap">
            <input
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              class="field__input"
              :class="{ 'field__input--error': confirmPassword.length > 0 && !passwordsMatch }"
              placeholder="••••••••"
              autocomplete="new-password"
              required
            />
            <button
              type="button"
              class="field__eye"
              :class="{ 'field__eye--active': showConfirmPassword }"
              :aria-label="showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="showConfirmPassword"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <i :class="showConfirmPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" aria-hidden="true" />
            </button>
          </div>
        </label>

        <button
          type="submit"
          class="btn-primary"
          :disabled="isSubmitting || !allRulesPassed || !passwordsMatch"
        >
          {{ isSubmitting ? 'Guardando…' : 'Guardar y entrar' }}
        </button>
      </form>
    </template>
  </div>
</template>

<style scoped>
.card {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 44px 40px;
  color: var(--color-text);
}

.card__logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 26px;
}

.card__logo-mark {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--color-brand);
  color: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 6px;
}

.card__logo-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 1px;
}

.card__logo-subtitle {
  font-size: 11px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.card__title {
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  margin: 0 0 6px;
}

.card__subtitle {
  font-size: 13px;
  color: var(--color-muted);
  text-align: center;
  margin: 0 0 22px;
}

.alert {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
  margin-bottom: 16px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 12px;
  color: var(--color-muted);
  font-weight: 500;
}

.field__wrap {
  position: relative;
}

.field__input {
  width: 100%;
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--color-text);
  outline: none;
  transition: border-color 0.15s ease;
}

.field__input::placeholder {
  color: #4a4a49;
}

.field__input:focus {
  border-color: var(--color-brand);
}

.field__input--error {
  border-color: var(--color-error);
}

.field__wrap .field__input {
  padding-right: 42px;
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
  line-height: 0;
}

.field__eye svg {
  display: block;
}

.field__eye:hover {
  color: #8A8A88;
}

.field__eye--active {
  opacity: 0.35;
}

.btn-primary {
  background: var(--color-brand);
  color: var(--color-bg);
  font-weight: 700;
  border: none;
  border-radius: 9px;
  padding: 13px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Steps */
.steps {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
  font-size: 11px;
  color: var(--color-muted);
}

.steps__item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.steps__dot {
  width: 20px;
  height: 20px;
  border-radius: 9999px;
  background: var(--color-border);
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}

.steps__item--done .steps__dot {
  background: var(--color-brand);
  color: var(--color-bg);
}

.steps__item--active .steps__dot {
  background: var(--color-brand);
  color: var(--color-bg);
}

.steps__item--active {
  color: var(--color-text);
}

.steps__bar {
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

/* Rules */
.rules {
  list-style: none;
  padding: 12px 14px;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
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
</style>
