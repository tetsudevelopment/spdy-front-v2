// WebSocket message types for the dashboard real-time feed.
// Backend contract: GET {SOCKET_BASE}/ws/dashboard?token=<ACCESS_JWT>
// Source of truth: spdy_v2/apps/api/src/realtime/realtime.plugin.ts

import { z } from 'zod'

// ── Inbound server→client messages ──────────────────────────────────────────

export const WsConnectedSchema = z.object({
  type: z.literal('connected'),
  data: z.object({
    rooms: z.array(z.string()),
  }),
})

export const WsOrderStatusChangeSchema = z.object({
  type: z.literal('order_status_change'),
  data: z.object({
    orderId: z.string(),
    commerceId: z.string(),
    fromStatus: z.string(),
    toStatus: z.string(),
    changedAt: z.string(),
  }),
})

export const WsNewOrderSchema = z.object({
  type: z.literal('new_order'),
  data: z.object({
    orderId: z.string(),
    commerceId: z.string(),
    status: z.string(),
    createdAt: z.string(),
  }),
})

export const WsErrorSchema = z.object({
  type: z.literal('error'),
  data: z.object({
    message: z.string(),
  }),
})

// Emitted by the backend when a rider's GPS position changes.
// Fan-out is server-side and tenant-safe:
//   - CommerceAdmin receives locations only for their commerce's riders.
//   - SuperAdmin (dashboard:all) receives all.
// NOTE: global (non-commerce) riders are NOT yet routed — backend deferred.
export const WsRiderLocationSchema = z.object({
  type: z.literal('rider_location'),
  data: z.object({
    riderId: z.string(),
    lat: z.number(),
    lng: z.number(),
    accuracy: z.number().optional(),
    speed: z.number().optional(),
    heading: z.number().optional(),
    recordedAt: z.string().optional(),
  }),
})

// Discriminated union — parse all incoming messages through this
export const WsMessageSchema = z.discriminatedUnion('type', [
  WsConnectedSchema,
  WsOrderStatusChangeSchema,
  WsNewOrderSchema,
  WsErrorSchema,
  WsRiderLocationSchema,
])

export type WsMessage = z.infer<typeof WsMessageSchema>
export type WsConnectedMessage = z.infer<typeof WsConnectedSchema>
export type WsOrderStatusChangeMessage = z.infer<typeof WsOrderStatusChangeSchema>
export type WsNewOrderMessage = z.infer<typeof WsNewOrderSchema>
export type WsErrorMessage = z.infer<typeof WsErrorSchema>
export type WsRiderLocationMessage = z.infer<typeof WsRiderLocationSchema>
