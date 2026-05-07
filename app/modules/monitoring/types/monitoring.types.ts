// Tipos del módulo de monitoreo.
// Entidades de dominio espejadas del API_CONTRACT.md §4.4, §4.5, §4.7

export type OrderStatus =
  | 'creado'
  | 'asignado'
  | 'aceptado'
  | 'en_punto_de_venta'
  | 'en_transito'
  | 'en_punto_de_entrega'
  | 'entregado'
  | 'cancelado'

export type RiderDomainStatus = 'activo' | 'inactivo' | 'suspendido'
export type VehicleType = 'bicicleta' | 'moto' | 'auto' | 'caminando'
export type FleetType = 'Privada' | 'Global' | 'Hibrida'

// Estado visual derivado: combina status + isOnline + si tiene orden activa.
export type RiderVisualStatus = 'online' | 'on_route' | 'offline'

export interface MonitoringOrder {
  id: string
  commerceId: string
  pickupPdvId: string
  assignedRiderId?: string
  assignedRiderName?: string
  zoneId?: string
  zoneName?: string
  fleetType: FleetType
  status: OrderStatus
  customerName: string
  customerPhone: string
  deliveryAddress: string
  deliveryLat?: string
  deliveryLng?: string
  createdAt: string
  updatedAt?: string
  assignedAt?: string
}

export interface MonitoringRider {
  id: string
  commerceId?: string
  status: RiderDomainStatus
  isOnline: boolean
  fullName: string
  phone: string
  email?: string
  photoUrl?: string
  vehicleType: VehicleType
  vehicleBrand?: string
  vehicleModel?: string
  licensePlate?: string
  zoneId?: string
  zoneName?: string
  currentLat?: number
  currentLng?: number
  currentOrderId?: string
  onlineSince?: string   // ISO timestamp
  lastSeenAt?: string    // ISO timestamp
}

export interface MonitoringZone {
  id: string
  commerceId?: string
  name: string
  color: string
  isGlobal: boolean
  isActive: boolean
  kmlUrl?: string
  ridersCount?: number
}

export type MonitoringTab = 'services' | 'riders' | 'zones'

export interface ServicesFilters {
  city: string | null
  zoneId: string | null
  status: OrderStatus | null
  search: string
}

export interface MonitoringKpi {
  key: 'active_services' | 'riders_online' | 'in_transit' | 'delivered_today'
  label: string
  value: number
  hint?: string
  tone?: 'brand' | 'warning' | 'muted'
}

// Respuestas del backend
export interface PaginatedOrdersResponse {
  data: MonitoringOrder[]
  total: number
  page: number
  limit: number
}

export interface PaginatedRidersResponse {
  data: MonitoringRider[]
  total: number
  page: number
  limit: number
}

export interface PaginatedZonesResponse {
  data: MonitoringZone[]
  total: number
  page: number
  limit: number
}

