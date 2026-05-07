import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type Role = 'SuperAdmin' | 'CommerceAdmin' | 'PointSaleUser' | 'Rider' | 'Supervisor'

export interface AuthUser {
  id: string
  username: string
  role: Role
  fullName?: string
  email?: string
  phone?: string
  mustChangePassword?: boolean
  commerces?: { commerceId: string; commerceName: string }[]
}

const REFRESH_TOKEN_KEY = 'spdy.refreshToken'

export const useAuthStore = defineStore('auth', () => {
  // accessToken SOLO en memoria
  const accessToken = ref<string | null>(null)
  // refreshToken en memoria reactiva, persistido a localStorage
  const refreshToken = ref<string | null>(null)
  // tempToken para flujo de cambio obligatorio
  const tempToken = ref<string | null>(null)

  const user = ref<AuthUser | null>(null)
  const hydrated = ref<boolean>(false)

  const isAuthenticated = computed<boolean>(() => accessToken.value !== null)

  function setTokens(access: string, refresh: string): void {
    accessToken.value = access
    refreshToken.value = refresh
    if (import.meta.client) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
    }
    tempToken.value = null
  }

  function setTempToken(token: string): void {
    tempToken.value = token
  }

  function setUser(value: AuthUser | null): void {
    user.value = value
  }

  function clear(): void {
    accessToken.value = null
    refreshToken.value = null
    tempToken.value = null
    user.value = null
    if (import.meta.client) {
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    }
  }

  function hydrateFromStorage(): void {
    if (hydrated.value) return
    if (!import.meta.client) return
    const stored = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (stored) refreshToken.value = stored
    hydrated.value = true
  }

  return {
    accessToken,
    refreshToken,
    tempToken,
    user,
    isAuthenticated,
    setTokens,
    setTempToken,
    setUser,
    clear,
    hydrateFromStorage,
  }
})
