// Zod 3 validation schemas — hand-mirrored from backend Zod 4 (D24)
// Do NOT import from backend or share across zod versions.
import { z } from 'zod'

export const quoteRequestSchema = z.object({
  pickupPdvId: z.string().uuid().optional(),
  deliveryAddress: z.string().min(1, 'Delivery address is required').max(500),
})

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>

export const createOrderWithQuoteSchema = z.object({
  pickupPdvId: z.string().uuid().optional(),
  customerName: z.string().min(1, 'Customer name is required').max(200),
  customerPhone: z.string().min(7).max(20),
  deliveryAddress: z.string().min(1).max(500),
  packageDescription: z.string().max(1000).optional(),
  packageWeightKg: z.number().positive().max(500).optional(),
  specialNotes: z.string().max(1000).optional(),
  codAmountCents: z.number().int().min(0).default(0),
  quote: z
    .object({
      expectedTotalCents: z.number().int().min(0),
    })
    .optional(),
})

export type CreateOrderWithQuoteInput = z.infer<typeof createOrderWithQuoteSchema>
