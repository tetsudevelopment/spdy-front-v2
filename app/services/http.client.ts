// Cliente HTTP centralizado con interceptor de 401.
// TODOS los services deben usar `authenticatedFetch` en lugar de $fetch directo.
// Al recibir 401: intenta refresh → si OK reintenta → si falla, limpia sesión y redirige a /login.

import { useAuthStore } from '~/stores/auth.store'

const REFRESH_TOKEN_KEY = 'spdy.refreshToken'

interface HttpOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  headers?: Record<string, string>
  retryOn401?: boolean
}

function readRefreshToken(): string | null {
  if (!import.meta.client) return null
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

function getBaseURL(): string {
  return useRuntimeConfig().public.apiBaseUrl as string
}

function isMultipartBody(body: unknown): boolean {
  return typeof FormData !== 'undefined' && body instanceof FormData
}

function buildHeaders(extra?: Record<string, string>, body?: unknown): Record<string, string> {
  const auth = useAuthStore()
  const headers: Record<string, string> = { ...extra }
  // El navegador debe fijar el Content-Type (con boundary) cuando el body es FormData
  if (!isMultipartBody(body) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  // El backend usa este header para bloquear logins de Riders en el CMS web
  // (defaultea a `web` si no llega, pero lo enviamos explícito para que las
  // futuras decisiones de auth/permisos por client-type queden documentadas).
  if (!headers['X-Client-Type']) {
    headers['X-Client-Type'] = 'web'
  }
  if (auth.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`
  return headers
}

// Métodos para los que Fastify aplica content-type guards. Si llegan con
// `Content-Type: application/json` y body vacío, responde 400
// FST_ERR_CTP_EMPTY_JSON_BODY. Inyectamos `{}` como body por default para
// que las transiciones (POST publish/archive) y las eliminaciones (DELETE)
// no tengan que recordarlo en cada service.
const METHODS_REQUIRING_BODY = new Set(['POST', 'PATCH', 'DELETE'])

function ensureJsonBody(
  method: string,
  body: unknown,
  headers: Record<string, string>,
): unknown {
  if (body !== undefined && body !== null) return body
  if (!METHODS_REQUIRING_BODY.has(method)) return body
  const ct = headers['Content-Type']
  if (typeof ct === 'string' && ct.includes('application/json')) return {}
  return body
}

// Todos los endpoints multi-tenant del backend exigen el header
// `X-Commerce-ID`, aunque el commerceId también viaje en el path. Para roles
// no-SuperAdmin la falta del header devuelve 400. En vez de obligar a cada
// service a recordarlo, lo extraemos del path automáticamente: cualquier URL
// con forma `/commerce/<uuid>/...` (o `/commerce/<uuid>` exacto) inyecta el
// header. Si el caller ya lo pasó manualmente, su valor gana.
const COMMERCE_PATH_REGEX = /\/commerce\/([0-9a-f-]{36})(?:\/|$)/i

function extractCommerceIdFromPath(path: string): string | null {
  const match = path.match(COMMERCE_PATH_REGEX)
  return match?.[1] ?? null
}

function ensureTenantHeader(path: string, headers: Record<string, string>): void {
  if (headers['X-Commerce-ID']) return
  const cid = extractCommerceIdFromPath(path)
  if (cid) headers['X-Commerce-ID'] = cid
}

async function tryRefresh(): Promise<boolean> {
  const stored = readRefreshToken()
  if (!stored) return false
  try {
    const res = await $fetch<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      baseURL: getBaseURL(),
      method: 'POST',
      body: { refreshToken: stored },
      headers: { 'X-Client-Type': 'web' },
    })
    const auth = useAuthStore()
    auth.setTokens(res.accessToken, res.refreshToken)
    return true
  } catch {
    return false
  }
}

function extractStatus(err: unknown): number | null {
  if (typeof err === 'object' && err !== null) {
    const e = err as { statusCode?: number; status?: number; response?: { status?: number } }
    return e.statusCode ?? e.status ?? e.response?.status ?? null
  }
  return null
}

export async function authenticatedFetch<T>(
  path: string,
  options: HttpOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const retryOn401 = options.retryOn401 ?? true

  const headers = buildHeaders(options.headers, options.body)
  ensureTenantHeader(path, headers)
  const body = ensureJsonBody(method, options.body, headers)

  try {
    return await $fetch<T>(path, {
      baseURL: getBaseURL(),
      method,
      headers,
      query: options.query,
      body: body as BodyInit | Record<string, unknown> | undefined,
    })
  } catch (err: unknown) {
    const status = extractStatus(err)

    if (status === 401 && retryOn401) {
      const refreshed = await tryRefresh()
      if (refreshed) {
        return authenticatedFetch<T>(path, { ...options, retryOn401: false })
      }
      // Refresh falló → limpiar todo y redirigir a login
      const auth = useAuthStore()
      auth.clear()
      if (import.meta.client) {
        await navigateTo('/login')
      }
    }

    throw err
  }
}
