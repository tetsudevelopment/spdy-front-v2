import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { humanizeAuthError } from '~/utils/error.utils'
import { PdvService } from '../services/pdv.service'
import type {
  CreatePdvDto,
  ListPdvParams,
  PointOfSale,
  UpdatePdvDto,
} from '../types/pdv.types'

interface CommerceRef {
  commerceId: string
  commerceName: string
}

interface Pagination {
  page: number
  limit: number
  total: number
}

export const usePdvStore = defineStore('pdv', () => {
  // Commerce activo — los PdV viven bajo /commerce/:commerceId/pdv, así que
  // todo el flujo depende de este valor.
  const selectedCommerceId = ref<string | null>(null)
  const availableCommerces = ref<CommerceRef[]>([])

  const pdvs = ref<PointOfSale[]>([])
  const selectedPdv = ref<PointOfSale | null>(null)

  const pagination = ref<Pagination>({ page: 1, limit: 20, total: 0 })
  const isLoading = ref<boolean>(false)
  const isCreating = ref<boolean>(false)
  const isUpdating = ref<boolean>(false)
  const error = ref<string | null>(null)

  // Búsqueda local sobre el listado paginado ya traído — el backend no
  // expone search dedicado para PdV.
  const search = ref<string>('')

  const filteredPdvs = computed<PointOfSale[]>(() => {
    const needle = search.value.trim().toLowerCase()
    if (!needle) return pdvs.value
    return pdvs.value.filter((p) => {
      const haystack = [p.name, p.address, p.email ?? '', p.phone ?? '']
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  })

  async function fetchPdvs(params: ListPdvParams = {}): Promise<void> {
    if (!selectedCommerceId.value) {
      pdvs.value = []
      pagination.value = { page: 1, limit: 20, total: 0 }
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const res = await PdvService.getAll(selectedCommerceId.value, {
        page: params.page ?? pagination.value.page,
        limit: params.limit ?? pagination.value.limit,
        isActive: params.isActive,
      })
      pdvs.value = res.data
      pagination.value = { page: res.page, limit: res.limit, total: res.total }
    } catch (e) {
      error.value = humanizeAuthError(e)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchById(pdvId: string): Promise<PointOfSale | null> {
    if (!selectedCommerceId.value) return null
    error.value = null
    try {
      const pdv = await PdvService.getById(selectedCommerceId.value, pdvId)
      selectedPdv.value = pdv
      // Mantén el item en el listado sincronizado — el listado puede venir
      // sin `zones` y el detalle sí las trae.
      const idx = pdvs.value.findIndex((p) => p.id === pdvId)
      if (idx !== -1) pdvs.value[idx] = pdv
      return pdv
    } catch (e) {
      error.value = humanizeAuthError(e)
      return null
    }
  }

  async function createPdv(dto: CreatePdvDto): Promise<PointOfSale> {
    if (!selectedCommerceId.value) {
      throw new Error('No hay comercio seleccionado')
    }
    isCreating.value = true
    error.value = null
    try {
      const created = await PdvService.create(selectedCommerceId.value, dto)
      await fetchPdvs({ page: 1 })
      return created
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    } finally {
      isCreating.value = false
    }
  }

  async function updatePdv(pdvId: string, dto: UpdatePdvDto): Promise<PointOfSale> {
    if (!selectedCommerceId.value) {
      throw new Error('No hay comercio seleccionado')
    }
    isUpdating.value = true
    error.value = null
    try {
      const updated = await PdvService.update(selectedCommerceId.value, pdvId, dto)
      await fetchPdvs({ page: pagination.value.page })
      if (selectedPdv.value?.id === pdvId) {
        selectedPdv.value = updated
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

  // Diff-based: el backend expone POST (asignar) y DELETE (desasignar) por
  // separado. Calculamos el delta y disparamos las llamadas que correspondan.
  async function assignZones(pdvId: string, targetZoneIds: string[]): Promise<void> {
    if (!selectedCommerceId.value) {
      throw new Error('No hay comercio seleccionado')
    }
    error.value = null
    const current = pdvs.value.find((p) => p.id === pdvId)
    const currentIds = current?.zones?.map((z) => z.id) ?? []
    const toAdd = targetZoneIds.filter((id) => !currentIds.includes(id))
    const toRemove = currentIds.filter((id) => !targetZoneIds.includes(id))

    try {
      if (toAdd.length > 0) {
        await PdvService.assignZones(selectedCommerceId.value, pdvId, toAdd)
      }
      for (const zoneId of toRemove) {
        await PdvService.removeZone(selectedCommerceId.value, pdvId, zoneId)
      }
      // Refrescar el detalle con zonas desde el backend
      const fresh = await PdvService.getById(selectedCommerceId.value, pdvId)
      const idx = pdvs.value.findIndex((p) => p.id === pdvId)
      if (idx !== -1) pdvs.value[idx] = fresh
      if (selectedPdv.value?.id === pdvId) selectedPdv.value = fresh
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    }
  }

  async function removeZone(pdvId: string, zoneId: string): Promise<void> {
    if (!selectedCommerceId.value) {
      throw new Error('No hay comercio seleccionado')
    }
    error.value = null
    try {
      await PdvService.removeZone(selectedCommerceId.value, pdvId, zoneId)
      const fresh = await PdvService.getById(selectedCommerceId.value, pdvId)
      const idx = pdvs.value.findIndex((p) => p.id === pdvId)
      if (idx !== -1) pdvs.value[idx] = fresh
      if (selectedPdv.value?.id === pdvId) selectedPdv.value = fresh
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    }
  }

  function setSelectedCommerce(commerceId: string | null): void {
    selectedCommerceId.value = commerceId
  }

  function setAvailableCommerces(list: CommerceRef[]): void {
    availableCommerces.value = list
  }

  function setSearch(value: string): void {
    search.value = value
  }

  // Auto-recarga al cambiar el commerce activo. Cada commerce tiene su propia
  // paginación — reseteamos a la primera página.
  watch(selectedCommerceId, async (id) => {
    search.value = ''
    selectedPdv.value = null
    pagination.value = { page: 1, limit: 20, total: 0 }
    if (id) await fetchPdvs({ page: 1 })
    else pdvs.value = []
  })

  return {
    selectedCommerceId,
    availableCommerces,
    pdvs,
    selectedPdv,
    pagination,
    isLoading,
    isCreating,
    isUpdating,
    error,
    search,
    filteredPdvs,
    fetchPdvs,
    fetchById,
    createPdv,
    updatePdv,
    assignZones,
    removeZone,
    setSelectedCommerce,
    setAvailableCommerces,
    setSearch,
  }
})
