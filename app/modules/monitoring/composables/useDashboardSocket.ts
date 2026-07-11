// Native WebSocket client for the real-time dashboard feed.
// Endpoint: GET {SOCKET_BASE}/ws/dashboard?token=<ACCESS_JWT>
//
// Design:
// - Reconnects with exponential backoff (1s→2s→4s…capped at 30s + jitter).
// - Stops reconnecting permanently on auth rejection (close code 1008 or
//   error message "unauthorized") — the existing auth interceptor in
//   http.client.ts handles token refresh/re-login; we must not loop forever.
// - Clean lifecycle: caller must call connect() on mount and close() on unmount.
//   The onUnmounted guard here is a safety net for composable-level cleanup.
// - Heartbeat: the server pings every 30s; the browser WebSocket API auto-pongs.
//   We only need to handle onclose/onerror → reconnect.

import { onUnmounted, ref } from 'vue'
import { useAuthStore } from '~/stores/auth.store'
import { WsMessageSchema, type WsMessage } from '../types/ws.types'

// ── Backoff config ──────────────────────────────────────────────────────────

const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 30_000
const JITTER_RANGE_MS = 500

function nextBackoffMs(attempt: number): number {
  const expo = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
  const jitter = Math.floor(Math.random() * JITTER_RANGE_MS)
  return expo + jitter
}

// ── Types ────────────────────────────────────────────────────────────────────

export type DashboardSocketStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed' // permanent close (auth rejection or manual close)

export interface UseDashboardSocket {
  status: Readonly<ReturnType<typeof ref<DashboardSocketStatus>>>
  connect: () => void
  close: () => void
}

// ── Composable ───────────────────────────────────────────────────────────────

export function useDashboardSocket(
  onMessage: (msg: WsMessage) => void,
): UseDashboardSocket {
  if (!import.meta.client) {
    // SSR guard — this composable is client-only.
    // The app is SPA (ssr: false in nuxt.config.ts) but guard defensively.
    const status = ref<DashboardSocketStatus>('idle')
    return { status, connect: () => {}, close: () => {} }
  }

  const authStore = useAuthStore()
  const config = useRuntimeConfig()

  // Convert http(s) base to ws(s) — e.g. "http://localhost:3009" → "ws://localhost:3009"
  function toWsBase(url: string): string {
    return url.replace(/^http/, 'ws')
  }

  const status = ref<DashboardSocketStatus>('idle')
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let permanentlyClosed = false
  let manualClose = false

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function buildUrl(): string | null {
    const token = authStore.accessToken
    if (!token) return null
    const wsBase = toWsBase(config.public.socketUrl as string)
    return `${wsBase}/ws/dashboard?token=${encodeURIComponent(token)}`
  }

  function openSocket(): void {
    if (permanentlyClosed) return

    const url = buildUrl()
    if (!url) {
      // No access token yet — wait; auth plugin sets it before mounting the page.
      status.value = 'idle'
      return
    }

    status.value = attempt === 0 ? 'connecting' : 'reconnecting'

    const ws = new WebSocket(url)
    socket = ws

    ws.onopen = () => {
      // Connection established; reset backoff counter.
      attempt = 0
      status.value = 'connected'
    }

    ws.onmessage = (event: MessageEvent) => {
      let raw: unknown
      try {
        raw = JSON.parse(event.data as string)
      } catch {
        // Malformed JSON — ignore
        return
      }

      const parsed = WsMessageSchema.safeParse(raw)
      if (!parsed.success) {
        // Unknown message shape — ignore gracefully
        return
      }

      const msg = parsed.data

      // Detect server-side auth rejection before dispatching to the caller.
      if (msg.type === 'error' && msg.data.message === 'unauthorized') {
        permanentlyClosed = true
        status.value = 'closed'
        ws.close(1000)
        return
      }

      onMessage(msg)
    }

    ws.onclose = (event: CloseEvent) => {
      socket = null
      if (manualClose || permanentlyClosed) {
        status.value = 'closed'
        return
      }

      // Close code 1008 = Policy Violation (auth rejection from server)
      if (event.code === 1008) {
        permanentlyClosed = true
        status.value = 'closed'
        return
      }

      // Any other close — attempt reconnect with backoff
      scheduleReconnect()
    }

    ws.onerror = () => {
      // onerror always fires before onclose; actual reconnect is handled in onclose.
      // We don't mark as closed here because onclose will follow.
    }
  }

  function scheduleReconnect(): void {
    if (permanentlyClosed || manualClose) return
    status.value = 'reconnecting'
    const delay = nextBackoffMs(attempt)
    attempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      openSocket()
    }, delay)
  }

  function connect(): void {
    if (permanentlyClosed) return
    manualClose = false
    attempt = 0
    clearReconnectTimer()
    if (socket) {
      socket.close(1000)
      socket = null
    }
    openSocket()
  }

  function close(): void {
    manualClose = true
    clearReconnectTimer()
    if (socket) {
      socket.close(1000)
      socket = null
    }
    status.value = 'closed'
  }

  // Safety-net cleanup in case the caller forgets to call close()
  onUnmounted(() => {
    close()
  })

  return { status, connect, close }
}
