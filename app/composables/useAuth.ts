import { computed } from 'vue'
import { useAuthStore, type AuthUser } from '~/stores/auth.store'
import { humanizeAuthError } from '~/utils/error.utils'

const REFRESH_TOKEN_KEY = 'spdy.refreshToken'

function readStoredRefreshToken(): string | null {
  if (!import.meta.client) return null
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

interface LoginCredentials {
  username: string
  password: string
}

interface LoginTokensResponse {
  accessToken: string
  refreshToken: string
}

interface LoginPasswordChangeResponse {
  requiresPasswordChange: true
  tempToken: string
}

type LoginResponse = LoginTokensResponse | LoginPasswordChangeResponse

interface LoginResult {
  requiresPasswordChange: boolean
}

interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

interface MeResponse extends AuthUser {}

function isPasswordChangeResponse(
  res: LoginResponse,
): res is LoginPasswordChangeResponse {
  return (res as LoginPasswordChangeResponse).requiresPasswordChange === true
}

export function useAuth() {
  const store = useAuthStore()
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBaseUrl

  const user = computed(() => store.user)
  const isAuthenticated = computed(() => store.isAuthenticated)
  const accessToken = computed(() => store.accessToken)

  // Wrapper autenticado con interceptor de 401. Delega a authenticatedFetch.
  async function request<T>(
    path: string,
    init: {
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
      body?: unknown
      token?: string | null
      retryOn401?: boolean
    } = {},
  ): Promise<T> {
    const { authenticatedFetch } = await import('~/services/http.client')
    const headers: Record<string, string> = {}
    if (init.token) headers.Authorization = `Bearer ${init.token}`
    return authenticatedFetch<T>(path, {
      method: init.method,
      body: init.body,
      headers: init.token ? headers : undefined,
      retryOn401: init.retryOn401,
    })
  }

  async function tryRefresh(explicitToken?: string): Promise<boolean> {
    const refreshToken = explicitToken ?? readStoredRefreshToken()
    if (!refreshToken) return false
    try {
      const res = await $fetch<RefreshResponse>('/auth/refresh', {
        baseURL,
        method: 'POST',
        body: { refreshToken },
        headers: { 'X-Client-Type': 'web' },
      })
      store.setTokens(res.accessToken, res.refreshToken)
      return true
    } catch {
      return false
    }
  }

  async function login(credentials: LoginCredentials): Promise<LoginResult> {
    // IMPORTANTE: usa $fetch directamente, nunca request<T>().
    // Si el backend responde 401 en /auth/login, debe mostrarse como error
    // al usuario — JAMÁS debe dispararse el interceptor de refresh.
    let res: LoginResponse
    try {
      res = await $fetch<LoginResponse>('/auth/login', {
        baseURL,
        method: 'POST',
        body: credentials,
        // El backend usa este header para rechazar logins de Riders en el CMS
        // (responde 403 con mensaje en español que `humanizeAuthError` propaga
        // tal cual al usuario).
        headers: { 'X-Client-Type': 'web' },
      })
    } catch (err: unknown) {
      throw new Error(humanizeAuthError(err))
    }

    if (isPasswordChangeResponse(res)) {
      store.setTempToken(res.tempToken)
      return { requiresPasswordChange: true }
    }

    store.setTokens(res.accessToken, res.refreshToken)

    // Cargar perfil con $fetch directo (sin interceptor) para que un fallo aquí
    // no pueda tumbar el flujo de login ni disparar refresh.
    try {
      const me = await $fetch<MeResponse>('/users/me', {
        baseURL,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${res.accessToken}`,
          'X-Client-Type': 'web',
        },
      })
      store.setUser(me)
    } catch {
      // No bloquear login por error en /users/me; se recarga más tarde.
    }

    return { requiresPasswordChange: false }
  }

  async function changePasswordWithTempToken(newPassword: string): Promise<void> {
    if (!store.tempToken) {
      throw new Error('No hay un token temporal activo')
    }
    const res = await request<LoginTokensResponse>('/auth/change-password', {
      method: 'POST',
      body: { newPassword },
      token: store.tempToken,
      retryOn401: false,
    })
    store.setTokens(res.accessToken, res.refreshToken)
    await fetchMe()
  }

  async function changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    })
  }

  async function fetchMe(): Promise<void> {
    try {
      const me = await request<MeResponse>('/users/me')
      store.setUser(me)
    } catch {
      // la sesión ya fue limpiada por el interceptor si era 401
    }
  }

  async function logout(): Promise<void> {
    try {
      if (store.accessToken) {
        await $fetch('/auth/logout', {
          baseURL,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${store.accessToken}`,
            'X-Client-Type': 'web',
          },
          body: { refreshToken: store.refreshToken },
        })
      }
    } catch {
      // no bloquear logout por error de red
    } finally {
      // Hard reload obligatorio: con navegación SPA quedan vivos los stores de
      // monitoring/riders/zones/etc. con datos del usuario anterior, sus
      // watchers y el polling de useRiderTracking. Tras login del próximo
      // usuario eso dispara fetches con contexto viejo que pueden 401/403,
      // el interceptor del http.client llama auth.clear() y rebota a /login.
      // Pinia setup-stores no auto-generan $reset(), así que el camino más
      // confiable es iniciar el siguiente ciclo de la app desde cero.
      store.clear()
      if (import.meta.client) {
        window.location.assign('/login')
      }
    }
  }

  async function logoutAll(): Promise<void> {
    try {
      if (store.accessToken) {
        await $fetch('/auth/logout-all', {
          baseURL,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${store.accessToken}`,
            'X-Client-Type': 'web',
          },
        })
      }
    } catch {
      // ignore
    } finally {
      store.clear()
      if (import.meta.client) {
        window.location.assign('/login')
      }
    }
  }

  return {
    user,
    isAuthenticated,
    accessToken,
    login,
    logout,
    logoutAll,
    changePassword,
    changePasswordWithTempToken,
    fetchMe,
    tryRefresh,
  }
}

