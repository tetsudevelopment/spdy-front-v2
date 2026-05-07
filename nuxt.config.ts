import tailwindcss from '@tailwindcss/vite'
import Aura from '@primeuix/themes/aura'

export default defineNuxtConfig({
  compatibilityDate: '2026-04-15',

  // SPA mode — auth es JWT en memoria/localStorage, sin cookies httpOnly.
  // El servidor no puede conocer la sesión, así que SSR genera hydration
  // mismatches en todo componente que dependa del usuario (sidebar, roles, etc.).
  ssr: false,

  devtools: { enabled: true },

  modules: [
    '@pinia/nuxt',
    '@primevue/nuxt-module',
    '@vueuse/nuxt',
  ],

  // @ts-ignore
  primevue: {
    options: {
      theme: {
        preset: Aura,
        options: { darkModeSelector: 'html' }
      }
    }
  },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()]
  },

  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
      socketUrl:  process.env.NUXT_PUBLIC_SOCKET_URL   ?? 'http://localhost:3000',
      mapTileUrl: process.env.NUXT_PUBLIC_MAP_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    }
  },

  typescript: {
    strict: true,
    typeCheck: false   // ← desactivado en dev, activar solo en CI/build
  }
})