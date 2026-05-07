<script setup lang="ts">
import { computed } from 'vue'
import Dropdown from 'primevue/select'
import InputText from 'primevue/inputtext'
import { useMonitoringStore } from '../store/monitoring.store'
import type { OrderStatus } from '../types/monitoring.types'

const store = useMonitoringStore()

interface StatusOption {
  label: string
  value: OrderStatus | null
}

const statusOptions: StatusOption[] = [
  { label: 'Todos los estados', value: null },
  { label: 'Sin asignar',        value: 'creado' },
  { label: 'Asignado',           value: 'asignado' },
  { label: 'Aceptado',           value: 'aceptado' },
  { label: 'En punto de venta',  value: 'en_punto_de_venta' },
  { label: 'En tránsito',        value: 'en_transito' },
  { label: 'En punto de entrega',value: 'en_punto_de_entrega' },
  { label: 'Entregado',          value: 'entregado' },
  { label: 'Cancelado',          value: 'cancelado' },
]

interface ZoneOption {
  label: string
  value: string | null
}

const zoneOptions = computed<ZoneOption[]>(() => {
  const base: ZoneOption[] = [{ label: 'Todas las zonas', value: null }]
  for (const z of store.zones ?? []) base.push({ label: z.name, value: z.id })
  return base
})

const cityOptions = computed<ZoneOption[]>(() => {
  // El backend aún no expone ciudades como entidad; placeholder estructural.
  return [{ label: 'Todas las ciudades', value: null }]
})

const filtered = computed<number>(() => store.filteredOrders.length)
</script>

<template>
  <div class="filters">
    <div class="filters__fields">
      <Dropdown
        :model-value="store.filters.city"
        :options="cityOptions"
        option-label="label"
        option-value="value"
        placeholder="Ciudad"
        class="filters__field"
        @update:model-value="(v: string | null) => store.setFilters({ city: v })"
      />
      <Dropdown
        :model-value="store.filters.zoneId"
        :options="zoneOptions"
        option-label="label"
        option-value="value"
        placeholder="Zona"
        class="filters__field"
        @update:model-value="(v: string | null) => store.setFilters({ zoneId: v })"
      />
      <Dropdown
        :model-value="store.filters.status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="Estado"
        class="filters__field"
        @update:model-value="(v: OrderStatus | null) => store.setFilters({ status: v })"
      />
      <span class="filters__search">
        <i class="pi pi-search filters__search-icon" aria-hidden="true" />
        <InputText
          :model-value="store.filters.search"
          placeholder="Buscar por ID, cliente o rider"
          class="filters__search-input"
          @update:model-value="(v: string | undefined) => store.setFilters({ search: v ?? '' })"
        />
      </span>
    </div>
    <div class="filters__count">
      {{ filtered }} {{ filtered === 1 ? 'servicio' : 'servicios' }}
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.filters__fields {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.filters__field {
  min-width: 180px;
}

.filters__search {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.filters__search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-muted);
  font-size: 13px;
  pointer-events: none;
}

.filters__search-input {
  width: 100%;
  padding-left: 34px !important;
}

.filters__count {
  font-size: 12px;
  color: var(--color-muted);
  white-space: nowrap;
}
</style>
