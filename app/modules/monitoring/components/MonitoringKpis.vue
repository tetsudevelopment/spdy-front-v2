<script setup lang="ts">
import { useMonitoringStore } from '../store/monitoring.store'
import type { MonitoringKpi } from '../types/monitoring.types'

const store = useMonitoringStore()

function kpiIcon(kpi: MonitoringKpi): string {
  switch (kpi.key) {
    case 'active_services':  return 'pi pi-box'
    case 'riders_online':    return 'pi pi-users'
    case 'in_transit':       return 'pi pi-send'
    case 'delivered_today':  return 'pi pi-check-circle'
    default:                 return 'pi pi-chart-bar'
  }
}
</script>

<template>
  <div class="kpis">
    <div
      v-for="kpi in store.kpis"
      :key="kpi.key"
      class="kpi"
    >
      <div class="kpi__header">
        <i :class="kpiIcon(kpi)" class="kpi__icon" aria-hidden="true" />
        <span class="kpi__label">{{ kpi.label }}</span>
      </div>
      <div class="kpi__value">{{ kpi.value }}</div>
      <div
        v-if="kpi.hint"
        class="kpi__hint"
        :class="{
          'kpi__hint--warning': kpi.tone === 'warning',
          'kpi__hint--brand':   kpi.tone === 'brand',
        }"
      >
        {{ kpi.hint }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.kpi {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.kpi__header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kpi__icon {
  color: var(--color-muted);
  font-size: 14px;
}

.kpi__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--color-muted);
  font-weight: 600;
}

.kpi__value {
  font-size: 30px;
  font-weight: 800;
  line-height: 1;
  color: var(--color-text);
}

.kpi__hint {
  font-size: 11px;
  color: var(--color-muted);
}

.kpi__hint--warning {
  color: var(--color-warning);
}

.kpi__hint--brand {
  color: var(--color-brand);
}

@media (max-width: 960px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
