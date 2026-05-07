<script setup lang="ts">
import { computed } from 'vue'
import DataTable, { type DataTableRowClickEvent } from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useAuth } from '~/composables/useAuth'
import { useRidersStore } from '../store/riders.store'
import type {
  Rider,
  RiderStatus,
  RiderZoneRef,
  VehicleType,
} from '../types/rider.types'

const emit = defineEmits<{
  select: [rider: Rider]
  edit: [rider: Rider]
  'manage-zones': [rider: Rider]
  'toggle-availability': [rider: Rider]
}>()

const store = useRidersStore()
const { user: authUser } = useAuth()

const isSuperAdmin = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')

const MAX_VISIBLE_ZONES = 2

// CommerceAdmin viendo un Rider Global no debe ver zonas de OTROS commerces:
// el backend devuelve todas, las acotamos al set accesible del actor (zonas
// privadas de su commerce + globales asignadas a su commerce).
function zonesForRow(rider: Rider): RiderZoneRef[] {
  const zones = rider.zones ?? []
  if (rider.fleetType !== 'Global') return zones
  if (isSuperAdmin.value) return zones
  const allowed = store.actorAccessibleZoneIds
  if (!allowed) return zones
  return zones.filter((z) => allowed.has(z.id))
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] as string).charAt(0).toUpperCase()
  return `${(parts[0] as string).charAt(0)}${(parts[parts.length - 1] as string).charAt(0)}`.toUpperCase()
}

// El borde del avatar refleja el estado operativo en tiempo real (currentStatus):
//  - online      → brand (verde)
//  - on_route    → warning (amarillo)
//  - offline/n/a → border (gris)
function borderClass(status: RiderStatus | undefined): string {
  if (status === 'online')   return 'avatar--online'
  if (status === 'on_route') return 'avatar--on-route'
  return 'avatar--offline'
}

// PrimeIcons no tiene íconos perfectos para bici/caminar — usamos
// equivalentes que se leen bien en monocromo (pi-motorcycle viene en PrimeIcons
// 7.x; pi-directions para caminar; pi-bookmark como placeholder para bici).
const VEHICLE_META: Record<VehicleType, { label: string; icon: string }> = {
  moto:       { label: 'Moto',       icon: 'pi pi-motorcycle' },
  bicicleta:  { label: 'Bicicleta',  icon: 'pi pi-bookmark' },
  auto:       { label: 'Auto',       icon: 'pi pi-car' },
  caminando:  { label: 'Caminando',  icon: 'pi pi-directions' },
}

function hasPlate(v: VehicleType): boolean {
  return v === 'moto' || v === 'auto'
}

function visibleZones(zones: RiderZoneRef[] | undefined): RiderZoneRef[] {
  if (!zones) return []
  return zones.slice(0, MAX_VISIBLE_ZONES)
}

function extraZoneCount(zones: RiderZoneRef[] | undefined): number {
  if (!zones) return 0
  return Math.max(0, zones.length - MAX_VISIBLE_ZONES)
}

function hasAnyZone(rider: Rider): boolean {
  return zonesForRow(rider).length > 0
}

// Las acciones por fila respetan los flags de permisos venidos del backend.
// Si el flag no viene (caso típico para SuperAdmin), asumimos `true` —
// el backend re-valida y nosotros sólo escondemos lo que el actor no puede
// usar para evitar 403 inevitables.
function canEdit(r: Rider): boolean {
  return r.commerceCanEdit ?? true
}

function canManageZones(r: Rider): boolean {
  return r.commerceCanManageZones ?? true
}

function onRowClick(event: DataTableRowClickEvent): void {
  emit('select', event.data as Rider)
}
</script>

<template>
  <div class="table-card">
    <DataTable
      :value="store.filteredRiders"
      :loading="store.isLoading"
      data-key="id"
      scrollable
      scroll-height="flex"
      :pt="{ root: { class: 'riders-table' } }"
      empty-message="Sin domiciliarios"
      @row-click="onRowClick"
    >
      <Column header="" style="width: 72px">
        <template #body="{ data }: { data: Rider }">
          <div class="avatar" :class="borderClass(data.currentStatus)">
            <img v-if="data.photoUrl" :src="data.photoUrl" :alt="data.fullName" class="avatar__img" />
            <span v-else class="avatar__initials">{{ initials(data.fullName) }}</span>
          </div>
        </template>
      </Column>

      <Column field="fullName" header="Nombre">
        <template #body="{ data }: { data: Rider }">
          <div class="name-cell">
            <div class="name-cell__top">
              <span class="name-cell__primary">{{ data.fullName }}</span>
              <span
                class="fleet-badge"
                :class="data.fleetType === 'Global' ? 'fleet-badge--global' : 'fleet-badge--private'"
              >
                {{ data.fleetType === 'Global' ? 'Global' : 'Privado' }}
              </span>
            </div>
            <span v-if="data.cedula" class="name-cell__secondary">{{ data.cedula }}</span>
            <span v-else class="name-cell__secondary name-cell__secondary--muted">Sin cédula</span>
          </div>
        </template>
      </Column>

      <Column header="Teléfono" style="width: 160px">
        <template #body="{ data }: { data: Rider }">
          <span class="cell-mono">{{ data.phone }}</span>
        </template>
      </Column>

      <Column header="Vehículo" style="width: 200px">
        <template #body="{ data }: { data: Rider }">
          <div class="vehicle-cell">
            <i :class="VEHICLE_META[data.vehicleType].icon" aria-hidden="true" />
            <span>{{ VEHICLE_META[data.vehicleType].label }}</span>
            <span
              v-if="hasPlate(data.vehicleType) && data.licensePlate"
              class="plate"
            >{{ data.licensePlate }}</span>
          </div>
        </template>
      </Column>

      <Column header="Zonas" style="width: 220px">
        <template #body="{ data }: { data: Rider }">
          <div v-if="hasAnyZone(data)" class="zones-cell">
            <span
              v-for="z in visibleZones(zonesForRow(data))"
              :key="z.id"
              class="zone-chip"
              :style="{
                color: z.color,
                background: `color-mix(in srgb, ${z.color} 15%, transparent)`,
                borderColor: `color-mix(in srgb, ${z.color} 40%, transparent)`,
              }"
            >{{ z.name }}</span>
            <span
              v-if="extraZoneCount(zonesForRow(data)) > 0"
              class="zone-chip zone-chip--more"
            >+{{ extraZoneCount(zonesForRow(data)) }}</span>
          </div>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>

      <Column header="Disponibilidad" style="width: 160px">
        <template #body="{ data }: { data: Rider }">
          <button
            type="button"
            class="availability"
            :class="data.availability === 'available' ? 'availability--on' : 'availability--off'"
            :aria-label="data.availability === 'available' ? 'Marcar como no disponible' : 'Marcar como disponible'"
            @click.stop="emit('toggle-availability', data)"
          >
            <span class="availability__dot" />
            {{ data.availability === 'available' ? 'Disponible' : 'No disponible' }}
          </button>
        </template>
      </Column>

      <Column header="" style="width: 140px">
        <template #body="{ data }: { data: Rider }">
          <div class="row-actions">
            <Button
              icon="pi pi-eye"
              text
              rounded
              aria-label="Ver perfil"
              :pt="{ root: { style: 'color: var(--color-brand);' } }"
              @click.stop="emit('select', data)"
            />
            <Button
              v-if="canEdit(data)"
              icon="pi pi-pencil"
              text
              rounded
              aria-label="Editar"
              @click.stop="emit('edit', data)"
            />
            <Button
              v-if="canManageZones(data)"
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

:deep(.riders-table .p-datatable-thead > tr > th) {
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

:deep(.riders-table .p-datatable-tbody > tr) {
  background: var(--color-surface);
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

:deep(.riders-table .p-datatable-tbody > tr:hover) {
  background: #1d1d1c;
}

:deep(.riders-table .p-datatable-tbody > tr > td) {
  font-size: 13px;
  border: none;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  border: 2px solid var(--color-border);
  background: color-mix(in srgb, var(--color-brand) 12%, transparent);
  color: var(--color-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  overflow: hidden;
  box-sizing: border-box;
}

.avatar--online   { border-color: var(--color-brand); }
.avatar--on-route { border-color: var(--color-warning); }
.avatar--offline  { border-color: var(--color-border); }

.avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar__initials {
  line-height: 1;
}

.name-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.name-cell__top {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.name-cell__primary {
  font-weight: 600;
  color: var(--color-text);
}

.fleet-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  border: 1px solid transparent;
  flex-shrink: 0;
}

.fleet-badge--private {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-muted) 30%, transparent);
}

.fleet-badge--global {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-brand) 35%, transparent);
}

.name-cell__secondary {
  font-size: 11px;
  color: var(--color-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.name-cell__secondary--muted {
  font-style: italic;
  font-family: inherit;
}

.cell-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.cell-muted {
  color: var(--color-muted);
}

.vehicle-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text);
}

.vehicle-cell i {
  color: var(--color-muted);
  font-size: 13px;
}

.plate {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--color-muted);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: #1a1a19;
  margin-left: 4px;
  letter-spacing: 0.5px;
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

.availability {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.availability__dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
}

.availability--on {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-brand) 35%, transparent);
}

.availability--on .availability__dot {
  background: var(--color-brand);
}

.availability--off {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-muted) 30%, transparent);
}

.availability--off .availability__dot {
  background: var(--color-muted);
}

.row-actions {
  display: flex;
  gap: 2px;
}
</style>
