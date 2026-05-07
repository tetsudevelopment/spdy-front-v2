<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useAuth } from '~/composables/useAuth'
import { useAppToast } from '~/composables/useToast'
import { useCommerceStore } from '~/modules/commerce/store/commerce.store'
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

interface CommerceOption {
  commerceId: string
  commerceName: string
}

const { user: authUser } = useAuth()
const toast = useAppToast()
const commerceStore = useCommerceStore()
const ridersStore = useRidersStore()

const isSuperAdmin = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')

const showCreateModal = ref<boolean>(false)
const showDetailPanel = ref<boolean>(false)
const showAssignZonesModal = ref<boolean>(false)
const editingRider = ref<Rider | null>(null)
const detailRider = ref<Rider | null>(null)
const zonesRider = ref<Rider | null>(null)

const showCommerceSelector = computed<boolean>(() => {
  if (ridersStore.viewMode === 'global') return false
  return isSuperAdmin.value || ridersStore.availableCommerces.length > 1
})

const isGlobalView = computed<boolean>(() => ridersStore.viewMode === 'global')

const hasCommerceSelected = computed<boolean>(
  () => ridersStore.selectedCommerceId !== null,
)

// En vista global no exigimos commerce seleccionado para listar.
const canShowList = computed<boolean>(() => {
  return isGlobalView.value || hasCommerceSelected.value
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

async function loadCommerces(): Promise<void> {
  if (isSuperAdmin.value) {
    if (commerceStore.commerces.length === 0) {
      await commerceStore.fetchCommerces()
    }
    const list: CommerceOption[] = commerceStore.commerces.map((c) => ({
      commerceId: c.id,
      commerceName: c.name,
    }))
    ridersStore.setAvailableCommerces(list)
    // SA ve todo: limpiamos cualquier set previo para que no filtre.
    ridersStore.clearActorAccessibleZoneIds()
  } else {
    const assigned = authUser.value?.commerces ?? []
    ridersStore.setAvailableCommerces([...assigned])
    // CA: cargamos los IDs de zonas accesibles (privadas + globales asignadas
    // a su commerce) para ocultar las zonas de otros commerces que un Rider
    // Global tenga asignadas. El backend devuelve todas; filtramos en cliente.
    const actorCommerceId = assigned[0]?.commerceId
    if (actorCommerceId) {
      await ridersStore.loadActorAccessibleZoneIds(actorCommerceId)
    }
  }
  if (!ridersStore.selectedCommerceId) {
    const first = ridersStore.availableCommerces[0]
    if (first) ridersStore.setSelectedCommerce(first.commerceId)
  }
}

onMounted(async () => {
  await loadCommerces()
})

watch(
  () => authUser.value?.id,
  async () => {
    ridersStore.setSelectedCommerce(null)
    await loadCommerces()
  },
)

function onCommerceChange(value: string | null): void {
  ridersStore.setSelectedCommerce(value)
}

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
          :disabled="!isSuperAdmin && !hasCommerceSelected"
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
      <Select
        v-if="showCommerceSelector"
        :model-value="ridersStore.selectedCommerceId"
        :options="[...ridersStore.availableCommerces]"
        option-label="commerceName"
        option-value="commerceId"
        placeholder="Selecciona un comercio"
        class="filter-commerce"
        :show-clear="false"
        @update:model-value="onCommerceChange"
      />

      <span class="search">
        <i class="pi pi-search search__icon" aria-hidden="true" />
        <InputText
          :model-value="ridersStore.search"
          placeholder="Buscar por nombre, cédula, teléfono o placa"
          class="search__input"
          :disabled="!hasCommerceSelected"
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
        :disabled="!hasCommerceSelected"
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
        :disabled="!hasCommerceSelected"
        @update:model-value="onStatusFilterChange"
      />
    </div>

    <div v-if="ridersStore.error" class="riders-page__error">{{ ridersStore.error }}</div>

    <div v-if="!canShowList" class="empty">
      <i class="pi pi-building empty__icon" aria-hidden="true" />
      <h2 class="empty__title">Selecciona un comercio</h2>
      <p class="empty__hint">
        Elige un comercio para ver y gestionar su flota de domiciliarios.
      </p>
    </div>

    <div v-else-if="noRiders" class="empty">
      <i class="pi pi-user empty__icon" aria-hidden="true" />
      <h2 class="empty__title">
        {{ isGlobalView ? 'No hay domiciliarios en el sistema' : 'Este comercio aún no tiene domiciliarios' }}
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

.filter-commerce {
  min-width: 240px;
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
