import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '~/stores/auth.store'
import { useActiveCommerceStore } from '~/stores/active-commerce.store'
import { humanizeAuthError } from '~/utils/error.utils'
import { PdvService } from '../services/pdv.service'
import type {
  CreatePdvDto,
  ListPdvParams,
  PointOfSale,
  UpdatePdvDto,
} from '../types/pdv.types'

interface Pagination {
  page: number
  limit: number
  total: number
}

// Tope defensivo cuando un SA en "Todos los comercios" abanica PdVs contra
// cada commerce accesible. En la práctica los commerces tienen pocos PdVs
// (decenas a lo sumo); 100 cubre con holgura. Si algún tenant tiene más, la
// vista mostrará menos del total real — manejable hasta que el backend
// exponga un endpoint agregado de PdVs.
const FANOUT_LIMIT_PER_COMMERCE = 100

export const usePdvStore = defineStore('pdv', () => {
  const activeCommerceStore = useActiveCommerceStore()
  const authStore = useAuthStore()

  // Reactive shortcut al commerce activo del sidebar — el watcher de abajo
  // dispara recargas cuando cambia.
  const activeCommerceId = computed<string | null>(() => activeCommerceStore.activeCommerceId)

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

  // Indica si hay un scope válido para listar PdVs:
  //   - activeCommerceId !== null → siempre.
  //   - activeCommerceId === null → solo SA puede ver "Todos los comercios".
  const canQuery = computed<boolean>(() => {
    if (activeCommerceId.value !== null) return true
    return authStore.user?.role === 'SuperAdmin'
  })

  async function fetchPdvs(params: ListPdvParams = {}): Promise<void> {
    const cId = activeCommerceId.value

    if (cId === null) {
      // "Todos los comercios": SA fanea contra cada commerce accesible.
      // Otros roles no deberían llegar (initFromAuth los fuerza a un commerce);
      // si llegan por edge-case, vacío.
      if (authStore.user?.role !== 'SuperAdmin') {
        pdvs.value = []
        pagination.value = { page: 1, limit: 20, total: 0 }
        return
      }
      const accessible = activeCommerceStore.accessibleCommerces
      if (accessible.length === 0) {
        pdvs.value = []
        pagination.value = { page: 1, limit: 20, total: 0 }
        return
      }
      isLoading.value = true
      error.value = null
      try {
        const responses = await Promise.all(
          accessible.map((c) =>
            PdvService.getAll(c.commerceId, {
              page: 1,
              limit: FANOUT_LIMIT_PER_COMMERCE,
              isActive: params.isActive,
            }),
          ),
        )
        const merged = responses.flatMap((r) => r.data)
        pdvs.value = merged
        // Sin paginación coherente al fanear out — total = conteo agregado.
        pagination.value = { page: 1, limit: merged.length, total: merged.length }
      } catch (e) {
        error.value = humanizeAuthError(e)
      } finally {
        isLoading.value = false
      }
      return
    }

    // Commerce específico — scoped al tenant.
    isLoading.value = true
    error.value = null
    try {
      const res = await PdvService.getAll(cId, {
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

  // Resuelve el commerceId para una operación sobre un PdV específico.
  // Preferimos el de la entidad (que viaja en el tipo y nunca es null) y
  // caemos al activo solo si el PdV no está en memoria — caso casi imposible
  // con el flujo actual, pero defensivo.
  function resolveCommerceFor(pdvId: string): string | null {
    const inMemory = pdvs.value.find((p) => p.id === pdvId)
    if (inMemory) return inMemory.commerceId
    if (selectedPdv.value?.id === pdvId) return selectedPdv.value.commerceId
    return activeCommerceId.value
  }

  // El callsite (modales) puede pasar commerceId explícito para evitar lookup
  // — útil cuando el PdV se conoce por props pero todavía no entró al listado
  // del store (ej: deep-link o fetch fresco).
  async function fetchById(
    pdvId: string,
    options: { commerceId?: string } = {},
  ): Promise<PointOfSale | null> {
    const cId = options.commerceId ?? resolveCommerceFor(pdvId)
    if (!cId) return null
    error.value = null
    try {
      const pdv = await PdvService.getById(cId, pdvId)
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

  // Crear PdV: bajo /commerce/:cId/pdv. Si llaman sin `targetCommerceId`,
  // usamos el commerce activo del sidebar.
  async function createPdv(
    dto: CreatePdvDto,
    targetCommerceId?: string,
  ): Promise<PointOfSale> {
    const cId = targetCommerceId ?? activeCommerceId.value
    if (!cId) throw new Error('No hay comercio seleccionado')
    isCreating.value = true
    error.value = null
    try {
      const created = await PdvService.create(cId, dto)
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
    const cId = resolveCommerceFor(pdvId)
    if (!cId) throw new Error('No se puede editar un PdV sin commerce dueño')
    isUpdating.value = true
    error.value = null
    try {
      const updated = await PdvService.update(cId, pdvId, dto)
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
    const cId = resolveCommerceFor(pdvId)
    if (!cId) throw new Error('No se puede gestionar zonas de un PdV sin commerce dueño')
    error.value = null
    const current = pdvs.value.find((p) => p.id === pdvId)
    const currentIds = current?.zones?.map((z) => z.id) ?? []
    const toAdd = targetZoneIds.filter((id) => !currentIds.includes(id))
    const toRemove = currentIds.filter((id) => !targetZoneIds.includes(id))

    try {
      if (toAdd.length > 0) {
        await PdvService.assignZones(cId, pdvId, toAdd)
      }
      for (const zoneId of toRemove) {
        await PdvService.removeZone(cId, pdvId, zoneId)
      }
      // Refrescar el detalle con zonas desde el backend
      const fresh = await PdvService.getById(cId, pdvId)
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
    const cId = resolveCommerceFor(pdvId)
    if (!cId) throw new Error('No se puede gestionar zonas de un PdV sin commerce dueño')
    error.value = null
    try {
      await PdvService.removeZone(cId, pdvId, zoneId)
      const fresh = await PdvService.getById(cId, pdvId)
      const idx = pdvs.value.findIndex((p) => p.id === pdvId)
      if (idx !== -1) pdvs.value[idx] = fresh
      if (selectedPdv.value?.id === pdvId) selectedPdv.value = fresh
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    }
  }

  function setSearch(value: string): void {
    search.value = value
  }

  // Cuando cambia el commerce del sidebar, recargamos. Cada commerce tiene
  // su propia paginación — reseteamos a la primera página.
  watch(activeCommerceId, async () => {
    search.value = ''
    selectedPdv.value = null
    pagination.value = { page: 1, limit: 20, total: 0 }
    await fetchPdvs({ page: 1 })
  })

  return {
    activeCommerceId,
    pdvs,
    selectedPdv,
    pagination,
    isLoading,
    isCreating,
    isUpdating,
    error,
    search,
    filteredPdvs,
    canQuery,
    fetchPdvs,
    fetchById,
    createPdv,
    updatePdv,
    assignZones,
    removeZone,
    setSearch,
  }
})
