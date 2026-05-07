<script setup lang="ts">
import { useMonitoringStore } from '../store/monitoring.store'
import { riderVisualStatus } from '../store/monitoring.store'
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

function formatSince(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function vehicleLabel(r: MonitoringRider): string {
  const parts: string[] = []
  if (r.vehicleType) parts.push(r.vehicleType)
  if (r.zoneName) parts.push(r.zoneName)
  return parts.join(' · ')
}

function isOnRoute(r: MonitoringRider): boolean {
  return riderVisualStatus(r) === 'on_route'
}
</script>

<template>
  <section class="panel">
    <header class="panel__header">
      <h3 class="panel__title">Activos</h3>
      <span class="panel__count">{{ store.activeRiders.length }}</span>
    </header>

    <div v-if="store.activeRiders.length === 0" class="panel__empty">
      Ningún domiciliario activo
    </div>

    <ul v-else class="list">
      <li
        v-for="rider in store.activeRiders"
        :key="rider.id"
        class="item"
      >
        <div
          class="item__avatar"
          :class="{ 'item__avatar--route': isOnRoute(rider) }"
        >
          {{ initials(rider.fullName) }}
        </div>
        <div class="item__info">
          <div class="item__name">{{ rider.fullName }}</div>
          <div class="item__meta">{{ vehicleLabel(rider) }}</div>
        </div>
        <div class="item__right">
          <span
            class="badge"
            :class="isOnRoute(rider) ? 'badge--route' : 'badge--online'"
          >
            {{ isOnRoute(rider) ? 'En ruta' : 'Online' }}
          </span>
          <span class="item__time">Desde {{ formatSince(rider.onlineSince) }}</span>
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
  border: 2px solid var(--color-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
  flex-shrink: 0;
}

.item__avatar--route {
  border-color: var(--color-warning);
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
  color: var(--color-brand);
}

.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
}

.badge--online {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}

.badge--route {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
}
</style>
