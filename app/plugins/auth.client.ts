// Se ejecuta solo en cliente, una vez al montar la app.
// Intenta restaurar la sesión desde el refreshToken del localStorage.
// Si el refresh es exitoso → el usuario queda autenticado sin pasar por login.
// Si falla → limpia el storage y deja que el middleware redirija a /login.
export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore()
  const { tryRefresh, fetchMe } = useAuth()

  if (authStore.accessToken) return

  const stored = localStorage.getItem('spdy.refreshToken')
  if (!stored) return

  const refreshed = await tryRefresh(stored)
  if (refreshed) {
    await fetchMe()
  } else {
    authStore.clear()
  }
})
