// §4.5 API_CONTRACT.md — Domiciliarios. Dos tipos:
//   - Privados: bajo /commerce/:commerceId/riders, ligados a un commerce.
//     Solo el commerce dueño puede editarlos / borrarlos / resetear password.
//   - Globales: existen sueltos en la flota. Solo SuperAdmin los crea
//     (POST /riders) y administra. Pueden tener zonas globales o privadas
//     de cualquier commerce.
// El backend al crear un rider también crea el User asociado, por eso el
// CreateRiderDto exige email + password.

export type VehicleType = 'bicicleta' | 'moto' | 'auto' | 'caminando'
export type RiderStatus = 'online' | 'offline' | 'on_route'
export type RiderAvailability = 'available' | 'unavailable'
export type FleetType = 'Privada' | 'Global'

export type RiderDocumentType =
  | 'identification'
  | 'driver_license'
  | 'vehicle_registration'
  | 'soat'
  | 'other'

export interface RiderDocument {
  id: string
  type: RiderDocumentType
  fileUrl: string
  fileName: string
  uploadedAt: string
}

export interface RiderZoneRef {
  id: string
  name: string
  color: string
}

export interface Rider {
  id: string
  // Privados: uuid del commerce dueño. Globales: null (vienen de la flota global).
  commerceId: string | null
  fleetType: FleetType
  userId?: string
  fullName: string
  cedula?: string
  phone: string
  email?: string
  vehicleType: VehicleType
  licensePlate?: string
  licenciaConducir?: string
  fechaNacimiento?: string   // YYYY-MM-DD
  address?: string
  vehicleBrand?: string
  vehicleModel?: string
  vehicleColor?: string
  photoUrl?: string
  isActive: boolean
  availability: RiderAvailability
  currentStatus?: RiderStatus
  lastLocation?: { x: number; y: number }  // PostGIS Point — x=lng, y=lat
  lastLocationAt?: string
  createdAt: string
  updatedAt?: string
  zones?: RiderZoneRef[]
  documents?: RiderDocument[]
  // Flags computados por el backend según el rol del actor. Para SuperAdmin
  // pueden venir todos `true` o no venir (asumimos `true`). Para CommerceAdmin
  // expresan si el commerce activo puede ejecutar esa acción sobre el rider:
  //   - sobre sus Privados → todos `true`.
  //   - sobre Globales que aparecen en su lista → solo zonas relevantes.
  commerceCanEdit?: boolean
  commerceCanResetPassword?: boolean
  commerceCanManageZones?: boolean
  commerceCanDelete?: boolean
}

export interface CreateRiderDto {
  fullName: string
  email: string           // requerido: el backend también crea un User
  password: string        // requerido: mínimo 8 caracteres
  phone: string
  vehicleType: VehicleType
  cedula?: string
  licenciaConducir?: string
  fechaNacimiento?: string  // YYYY-MM-DD
  address?: string
  vehicleBrand?: string
  vehicleModel?: string
  vehicleColor?: string
  licensePlate?: string
}

// En update NO se envía password — el backend tiene su propio flujo para eso.
export interface UpdateRiderDto {
  fullName?: string
  email?: string
  phone?: string
  vehicleType?: VehicleType
  cedula?: string
  licenciaConducir?: string
  fechaNacimiento?: string
  address?: string
  vehicleBrand?: string
  vehicleModel?: string
  vehicleColor?: string
  licensePlate?: string
  isActive?: boolean
}

export interface ListRidersParams {
  page?: number
  limit?: number
  isActive?: boolean
  availability?: RiderAvailability
  vehicleType?: VehicleType
}

// Patrón A (page + limit) — §1 API_CONTRACT.md
export interface ListRidersResponse {
  data: Rider[]
  total: number
  page: number
  limit: number
}

export interface ZoneSummary {
  id: string
  name: string
  color: string
  isActive: boolean
  // null = zona global (vive bajo /zones, no bajo un commerce). Necesario para
  // enrutar asignaciones de Riders Globales al commerce dueño de cada zona.
  commerceId: string | null
}
