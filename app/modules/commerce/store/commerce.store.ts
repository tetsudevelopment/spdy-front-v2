import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { humanizeAuthError } from '~/utils/error.utils'
import { CommerceService } from '../services/commerce.service'
import type {
  Commerce,
  CreateCommerceDto,
  FleetType,
  ListCommercesParams,
  UpdateCommerceDto,
} from '../types/commerce.types'

interface Pagination {
  page: number
  limit: number
  total: number
}

export const useCommerceStore = defineStore('commerce', () => {
  const commerces = ref<Commerce[]>([])
  const selectedCommerce = ref<Commerce | null>(null)
  const pagination = ref<Pagination>({ page: 1, limit: 20, total: 0 })
  const isLoading = ref<boolean>(false)
  const isCreating = ref<boolean>(false)
  const isUpdating = ref<boolean>(false)
  const error = ref<string | null>(null)

  // Filtros locales — el backend aún no expone búsqueda dedicada, se filtra
  // del lado del cliente sobre el listado paginado ya traído.
  const search = ref<string>('')
  const fleetTypeFilter = ref<FleetType | null>(null)

  const filteredCommerces = computed<Commerce[]>(() => {
    let list = commerces.value
    if (fleetTypeFilter.value) {
      list = list.filter((c) => c.fleetType === fleetTypeFilter.value)
    }
    const needle = search.value.trim().toLowerCase()
    if (!needle) return list
    return list.filter((c) => {
      const haystack = [
        c.name,
        c.nit ?? '',
        c.email ?? '',
        c.razonSocial ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  })

  async function fetchCommerces(params: ListCommercesParams = {}): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await CommerceService.getAll({
        page: params.page ?? pagination.value.page,
        limit: params.limit ?? pagination.value.limit,
      })
      commerces.value = res.data
      pagination.value = { page: res.page, limit: res.limit, total: res.total }
    } catch (e) {
      error.value = humanizeAuthError(e)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchById(id: string): Promise<Commerce | null> {
    error.value = null
    try {
      const c = await CommerceService.getById(id)
      selectedCommerce.value = c
      return c
    } catch (e) {
      error.value = humanizeAuthError(e)
      return null
    }
  }

  async function createCommerce(dto: CreateCommerceDto): Promise<Commerce> {
    isCreating.value = true
    error.value = null
    try {
      const created = await CommerceService.create(dto)
      await fetchCommerces({ page: 1 })
      return created
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    } finally {
      isCreating.value = false
    }
  }

  async function updateCommerce(id: string, dto: UpdateCommerceDto): Promise<Commerce> {
    isUpdating.value = true
    error.value = null
    try {
      const updated = await CommerceService.update(id, dto)
      await fetchCommerces({ page: pagination.value.page })
      if (selectedCommerce.value?.id === id) {
        selectedCommerce.value = updated
      }
      return updated
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    } finally {
      isUpdating.value = false
    }
  }

  function selectCommerce(c: Commerce | null): void {
    selectedCommerce.value = c
  }

  function setSearch(value: string): void {
    search.value = value
  }

  function setFleetTypeFilter(value: FleetType | null): void {
    fleetTypeFilter.value = value
  }

  return {
    commerces,
    selectedCommerce,
    pagination,
    isLoading,
    isCreating,
    isUpdating,
    error,
    search,
    fleetTypeFilter,
    filteredCommerces,
    fetchCommerces,
    fetchById,
    createCommerce,
    updateCommerce,
    selectCommerce,
    setSearch,
    setFleetTypeFilter,
  }
})
