<script setup lang="ts">
import DataTable, { type DataTableRowClickEvent } from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useCommerceStore } from '../store/commerce.store'
import type { Commerce, FleetType } from '../types/commerce.types'

const emit = defineEmits<{
  select: [commerce: Commerce]
}>()

const store = useCommerceStore()

interface FleetMeta {
  label: string
  tone: 'blue' | 'green' | 'yellow'
}

const FLEET_META: Record<FleetType, FleetMeta> = {
  Privada: { label: 'Privada',  tone: 'blue' },
  Global:  { label: 'Global',   tone: 'green' },
  Hibrida: { label: 'Híbrida',  tone: 'yellow' },
}

function fleetMeta(t: FleetType): FleetMeta {
  return FLEET_META[t]
}

function initial(name: string): string {
  const first = name.trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}

function onRowClick(event: DataTableRowClickEvent): void {
  emit('select', event.data as Commerce)
}
</script>

<template>
  <div class="table-card">
    <DataTable
      :value="store.filteredCommerces"
      :loading="store.isLoading"
      data-key="id"
      scrollable
      scroll-height="flex"
      :pt="{ root: { class: 'commerces-table' } }"
      empty-message="Sin comercios"
      @row-click="onRowClick"
    >
      <Column header="" style="width: 64px">
        <template #body="{ data }: { data: Commerce }">
          <div class="logo-cell">
            <img
              v-if="data.logoUrl"
              :src="data.logoUrl"
              :alt="data.name"
              class="logo-cell__img"
            />
            <div v-else class="logo-cell__avatar">{{ initial(data.name) }}</div>
          </div>
        </template>
      </Column>

      <Column field="name" header="Nombre">
        <template #body="{ data }: { data: Commerce }">
          <div class="name-cell">
            <span class="name-cell__primary">{{ data.name }}</span>
            <span v-if="data.razonSocial" class="name-cell__secondary">
              {{ data.razonSocial }}
            </span>
          </div>
        </template>
      </Column>

      <Column header="Tipo de flota" style="width: 140px">
        <template #body="{ data }: { data: Commerce }">
          <span class="pill" :class="`pill--${fleetMeta(data.fleetType).tone}`">
            {{ fleetMeta(data.fleetType).label }}
          </span>
        </template>
      </Column>

      <Column header="NIT" style="width: 160px">
        <template #body="{ data }: { data: Commerce }">
          <span v-if="data.nit" class="cell-mono">{{ data.nit }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>

      <Column header="Email">
        <template #body="{ data }: { data: Commerce }">
          <span v-if="data.email">{{ data.email }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>

      <Column header="Activo" style="width: 100px">
        <template #body="{ data }: { data: Commerce }">
          <span
            class="badge"
            :class="data.isActive ? 'badge--active' : 'badge--inactive'"
          >
            {{ data.isActive ? 'Activo' : 'Inactivo' }}
          </span>
        </template>
      </Column>

      <Column header="" style="width: 60px">
        <template #body="{ data }: { data: Commerce }">
          <Button
            icon="pi pi-eye"
            text
            rounded
            aria-label="Ver detalle"
            :pt="{ root: { style: 'color: var(--color-brand);' } }"
            @click.stop="emit('select', data)"
          />
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

:deep(.commerces-table .p-datatable-thead > tr > th) {
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

:deep(.commerces-table .p-datatable-tbody > tr) {
  background: var(--color-surface);
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

:deep(.commerces-table .p-datatable-tbody > tr:hover) {
  background: #1d1d1c;
}

:deep(.commerces-table .p-datatable-tbody > tr > td) {
  font-size: 13px;
  border: none;
}

.logo-cell {
  display: flex;
  align-items: center;
}

.logo-cell__img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.logo-cell__avatar {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-brand) 12%, transparent);
  color: var(--color-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
}

.name-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.name-cell__primary {
  font-weight: 600;
  color: var(--color-text);
}

.name-cell__secondary {
  font-size: 11px;
  color: var(--color-muted);
}

.cell-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
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

.pill--blue {
  color: #60a5fa;
  background: color-mix(in srgb, #60a5fa 15%, transparent);
}
.pill--green {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}
.pill--yellow {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
}

.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 9999px;
}

.badge--active {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}

.badge--inactive {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
}
</style>
