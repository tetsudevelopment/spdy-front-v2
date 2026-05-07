// §4.7 API_CONTRACT.md — cliente de Zonas.
// Crear/actualizar usa multipart/form-data: el backend lee el KML, lo convierte
// a MultiPolygon y lo sube a S3. Como en commerce, dejamos que el navegador
// fije el Content-Type con el boundary (no tocarlo desde buildHeaders).

import { authenticatedFetch } from '~/services/http.client'
import type {
  CreateZoneDto,
  ListZonesParams,
  ListZonesResponse,
  UpdateZoneDto,
  Zone,
} from '../types/zone.types'

const GLOBAL_ROOT = '/zones'
const STRING_FIELDS = ['name', 'description', 'color'] as const
const NUMBER_FIELDS = ['priority'] as const

function tenantHeaders(commerceId: string): Record<string, string> {
  return { 'X-Commerce-ID': commerceId }
}

function buildZoneFormData(dto: Record<string, unknown>): FormData {
  const fd = new FormData()

  for (const key of STRING_FIELDS) {
    const v = dto[key]
    if (typeof v === 'string' && v.trim() !== '') {
      fd.append(key, v)
    }
  }
  for (const key of NUMBER_FIELDS) {
    const v = dto[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      fd.append(key, String(v))
    }
  }
  if (typeof dto.isActive === 'boolean') {
    fd.append('isActive', String(dto.isActive))
  }
  if (dto.kml instanceof File) {
    fd.append('kml', dto.kml, dto.kml.name)
  }
  return fd
}

function debugFormData(label: string, fd: FormData): void {
  if (!import.meta.dev || !import.meta.client) return
  for (const [k, v] of fd.entries()) {
    const repr = v instanceof File ? `[File name=${v.name} type=${v.type} size=${v.size}B]` : v
    // eslint-disable-next-line no-console
    console.log(`[${label}]`, k, repr)
  }
}

export const ZonesService = {
  // Globales: GET /zones. Privadas: GET /commerce/:commerceId/zones.
  async getAll(params: ListZonesParams = {}): Promise<ListZonesResponse> {
    const query: Record<string, string | number | boolean> = {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    }
    if (typeof params.isActive === 'boolean') query.isActive = params.isActive

    const path = params.commerceId
      ? `/commerce/${params.commerceId}/zones`
      : GLOBAL_ROOT
    return authenticatedFetch<ListZonesResponse>(path, { query })
  },

  async getById(zoneId: string): Promise<Zone> {
    return authenticatedFetch<Zone>(`${GLOBAL_ROOT}/${zoneId}`)
  },

  async create(dto: CreateZoneDto): Promise<Zone> {
    const fd = buildZoneFormData(dto as unknown as Record<string, unknown>)
    debugFormData('zones.create', fd)
    const path = dto.commerceId
      ? `/commerce/${dto.commerceId}/zones`
      : GLOBAL_ROOT
    return authenticatedFetch<Zone>(path, {
      method: 'POST',
      body: fd,
    })
  },

  // PATCH /commerce/:commerceId/zones/:zoneId — endpoint único. No hay PATCH
  // global registrado en el backend (Fastify devuelve 404 "Route not found"
  // ante /zones/:zId). El handler ramifica por Content-Type: JSON para editar
  // metadata, multipart cuando se reemplaza el KML. Mandamos JSON puro si no
  // hay archivo nuevo para que el backend no intente parsear un KML inexistente.
  async update(
    zoneId: string,
    commerceId: string,
    dto: UpdateZoneDto,
  ): Promise<Zone> {
    const path = `/commerce/${commerceId}/zones/${zoneId}`
    const headers = tenantHeaders(commerceId)

    if (dto.kml instanceof File) {
      const fd = buildZoneFormData(dto as unknown as Record<string, unknown>)
      debugFormData('zones.update', fd)
      return authenticatedFetch<Zone>(path, {
        method: 'PATCH',
        body: fd,
        headers,
      })
    }

    const body: Record<string, unknown> = {}
    if (typeof dto.name === 'string' && dto.name.trim() !== '') body.name = dto.name
    if (typeof dto.color === 'string' && dto.color.trim() !== '') body.color = dto.color
    if (typeof dto.description === 'string') body.description = dto.description
    if (typeof dto.priority === 'number' && Number.isFinite(dto.priority)) {
      body.priority = dto.priority
    }
    if (typeof dto.isActive === 'boolean') body.isActive = dto.isActive

    return authenticatedFetch<Zone>(path, {
      method: 'PATCH',
      body,
      headers,
    })
  },

  // POST /commerce/:commerceId/zones/:zoneId/copy — clona la zona global hacia
  // el commerce destino devolviendo la zona privada creada. El body { name }
  // es opcional: si no se envía, el backend genera "<nombre original> (copia)".
  // Precondición: el commerce debe tener la zona asignada previamente con
  // POST /zones/:zoneId/assign (ver assignZoneToCommerces abajo).
  async copyZone(
    zoneId: string,
    targetCommerceId: string,
    newName?: string,
  ): Promise<Zone> {
    return authenticatedFetch<Zone>(
      `/commerce/${targetCommerceId}/zones/${zoneId}/copy`,
      {
        method: 'POST',
        body: newName ? { name: newName } : {},
      },
    )
  },

  // POST /zones/:zoneId/assign — vincula la zona global a uno o varios
  // commerces (no duplica datos). Es el paso previo obligatorio antes de
  // poder copiar la zona hacia cada commerce destino.
  async assignZoneToCommerces(zoneId: string, commerceIds: string[]): Promise<void> {
    await authenticatedFetch(`${GLOBAL_ROOT}/${zoneId}/assign`, {
      method: 'POST',
      body: { commerceIds },
    })
  },
}
