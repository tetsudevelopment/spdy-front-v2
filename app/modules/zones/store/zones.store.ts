import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '~/stores/auth.store'
import { useActiveCommerceStore } from '~/stores/active-commerce.store'
import { humanizeAuthError } from '~/utils/error.utils'
import { ZonesService } from '../services/zones.service'
import type {
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

// Tope defensivo cuando un SA en "Todos los comercios" abanica privadas
// contra cada commerce accesible. En la práctica las comercios tienen <20
// zonas; 100 cubre con holgura. Si en el futuro hay tenants con más, este
// store debería migrar a un endpoint agregado del backend.
const FANOUT_LIMIT_PER_COMMERCE = 100

export const useZonesStore = defineStore('zones', () => {
  const activeCommerceStore = useActiveCommerceStore()
  const authStore = useAuthStore()

  // viewMode decide la familia de listados:
  //   'global'   → GET /zones (solo SA — pestaña 'Globales')
  //   'commerce' → privadas, alineadas al sidebar (activeCommerceId):
  //                  uuid  → GET /commerce/:cId/zones
  //                  null  → SA only ("Todos los comercios"): fan-out por
  //                          cada commerce accesible y merge.
  const viewMode = ref<ZoneViewMode>('global')

  // Reactive shortcut al commerce activo del sidebar — los watchers de abajo
  // disparan recargas cuando cambia (excepto en vista 'global').
  const activeCommerceId = computed<string | null>(() => activeCommerceStore.activeCommerceId)

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
  //   - 'global': siempre.
  //   - 'commerce' + uuid: siempre.
  //   - 'commerce' + null: solo SA puede (vista "Todos"). CA sin commerces
  //     llega aquí por edge-case y queda en false.
  const canQuery = computed<boolean>(() => {
    if (viewMode.value === 'global') return true
    if (activeCommerceId.value !== null) return true
    return authStore.user?.role === 'SuperAdmin'
  })

  async function fetchZones(params: ListZonesParams = {}): Promise<void> {
    if (viewMode.value === 'global') {
      // Globales del sistema — endpoint /zones, ignora el sidebar.
      isLoading.value = true
      error.value = null
      try {
        const res = await ZonesService.getAll({
          page: params.page ?? pagination.value.page,
          limit: params.limit ?? pagination.value.limit,
          isActive: params.isActive,
        })
        zones.value = res.data
        pagination.value = { page: res.page, limit: res.limit, total: res.total }
      } catch (e) {
        error.value = humanizeAuthError(e)
      } finally {
        isLoading.value = false
      }
      return
    }

    // viewMode === 'commerce' — privadas alineadas al sidebar.
    const cId = activeCommerceId.value

    if (cId === null) {
      // "Todos los comercios": SA fanea contra cada commerce accesible.
      // Otros roles no deberían llegar (initFromAuth los fuerza a un commerce);
      // si llegan por edge-case, vacío.
      if (authStore.user?.role !== 'SuperAdmin') {
        zones.value = []
        pagination.value = { page: 1, limit: 20, total: 0 }
        return
      }
      const accessible = activeCommerceStore.accessibleCommerces
      if (accessible.length === 0) {
        zones.value = []
        pagination.value = { page: 1, limit: 20, total: 0 }
        return
      }
      isLoading.value = true
      error.value = null
      try {
        const responses = await Promise.all(
          accessible.map((c) =>
            ZonesService.getAll({
              page: 1,
              limit: FANOUT_LIMIT_PER_COMMERCE,
              commerceId: c.commerceId,
              isActive: params.isActive,
            }),
          ),
        )
        const merged = responses.flatMap((r) => r.data)
        zones.value = merged
        // No hay paginación coherente al fanear out; dejamos el total con
        // el agregado y limit con el conteo real para que la UI muestre
        // "X zonas" sin sugerir páginas adicionales.
        pagination.value = { page: 1, limit: merged.length, total: merged.length }
      } catch (e) {
        error.value = humanizeAuthError(e)
      } finally {
        isLoading.value = false
      }
      return
    }

    // Commerce específico — privadas scoped al tenant.
    isLoading.value = true
    error.value = null
    try {
      const res = await ZonesService.getAll({
        page: params.page ?? pagination.value.page,
        limit: params.limit ?? pagination.value.limit,
        isActive: params.isActive,
        commerceId: cId,
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
  //   2) el commerce activo del sidebar (cuando el listado venía con null —
  //      caso típico: zona global asignada al commerce, que aparece en el
  //      GET commerce-scoped con commerceId=null pese a vivir bajo ese cId)
  // Si tampoco hay activo, no podemos enrutar (típicamente vista Globales).
  async function updateZone(
    zoneId: string,
    zoneCommerceId: string | null,
    dto: UpdateZoneDto,
  ): Promise<Zone> {
    const cId = zoneCommerceId ?? activeCommerceId.value
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

  function setSearch(value: string): void {
    search.value = value
  }

  // Cambio de pestaña → recargar (las dos vistas tienen datasets distintos).
  watch(viewMode, async () => {
    search.value = ''
    selectedZone.value = null
    pagination.value = { page: 1, limit: 20, total: 0 }
    await fetchZones({ page: 1 })
  })

  // Cambio de commerce activo → recargar SOLO si estamos en pestaña 'commerce'.
  // En 'global' las zonas son del sistema; no dependen del sidebar.
  watch(activeCommerceId, async () => {
    if (viewMode.value === 'global') return
    search.value = ''
    selectedZone.value = null
    pagination.value = { page: 1, limit: 20, total: 0 }
    await fetchZones({ page: 1 })
  })

  return {
    activeCommerceId,
    viewMode,
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
    setSearch,
  }
})
