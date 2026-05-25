<script setup lang="ts">
import type { OrderQuote } from '../types/quote.types'

const props = defineProps<{
  quote: OrderQuote
}>()

function formatCents(cents: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: props.quote.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${Math.round(meters)} m`
}
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
    <h3 class="font-semibold text-sm text-gray-700 uppercase tracking-wide">
      Delivery Quote
    </h3>

    <!-- Route info -->
    <div class="grid grid-cols-2 gap-2 text-sm">
      <div>
        <span class="text-gray-500">Distance</span>
        <p class="font-medium">{{ formatDistance(quote.distanceMeters) }}</p>
      </div>
      <div>
        <span class="text-gray-500">Estimated ETA</span>
        <p class="font-medium">{{ quote.etaMinutes }} min</p>
      </div>
    </div>

    <!-- Pricing breakdown -->
    <div class="border-t border-gray-200 pt-3 space-y-1.5 text-sm">
      <div class="flex justify-between text-gray-600">
        <span>Base fare</span>
        <span>{{ formatCents(quote.pricing.baseFareCents) }}</span>
      </div>
      <div
        v-if="quote.pricing.excessKmCents > 0"
        class="flex justify-between text-gray-600"
      >
        <span>Excess distance</span>
        <span>{{ formatCents(quote.pricing.excessKmCents) }}</span>
      </div>
      <div
        v-if="quote.pricing.excessMinutesCents > 0"
        class="flex justify-between text-gray-600"
      >
        <span>Excess time</span>
        <span>{{ formatCents(quote.pricing.excessMinutesCents) }}</span>
      </div>
      <div class="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2">
        <span>Total</span>
        <span>{{ formatCents(quote.pricing.totalCents) }}</span>
      </div>
    </div>
  </div>
</template>
