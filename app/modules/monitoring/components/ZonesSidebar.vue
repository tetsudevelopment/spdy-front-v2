<script setup lang="ts">
import { useMonitoringStore } from '../store/monitoring.store'

const store = useMonitoringStore()

function ridersInZone(zoneId: string): number {
  return (store.ridersByZone[zoneId] ?? []).length
}
</script>

<template>
  <aside class="zones-sidebar">
    <header class="zones-sidebar__header">
      <h3 class="zones-sidebar__title">Zonas</h3>
      <span class="zones-sidebar__count">{{ store.zones.length }}</span>
    </header>

    <div v-if="store.isLoadingZones" class="zones-sidebar__state">
      <i class="pi pi-spin pi-spinner" aria-hidden="true" /> Cargando zonas…
    </div>
    <div v-else-if="store.zones.length === 0" class="zones-sidebar__state">
      No hay zonas configuradas
    </div>

    <ul v-else class="zones-list">
      <li
        v-for="zone in store.zones"
        :key="zone.id"
        class="zone"
        :class="{ 'zone--active': zone.id === store.selectedZoneId }"
        @click="store.selectZone(zone.id)"
      >
        <span
          class="zone__dot"
          :style="{ background: zone.color }"
        />
        <span class="zone__name">{{ zone.name }}</span>
        <span class="zone__riders">{{ ridersInZone(zone.id) }}</span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.zones-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
}

.zones-sidebar__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 6px 6px;
  border-bottom: 1px solid var(--color-border);
}

.zones-sidebar__title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.zones-sidebar__count {
  font-size: 11px;
  color: var(--color-muted);
}

.zones-sidebar__state {
  padding: 16px 10px;
  color: var(--color-muted);
  font-size: 12px;
  text-align: center;
}

.zones-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.zone {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  transition: background 0.15s ease;
  border-left: 3px solid transparent;
}

.zone:hover {
  background: var(--color-bg);
}

.zone--active {
  background: color-mix(in srgb, var(--color-brand) 8%, transparent);
  border-left-color: var(--color-brand);
}

.zone--active .zone__name {
  color: var(--color-brand);
}

.zone__dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.zone__name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.zone__riders {
  font-size: 11px;
  color: var(--color-muted);
  font-weight: 600;
}
</style>
