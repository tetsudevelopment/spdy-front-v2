<script setup lang="ts">
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useMonitoringStore } from '../store/monitoring.store'
import type { MonitoringOrder, OrderStatus } from '../types/monitoring.types'

const store = useMonitoringStore()

interface StatusMeta {
  label: string
  tone: 'gray' | 'blue' | 'violet' | 'yellow' | 'green' | 'red'
}

const STATUS_META: Record<OrderStatus, StatusMeta> = {
  creado:              { label: 'Sin asignar',        tone: 'gray' },
  asignado:            { label: 'Asignado',           tone: 'blue' },
  aceptado:            { label: 'Aceptado',           tone: 'blue' },
  en_punto_de_venta:   { label: 'En punto de venta',  tone: 'violet' },
  en_transito:         { label: 'En tránsito',        tone: 'yellow' },
  en_punto_de_entrega: { label: 'En punto de entrega',tone: 'yellow' },
  entregado:           { label: 'Entregado',          tone: 'green' },
  cancelado:           { label: 'Cancelado',          tone: 'red' },
}

function statusMeta(status: OrderStatus): StatusMeta {
  return STATUS_META[status] ?? { label: status, tone: 'gray' }
}

function shortId(id: string): string {
  return `#${id.slice(0, 8)}`
}

function formatHour(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="table-card">
    <DataTable
      :value="store.filteredOrders"
      :loading="store.isLoadingOrders"
      data-key="id"
      scrollable
      scroll-height="flex"
      :pt="{ root: { class: 'services-table' } }"
      empty-message="Sin servicios para los filtros actuales"
    >
      <Column field="id" header="ID" style="width: 120px">
        <template #body="{ data }: { data: MonitoringOrder }">
          <span class="cell-id">{{ shortId(data.id) }}</span>
        </template>
      </Column>
      <Column field="customerName" header="Cliente" />
      <Column field="deliveryAddress" header="Dirección" />
      <Column header="Rider">
        <template #body="{ data }: { data: MonitoringOrder }">
          <span v-if="data.assignedRiderName">{{ data.assignedRiderName }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>
      <Column header="Zona">
        <template #body="{ data }: { data: MonitoringOrder }">
          <span v-if="data.zoneName">{{ data.zoneName }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>
      <Column header="Estado" style="width: 170px">
        <template #body="{ data }: { data: MonitoringOrder }">
          <span
            class="pill"
            :class="`pill--${statusMeta(data.status).tone}`"
          >
            {{ statusMeta(data.status).label }}
          </span>
        </template>
      </Column>
      <Column header="Hora" style="width: 90px">
        <template #body="{ data }: { data: MonitoringOrder }">
          <span class="cell-muted">{{ formatHour(data.createdAt) }}</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.table-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

:deep(.services-table .p-datatable-thead > tr > th) {
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

:deep(.services-table .p-datatable-tbody > tr) {
  background: var(--color-surface);
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
}

:deep(.services-table .p-datatable-tbody > tr:hover) {
  background: #1d1d1c;
}

:deep(.services-table .p-datatable-tbody > tr > td) {
  font-size: 13px;
  border: none;
}

.cell-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--color-muted);
}

.cell-muted {
  color: var(--color-muted);
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.pill--gray {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
}
.pill--blue {
  color: #60a5fa;
  background: color-mix(in srgb, #60a5fa 15%, transparent);
}
.pill--violet {
  color: #a78bfa;
  background: color-mix(in srgb, #a78bfa 15%, transparent);
}
.pill--yellow {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
}
.pill--green {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}
.pill--red {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
}
</style>
