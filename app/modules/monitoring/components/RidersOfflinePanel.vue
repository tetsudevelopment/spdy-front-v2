<script setup lang="ts">
import { useMonitoringStore } from '../store/monitoring.store'
import type { MonitoringRider } from '../types/monitoring.types'

const store = useMonitoringStore()

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatLastSeen(iso: string | undefined): string {
  if (!iso) return 'desconocido'
  const d = new Date(iso)
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function vehicleLabel(r: MonitoringRider): string {
  const parts: string[] = []
  if (r.vehicleType) parts.push(r.vehicleType)
  if (r.zoneName) parts.push(r.zoneName)
  return parts.join(' · ')
}
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h3 class="panel__title">Inactivos / Offline</h3>
      <span class="panel__count">{{ store.offlineRiders.length }}</span>
    </header>

    <div v-if="store.offlineRiders.length === 0" class="panel__empty">
      Sin domiciliarios offline
    </div>

    <ul v-else class="list">
      <li
        v-for="rider in store.offlineRiders"
        :key="rider.id"
        class="item"
      >
        <div class="item__avatar">{{ initials(rider.fullName) }}</div>
        <div class="item__info">
          <div class="item__name">{{ rider.fullName }}</div>
          <div class="item__meta">{{ vehicleLabel(rider) }}</div>
        </div>
        <div class="item__right">
          <span class="badge">Offline</span>
          <span class="item__time">Últ. vez {{ formatLastSeen(rider.lastSeenAt) }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 18px 18px 10px;
}

.panel__header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
}

.panel__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.panel__count {
  font-size: 11px;
  color: var(--color-muted);
}

.panel__empty {
  padding: 20px 0;
  text-align: center;
  color: var(--color-muted);
  font-size: 13px;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--color-bg);
  border-radius: 10px;
}

.item__avatar {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-muted);
  flex-shrink: 0;
}

.item__info {
  flex: 1;
  min-width: 0;
}

.item__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item__meta {
  font-size: 11px;
  color: var(--color-muted);
  text-transform: capitalize;
}

.item__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.item__time {
  font-size: 10px;
  color: var(--color-muted);
}

.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
}
</style>
