import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from '~/stores/auth.store'
import { MonitoringService } from '../services/monitoring.service'
import type {
  MonitoringKpi,
  MonitoringOrder,
  MonitoringRider,
  MonitoringTab,
  MonitoringZone,
  OrderStatus,
  RiderVisualStatus,
  ServicesFilters,
} from '../types/monitoring.types'
import type { OrderQuote, QuoteRequest, CreateOrderWithQuoteRequest } from '../types/quote.types'
import type { WsMessage } from '../types/ws.types'

// Live GPS position received via rider_location WS events.
export interface RiderLivePosition {
  lat: number
  lng: number
  accuracy?: number
  speed?: number
  heading?: number
  recordedAt?: string
  /** Wall-clock time this frontend received the update (ISO string). */
  updatedAt: string
}

const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'entregado',
  'cancelado',
])

const IN_TRANSIT_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'en_transito',
  'en_punto_de_entrega',
])

export function riderVisualStatus(rider: MonitoringRider): RiderVisualStatus {
  if (rider.currentOrderId) return 'on_route'
  if (rider.isOnline && rider.status === 'activo') return 'online'
  return 'offline'
}

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  )
}

export const useMonitoringStore = defineStore('monitoring', () => {
  // State
  const activeTab = ref<MonitoringTab>('services')

  const orders = ref<MonitoringOrder[]>([])
  const riders = ref<MonitoringRider[]>([])
  const zones = ref<MonitoringZone[]>([])
  const selectedZoneId = ref<string | null>(null)

  const filters = ref<ServicesFilters>({
    city: null,
    zoneId: null,
    status: null,
    search: '',
  })

  const isLoadingOrders = ref<boolean>(false)
  const isLoadingRiders = ref<boolean>(false)
  const isLoadingZones = ref<boolean>(false)
  const error = ref<string | null>(null)

  const lastUpdatedAt = ref<string | null>(null)

  // Live GPS positions received via rider_location WS events.
  // Key: riderId. Value: latest position snapshot.
  // Updated surgically on each rider_location event — no full refetch needed.
  const riderLivePositions = ref<Map<string, RiderLivePosition>>(new Map())

  // Quote state — single instance (D23: modal is single-instance, not a Map)
  const lastQuote = ref<OrderQuote | null>(null)
  const quoteLoading = ref<boolean>(false)
  const quoteError = ref<string | null>(null)

  // Derivados
  const activeCommerceId = computed<string | null>(() => {
    const auth = useAuthStore()
    return auth.user?.commerces?.[0]?.commerceId ?? null
  })

  // Todos los computeds aplican `?? []` defensivo: aunque el state arranca en
  // [] y los fetchers son defensivos, una respuesta malformada del backend
  // podría dejar el ref en undefined y reventar el render del header de KPIs
  // y los filtros antes incluso de poder mostrar el empty state.
  const filteredOrders = computed<MonitoringOrder[]>(() => {
    const f = filters.value
    const needle = (f.search ?? '').trim().toLowerCase()
    return (orders.value ?? []).filter((o) => {
      if (f.zoneId && o.zoneId !== f.zoneId) return false
      if (f.status && o.status !== f.status) return false
      if (needle) {
        const haystack = [
          o.id,
          o.customerName,
          o.assignedRiderName ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  })

  const activeRiders = computed<MonitoringRider[]>(() =>
    (riders.value ?? []).filter((r) => {
      const vs = riderVisualStatus(r)
      return vs === 'online' || vs === 'on_route'
    }),
  )

  const offlineRiders = computed<MonitoringRider[]>(() =>
    (riders.value ?? []).filter((r) => riderVisualStatus(r) === 'offline'),
  )

  const ridersByZone = computed<Record<string, MonitoringRider[]>>(() => {
    const map: Record<string, MonitoringRider[]> = {}
    for (const r of riders.value ?? []) {
      const key = r.zoneId ?? '__none__'
      if (!map[key]) map[key] = []
      map[key].push(r)
    }
    return map
  })

  const ridersInSelectedZone = computed<MonitoringRider[]>(() => {
    if (!selectedZoneId.value) return []
    return ridersByZone.value[selectedZoneId.value] ?? []
  })

  // KPIs (§14 AGENT.md)
  const kpis = computed<MonitoringKpi[]>(() => {
    const now = new Date()
    const ordersList = orders.value ?? []
    const ridersList = riders.value ?? []

    const activeServices = ordersList.filter(
      (o) => !TERMINAL_STATUSES.has(o.status),
    ).length
    const unassigned = ordersList.filter((o) => o.status === 'creado').length

    const totalActive = ridersList.filter((r) => r.status === 'activo').length
    const online = ridersList.filter(
      (r) => r.isOnline && r.status === 'activo',
    ).length

    const inTransit = ordersList.filter((o) =>
      IN_TRANSIT_STATUSES.has(o.status),
    ).length

    const deliveredToday = ordersList.filter(
      (o) => o.status === 'entregado' && isSameDay(o.updatedAt ?? o.createdAt, now),
    ).length

    return [
      {
        key: 'active_services',
        label: 'Servicios activos',
        value: activeServices,
        hint: unassigned > 0 ? `${unassigned} sin asignar` : undefined,
        tone: unassigned > 0 ? 'warning' : 'muted',
      },
      {
        key: 'riders_online',
        label: 'Riders online',
        value: online,
        hint: `de ${totalActive} activos`,
        tone: 'brand',
      },
      {
        key: 'in_transit',
        label: 'En tránsito',
        value: inTransit,
        tone: 'muted',
      },
      {
        key: 'delivered_today',
        label: 'Entregados hoy',
        value: deliveredToday,
        tone: 'muted',
      },
    ]
  })

  // Actions
  async function fetchOrders(): Promise<void> {
    isLoadingOrders.value = true
    error.value = null
    try {
      const res = await MonitoringService.getOrders()
      orders.value = res?.data ?? []
      lastUpdatedAt.value = new Date().toISOString()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error cargando servicios'
    } finally {
      isLoadingOrders.value = false
    }
  }

  async function fetchRiders(): Promise<void> {
    const auth = useAuthStore()
    const isSuperAdmin = auth.user?.role === 'SuperAdmin'
    const commerceId = activeCommerceId.value

    isLoadingRiders.value = true
    error.value = null
    try {
      if (commerceId) {
        // CommerceAdmin / SuperAdmin con commerce asignado → listado completo
        // (activos + offline) del commerce.
        const res = await MonitoringService.getAllCommerceRiders(commerceId)
        riders.value = res?.data ?? []
      } else if (isSuperAdmin) {
        // SuperAdmin sin commerce → /riders/online sin filtro (globales online).
        const res = await MonitoringService.getOnlineRiders()
        riders.value = res?.data ?? []
      } else {
        // Otros roles sin commerce → no hay nada que listar.
        riders.value = []
      }
      lastUpdatedAt.value = new Date().toISOString()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error cargando domiciliarios'
    } finally {
      isLoadingRiders.value = false
    }
  }

  async function fetchZones(): Promise<void> {
    isLoadingZones.value = true
    error.value = null
    try {
      const res = await MonitoringService.getZones()
      const data = res?.data ?? []
      zones.value = data
      if (!selectedZoneId.value && data.length > 0) {
        selectedZoneId.value = data[0]?.id ?? null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error cargando zonas'
    } finally {
      isLoadingZones.value = false
    }
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([fetchOrders(), fetchRiders(), fetchZones()])
  }

  function setTab(tab: MonitoringTab): void {
    activeTab.value = tab
  }

  function setFilters(patch: Partial<ServicesFilters>): void {
    filters.value = { ...filters.value, ...patch }
  }

  function selectZone(zoneId: string): void {
    selectedZoneId.value = zoneId
  }

  // ── Quote actions ──────────────────────────────────────────────────────────

  async function quoteOrder(commerceId: string, body: QuoteRequest): Promise<OrderQuote | null> {
    quoteLoading.value = true
    quoteError.value = null
    try {
      const quote = await MonitoringService.quoteOrder(commerceId, body)
      lastQuote.value = quote
      return quote
    } catch (err) {
      quoteError.value = err instanceof Error ? err.message : 'Failed to get quote'
      lastQuote.value = null
      return null
    } finally {
      quoteLoading.value = false
    }
  }

  async function createOrder(
    commerceId: string,
    body: CreateOrderWithQuoteRequest,
  ): Promise<MonitoringOrder | null> {
    try {
      const order = await MonitoringService.createOrder(commerceId, body)
      // Refresh orders list after successful creation
      await fetchOrders()
      return order
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create order'
      return null
    }
  }

  function clearQuote(): void {
    lastQuote.value = null
    quoteError.value = null
    quoteLoading.value = false
  }

  // ── WebSocket real-time feed ──────────────────────────────────────────────
  //
  // The store exposes a typed message handler that the monitoring page
  // passes to useDashboardSocket(). The socket lifecycle (connect/close) lives
  // in the page component so it ties to the component's onMounted/onUnmounted.
  // This follows the repo convention: composables manage lifecycle, stores manage state.

  function handleWsMessage(msg: WsMessage): void {
    if (msg.type === 'connected') {
      // Server confirmed subscription rooms — no state change needed.
      return
    }

    if (msg.type === 'order_status_change') {
      const { orderId, toStatus } = msg.data
      const idx = orders.value.findIndex((o) => o.id === orderId)
      if (idx !== -1) {
        // Surgical patch — no full refetch needed when order is in the list
        orders.value[idx] = {
          ...orders.value[idx]!,
          status: toStatus as OrderStatus,
          updatedAt: msg.data.changedAt,
        }
        lastUpdatedAt.value = new Date().toISOString()
      } else {
        // Order not in current list (different page/filter) — fall back to refetch
        void fetchOrders()
      }
      return
    }

    if (msg.type === 'new_order') {
      // WS event carries only IDs, not the full MonitoringOrder shape — refetch.
      void fetchOrders()
      return
    }

    if (msg.type === 'rider_location') {
      const { riderId, lat, lng, accuracy, speed, heading, recordedAt } = msg.data
      // Store the live position regardless of whether the rider is in the
      // current riders[] list — the map watcher will pick it up either way.
      // If the rider is NOT in the list (global rider, different scope), the
      // position is stored but not rendered (graceful ignore at render time).
      riderLivePositions.value.set(riderId, {
        lat,
        lng,
        accuracy,
        speed,
        heading,
        recordedAt,
        updatedAt: new Date().toISOString(),
      })
      // Trigger reactivity: replace the Map reference so Vue watchers fire.
      riderLivePositions.value = new Map(riderLivePositions.value)
      return
    }

    // msg.type === 'error' with 'unauthorized' is intercepted inside useDashboardSocket
    // before reaching this callback; no action needed here.
  }

  return {
    // state
    activeTab,
    orders,
    riders,
    zones,
    selectedZoneId,
    filters,
    isLoadingOrders,
    isLoadingRiders,
    isLoadingZones,
    error,
    lastUpdatedAt,
    riderLivePositions,
    // quote state
    lastQuote,
    quoteLoading,
    quoteError,
    // getters
    activeCommerceId,
    filteredOrders,
    activeRiders,
    offlineRiders,
    ridersByZone,
    ridersInSelectedZone,
    kpis,
    // actions
    fetchOrders,
    fetchRiders,
    fetchZones,
    refreshAll,
    setTab,
    setFilters,
    selectZone,
    // quote actions
    quoteOrder,
    createOrder,
    clearQuote,
    // ws handler (used by useDashboardSocket on the monitoring page)
    handleWsMessage,
  }
})
