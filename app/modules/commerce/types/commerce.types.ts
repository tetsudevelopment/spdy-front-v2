// §5 API_CONTRACT.md — Modelo Commerce + DTOs alineados al endpoint multipart.

export type FleetType = 'Privada' | 'Global' | 'Hibrida'

export interface Commerce {
  id: string
  name: string
  timezone: string
  isActive: boolean
  fleetType: FleetType
  phone?: string
  email?: string
  address?: string
  nit?: string
  razonSocial?: string
  logoUrl?: string
  website?: string
  currency: string
  baseFare?: string
  dailyOrderLimit?: number
  maxRadiusKm?: string
  podPhotoRequired: boolean
  acceptanceTimeoutMinutes?: number
  createdAt: string
  updatedAt?: string
}

// Los campos numéricos se envían como string porque el backend acepta multipart
// (FormData siempre serializa a string y el backend ya valida/convierte).
export interface CreateCommerceDto {
  name: string
  fleetType: FleetType
  logo?: File
  phone?: string
  email?: string
  address?: string
  nit?: string
  razonSocial?: string
  website?: string
  currency?: string           // default 'COP'
  timezone?: string           // default 'America/Bogota'
  baseFare?: string
  dailyOrderLimit?: string
  maxRadiusKm?: string
}

export interface UpdateCommerceDto {
  name?: string
  fleetType?: FleetType
  logo?: File
  phone?: string
  email?: string
  address?: string
  nit?: string
  razonSocial?: string
  website?: string
  currency?: string
  timezone?: string
  baseFare?: string
  dailyOrderLimit?: string
  maxRadiusKm?: string
}

export interface ListCommercesParams {
  page?: number
  limit?: number
  search?: string
  fleetType?: FleetType
}

// Patrón A (page + limit) — §1 API_CONTRACT.md
export interface ListCommercesResponse {
  data: Commerce[]
  total: number
  page: number
  limit: number
}

export interface ApiKeyResponse {
  apiKey: string
  warning?: string
}
