import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '~/stores/auth.store'
import { useActiveCommerceStore } from '~/stores/active-commerce.store'
import { humanizeAuthError } from '~/utils/error.utils'
import { RidersService } from '../services/riders.service'
import type {
  CreateRiderDto,
  FleetType,
  ListRidersParams,
  Rider,
  RiderAvailability,
  RiderDocument,
  RiderDocumentType,
  RiderStatus,
  UpdateRiderDto,
  ZoneSummary,
} from '../types/rider.types'

// Pareja mínima para enrutar adds/removes de zonas a su commerce dueño.
type ZoneOwner = Pick<ZoneSummary, 'id' | 'commerceId'>

interface Pagination {
  page: number
  limit: number
  total: number
}

// 'commerce' = vista alineada al sidebar (selector de comercio activo):
//                - activeCommerceId === uuid → riders del commerce
//                  (privados + globales relevantes, vía /commerce/:cId/riders)
//                - activeCommerceId === null → SA only ("Todos los comercios"):
//                  TODOS los riders del sistema (privados + globales) vía /riders
// 'global'   = vista exclusiva de SuperAdmin: SOLO los riders Globales del
//              sistema. Ignora el sidebar; filtra client-side sobre /riders
//              hasta que exista endpoint dedicado.
export type RidersViewMode = 'commerce' | 'global'

export const useRidersStore = defineStore('riders', () => {
  const activeCommerceStore = useActiveCommerceStore()
  const authStore = useAuthStore()

  // Reactive shortcut al commerce activo del sidebar — el watcher de abajo
  // dispara recargas cuando cambia. La lista accesible (para selectores
  // dentro del módulo) la leen directamente del activeCommerceStore.
  const activeCommerceId = computed<string | null>(() => activeCommerceStore.activeCommerceId)

  const viewMode = ref<RidersViewMode>('commerce')

  const riders = ref<Rider[]>([])
  const selectedRider = ref<Rider | null>(null)

  const pagination = ref<Pagination>({ page: 1, limit: 20, total: 0 })
  const isLoading = ref<boolean>(false)
  const isCreating = ref<boolean>(false)
  const isUpdating = ref<boolean>(false)
  const error = ref<string | null>(null)

  // IDs de zonas accesibles para el actor (privadas + globales asignadas a su
  // commerce). Se usa para ocultar a un CommerceAdmin las zonas de OTROS
  // commerces que un Rider Global tenga asignadas — el backend devuelve la
  // lista completa, el filtrado de privacidad lo hacemos en cliente. `null`
  // significa "sin filtro" (caso SuperAdmin o aún no cargado).
  const actorAccessibleZoneIds = ref<Set<string> | null>(null)

  // Filtros — búsqueda local sobre lo traído, filtros de estado se aplican
  // también en cliente para evitar round-trips al cambiar el chip activo.
  const search = ref<string>('')
  const availabilityFilter = ref<RiderAvailability | null>(null)
  const statusFilter = ref<RiderStatus | null>(null)

  const filteredRiders = computed<Rider[]>(() => {
    let list = riders.value
    if (availabilityFilter.value) {
      list = list.filter((r) => r.availability === availabilityFilter.value)
    }
    if (statusFilter.value) {
      list = list.filter((r) => r.currentStatus === statusFilter.value)
    }
    const needle = search.value.trim().toLowerCase()
    if (!needle) return list
    return list.filter((r) => {
      const haystack = [
        r.fullName,
        r.cedula ?? '',
        r.phone,
        r.email ?? '',
        r.licensePlate ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  })

  const totalActive = computed<number>(
    () => riders.value.filter((r) => r.isActive).length,
  )
  const availableCount = computed<number>(
    () => riders.value.filter((r) => r.isActive && r.availability === 'available').length,
  )
  const onlineCount = computed<number>(
    () => riders.value.filter((r) => r.currentStatus === 'online' || r.currentStatus === 'on_route').length,
  )
  const offlineCount = computed<number>(
    () => riders.value.filter((r) => !r.currentStatus || r.currentStatus === 'offline').length,
  )

  // Helper: pega contra /riders y actualiza state. Lo extraemos porque tanto
  // `viewMode='global'` (filtrando) como `viewMode='commerce' + activeCommerceId=null`
  // (sin filtrar) lo usan.
  async function fetchSystemWide(
    params: ListRidersParams,
    onlyGlobals: boolean,
  ): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await RidersService.getAllGlobal({
        page: params.page ?? pagination.value.page,
        limit: params.limit ?? pagination.value.limit,
      })
      riders.value = onlyGlobals
        ? res.data.filter((r) => r.fleetType === 'Global')
        : res.data
      // Nota: `total` viene del backend sobre el listado completo de /riders.
      // Cuando filtramos a Globales, el contador queda inflado — aceptable
      // hasta que el backend exponga un endpoint específico de globales.
      pagination.value = { page: res.page, limit: res.limit, total: res.total }
    } catch (e) {
      error.value = humanizeAuthError(e)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchRiders(params: ListRidersParams = {}): Promise<void> {
    if (viewMode.value === 'global') {
      // Vista 'Global': SOLO riders Globales del sistema.
      await fetchSystemWide(params, true)
      return
    }

    // Vista 'commerce' — alineada al sidebar.
    const cId = activeCommerceId.value

    if (cId === null) {
      // "Todos los comercios": SA ve TODOS los riders (privados + globales).
      // CommerceAdmin sin commerces asignados también puede caer aquí por
      // edge-case (initFromAuth lo deja en null). En ese caso vacío, el
      // sidebar ya escondió el selector.
      if (authStore.user?.role !== 'SuperAdmin') {
        riders.value = []
        pagination.value = { page: 1, limit: 20, total: 0 }
        return
      }
      await fetchSystemWide(params, false)
      return
    }

    // Commerce específico — scoped al tenant.
    isLoading.value = true
    error.value = null
    try {
      const res = await RidersService.getAll(cId, {
        page: params.page ?? pagination.value.page,
        limit: params.limit ?? pagination.value.limit,
      })
      riders.value = res.data
      pagination.value = { page: res.page, limit: res.limit, total: res.total }
    } catch (e) {
      error.value = humanizeAuthError(e)
    } finally {
      isLoading.value = false
    }
  }

  // Detalle: para Riders Globales usamos GET /riders/:id; para Privados,
  // commerce-scoped. El rider en cuestión puede no estar aún en la lista
  // (deep-link), así que aceptamos un fleetType opcional para forzar la ruta.
  //
  // Importante: GET /riders/:id (endpoint global) NO trae los flags
  // commerceCan* — vienen sólo desde GET /commerce/:cId/riders, donde el
  // backend conoce el contexto del actor. Sin merge, refrescar el detalle
  // de un Rider Global sobreescribiría los flags `false` por undefined y
  // los botones de editar reaparecen para CommerceAdmin. Por eso aquí
  // preservamos los flags previos cuando el fetch no los devolvió.
  async function fetchById(
    riderId: string,
    options: { fleetType?: FleetType; commerceId?: string | null } = {},
  ): Promise<Rider | null> {
    error.value = null
    try {
      const inMemory = riders.value.find((r) => r.id === riderId)
      const fleet = options.fleetType ?? inMemory?.fleetType
      const ownerCommerceId = options.commerceId ?? inMemory?.commerceId ?? activeCommerceId.value

      let fetched: Rider
      if (fleet === 'Global') {
        fetched = await RidersService.getGlobalById(riderId)
      } else {
        if (!ownerCommerceId) return null
        fetched = await RidersService.getById(ownerCommerceId, riderId)
      }

      const previous = inMemory ?? selectedRider.value
      const merged: Rider = {
        ...fetched,
        commerceCanEdit:
          fetched.commerceCanEdit ?? previous?.commerceCanEdit,
        commerceCanResetPassword:
          fetched.commerceCanResetPassword ?? previous?.commerceCanResetPassword,
        commerceCanManageZones:
          fetched.commerceCanManageZones ?? previous?.commerceCanManageZones,
        commerceCanDelete:
          fetched.commerceCanDelete ?? previous?.commerceCanDelete,
      }

      selectedRider.value = merged
      const idx = riders.value.findIndex((r) => r.id === riderId)
      if (idx !== -1) riders.value[idx] = merged
      return merged
    } catch (e) {
      error.value = humanizeAuthError(e)
      return null
    }
  }

  // Carga los IDs de zonas accesibles para el actor (su commerce). Se llama
  // solo para CommerceAdmin desde la página de riders al montar y al cambiar
  // el commerce activo — SA ve todo y no requiere este filtro. Idempotente.
  async function loadActorAccessibleZoneIds(commerceId: string): Promise<void> {
    try {
      const zones = await RidersService.listZonesForCommerce(commerceId)
      actorAccessibleZoneIds.value = new Set(zones.map((z) => z.id))
    } catch {
      // Sin red o sin permiso: dejamos el set en null (sin filtro). Mejor
      // mostrar de más temporalmente que romper el render del listado.
      actorAccessibleZoneIds.value = null
    }
  }

  function clearActorAccessibleZoneIds(): void {
    actorAccessibleZoneIds.value = null
  }

  // Crear rider Privado: bajo /commerce/:cId/riders. Si llaman sin
  // `targetCommerceId`, se usa el commerce activo del sidebar.
  async function createRider(
    dto: CreateRiderDto,
    photo?: File | null,
    targetCommerceId?: string,
  ): Promise<Rider> {
    const commerceId = targetCommerceId ?? activeCommerceId.value
    if (!commerceId) throw new Error('No hay comercio seleccionado')
    isCreating.value = true
    error.value = null
    try {
      const created = await RidersService.create(commerceId, dto, photo)
      await fetchRiders({ page: 1 })
      return created
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    } finally {
      isCreating.value = false
    }
  }

  // Crear rider Global: bajo /riders, sin commerce. Solo SuperAdmin.
  async function createGlobalRider(
    dto: CreateRiderDto,
    photo?: File | null,
  ): Promise<Rider> {
    isCreating.value = true
    error.value = null
    try {
      const created = await RidersService.createGlobal(dto, photo)
      await fetchRiders({ page: 1 })
      return created
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    } finally {
      isCreating.value = false
    }
  }

  // Resuelve el rider en memoria para enrutar según su fleetType. Para
  // Privados usamos su commerceId dueño; para Globales, /riders/:id.
  function resolveRider(riderId: string): Rider | undefined {
    if (selectedRider.value?.id === riderId) return selectedRider.value
    return riders.value.find((r) => r.id === riderId)
  }

  async function updateRider(riderId: string, dto: UpdateRiderDto): Promise<Rider> {
    const target = resolveRider(riderId)
    isUpdating.value = true
    error.value = null
    try {
      let updated: Rider
      if (target?.fleetType === 'Global') {
        updated = await RidersService.updateGlobal(riderId, dto)
      } else {
        const cId = target?.commerceId ?? activeCommerceId.value
        if (!cId) throw new Error('No hay comercio asociado al domiciliario')
        updated = await RidersService.update(cId, riderId, dto)
      }
      const idx = riders.value.findIndex((r) => r.id === riderId)
      if (idx !== -1) riders.value[idx] = updated
      if (selectedRider.value?.id === riderId) selectedRider.value = updated
      return updated
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    } finally {
      isUpdating.value = false
    }
  }

  async function updatePhoto(riderId: string, file: File): Promise<Rider> {
    const target = resolveRider(riderId)
    error.value = null
    try {
      let updated: Rider
      if (target?.fleetType === 'Global') {
        updated = await RidersService.updateGlobalPhoto(riderId, file)
      } else {
        const cId = target?.commerceId ?? activeCommerceId.value
        if (!cId) throw new Error('No hay comercio asociado al domiciliario')
        updated = await RidersService.updatePhoto(cId, riderId, file)
      }
      const idx = riders.value.findIndex((r) => r.id === riderId)
      if (idx !== -1) riders.value[idx] = updated
      if (selectedRider.value?.id === riderId) selectedRider.value = updated
      return updated
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    }
  }

  async function uploadDocument(
    riderId: string,
    type: RiderDocumentType,
    file: File,
  ): Promise<RiderDocument> {
    const target = resolveRider(riderId)
    // Documentos siguen siendo commerce-scoped en el backend. Para un Global
    // usamos el commerce activo (el actor está operando en un contexto).
    const cId = target?.commerceId ?? activeCommerceId.value
    if (!cId) throw new Error('No hay comercio seleccionado')
    error.value = null
    try {
      const doc = await RidersService.uploadDocument(cId, riderId, type, file)
      if (selectedRider.value?.id === riderId) {
        const fresh = await fetchById(riderId)
        if (fresh) {
          const idx = riders.value.findIndex((r) => r.id === riderId)
          if (idx !== -1) riders.value[idx] = fresh
        }
      }
      return doc
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    }
  }

  // Diff-based igual que en PdV. El routing depende del fleetType del rider:
  //   - Privado: 1 sola petición contra el commerce dueño (POST/DELETE bulk).
  //   - Global: cada zona se asigna contra SU commerce dueño. Si la zona es
  //     global (commerceId === null), va al endpoint legacy /riders/:rId/zones
  //     (sin tenancy, solo SA). Por eso necesitamos `zoneCatalog`: el modal
  //     conoce el dueño de cada zona seleccionable; sin eso, no podemos rutear.
  async function assignZones(
    riderId: string,
    targetZoneIds: string[],
    zoneCatalog: ReadonlyArray<ZoneOwner> = [],
  ): Promise<void> {
    const target = resolveRider(riderId)
    if (!target) throw new Error('Domiciliario no encontrado')

    error.value = null
    const currentIds = target.zones?.map((z) => z.id) ?? []
    const toAdd = targetZoneIds.filter((id) => !currentIds.includes(id))
    const toRemove = currentIds.filter((id) => !targetZoneIds.includes(id))

    try {
      if (target.fleetType === 'Privada') {
        const cId = target.commerceId ?? activeCommerceId.value
        if (!cId) throw new Error('No hay comercio seleccionado')
        if (toAdd.length > 0) {
          await RidersService.assignZones(cId, riderId, toAdd)
        }
        for (const zoneId of toRemove) {
          await RidersService.removeZone(cId, riderId, zoneId)
        }
      } else {
        // Global: agrupar adds/removes por owner. Si una zona no está en el
        // catálogo (caso raro: assigned pero ya inactiva o fuera del scope),
        // caemos al commerce activo del actor.
        const ownerById = new Map<string, string | null>()
        for (const z of zoneCatalog) ownerById.set(z.id, z.commerceId)
        const fallback = activeCommerceId.value

        const ownerOf = (zoneId: string): string | null => {
          if (ownerById.has(zoneId)) return ownerById.get(zoneId) ?? null
          return fallback ?? null
        }

        const groupByOwner = (ids: string[]): Map<string | null, string[]> => {
          const out = new Map<string | null, string[]>()
          for (const id of ids) {
            const owner = ownerOf(id)
            const list = out.get(owner) ?? []
            list.push(id)
            out.set(owner, list)
          }
          return out
        }

        const addGroups = groupByOwner(toAdd)
        const removeGroups = groupByOwner(toRemove)
        const requests: Array<Promise<unknown>> = []

        for (const [owner, ids] of addGroups) {
          if (ids.length === 0) continue
          if (owner === null) {
            requests.push(RidersService.assignGlobalZones(riderId, ids))
          } else {
            requests.push(RidersService.assignZones(owner, riderId, ids))
          }
        }
        for (const [owner, ids] of removeGroups) {
          for (const zoneId of ids) {
            if (owner === null) {
              requests.push(RidersService.removeGlobalZone(riderId, zoneId))
            } else {
              requests.push(RidersService.removeZone(owner, riderId, zoneId))
            }
          }
        }

        await Promise.all(requests)
      }

      const fresh = await fetchById(riderId)
      if (fresh) {
        const idx = riders.value.findIndex((r) => r.id === riderId)
        if (idx !== -1) riders.value[idx] = fresh
        if (selectedRider.value?.id === riderId) selectedRider.value = fresh
      }
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    }
  }

  async function resetPassword(riderId: string, newPassword: string): Promise<void> {
    const target = resolveRider(riderId)
    error.value = null
    try {
      if (target?.fleetType === 'Global') {
        await RidersService.resetGlobalRiderPassword(riderId, newPassword)
      } else {
        const cId = target?.commerceId ?? activeCommerceId.value
        if (!cId) throw new Error('No hay comercio asociado al domiciliario')
        await RidersService.resetPassword(cId, riderId, newPassword)
      }
    } catch (e) {
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    }
  }

  // Optimistic update: alternamos en memoria primero y revertimos si la API
  // rechaza. Así el toggle se siente instantáneo en la UI.
  async function toggleAvailability(
    riderId: string,
    next: RiderAvailability,
  ): Promise<void> {
    const idx = riders.value.findIndex((r) => r.id === riderId)
    if (idx === -1) return
    const original = riders.value[idx] as Rider
    const previous = original.availability
    if (previous === next) return

    // El endpoint de availability es commerce-scoped. Para Privados usamos su
    // commerce dueño; para Globales, el commerce activo. Si el actor está en
    // "Todos los comercios" (activeCommerceId=null) y el rider es Global, no
    // podemos rutear — pedimos seleccionar un commerce.
    const cId = original.fleetType === 'Global'
      ? activeCommerceId.value
      : (original.commerceId ?? activeCommerceId.value)
    if (!cId) {
      throw new Error('Selecciona un comercio en el sidebar para gestionar la disponibilidad de un rider global')
    }

    // Optimistic mutation — objeto nuevo para que Vue detecte el cambio.
    const optimistic: Rider = { ...original, availability: next }
    riders.value = [...riders.value.slice(0, idx), optimistic, ...riders.value.slice(idx + 1)]
    if (selectedRider.value?.id === riderId) selectedRider.value = optimistic

    try {
      const updated = await RidersService.toggleAvailability(cId, riderId, next)
      const freshIdx = riders.value.findIndex((r) => r.id === riderId)
      if (freshIdx !== -1) riders.value[freshIdx] = updated
      if (selectedRider.value?.id === riderId) selectedRider.value = updated
    } catch (e) {
      // Rollback
      const rollbackIdx = riders.value.findIndex((r) => r.id === riderId)
      if (rollbackIdx !== -1) {
        const rollback: Rider = { ...(riders.value[rollbackIdx] as Rider), availability: previous }
        riders.value[rollbackIdx] = rollback
        if (selectedRider.value?.id === riderId) selectedRider.value = rollback
      }
      const msg = humanizeAuthError(e)
      error.value = msg
      throw new Error(msg)
    }
  }

  async function setViewMode(mode: RidersViewMode): Promise<void> {
    if (viewMode.value === mode) return
    viewMode.value = mode
    selectedRider.value = null
    pagination.value = { page: 1, limit: 20, total: 0 }
    search.value = ''
    availabilityFilter.value = null
    statusFilter.value = null
    await fetchRiders({ page: 1 })
  }

  function setSearch(value: string): void {
    search.value = value
  }

  function setAvailabilityFilter(value: RiderAvailability | null): void {
    availabilityFilter.value = value
  }

  function setStatusFilter(value: RiderStatus | null): void {
    statusFilter.value = value
  }

  // Cuando el usuario cambia el commerce en el sidebar, re-disparamos el
  // listado. La vista 'global' ignora el sidebar (es a nivel sistema).
  watch(activeCommerceId, async () => {
    if (viewMode.value === 'global') return
    search.value = ''
    availabilityFilter.value = null
    statusFilter.value = null
    selectedRider.value = null
    pagination.value = { page: 1, limit: 20, total: 0 }
    await fetchRiders({ page: 1 })
  })

  return {
    activeCommerceId,
    viewMode,
    riders,
    selectedRider,
    pagination,
    isLoading,
    isCreating,
    isUpdating,
    error,
    search,
    availabilityFilter,
    statusFilter,
    actorAccessibleZoneIds,
    filteredRiders,
    totalActive,
    availableCount,
    onlineCount,
    offlineCount,
    fetchRiders,
    fetchById,
    createRider,
    createGlobalRider,
    updateRider,
    updatePhoto,
    uploadDocument,
    assignZones,
    toggleAvailability,
    resetPassword,
    setViewMode,
    setSearch,
    setAvailabilityFilter,
    setStatusFilter,
    loadActorAccessibleZoneIds,
    clearActorAccessibleZoneIds,
  }
})
