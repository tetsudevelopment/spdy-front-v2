import { useAuthStore } from '~/stores/auth.store'

const PUBLIC_ROUTES: ReadonlySet<string> = new Set<string>(['/login'])

export default defineNuxtRouteMiddleware((to) => {
  if (to.meta.auth === false) return
  if (PUBLIC_ROUTES.has(to.path)) return

  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) {
    return navigateTo('/login')
  }
})
