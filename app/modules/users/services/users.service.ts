import { useAuthStore } from '~/stores/auth.store'
import { authenticatedFetch } from '~/services/http.client'
import type {
  CommerceLite,
  CreateUserDto,
  ListUsersParams,
  ListUsersResponse,
  PaginatedCommerceLiteResponse,
  UpdateUserDto,
  User,
} from '../types/user.types'

export const UsersService = {
  async getAll(params: ListUsersParams = {}): Promise<ListUsersResponse> {
    const query: Record<string, string | number> = {
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    }
    if (params.search) query.search = params.search
    return authenticatedFetch<ListUsersResponse>('/users', { query })
  },

  async create(dto: CreateUserDto): Promise<User> {
    return authenticatedFetch<User>('/users', { method: 'POST', body: dto })
  },

  async update(userId: string, dto: UpdateUserDto): Promise<User> {
    return authenticatedFetch<User>(`/users/${userId}`, { method: 'PATCH', body: dto })
  },

  async assignCommerces(userId: string, commerceIds: string[]): Promise<void> {
    await authenticatedFetch<void>(`/users/${userId}/commerces`, {
      method: 'POST',
      body: { commerceIds },
    })
  },

  async removeCommerce(userId: string, commerceId: string): Promise<void> {
    await authenticatedFetch<void>(`/users/${userId}/commerces/${commerceId}`, {
      method: 'DELETE',
    })
  },

  // Helper: lista de comercios disponibles para poblar el MultiSelect del modal.
  // SuperAdmin ve todos los comercios; CommerceAdmin solo los suyos (los que ya
  // tiene asignados en authStore.user.commerces), sin pegarle al backend.
  async getAvailableCommerces(): Promise<CommerceLite[]> {
    const auth = useAuthStore()
    const role = auth.user?.role
    if (role === 'SuperAdmin') {
      const res = await authenticatedFetch<PaginatedCommerceLiteResponse>('/commerce', {
        query: { page: 1, limit: 100 },
      })
      return res.data.map((c) => ({ id: c.id, name: c.name }))
    }
    const owned = auth.user?.commerces ?? []
    return owned.map((c) => ({ id: c.commerceId, name: c.commerceName }))
  },
}
