// Diccionario completo de errores del backend SPDY v2.
// Cada mensaje del backend se traduce a un texto legible en español para el usuario.

export const API_ERRORS: Record<string, string> = {
  // ── Auth (401) ──
  'Invalid credentials':                        'Usuario o contraseña incorrectos',
  'Invalid or expired token':                   'Tu sesión expiró. Inicia sesión nuevamente',
  'Invalid token type':                         'Sesión inválida. Inicia sesión nuevamente',
  'Token has been revoked':                     'Tu sesión fue cerrada. Inicia sesión nuevamente',
  'Token invalidated by logout from all devices': 'Todas tus sesiones fueron cerradas. Inicia sesión nuevamente',
  'Invalid or expired refresh token':           'Tu sesión expiró. Inicia sesión nuevamente',

  // ── Auth (403) ──
  'Account disabled':                           'Tu cuenta está desactivada. Contacta al administrador',

  // ── Auth — change-password (400/401) ──
  'Current password is required':               'Debes ingresar tu contraseña actual',
  'Current password is incorrect':              'La contraseña actual es incorrecta',
  'Password does not meet policy requirements': 'La contraseña no cumple los requisitos de seguridad',
  'Password must be at least 8 characters':     'La contraseña debe tener al menos 8 caracteres',
  'Password must contain at least one uppercase letter': 'La contraseña debe contener al menos una mayúscula',
  'Password must contain at least one number':  'La contraseña debe contener al menos un número',
  'Password must contain at least one special character': 'La contraseña debe contener al menos un carácter especial',
  'Password cannot contain username':           'La contraseña no puede contener el nombre de usuario',

  // ── Autorización (403) ──
  'Insufficient permissions':                   'No tienes permisos para realizar esta acción',
  'Access denied to this commerce':             'No tienes acceso a este comercio',
  'Access denied to this point of sale':        'No tienes acceso a este punto de venta',

  // ── Headers / RLS (400) ──
  'X-Commerce-ID header is required':           'Falta la identificación del comercio. Contacta soporte',
  'X-Commerce-ID must be a valid UUID':         'Identificación de comercio inválida. Contacta soporte',

  // ── Users (409/400/404) ──
  'Username already exists':                    'El nombre de usuario ya está en uso',
  'User not found':                             'Usuario no encontrado',

  // ── Commerce (400/404/403) ──
  'Invalid image type. Allowed: image/png, image/jpeg, image/webp': 'Formato de imagen no válido. Usa PNG, JPEG o WebP',
  'Commerce not found':                         'Comercio no encontrado',

  // ── Points of Sale (404) ──
  'Point of sale not found':                    'Punto de venta no encontrado',

  // ── Zones (404/409) ──
  'Zone not found':                             'Zona no encontrada',

  // ── Riders (404/409) ──
  'Rider not found':                            'Domiciliario no encontrado',

  // ── Orders (404/409) ──
  'Order not found':                            'Orden no encontrada',
  'Invalid status transition':                  'No se puede cambiar a ese estado',

  // ── Coverage (401) ──
  'API key required':                           'Se requiere una API key para esta operación',
  'Invalid API key':                            'API key inválida',

  // ── Validación genérica (400) ──
  'Validation failed':                          'Los datos enviados no son válidos',
  'Invalid request body':                       'Los datos enviados no son válidos',
  'Invalid query parameters':                   'Los parámetros de consulta no son válidos',
}

export const HTTP_ERRORS: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autorizado',
  403: 'Sin permisos para realizar esta acción',
  404: 'Recurso no encontrado',
  409: 'Conflicto con datos existentes',
  500: 'Error interno del servidor. Intenta de nuevo',
}

const FALLBACK = 'Error inesperado. Intenta de nuevo'

interface ErrorPayload {
  error?: string
  message?: string
  details?: Array<string | { message?: string; path?: string[] }>
}

interface FetchLikeError {
  data?: ErrorPayload
  statusCode?: number
  status?: number
  response?: { status?: number }
  error?: string
  message?: string
}

function asFetchError(raw: unknown): FetchLikeError | null {
  if (typeof raw !== 'object' || raw === null) return null
  return raw as FetchLikeError
}

const GENERIC_ERROR_MESSAGES = new Set(['Error', 'Network Error'])

function isPlainError(err: unknown): err is Error {
  return (
    err instanceof Error &&
    !('status' in err) &&
    !('statusCode' in err) &&
    !('data' in err) &&
    !('response' in err)
  )
}

function plainErrorMessage(raw: unknown): string | null {
  if (!isPlainError(raw)) return null
  const msg = raw.message
  if (!msg || GENERIC_ERROR_MESSAGES.has(msg)) return null
  return msg
}

function extractRawMessage(err: FetchLikeError): string {
  const fromData = err.data?.error ?? err.data?.message
  if (fromData) return fromData
  return err.error ?? err.message ?? ''
}

function extractStatusCode(err: FetchLikeError): number | null {
  return err.statusCode ?? err.status ?? err.response?.status ?? null
}

// Intenta match parcial: "Insufficient permissions (required: [users:create])"
// debe matchear la key "Insufficient permissions".
function matchPartial(msg: string): string | null {
  for (const key of Object.keys(API_ERRORS)) {
    if (msg.startsWith(key)) return API_ERRORS[key] as string
  }
  return null
}

// Extrae detalles de validación. El backend envía dos formatos:
// 1) string[]: ["Password cannot contain username"]
// 2) object[]: [{ message: "...", path: ["campo"] }]
// Intentamos traducir cada detalle por el diccionario antes de devolverlo.
function extractValidationDetails(err: FetchLikeError): string | null {
  const details = err.data?.details
  if (!Array.isArray(details) || details.length === 0) return null
  const translated: string[] = []
  for (const item of details) {
    if (typeof item === 'string') {
      translated.push(API_ERRORS[item] ?? item)
    } else if (item?.message) {
      const msg = API_ERRORS[item.message] ?? item.message
      const field = item.path?.[0]
      translated.push(field ? `${msg} (${field})` : msg)
    }
  }
  return translated.length > 0 ? translated.join('. ') : null
}

export function humanizeAuthError(raw: unknown): string {
  const plain = plainErrorMessage(raw)
  if (plain) return plain
  const err = asFetchError(raw)
  if (!err) return FALLBACK
  // Detalles específicos primero (ej: "Password cannot contain username")
  const detail = extractValidationDetails(err)
  if (detail) return detail
  const msg = extractRawMessage(err)
  if (msg) {
    const exact = API_ERRORS[msg]
    if (exact) return exact
    const partial = matchPartial(msg)
    if (partial) return partial
  }
  const status = extractStatusCode(err)
  if (status !== null && HTTP_ERRORS[status]) return HTTP_ERRORS[status] as string
  return FALLBACK
}

export function humanizeHttpError(raw: unknown): string {
  const plain = plainErrorMessage(raw)
  if (plain) return plain
  const err = asFetchError(raw)
  if (!err) return FALLBACK
  const detail = extractValidationDetails(err)
  if (detail) return detail
  const msg = extractRawMessage(err)
  if (msg) {
    const exact = API_ERRORS[msg]
    if (exact) return exact
    const partial = matchPartial(msg)
    if (partial) return partial
  }
  const status = extractStatusCode(err)
  if (status !== null && HTTP_ERRORS[status]) return HTTP_ERRORS[status] as string
  return FALLBACK
}
