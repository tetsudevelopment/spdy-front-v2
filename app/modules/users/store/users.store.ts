import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { humanizeAuthError } from '~/utils/error.utils'
import { UsersService } from '../services/users.service'
import type {
  CommerceLite,
  CreateUserDto,
  ListUsersParams,
  UpdateUserDto,
  User,
} from '../types/user.types'

interface Pagination {
  limit: number
  offset: number
  count: number
}

export const useUsersStore = defineStore('users', () => {
  const users = ref<User[]>([])
  const pagination = ref<Pagination>({ limit: 50, offset: 0, count: 0 })
  const isLoading = ref<boolean>(false)
  const isCreating = ref<boolean>(false)
  const isUpdating = ref<boolean>(false)
  const error = ref<string | null>(null)

  const availableCommerces = ref<CommerceLite[]>([])
  const isLoadingCommerces = ref<boolean>(false)

  const search = ref<string>('')

  const filteredUsers = computed<User[]>(() => {
    const needle = search.value.trim().toLowerCase()
    if (!needle) return users.value
    return users.value.filter((u) => {
      const haystack = [u.username, u.fullName ?? '', u.email ?? '']
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  })

  async function fetchUsers(params: ListUsersParams = {}): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await UsersService.getAll({
        limit: params.limit ?? pagination.value.limit,
        offset: params.offset ?? 0,
      })
      users.value = res.users
      pagination.value = res.pagination
    } catch (e) {
      error.value = humanizeAuthError(e)
    } finally {
      isLoading.value = false
    }
  }

  async function createUser(dto: CreateUserDto): Promise<User> {
    isCreating.value = true
    error.value = null
    try {
      const created = await UsersService.create(dto)
      // Recargar listado tras la creación
      await fetchUsers({ offset: 0 })
      return created
    } catch (e) {
      const message = humanizeAuthError(e)
      error.value = message
      throw new Error(message)
    } finally {
      isCreating.value = false
    }
  }

  async function updateUser(userId: string, dto: UpdateUserDto): Promise<User> {
    isUpdating.value = true
    error.value = null
    try {
      const updated = await UsersService.update(userId, dto)
      await fetchUsers({ offset: 0 })
      return updated
    } catch (e) {
      const message = humanizeAuthError(e)
      error.value = message
      throw new Error(message)
    } finally {
      isUpdating.value = false
    }
  }

  async function fetchAvailableCommerces(): Promise<void> {
    isLoadingCommerces.value = true
    try {
      availableCommerces.value = await UsersService.getAvailableCommerces()
    } catch (e) {
      error.value = humanizeAuthError(e)
    } finally {
      isLoadingCommerces.value = false
    }
  }

  function setSearch(value: string): void {
    search.value = value
  }

  return {
    users,
    pagination,
    isLoading,
    isCreating,
    isUpdating,
    error,
    availableCommerces,
    isLoadingCommerces,
    search,
    filteredUsers,
    fetchUsers,
    createUser,
    updateUser,
    fetchAvailableCommerces,
    setSearch,
  }
})
