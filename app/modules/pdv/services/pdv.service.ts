// §4.6 API_CONTRACT.md — cliente de Puntos de Venta. Todos los endpoints
// viven bajo /commerce/:commerceId/pdv. El POST/PATCH va en JSON (no multipart).

import { authenticatedFetch } from '~/services/http.client'
import type {
  CreatePdvDto,
  ListPdvParams,
  ListPdvResponse,
  PointOfSale,
  UpdatePdvDto,
  ZoneSummary,
} from '../types/pdv.types'

function base(commerceId: string): string {
  return `/commerce/${commerceId}/pdv`
}

export const PdvService = {
  async getAll(commerceId: string, params: ListPdvParams = {}): Promise<ListPdvResponse> {
    const query: Record<string, string | number | boolean> = {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    }
    if (typeof params.isActive === 'boolean') query.isActive = params.isActive
    return authenticatedFetch<ListPdvResponse>(base(commerceId), { query })
  },

  async getById(commerceId: string, pdvId: string): Promise<PointOfSale> {
    return authenticatedFetch<PointOfSale>(`${base(commerceId)}/${pdvId}`)
  },

  async create(commerceId: string, dto: CreatePdvDto): Promise<PointOfSale> {
    return authenticatedFetch<PointOfSale>(base(commerceId), {
      method: 'POST',
      body: dto,
    })
  },

  async update(commerceId: string, pdvId: string, dto: UpdatePdvDto): Promise<PointOfSale> {
    return authenticatedFetch<PointOfSale>(`${base(commerceId)}/${pdvId}`, {
      method: 'PATCH',
      body: dto,
    })
  },

  async assignZones(commerceId: string, pdvId: string, zoneIds: string[]): Promise<void> {
    await authenticatedFetch(`${base(commerceId)}/${pdvId}/zones`, {
      method: 'POST',
      body: { zoneIds },
    })
  },

  async removeZone(commerceId: string, pdvId: string, zoneId: string): Promise<void> {
    await authenticatedFetch(`${base(commerceId)}/${pdvId}/zones/${zoneId}`, {
      method: 'DELETE',
    })
  },

  // El módulo de Zonas aún no existe como store propio — endpoint temporal para
  // poblar el MultiSelect de AssignZonesModal. Cuando se cree el store de zonas,
  // mover este método ahí y eliminarlo de aquí.
  async listZonesForCommerce(commerceId: string): Promise<ZoneSummary[]> {
    const res = await authenticatedFetch<{
      data: ZoneSummary[]
      total: number
      page: number
      limit: number
    }>(`/commerce/${commerceId}/zones`, { query: { page: 1, limit: 100 } })
    return res.data
  },
}
