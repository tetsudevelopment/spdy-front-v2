// Polling temporal para posiciones de riders.
// TODO: confirmar con equipo — reemplazar por WS/SSE cuando el backend lo soporte.
// La interfaz pública (start/stop/isPolling) debe mantenerse estable.

import { onUnmounted, ref } from 'vue'
import { useMonitoringStore } from '../store/monitoring.store'

const DEFAULT_INTERVAL_MS = 15_000

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
