<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { ref } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useAuth } from '~/composables/useAuth'
import { useAppToast } from '~/composables/useToast'
import { useActiveCommerceStore } from '~/stores/active-commerce.store'
import { useRidersStore, type RidersViewMode } from '~/modules/riders/store/riders.store'
import RidersTable from '~/modules/riders/components/RidersTable.vue'
import CreateRiderModal from '~/modules/riders/components/CreateRiderModal.vue'
import RiderDetailPanel from '~/modules/riders/components/RiderDetailPanel.vue'
import AssignRiderZonesModal from '~/modules/riders/components/AssignRiderZonesModal.vue'
import type {
  Rider,
  RiderAvailability,
  RiderStatus,
} from '~/modules/riders/types/rider.types'

definePageMeta({
  layout: 'default',
  allowedRoles: ['SuperAdmin', 'CommerceAdmin'],
})

const { user: authUser } = useAuth()
const toast = useAppToast()
const activeCommerceStore = useActiveCommerceStore()
const ridersStore = useRidersStore()

const isSuperAdmin = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')

const showCreateModal = ref<boolean>(false)
const showDetailPanel = ref<boolean>(false)
const showAssignZonesModal = ref<boolean>(false)
const editingRider = ref<Rider | null>(null)
const detailRider = ref<Rider | null>(null)
const zonesRider = ref<Rider | null>(null)

const isGlobalView = computed<boolean>(() => ridersStore.viewMode === 'global')

// `canShowList` decide si rendereamos KPIs/tabla o un empty state previo.
//  - vista 'global': siempre, listado a nivel sistema.
//  - vista 'commerce' + activeCommerceId === uuid: siempre.
//  - vista 'commerce' + null: solo SA (verá "Todos los comercios"). Para CA
//    sin commerces accesibles esto queda en false → empty state dedicado.
const canShowList = computed<boolean>(() => {
  if (isGlobalView.value) return true
  if (activeCommerceStore.activeCommerceId !== null) return true
  return isSuperAdmin.value
})

const noRiders = computed<boolean>(() => {
  return (
    canShowList.value &&
    !ridersStore.isLoading &&
    ridersStore.riders.length === 0 &&
    !ridersStore.error
  )
})

const VIEW_MODE_OPTIONS: ReadonlyArray<{ label: string; value: RidersViewMode }> = [
  { label: 'Por commerce', value: 'commerce' },
  { label: 'Global',       value: 'global' },
]

const AVAILABILITY_OPTIONS: ReadonlyArray<{ label: string; value: RiderAvailability | null }> = [
  { label: 'Todas',         value: null },
  { label: 'Disponibles',   value: 'available' },
  { label: 'No disponibles', value: 'unavailable' },
]

const STATUS_OPTIONS: ReadonlyArray<{ label: string; value: RiderStatus | null }> = [
  { label: 'Todos',   value: null },
  { label: 'Online',  value: 'online' },
  { label: 'En ruta', value: 'on_route' },
  { label: 'Offline', value: 'offline' },
]

// Para CA, los IDs de zonas accesibles del actor se usan en AssignRiderZonesModal
// para filtrar zonas de OTROS commerces que un Rider Global tenga asignadas. SA
// no requiere este filtro.
async function refreshActorAccessibleZones(): Promise<void> {
  if (isSuperAdmin.value) {
    ridersStore.clearActorAccessibleZoneIds()
    return
  }
  const cId = activeCommerceStore.activeCommerceId
  if (cId) await ridersStore.loadActorAccessibleZoneIds(cId)
  else ridersStore.clearActorAccessibleZoneIds()
}

onMounted(async () => {
  await refreshActorAccessibleZones()
  await ridersStore.fetchRiders({ page: 1 })
})

// El watcher del store ya se encarga de re-fetchar la lista cuando cambia el
// commerce activo. Acá solo refrescamos el set de zonas accesibles del actor
// (CA con varios commerces asignados puede saltar entre ellos).
watch(
  () => activeCommerceStore.activeCommerceId,
  async () => {
    await refreshActorAccessibleZones()
  },
)

async function onViewModeChange(value: RidersViewMode | null): Promise<void> {
  // El SelectButton puede emitir null si el usuario clickea el botón ya activo
  // — ignoramos para no perder estado.
  if (!value) return
  await ridersStore.setViewMode(value)
}

function onSearchInput(value: string | undefined): void {
  ridersStore.setSearch(value ?? '')
}

function onAvailabilityFilterChange(value: RiderAvailability | null): void {
  ridersStore.setAvailabilityFilter(value)
}

function onStatusFilterChange(value: RiderStatus | null): void {
  ridersStore.setStatusFilter(value)
}

function openCreate(): void {
  editingRider.value = null
  showCreateModal.value = true
}

function onSelectFromTable(rider: Rider): void {
  detailRider.value = rider
  showDetailPanel.value = true
}

function onEditFromTable(rider: Rider): void {
  editingRider.value = rider
  showCreateModal.value = true
}

function onManageZonesFromTable(rider: Rider): void {
  zonesRider.value = rider
  showAssignZonesModal.value = true
}

async function onToggleAvailabilityFromTable(rider: Rider): Promise<void> {
  const next: RiderAvailability = rider.availability === 'available' ? 'unavailable' : 'available'
  try {
    await ridersStore.toggleAvailability(rider.id, next)
    toast.success(
      next === 'available'
        ? 'Domiciliario marcado como disponible'
        : 'Domiciliario marcado como no disponible',
    )
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'No se pudo actualizar la disponibilidad')
  }
}

function onEditFromDetail(rider: Rider): void {
  showDetailPanel.value = false
  editingRider.value = rider
  showCreateModal.value = true
}

function onCreated(): void {
  toast.success('Domiciliario creado correctamente')
}

function onUpdated(): void {
  toast.success('Domiciliario actualizado correctamente')
  // Si veníamos de detalle, lo reabrimos con datos frescos ya traídos por el store.
  if (editingRider.value) {
    const refreshed = ridersStore.riders.find((r) => r.id === editingRider.value?.id)
    if (refreshed) {
      detailRider.value = refreshed
      showDetailPanel.value = true
    }
  }
  editingRider.value = null
}

function onZonesSaved(): void {
  toast.success('Zonas actualizadas correctamente')
  if (zonesRider.value) {
    const fresh = ridersStore.riders.find((r) => r.id === zonesRider.value?.id)
    if (fresh) zonesRider.value = fresh
  }
}
</script>

<template>
  <div class="riders-page">
    <Toast />

    <header class="riders-page__header">
      <div class="riders-page__title">
        <h1>Domiciliarios</h1>
        <span v-if="canShowList" class="riders-page__count">
          {{ ridersStore.filteredRiders.length }}
        </span>
      </div>
      <div class="riders-page__actions">
        <div v-if="isSuperAdmin" class="view-toggle" role="tablist" aria-label="Vista">
          <button
            v-for="opt in VIEW_MODE_OPTIONS"
            :key="opt.value"
            type="button"
            role="tab"
            class="view-toggle__btn"
            :class="{ 'view-toggle__btn--active': ridersStore.viewMode === opt.value }"
            :aria-selected="ridersStore.viewMode === opt.value"
            @click="onViewModeChange(opt.value)"
          >{{ opt.label }}</button>
        </div>

        <Button
          label="Nuevo domiciliario"
          icon="pi pi-plus"
          severity="primary"
          :disabled="!canShowList"
          @click="openCreate"
        />
      </div>
    </header>

    <div v-if="canShowList" class="kpis">
      <div class="kpi">
        <span class="kpi__label">Total activos</span>
        <span class="kpi__value">{{ ridersStore.totalActive }}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">Disponibles ahora</span>
        <span class="kpi__value">{{ ridersStore.availableCount }}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">Online actualmente</span>
        <span class="kpi__value kpi__value--brand">{{ ridersStore.onlineCount }}</span>
      </div>
    </div>

    <div class="riders-page__filters">
      <span class="search">
        <i class="pi pi-search search__icon" aria-hidden="true" />
        <InputText
          :model-value="ridersStore.search"
          placeholder="Buscar por nombre, cédula, teléfono o placa"
          class="search__input"
          :disabled="!canShowList"
          @update:model-value="onSearchInput"
        />
      </span>

      <Select
        :model-value="ridersStore.availabilityFilter"
        :options="[...AVAILABILITY_OPTIONS]"
        option-label="label"
        option-value="value"
        placeholder="Disponibilidad"
        class="filter-slim"
        show-clear
        :disabled="!canShowList"
        @update:model-value="onAvailabilityFilterChange"
      />

      <Select
        :model-value="ridersStore.statusFilter"
        :options="[...STATUS_OPTIONS]"
        option-label="label"
        option-value="value"
        placeholder="Estado"
        class="filter-slim"
        show-clear
        :disabled="!canShowList"
        @update:model-value="onStatusFilterChange"
      />
    </div>

    <div v-if="ridersStore.error" class="riders-page__error">{{ ridersStore.error }}</div>

    <div v-if="!canShowList" class="empty">
      <i class="pi pi-building empty__icon" aria-hidden="true" />
      <h2 class="empty__title">Sin comercios accesibles</h2>
      <p class="empty__hint">
        Tu cuenta no tiene comercios asignados. Pedí al SuperAdmin que te
        habilite acceso a uno.
      </p>
    </div>

    <div v-else-if="noRiders" class="empty">
      <i class="pi pi-user empty__icon" aria-hidden="true" />
      <h2 class="empty__title">
        {{ isGlobalView ? 'No hay domiciliarios globales en el sistema' : 'No hay domiciliarios para mostrar' }}
      </h2>
      <p class="empty__hint">
        Crea el primero para empezar a operar entregas.
      </p>
      <Button label="Crear domiciliario" icon="pi pi-plus" @click="openCreate" />
    </div>

    <RidersTable
      v-else
      @select="onSelectFromTable"
      @edit="onEditFromTable"
      @manage-zones="onManageZonesFromTable"
      @toggle-availability="onToggleAvailabilityFromTable"
    />

    <CreateRiderModal
      v-model:visible="showCreateModal"
      :rider="editingRider"
      @created="onCreated"
      @updated="onUpdated"
    />

    <RiderDetailPanel
      v-model:visible="showDetailPanel"
      :rider="detailRider"
      @edit="onEditFromDetail"
    />

    <AssignRiderZonesModal
      v-model:visible="showAssignZonesModal"
      :rider="zonesRider"
      @saved="onZonesSaved"
    />
  </div>
</template>

<style scoped>
.riders-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.riders-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.riders-page__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.riders-page__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.view-toggle {
  display: inline-flex;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 9px;
  padding: 3px;
  gap: 2px;
}

.view-toggle__btn {
  background: transparent;
  border: none;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-muted);
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.view-toggle__btn:hover {
  color: var(--color-text);
}

.view-toggle__btn--active {
  background: color-mix(in srgb, var(--color-brand) 18%, transparent);
  color: var(--color-brand);
}


.riders-page__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.riders-page__count {
  font-size: 12px;
  color: var(--color-muted);
}

.kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.kpi {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kpi__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-muted);
  font-weight: 700;
}

.kpi__value {
  font-size: 26px;
  font-weight: 800;
  color: var(--color-text);
  line-height: 1.1;
}

.kpi__value--brand {
  color: var(--color-brand);
}

.riders-page__filters {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-slim {
  min-width: 160px;
}

.search {
  position: relative;
  flex: 1;
  max-width: 360px;
}

.search__icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-muted);
  font-size: 13px;
  pointer-events: none;
  z-index: 1;
}

.search__input {
  width: 100%;
  padding-left: 34px !important;
}

.riders-page__error {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 64px 32px;
  background: var(--color-surface);
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  text-align: center;
}

.empty__icon {
  font-size: 40px;
  color: var(--color-muted);
  margin-bottom: 6px;
}

.empty__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.empty__hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--color-muted);
  max-width: 380px;
  line-height: 1.5;
}
</style>
