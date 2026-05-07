import { useAuthStore } from '~/stores/auth.store'
import { authenticatedFetch } from '~/services/http.client'
import type {
  MonitoringOrder,
  MonitoringRider,
  MonitoringZone,
  OrderStatus,
  PaginatedOrdersResponse,
  PaginatedRidersResponse,
  PaginatedZonesResponse,
} from '../types/monitoring.types'

interface AuthScope {
  isSuperAdmin: boolean
  commerceId: string | null
}

function getAuthScope(): AuthScope {
  const auth = useAuthStore()
  return {
    isSuperAdmin: auth.user?.role === 'SuperAdmin',
    commerceId: auth.user?.commerces?.[0]?.commerceId ?? null,
  }
}

function emptyOrders(limit: number): PaginatedOrdersResponse {
  return { data: [], total: 0, page: 1, limit }
}
function emptyRiders(limit: number): PaginatedRidersResponse {
  return { data: [], total: 0, page: 1, limit }
}
function emptyZones(limit: number): PaginatedZonesResponse {
  return { data: [], total: 0, page: 1, limit }
}

interface OrdersQuery {
  status?: OrderStatus
  riderId?: string
  page?: number
  limit?: number
}

export const MonitoringService = {
  // §4.4 — /commerce/:cId/orders exige commerceId en el path.
  // SuperAdmin → sin commerce asignado no puede listar órdenes globales
  //              (el backend no expone /orders global), devolvemos vacío.
  // SuperAdmin CON un commerce asignado → usa ese commerce.
  // Otros roles → commerceId obligatorio.
  async getOrders(query: OrdersQuery = {}): Promise<PaginatedOrdersResponse> {
    const { isSuperAdmin, commerceId } = getAuthScope()
    // El backend cap-ea `limit` en 100 para todos los endpoints paginados;
    // pasar más devuelve 400. Si hace falta mostrar más, paginar.
    const limit = query.limit ?? 100
    if (!commerceId) {
      if (isSuperAdmin) return emptyOrders(limit)
      return emptyOrders(limit)
    }
    const params: Record<string, string | number> = {
      page: query.page ?? 1,
      limit,
    }
    if (query.status) params.status = query.status
    if (query.riderId) params.riderId = query.riderId
    return authenticatedFetch<PaginatedOrdersResponse>(`/commerce/${commerceId}/orders`, {
      query: params,
    })
  },

  // §4.5 — /riders/online requiere al menos uno de commerceId | zoneId | fleetType.
  // TEMPORAL (opción 2): cuando el SuperAdmin no tiene commerceId asignado,
  // devolvemos vacío en vez de llamar al backend para evitar el 400 en la UI.
  // El backend actual rechaza el request sin filtros aunque sea SA; cuando
  // implemente el modo global, quitar el early-return y usar la rama sin params.
  // Otros roles → commerceId obligatorio; si no lo tienen, tampoco llamamos.
  async getOnlineRiders(): Promise<PaginatedRidersResponse> {
    const { commerceId } = getAuthScope()
    const limit = 100

    if (!commerceId) {
      return emptyRiders(limit)
    }

    return authenticatedFetch<PaginatedRidersResponse>('/riders/online', {
      query: { page: 1, limit, commerceId },
    })
  },

  // Lista completa (activos + offline) de un commerce específico.
  // Solo aplica cuando el usuario tiene un commerceId asignado.
  async getAllCommerceRiders(commerceId: string): Promise<PaginatedRidersResponse> {
    return authenticatedFetch<PaginatedRidersResponse>(`/commerce/${commerceId}/riders`, {
      query: { page: 1, limit: 100 },
    })
  },

  // §4.7 — zonas
  // SuperAdmin → GET /zones (globales, sin filtro).
  // Otros roles → GET /commerce/:cId/zones; si no hay commerceId, vacío.
  async getZones(): Promise<PaginatedZonesResponse> {
    const { isSuperAdmin, commerceId } = getAuthScope()
    const limit = 100

    if (isSuperAdmin) {
      return authenticatedFetch<PaginatedZonesResponse>('/zones', { query: { page: 1, limit } })
    }
    if (!commerceId) {
      return emptyZones(limit)
    }
    return authenticatedFetch<PaginatedZonesResponse>(`/commerce/${commerceId}/zones`, {
      query: { page: 1, limit },
    })
  },

  async getOrderDetail(commerceId: string, orderId: string): Promise<MonitoringOrder> {
    return authenticatedFetch<MonitoringOrder>(`/commerce/${commerceId}/orders/${orderId}`)
  },

  async getRiderDetail(riderId: string): Promise<MonitoringRider> {
    return authenticatedFetch<MonitoringRider>(`/riders/${riderId}`)
  },

  async getZoneDetail(zoneId: string): Promise<MonitoringZone> {
    return authenticatedFetch<MonitoringZone>(`/zones/${zoneId}`)
  },
}
