// §4.6 API_CONTRACT.md — Puntos de venta viven bajo /commerce/:commerceId/pdv.
// Los PdV se crean con JSON (no multipart). El backend geocodifica con Nominatim
// cuando `address` viene sin lat/lng.

// Zona asignada a un PdV — shape mínimo que devuelve el backend al incluir zonas.
export interface PdvZoneRef {
  id: string
  name: string
  color: string
}

export interface PointOfSale {
  id: string
  commerceId: string
  name: string
  address: string
  location?: { x: number; y: number }  // PostGIS Point — x = lng, y = lat
  phone?: string
  email?: string
  schedule?: object
  isActive: boolean
  responsibleUserId?: string
  createdAt: string
  updatedAt?: string
  zones?: PdvZoneRef[]
}

export interface CreatePdvDto {
  name: string
  address: string
  lat?: number
  lng?: number
  phone?: string
  email?: string
  schedule?: object
  responsibleUserId?: string
}

export interface UpdatePdvDto {
  name?: string
  address?: string
  lat?: number
  lng?: number
  phone?: string
  email?: string
  schedule?: object
  responsibleUserId?: string
  isActive?: boolean
}

export interface ListPdvParams {
  page?: number
  limit?: number
  isActive?: boolean
}

// Patrón A (page + limit) — §1 API_CONTRACT.md
export interface ListPdvResponse {
  data: PointOfSale[]
  total: number
  page: number
  limit: number
}

// Respuesta mínima de GET /commerce/:cId/zones que consume el PdV.
export interface ZoneSummary {
  id: string
  name: string
  color: string
  isActive: boolean
}
