// Quote types — hand-mirrored from backend Zod 4 (D24: NEVER cross-contaminate Zod versions)
// Frontend uses Zod 3

export interface QuoteLocation {
  lat: number
  lng: number
  displayName: string
}

export interface QuotePricing {
  baseFareCents: number
  excessKmCents: number
  excessMinutesCents: number
  totalCents: number
  breakdown: {
    baseFareCents: number
    excessKmCents: number
    excessMinutesCents: number
  }
}

export interface OrderQuote {
  origin: QuoteLocation
  destination: QuoteLocation
  distanceMeters: number
  durationSeconds: number
  polyline: string | null
  pricing: QuotePricing
  etaMinutes: number
  currency: string
  degraded: boolean
}

export interface QuoteRequest {
  pickupPdvId?: string
  deliveryAddress: string
}

export interface CreateOrderWithQuoteRequest {
  pickupPdvId?: string
  customerName: string
  customerPhone: string
  deliveryAddress: string
  packageDescription?: string
  packageWeightKg?: number
  specialNotes?: string
  codAmountCents?: number
  quote?: {
    expectedTotalCents: number
  }
}
