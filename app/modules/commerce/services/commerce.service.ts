import { authenticatedFetch } from '~/services/http.client'
import type {
  ApiKeyResponse,
  Commerce,
  CreateCommerceDto,
  ListCommercesParams,
  ListCommercesResponse,
  UpdateCommerceDto,
} from '../types/commerce.types'

// El backend itera `request.parts()` manualmente: recibe TODO como string
// y después convierte con Number(...) / JSON.parse(...). Por eso:
//  - solo anexamos campos con valor real (no '', null ni undefined)
//  - todo valor primitivo se coerce a string antes del append
//  - schedule (si llega como objeto) se serializa a JSON
//  - logo va como File con su filename — el navegador fija el boundary.
const STRING_FIELDS = [
  'name', 'fleetType', 'phone', 'email', 'address',
  'nit', 'razonSocial', 'website', 'currency', 'timezone',
  'baseFare', 'dailyOrderLimit', 'maxRadiusKm',
] as const

function buildFormData(dto: Record<string, unknown>): FormData {
  const fd = new FormData()

  for (const key of STRING_FIELDS) {
    const v = dto[key]
    if (typeof v === 'string' && v.trim() !== '') {
      fd.append(key, v)
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      fd.append(key, String(v))
    }
  }

  if (dto.schedule && typeof dto.schedule === 'object') {
    fd.append('schedule', JSON.stringify(dto.schedule))
  }

  if (dto.logo instanceof File) {
    fd.append('logo', dto.logo, dto.logo.name)
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

export const CommerceService = {
  async getAll(params: ListCommercesParams = {}): Promise<ListCommercesResponse> {
    const query: Record<string, string | number> = {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    }
    if (params.search) query.search = params.search
    if (params.fleetType) query.fleetType = params.fleetType
    return authenticatedFetch<ListCommercesResponse>('/commerce', { query })
  },

  async getById(id: string): Promise<Commerce> {
    return authenticatedFetch<Commerce>(`/commerce/${id}`)
  },

  async create(dto: CreateCommerceDto): Promise<Commerce> {
    const fd = buildFormData(dto as unknown as Record<string, unknown>)
    debugFormData('commerce.create', fd)
    return authenticatedFetch<Commerce>('/commerce', {
      method: 'POST',
      body: fd,
    })
  },

  async update(id: string, dto: UpdateCommerceDto): Promise<Commerce> {
    const fd = buildFormData(dto as unknown as Record<string, unknown>)
    debugFormData('commerce.update', fd)
    return authenticatedFetch<Commerce>(`/commerce/${id}`, {
      method: 'PATCH',
      body: fd,
    })
  },

  async generateApiKey(id: string): Promise<ApiKeyResponse> {
    return authenticatedFetch<ApiKeyResponse>(`/commerce/${id}/api-key`, {
      method: 'POST',
    })
  },
}
