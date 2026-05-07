// Contexto global de "comercio activo" — driver de filtrado de TODOS los
// módulos scoped a commerce (riders, zones, pdvs, schedule, monitoring).
//
// Reglas de inicialización tras login / hydratación:
//   - SuperAdmin            → preferimos lo persistido si sigue siendo válido;
//                              default `null` ("Todos los comercios").
//   - CommerceAdmin (1)     → forzamos al ID de su único commerce, ignoramos
//                              storage; el selector queda bloqueado.
//   - CommerceAdmin (varios)→ preferimos lo persistido si le pertenece;
//                              default = primer commerce de su lista.
//   - Roles sin commerces   → `null` y selector oculto.
//
// La fuente de verdad de la lista accesible:
//   - SuperAdmin    → `useCommerceStore().commerces` (GET /commerce)
//   - resto         → `auth.user.commerces` (viene en /users/me)
//
// `syncActiveCommerceWithAuth()` arriba abajo es el entrypoint imperativo:
// resuelve la lista correcta según rol y dispara `initFromAuth`. Lo llaman
// `useAuth.login()`, `useAuth.fetchMe()` y, si hace falta, la propia UI antes
// de leer `accessibleCommerces`.

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore, type AuthUser } from './auth.store'
import { useCommerceStore } from '~/modules/commerce/store/commerce.store'

const STORAGE_KEY = 'spdy.activeCommerceId'

export interface AccessibleCommerce {
  commerceId: string
  commerceName: string
}

function readStored(): string | null {
  if (!import.meta.client) return null
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw && raw.length > 0 ? raw : null
}

function writeStored(id: string | null): void {
  if (!import.meta.client) return
  if (id === null) localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, id)
}

export const useActiveCommerceStore = defineStore('activeCommerce', () => {
  // `null` significa "Todos los comercios" — solo SuperAdmin lo ve.
  const activeCommerceId = ref<string | null>(null)

  // Lista que alimenta el selector. Se popula vía `initFromAuth` y la usamos
  // también para resolver `activeCommerce` (lookup id → name) sin tener que
  // exponer el commerce store a cada consumidor.
  const accessibleCommerces = ref<AccessibleCommerce[]>([])

  // CommerceAdmin con un solo commerce no debe poder cambiar — la UI usa este
  // flag para deshabilitar el dropdown sin duplicar la lógica de roles.
  const isLocked = ref<boolean>(false)

  const isAllCommerces = computed<boolean>(() => activeCommerceId.value === null)

  const activeCommerce = computed<AccessibleCommerce | null>(() => {
    const id = activeCommerceId.value
    if (id === null) return null
    return accessibleCommerces.value.find((c) => c.commerceId === id) ?? null
  })

  function setActiveCommerce(id: string | null): void {
    if (isLocked.value) return
    activeCommerceId.value = id
    writeStored(id)
  }

  function initFromAuth(user: AuthUser | null, commerces: AccessibleCommerce[]): void {
    accessibleCommerces.value = commerces

    if (!user) {
      activeCommerceId.value = null
      isLocked.value = false
      return
    }

    const stored = readStored()

    if (user.role === 'SuperAdmin') {
      isLocked.value = false
      // SA puede operar sin commerce activo (vista "Todos") — si el storage
      // apunta a uno que ya no existe lo descartamos, NO promovemos al primero.
      if (stored && commerces.some((c) => c.commerceId === stored)) {
        activeCommerceId.value = stored
      } else {
        activeCommerceId.value = null
        writeStored(null)
      }
      return
    }

    // Roles no-SA: deben siempre tener un commerce activo. Si no tienen
    // ninguno asignado, dejamos null y la UI esconde el selector.
    if (commerces.length === 0) {
      activeCommerceId.value = null
      isLocked.value = false
      writeStored(null)
      return
    }

    if (commerces.length === 1) {
      const only = commerces[0]!.commerceId
      activeCommerceId.value = only
      isLocked.value = true
      writeStored(only)
      return
    }

    isLocked.value = false
    if (stored && commerces.some((c) => c.commerceId === stored)) {
      activeCommerceId.value = stored
    } else {
      const first = commerces[0]!.commerceId
      activeCommerceId.value = first
      writeStored(first)
    }
  }

  function clear(): void {
    activeCommerceId.value = null
    accessibleCommerces.value = []
    isLocked.value = false
    if (import.meta.client) {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  return {
    activeCommerceId,
    accessibleCommerces,
    isLocked,
    isAllCommerces,
    activeCommerce,
    setActiveCommerce,
    initFromAuth,
    clear,
  }
})

// Entrypoint imperativo: resuelve la lista de commerces accesibles según rol
// y delega en `initFromAuth`. Hecho como función top-level (en vez de método
// del store) para encapsular la dependencia con `useCommerceStore` solo
// cuando se invoca, evitando ejecuciones innecesarias durante el setup del
// store.
export async function syncActiveCommerceWithAuth(): Promise<void> {
  const authStore = useAuthStore()
  const activeCommerceStore = useActiveCommerceStore()
  const user = authStore.user

  if (!user) {
    activeCommerceStore.clear()
    return
  }

  if (user.role === 'SuperAdmin') {
    const commerceStore = useCommerceStore()
    if (commerceStore.commerces.length === 0) {
      try {
        await commerceStore.fetchCommerces()
      } catch {
        // Si /commerce falla seguimos con lista vacía — el selector mostrará
        // solo "Todos los comercios" y el resto de módulos no tendrá filtro.
      }
    }
    activeCommerceStore.initFromAuth(
      user,
      commerceStore.commerces.map((c) => ({ commerceId: c.id, commerceName: c.name })),
    )
    return
  }

  activeCommerceStore.initFromAuth(user, user.commerces ?? [])
}
