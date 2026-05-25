<script setup lang="ts">
// No props — shown whenever quote.degraded === true (parent controls v-if)
</script>

<template>
  <div
    class="flex items-center gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-amber-800"
    role="alert"
  >
    <i class="pi pi-exclamation-triangle text-amber-500" aria-hidden="true" />
    <div>
      <p class="font-semibold text-sm">Routing service unavailable</p>
      <p class="text-xs mt-0.5">
        Distance and ETA are estimated using straight-line calculation. Pricing may vary after confirmation.
      </p>
    </div>
  </div>
</template>
