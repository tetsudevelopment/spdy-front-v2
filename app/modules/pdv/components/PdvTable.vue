<script setup lang="ts">
import DataTable, { type DataTableRowClickEvent } from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { usePdvStore } from '../store/pdv.store'
import type { PointOfSale, PdvZoneRef } from '../types/pdv.types'

const emit = defineEmits<{
  select: [pdv: PointOfSale]
  edit: [pdv: PointOfSale]
  'manage-zones': [pdv: PointOfSale]
}>()

const store = usePdvStore()

const MAX_VISIBLE_ZONES = 2

function visibleZones(zones: PdvZoneRef[] | undefined): PdvZoneRef[] {
  if (!zones) return []
  return zones.slice(0, MAX_VISIBLE_ZONES)
}

function extraZoneCount(zones: PdvZoneRef[] | undefined): number {
  if (!zones) return 0
  return Math.max(0, zones.length - MAX_VISIBLE_ZONES)
}

function onRowClick(event: DataTableRowClickEvent): void {
  emit('select', event.data as PointOfSale)
}
</script>

<template>
  <div class="table-card">
    <DataTable
      :value="store.filteredPdvs"
      :loading="store.isLoading"
      data-key="id"
      scrollable
      scroll-height="flex"
      :pt="{ root: { class: 'pdv-table' } }"
      empty-message="Sin puntos de venta"
      @row-click="onRowClick"
    >
      <Column field="name" header="Nombre">
        <template #body="{ data }: { data: PointOfSale }">
          <div class="name-cell">
            <span class="name-cell__primary">{{ data.name }}</span>
            <span v-if="data.email" class="name-cell__secondary">
              {{ data.email }}
            </span>
          </div>
        </template>
      </Column>

      <Column header="Dirección">
        <template #body="{ data }: { data: PointOfSale }">
          <span v-if="data.address">{{ data.address }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>

      <Column header="Teléfono" style="width: 160px">
        <template #body="{ data }: { data: PointOfSale }">
          <span v-if="data.phone" class="cell-mono">{{ data.phone }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>

      <Column header="Zonas" style="width: 260px">
        <template #body="{ data }: { data: PointOfSale }">
          <div v-if="data.zones && data.zones.length > 0" class="zones-cell">
            <span
              v-for="z in visibleZones(data.zones)"
              :key="z.id"
              class="zone-chip"
              :style="{
                color: z.color,
                background: `color-mix(in srgb, ${z.color} 15%, transparent)`,
                borderColor: `color-mix(in srgb, ${z.color} 40%, transparent)`,
              }"
            >
              {{ z.name }}
            </span>
            <span
              v-if="extraZoneCount(data.zones) > 0"
              class="zone-chip zone-chip--more"
            >+{{ extraZoneCount(data.zones) }}</span>
          </div>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>

      <Column header="Activo" style="width: 100px">
        <template #body="{ data }: { data: PointOfSale }">
          <span
            class="badge"
            :class="data.isActive ? 'badge--active' : 'badge--inactive'"
          >
            {{ data.isActive ? 'Activo' : 'Inactivo' }}
          </span>
        </template>
      </Column>

      <Column header="" style="width: 140px">
        <template #body="{ data }: { data: PointOfSale }">
          <div class="row-actions">
            <Button
              icon="pi pi-eye"
              text
              rounded
              aria-label="Ver detalle"
              :pt="{ root: { style: 'color: var(--color-brand);' } }"
              @click.stop="emit('select', data)"
            />
            <Button
              icon="pi pi-pencil"
              text
              rounded
              aria-label="Editar"
              @click.stop="emit('edit', data)"
            />
            <Button
              icon="pi pi-map-marker"
              text
              rounded
              aria-label="Asignar zonas"
              @click.stop="emit('manage-zones', data)"
            />
          </div>
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

:deep(.pdv-table .p-datatable-thead > tr > th) {
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

:deep(.pdv-table .p-datatable-tbody > tr) {
  background: var(--color-surface);
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

:deep(.pdv-table .p-datatable-tbody > tr:hover) {
  background: #1d1d1c;
}

:deep(.pdv-table .p-datatable-tbody > tr > td) {
  font-size: 13px;
  border: none;
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

.zones-cell {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.zone-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid transparent;
  letter-spacing: 0.2px;
}

.zone-chip--more {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-muted) 30%, transparent);
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

.row-actions {
  display: flex;
  gap: 2px;
}
</style>
