// Periodic reconciliation + fallback for rider positions.
//
// ROLE (updated 2026-06-02):
//   The primary rider position feed is now the `rider_location` WS event
//   delivered by `useDashboardSocket` → monitoring.store.riderLivePositions.
//   This polling serves two purposes:
//     1. Full-list reconcile: keeps the riders[] list (names, status, zone
//        assignments) in sync with the backend even when no WS events arrive.
//     2. Global-rider fallback: riders without a home commerce are NOT yet
//        routed through rider_location WS events (backend deferred). REST
//        polling is the only position source for them until that is implemented.
//
// Interval is intentionally long (60 s) because live positions come via WS.
// Do NOT remove this composable — it is still the sole source for global riders.
// When the backend implements rider_location for global riders, reduce the interval
// further or remove the fetchRiders() call from tick() and keep only fetchOrders().

import { onUnmounted, ref } from 'vue'
import { useMonitoringStore } from '../store/monitoring.store'

const DEFAULT_INTERVAL_MS = 60_000

export function useRiderTracking(intervalMs: number = DEFAULT_INTERVAL_MS) {
  const store = useMonitoringStore()
  const isPolling = ref<boolean>(false)
  const tickCount = ref<number>(0)
  let timerId: ReturnType<typeof setInterval> | null = null

  async function tick(): Promise<void> {
    tickCount.value += 1
    await Promise.all([store.fetchRiders(), store.fetchOrders()])
  }

  async function start(): Promise<void> {
    if (isPolling.value) return
    if (!import.meta.client) return
    isPolling.value = true
    await tick()
    timerId = setInterval(() => {
      void tick()
    }, intervalMs)
  }

  function stop(): void {
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
    isPolling.value = false
  }

  onUnmounted(() => {
    stop()
  })

  return { start, stop, isPolling, tickCount }
}
