// §4.7 API_CONTRACT.md — Zonas. Dos tipos:
//   - Globales: commerceId === null, creadas por SuperAdmin en POST /zones.
//   - Privadas: bajo /commerce/:commerceId/zones, ligadas a un commerce.
// El KML se sube como multipart/form-data; el backend convierte a MultiPolygon
// y guarda el archivo en S3 devolviendo `kmlUrl`.

export interface Zone {
  id: string
  commerceId: string | null
  name: string
  description?: string
  color: string          // hex (#rrggbb)
  kmlUrl: string
  kmlS3Key?: string
  priority?: number
  isGlobal: boolean
  isActive: boolean
  createdAt: string
  updatedAt?: string
}

export interface CreateZoneDto {
  name: string
  description?: string
  color: string
  priority?: number
  kml: File
  // Si se omite o es null → global (POST /zones). Si trae uuid → privada
  // (POST /commerce/:commerceId/zones).
  commerceId?: string | null
}

// En edición el KML es opcional: si no se envía, el backend conserva el actual.
export interface UpdateZoneDto {
  name?: string
  description?: string
  color?: string
  priority?: number
  kml?: File
  isActive?: boolean
}

export type ZoneViewMode = 'global' | 'commerce'

export interface ListZonesParams {
  page?: number
  limit?: number
  commerceId?: string
  isActive?: boolean
}

// Patrón A (page + limit) — §1 API_CONTRACT.md
export interface ListZonesResponse {
  data: Zone[]
  total: number
  page: number
  limit: number
}

// Destino de copia — POST /zones/:zoneId/copy replicado por cada commerce.
export interface CommerceRef {
  commerceId: string
  commerceName: string
}
