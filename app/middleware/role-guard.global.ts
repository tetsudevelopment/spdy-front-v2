// Guard de autorización por rol. Lee `to.meta.allowedRoles` (definido por
// `definePageMeta({ allowedRoles: [...] })` en cada página sensible) y
// rechaza usuarios cuyo rol no está en la lista, redirigiéndolos a /monitoring
// — dashboard accesible para todos los roles que entran a la web.
//
// IMPORTANTE: el backend ya rechaza cada acción con 403 si el rol no
// corresponde. Esto es defensa en profundidad (UX + ocultar superficie),
// no la frontera de seguridad.

import { useAuthStore } from '~/stores/auth.store'

export default defineNuxtRouteMiddleware((to) => {
  const allowed = to.meta.allowedRoles
  if (!allowed || allowed.length === 0) return

  const auth = useAuthStore()
  const role = auth.user?.role
  if (!role || !allowed.includes(role)) {
    return navigateTo('/monitoring')
  }
})
