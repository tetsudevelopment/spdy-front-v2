<script setup lang="ts">
import DataTable, { type DataTableRowClickEvent } from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useZonesStore } from '../store/zones.store'
import type { Zone } from '../types/zone.types'

interface Props {
  canCopy?: boolean
}
withDefaults(defineProps<Props>(), { canCopy: false })

const emit = defineEmits<{
  select: [zone: Zone]
  edit: [zone: Zone]
  copy: [zone: Zone]
}>()

const store = useZonesStore()

function onRowClick(event: DataTableRowClickEvent): void {
  emit('select', event.data as Zone)
}
</script>

<template>
  <div class="table-card">
    <DataTable
      :value="store.filteredZones"
      :loading="store.isLoading"
      data-key="id"
      scrollable
      scroll-height="flex"
      :pt="{ root: { class: 'zones-table' } }"
      empty-message="Sin zonas"
      @row-click="onRowClick"
    >
      <Column header="" style="width: 48px">
        <template #body="{ data }: { data: Zone }">
          <span
            class="color-dot"
            :style="{
              background: data.color,
              borderColor: `color-mix(in srgb, ${data.color} 55%, transparent)`,
            }"
            :aria-label="`Color ${data.color}`"
          />
        </template>
      </Column>

      <Column field="name" header="Nombre">
        <template #body="{ data }: { data: Zone }">
          <span class="name-primary">{{ data.name }}</span>
        </template>
      </Column>

      <Column header="Descripción">
        <template #body="{ data }: { data: Zone }">
          <span v-if="data.description" class="desc">{{ data.description }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>

      <Column header="Prioridad" style="width: 120px">
        <template #body="{ data }: { data: Zone }">
          <span v-if="typeof data.priority === 'number'" class="priority">
            {{ data.priority }}
          </span>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>

      <Column header="Tipo" style="width: 120px">
        <template #body="{ data }: { data: Zone }">
          <span class="pill" :class="data.isGlobal ? 'pill--global' : 'pill--private'">
            {{ data.isGlobal ? 'Global' : 'Privada' }}
          </span>
        </template>
      </Column>

      <Column header="Activa" style="width: 100px">
        <template #body="{ data }: { data: Zone }">
          <span
            class="badge"
            :class="data.isActive ? 'badge--active' : 'badge--inactive'"
          >
            {{ data.isActive ? 'Activa' : 'Inactiva' }}
          </span>
        </template>
      </Column>

      <Column header="" style="width: 150px">
        <template #body="{ data }: { data: Zone }">
          <div class="row-actions">
            <Button
              icon="pi pi-map"
              text
              rounded
              aria-label="Ver mapa"
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
              v-if="canCopy && data.isGlobal"
              icon="pi pi-copy"
              text
              rounded
              aria-label="Copiar a comercio"
              @click.stop="emit('copy', data)"
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

:deep(.zones-table .p-datatable-thead > tr > th) {
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

:deep(.zones-table .p-datatable-tbody > tr) {
  background: var(--color-surface);
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

:deep(.zones-table .p-datatable-tbody > tr:hover) {
  background: #1d1d1c;
}

:deep(.zones-table .p-datatable-tbody > tr > td) {
  font-size: 13px;
  border: none;
}

.color-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 9999px;
  border: 2px solid;
  box-sizing: border-box;
}

.name-primary {
  font-weight: 600;
  color: var(--color-text);
}

.desc {
  color: var(--color-text);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.priority {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--color-text);
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

.pill--global {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}

.pill--private {
  color: #60a5fa;
  background: color-mix(in srgb, #60a5fa 15%, transparent);
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
