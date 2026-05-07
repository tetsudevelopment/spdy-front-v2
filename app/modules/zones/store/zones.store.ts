import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { humanizeAuthError } from '~/utils/error.utils'
import { ZonesService } from '../services/zones.service'
import type {
  CommerceRef,
  CreateZoneDto,
  ListZonesParams,
  UpdateZoneDto,
  Zone,
  ZoneViewMode,
} from '../types/zone.types'

interface Pagination {
  page: number
  limit: number
  total: number
}

export const useZonesStore = defineStore('zones', () => {
  // viewMode decide desde qué endpoint se listan las zonas:
  //   'global'   → GET /zones (solo SA)
  //   'commerce' → GET /commerce/:selectedCommerceId/zones
  const viewMode = ref<ZoneViewMode>('global')
  const selectedCommerceId = ref<string | null>(null)
  const availableCommerces = ref<CommerceRef[]>([])

  const zones = ref<Zone[]>([])
  const selectedZone = ref<Zone | null>(null)

  const pagination = ref<Pagination>({ page: 1, limit: 20, total: 0 })
  const isLoading = ref<boolean>(false)
  const isCreating = ref<boolean>(false)
  const isUpdating = ref<boolean>(false)
  const isCopying = ref<boolean>(false)
  const error = ref<string | null>(null)

  const search = ref<string>('')

  const filteredZones = computed<Zone[]>(() => {
    const needle = search.value.trim().toLowerCase()
    if (!needle) return zones.value
    return zones.value.filter((z) => {
      const haystack = [z.name, z.description ?? ''].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  })

  // ¿Tenemos los params suficientes para tirar de la API en el modo actual?
  const canQuery = computed<boolean>(() => {
    if (viewMode.value === 'global') return true
    return selectedCommerceId.value !== null
  })

  async function fetchZones(params: ListZonesParams = {}): Promise<void> {
    if (!canQuery.value) {
      zones.value = []
      pagination.value = { page: 1, limit: 20, total: 0 }
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const res = await ZonesService.getAll({
        page: params.page ?? pagination.value.page,
        limit: params.limit ?? pagination.value.limit,
        isActive: params.isActive,
        commerceId: viewMode.value === 'commerce'
          ? selectedCommerceId.value ?? undefined
          : undefined,
      })
      zones.value = res.data
      pagination.value = { page: res.page, limit: res.limit, total: res.total }
    } catch (e) {
      error.value = humanizeAuthError(e)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchById(zoneId: string): Promise<Zone | null> {
    error.value = null
    try {
      const zone = await ZonesService.getById(zoneId)
      selectedZone.value = zone
      const idx = zones.value.findIndex((z) => z.id === zoneId)
      if (idx !== -1) zones.value[idx] = zone
      return zone
    } catch (e) {
      error.value = humanizeAuthError(e)
      return null
    }
  }

  async function createZone(dto: CreateZoneDto): Promise<Zone> {
    isCreating.value = true
    error.value = null
    try {
      const created = await ZonesService.create(dto)
      await fetchZones({ page: 1 })
      return created
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    } finally {
      isCreating.value = false
    }
  }

  // El backend solo acepta PATCH /commerce/:cId/zones/:zoneId. Resolvemos el
  // commerceId en este orden:
  //   1) el de la zona (cuando el listado lo incluye)
  //   2) el commerce activo del store (cuando el listado venía con null —
  //      caso típico: zona global asignada al commerce, que aparece en el
  //      GET commerce-scoped con commerceId=null pese a vivir bajo ese cId)
  // Si tampoco hay activo, no podemos enrutar (típicamente vista Globales).
  async function updateZone(
    zoneId: string,
    zoneCommerceId: string | null,
    dto: UpdateZoneDto,
  ): Promise<Zone> {
    const cId = zoneCommerceId ?? selectedCommerceId.value
    if (!cId) {
      throw new Error('No se puede editar una zona sin commerce dueño')
    }
    isUpdating.value = true
    error.value = null
    try {
      const updated = await ZonesService.update(zoneId, cId, dto)
      await fetchZones({ page: pagination.value.page })
      if (selectedZone.value?.id === zoneId) selectedZone.value = updated
      return updated
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    } finally {
      isUpdating.value = false
    }
  }

  async function copyZone(zoneId: string, targetCommerceIds: string[]): Promise<Zone[]> {
    isCopying.value = true
    error.value = null
    try {
      // 1) Asignar la zona global a todos los commerces destino en una sola
      //    llamada — es precondición del backend antes de poder copiarla.
      await ZonesService.assignZoneToCommerces(zoneId, targetCommerceIds)

      // 2) Copiar la zona hacia cada commerce. El endpoint acepta uno a la
      //    vez; el backend es idempotente por commerce, así que podemos ir
      //    en paralelo.
      const results = await Promise.all(
        targetCommerceIds.map((commerceId) =>
          ZonesService.copyZone(zoneId, commerceId),
        ),
      )
      return results
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    } finally {
      isCopying.value = false
    }
  }

  function setViewMode(mode: ZoneViewMode): void {
    viewMode.value = mode
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

  // Auto-recarga al cambiar de vista o de commerce activo.
  watch([viewMode, selectedCommerceId], async () => {
    search.value = ''
    selectedZone.value = null
    pagination.value = { page: 1, limit: 20, total: 0 }
    await fetchZones({ page: 1 })
  })

  return {
    viewMode,
    selectedCommerceId,
    availableCommerces,
    zones,
    selectedZone,
    pagination,
    isLoading,
    isCreating,
    isUpdating,
    isCopying,
    error,
    search,
    filteredZones,
    canQuery,
    fetchZones,
    fetchById,
    createZone,
    updateZone,
    copyZone,
    setViewMode,
    setSelectedCommerce,
    setAvailableCommerces,
    setSearch,
  }
})
