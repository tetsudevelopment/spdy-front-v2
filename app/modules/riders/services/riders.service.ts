// §4.5 API_CONTRACT.md — cliente de Domiciliarios.
//
// Hay dos familias de endpoints:
//   - Privados: bajo /commerce/:commerceId/riders. CRUD multi-tenant; exige
//     header X-Commerce-ID además del commerceId en el path. Crear, editar,
//     eliminar, resetear contraseña: solo el commerce dueño.
//   - Globales: bajo /riders (sin commerce). Solo SuperAdmin puede crear /
//     editar / eliminar / resetear contraseña.
//
// Foto y documentos usan multipart/form-data — dejamos que el navegador
// setee el Content-Type con el boundary (igual que commerce/zonas).

import { authenticatedFetch } from '~/services/http.client'
import type {
  CreateRiderDto,
  ListRidersParams,
  ListRidersResponse,
  Rider,
  RiderAvailability,
  RiderDocument,
  RiderDocumentType,
  UpdateRiderDto,
  ZoneSummary,
} from '../types/rider.types'

function base(commerceId: string): string {
  return `/commerce/${commerceId}/riders`
}

function tenantHeaders(commerceId: string): Record<string, string> {
  return { 'X-Commerce-ID': commerceId }
}

// Dump dev-only de FormData — útil para verificar exactamente qué fields y
// archivos viajan al backend cuando hay un 400 difícil de diagnosticar.
// Mismo patrón que commerce.service.ts y zones.service.ts.
function debugFormData(label: string, fd: FormData): void {
  if (!import.meta.dev || !import.meta.client) return
  for (const [k, v] of fd.entries()) {
    const repr = v instanceof File
      ? `[File name=${v.name} type=${v.type} size=${v.size}B]`
      : v
    // eslint-disable-next-line no-console
    console.log(`[${label}]`, k, '=', repr)
  }
}

export const RidersService = {
  async getAll(commerceId: string, params: ListRidersParams = {}): Promise<ListRidersResponse> {
    const query: Record<string, string | number | boolean> = {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    }
    if (typeof params.isActive === 'boolean') query.isActive = params.isActive
    if (params.availability) query.availability = params.availability
    if (params.vehicleType) query.vehicleType = params.vehicleType
    return authenticatedFetch<ListRidersResponse>(base(commerceId), {
      query,
      headers: tenantHeaders(commerceId),
    })
  },

  async getById(commerceId: string, riderId: string): Promise<Rider> {
    return authenticatedFetch<Rider>(`${base(commerceId)}/${riderId}`, {
      headers: tenantHeaders(commerceId),
    })
  },

  // Crea un rider. El backend acepta dos formatos:
  //   - JSON puro (más liviano, default cuando no hay foto).
  //   - multipart/form-data con campo `photo` opcional (mismo endpoint).
  // Mantenemos JSON cuando no hay foto para evitar el costo de FormData en el
  // caso común. Cuando hay foto, serializamos cada campo del DTO como string
  // (el backend hace `Number()` / `JSON.parse()` por su parte) y agregamos el
  // archivo. NO seteamos `Content-Type` — el navegador lo fija con boundary.
  async create(commerceId: string, dto: CreateRiderDto, photo?: File | null): Promise<Rider> {
    if (!photo) {
      return authenticatedFetch<Rider>(base(commerceId), {
        method: 'POST',
        body: dto,
        headers: tenantHeaders(commerceId),
      })
    }

    const fd = new FormData()
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined || value === null) continue
      fd.append(key, typeof value === 'string' ? value : String(value))
    }
    fd.append('photo', photo, photo.name)
    debugFormData('riders.create', fd)
    return authenticatedFetch<Rider>(base(commerceId), {
      method: 'POST',
      body: fd,
      headers: tenantHeaders(commerceId),
    })
  },

  async update(commerceId: string, riderId: string, dto: UpdateRiderDto): Promise<Rider> {
    return authenticatedFetch<Rider>(`${base(commerceId)}/${riderId}`, {
      method: 'PATCH',
      body: dto,
      headers: tenantHeaders(commerceId),
    })
  },

  async updatePhoto(commerceId: string, riderId: string, file: File): Promise<Rider> {
    const fd = new FormData()
    fd.append('photo', file, file.name)
    return authenticatedFetch<Rider>(`${base(commerceId)}/${riderId}/photo`, {
      method: 'PATCH',
      body: fd,
      headers: tenantHeaders(commerceId),
    })
  },

  async uploadDocument(
    commerceId: string,
    riderId: string,
    type: RiderDocumentType,
    file: File,
  ): Promise<RiderDocument> {
    const fd = new FormData()
    fd.append('type', type)
    fd.append('file', file, file.name)
    return authenticatedFetch<RiderDocument>(
      `${base(commerceId)}/${riderId}/documents`,
      {
        method: 'POST',
        body: fd,
        headers: tenantHeaders(commerceId),
      },
    )
  },

  async listDocuments(commerceId: string, riderId: string): Promise<RiderDocument[]> {
    return authenticatedFetch<RiderDocument[]>(
      `${base(commerceId)}/${riderId}/documents`,
      { headers: tenantHeaders(commerceId) },
    )
  },

  async assignZones(commerceId: string, riderId: string, zoneIds: string[]): Promise<void> {
    await authenticatedFetch(`${base(commerceId)}/${riderId}/zones`, {
      method: 'POST',
      body: { zoneIds },
      headers: tenantHeaders(commerceId),
    })
  },

  async removeZone(commerceId: string, riderId: string, zoneId: string): Promise<void> {
    await authenticatedFetch(
      `${base(commerceId)}/${riderId}/zones/${zoneId}`,
      { method: 'DELETE', headers: tenantHeaders(commerceId) },
    )
  },

  async toggleAvailability(
    commerceId: string,
    riderId: string,
    availability: RiderAvailability,
  ): Promise<Rider> {
    return authenticatedFetch<Rider>(
      `${base(commerceId)}/${riderId}/availability`,
      {
        method: 'PATCH',
        body: { availability },
        headers: tenantHeaders(commerceId),
      },
    )
  },

  // Permite a un admin (SA / CA con `riders:reset-password`) sobrescribir la
  // contraseña del rider sin pedir la actual. El backend valida la política
  // (8+ chars, mayúscula, número, especial); la UI replica esas reglas en
  // vivo para que el operador no llegue a un 400.
  async resetPassword(
    commerceId: string,
    riderId: string,
    newPassword: string,
  ): Promise<void> {
    await authenticatedFetch(
      `${base(commerceId)}/${riderId}/reset-password`,
      {
        method: 'PATCH',
        body: { newPassword },
        headers: tenantHeaders(commerceId),
      },
    )
  },

  // Listado de zonas del commerce — también multi-tenant. Preservamos el
  // `commerceId` que devuelve el backend: una zona global asignada al commerce
  // (vía POST /zones/:zId/assign) aparece en este listado con commerceId=null,
  // y debemos respetar ese null para que el routing de adds/removes contra el
  // rider Global vaya al endpoint legacy /riders/:rId/zones. Solo si el
  // backend no incluye el campo (defensivo) caemos al cId del path.
  async listZonesForCommerce(commerceId: string): Promise<ZoneSummary[]> {
    const res = await authenticatedFetch<{
      data: Array<Omit<ZoneSummary, 'commerceId'> & { commerceId?: string | null }>
      total: number
      page: number
      limit: number
    }>(`/commerce/${commerceId}/zones`, {
      query: { page: 1, limit: 100 },
      headers: tenantHeaders(commerceId),
    })
    return res.data.map((z) => ({
      id: z.id,
      name: z.name,
      color: z.color,
      isActive: z.isActive,
      commerceId: z.commerceId !== undefined ? z.commerceId : commerceId,
    }))
  },

  // Listado de zonas globales (sin commerce) — usado por SuperAdmin al asignar
  // zonas a un Rider Global. Marcamos `commerceId: null` para que el modal
  // ratee adds/removes al endpoint global (POST /riders/:rId/zones).
  async listGlobalZones(): Promise<ZoneSummary[]> {
    const res = await authenticatedFetch<{
      data: Array<Omit<ZoneSummary, 'commerceId'> & { commerceId?: string | null; isGlobal?: boolean }>
      total: number
      page: number
      limit: number
    }>(`/zones`, { query: { page: 1, limit: 100 } })
    return res.data.map((z) => ({
      id: z.id,
      name: z.name,
      color: z.color,
      isActive: z.isActive,
      commerceId: null,
    }))
  },

  // === Asignación de zonas Globales para Riders Globales ===
  // Endpoint legacy /riders/:rId/zones — sin tenancy. Se usa cuando la zona a
  // asignar es global (commerceId === null). Para una zona privada de algún
  // commerce, seguimos usando `assignZones(commerceId, ...)` contra el dueño.
  async assignGlobalZones(riderId: string, zoneIds: string[]): Promise<void> {
    await authenticatedFetch(`/riders/${riderId}/zones`, {
      method: 'POST',
      body: { zoneIds },
    })
  },

  async removeGlobalZone(riderId: string, zoneId: string): Promise<void> {
    await authenticatedFetch(`/riders/${riderId}/zones/${zoneId}`, {
      method: 'DELETE',
    })
  },

  // === Riders Globales (solo SuperAdmin) ===
  // Lista TODOS los riders del sistema (privados + globales). Útil para la
  // vista global del SuperAdmin. CommerceAdmin no debe llamar esto: usa
  // getAll(commerceId) que ya incluye sus globales relevantes.
  async getAllGlobal(params: ListRidersParams = {}): Promise<ListRidersResponse> {
    const query: Record<string, string | number | boolean> = {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    }
    if (typeof params.isActive === 'boolean') query.isActive = params.isActive
    if (params.availability) query.availability = params.availability
    if (params.vehicleType) query.vehicleType = params.vehicleType
    return authenticatedFetch<ListRidersResponse>('/riders', { query })
  },

  // Crea un rider Global — sin commerce dueño. Mismo patrón JSON / multipart
  // que `create(...)` privado. El backend acepta `photo` opcional.
  async createGlobal(dto: CreateRiderDto, photo?: File | null): Promise<Rider> {
    if (!photo) {
      return authenticatedFetch<Rider>('/riders', {
        method: 'POST',
        body: dto,
      })
    }

    const fd = new FormData()
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined || value === null) continue
      fd.append(key, typeof value === 'string' ? value : String(value))
    }
    fd.append('photo', photo, photo.name)
    debugFormData('riders.createGlobal', fd)
    return authenticatedFetch<Rider>('/riders', {
      method: 'POST',
      body: fd,
    })
  },

  async getGlobalById(riderId: string): Promise<Rider> {
    return authenticatedFetch<Rider>(`/riders/${riderId}`)
  },

  async updateGlobal(riderId: string, dto: UpdateRiderDto): Promise<Rider> {
    return authenticatedFetch<Rider>(`/riders/${riderId}`, {
      method: 'PATCH',
      body: dto,
    })
  },

  async updateGlobalPhoto(riderId: string, file: File): Promise<Rider> {
    const fd = new FormData()
    fd.append('photo', file, file.name)
    return authenticatedFetch<Rider>(`/riders/${riderId}/photo`, {
      method: 'PATCH',
      body: fd,
    })
  },

  async resetGlobalRiderPassword(riderId: string, newPassword: string): Promise<void> {
    await authenticatedFetch(`/riders/${riderId}/reset-password`, {
      method: 'PATCH',
      body: { newPassword },
    })
  },
}
