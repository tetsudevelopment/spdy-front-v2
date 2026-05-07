// Augmentación de `vue-router` para tipar `definePageMeta({ allowedRoles })`.
// El middleware `role-guard` lee este campo. Si no está presente, la página
// queda abierta a cualquier usuario autenticado.

import type { Role } from '~/stores/auth.store'

declare module 'vue-router' {
  interface RouteMeta {
    allowedRoles?: ReadonlyArray<Role>
  }
}

export {}
