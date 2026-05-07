<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useAuth } from '~/composables/useAuth'
import { useAppToast } from '~/composables/useToast'
import { useCommerceStore } from '~/modules/commerce/store/commerce.store'
import { useZonesStore } from '~/modules/zones/store/zones.store'
import ZonesTable from '~/modules/zones/components/ZonesTable.vue'
import CreateZoneModal from '~/modules/zones/components/CreateZoneModal.vue'
import ZoneMapPreview from '~/modules/zones/components/ZoneMapPreview.vue'
import CopyZoneModal from '~/modules/zones/components/CopyZoneModal.vue'
import type { CommerceRef, Zone, ZoneViewMode } from '~/modules/zones/types/zone.types'

definePageMeta({
  layout: 'default',
  allowedRoles: ['SuperAdmin', 'CommerceAdmin'],
})

const { user: authUser } = useAuth()
const toast = useAppToast()
const commerceStore = useCommerceStore()
const zonesStore = useZonesStore()

const isSuperAdmin = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')

const showCreateModal = ref<boolean>(false)
const showMapPreview = ref<boolean>(false)
const showCopyModal = ref<boolean>(false)
const editingZone = ref<Zone | null>(null)
const previewZone = ref<Zone | null>(null)
const copyZoneTarget = ref<Zone | null>(null)

const showCommerceSelector = computed<boolean>(() => {
  if (zonesStore.viewMode !== 'commerce') return false
  return isSuperAdmin.value || zonesStore.availableCommerces.length > 1
})

// El botón "Nueva zona" requiere que haya un destino claro:
//  - modo Global (solo SA disponible): siempre habilitado
//  - modo Commerce: exige un commerce seleccionado
const canCreate = computed<boolean>(() => {
  if (zonesStore.viewMode === 'global') return isSuperAdmin.value
  return zonesStore.selectedCommerceId !== null
})

const noResults = computed<boolean>(() => {
  return (
    zonesStore.canQuery &&
    !zonesStore.isLoading &&
    zonesStore.zones.length === 0 &&
    !zonesStore.error
  )
})

// Pestañas visibles: CA/Supervisor no ven "Globales".
const tabs = computed<ReadonlyArray<{ label: string; value: ZoneViewMode }>>(() => {
  const list: Array<{ label: string; value: ZoneViewMode }> = []
  if (isSuperAdmin.value) list.push({ label: 'Globales', value: 'global' })
  list.push({ label: 'Privadas', value: 'commerce' })
  return list
})

async function loadCommerces(): Promise<void> {
  if (isSuperAdmin.value) {
    if (commerceStore.commerces.length === 0) {
      await commerceStore.fetchCommerces()
    }
    const list: CommerceRef[] = commerceStore.commerces.map((c) => ({
      commerceId: c.id,
      commerceName: c.name,
    }))
    zonesStore.setAvailableCommerces(list)
  } else {
    const assigned = authUser.value?.commerces ?? []
    zonesStore.setAvailableCommerces([...assigned])
  }
}

onMounted(async () => {
  // Por defecto: SA aterriza en Globales; CA y Supervisor en Privadas.
  zonesStore.setViewMode(isSuperAdmin.value ? 'global' : 'commerce')
  await loadCommerces()
  if (zonesStore.viewMode === 'commerce' && !zonesStore.selectedCommerceId) {
    const first = zonesStore.availableCommerces[0]
    if (first) zonesStore.setSelectedCommerce(first.commerceId)
  }
  // Primer fetch explícito — los watchers también lo harían al cambiar, pero
  // en el primer montaje el estado puede no haber cambiado.
  await zonesStore.fetchZones({ page: 1 })
})

watch(
  () => authUser.value?.id,
  async () => {
    zonesStore.setSelectedCommerce(null)
    zonesStore.setViewMode(isSuperAdmin.value ? 'global' : 'commerce')
    await loadCommerces()
  },
)

function onTabChange(mode: ZoneViewMode): void {
  if (mode === zonesStore.viewMode) return
  zonesStore.setViewMode(mode)
  if (mode === 'commerce' && !zonesStore.selectedCommerceId) {
    const first = zonesStore.availableCommerces[0]
    if (first) zonesStore.setSelectedCommerce(first.commerceId)
  }
}

function onCommerceChange(value: string | null): void {
  zonesStore.setSelectedCommerce(value)
}

function onSearchInput(value: string | undefined): void {
  zonesStore.setSearch(value ?? '')
}

function openCreate(): void {
  editingZone.value = null
  showCreateModal.value = true
}

function onSelectFromTable(zone: Zone): void {
  previewZone.value = zone
  showMapPreview.value = true
}

function onEditFromTable(zone: Zone): void {
  editingZone.value = zone
  showCreateModal.value = true
}

function onCopyFromTable(zone: Zone): void {
  copyZoneTarget.value = zone
  showCopyModal.value = true
}

function onEditFromPreview(zone: Zone): void {
  showMapPreview.value = false
  editingZone.value = zone
  showCreateModal.value = true
}

function onCreated(): void {
  toast.success('Zona creada correctamente')
}

function onUpdated(): void {
  toast.success('Zona actualizada correctamente')
  editingZone.value = null
}

function onCopied(count: number): void {
  toast.success(
    count === 1
      ? 'Zona copiada a 1 comercio'
      : `Zona copiada a ${count} comercios`,
  )
  copyZoneTarget.value = null
}
</script>

<template>
  <div class="zones-page">
    <Toast />

    <header class="zones-page__header">
      <div class="zones-page__title">
        <h1>Zonas</h1>
        <span v-if="zonesStore.canQuery" class="zones-page__count">
          {{ zonesStore.filteredZones.length }}
        </span>
      </div>
      <Button
        label="Nueva zona"
        icon="pi pi-plus"
        severity="primary"
        :disabled="!canCreate"
        @click="openCreate"
      />
    </header>

    <div v-if="tabs.length > 1" class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        class="tabs__item"
        :class="{ 'tabs__item--active': zonesStore.viewMode === tab.value }"
        @click="onTabChange(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="zones-page__filters">
      <Select
        v-if="showCommerceSelector"
        :model-value="zonesStore.selectedCommerceId"
        :options="[...zonesStore.availableCommerces]"
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
          :model-value="zonesStore.search"
          placeholder="Buscar por nombre o descripción"
          class="search__input"
          :disabled="!zonesStore.canQuery"
          @update:model-value="onSearchInput"
        />
      </span>
    </div>

    <div v-if="zonesStore.error" class="zones-page__error">{{ zonesStore.error }}</div>

    <!-- Empty: modo Privadas sin commerce seleccionado -->
    <div
      v-if="zonesStore.viewMode === 'commerce' && !zonesStore.selectedCommerceId"
      class="empty"
    >
      <i class="pi pi-building empty__icon" aria-hidden="true" />
      <h2 class="empty__title">Selecciona un comercio</h2>
      <p class="empty__hint">
        Elige un comercio para ver y gestionar sus zonas privadas.
      </p>
    </div>

    <!-- Empty: sin resultados dentro del scope actual -->
    <div v-else-if="noResults" class="empty">
      <i class="pi pi-map-marker empty__icon" aria-hidden="true" />
      <h2 class="empty__title">
        {{
          zonesStore.viewMode === 'global'
            ? 'Aún no hay zonas globales'
            : 'Este comercio aún no tiene zonas'
        }}
      </h2>
      <p class="empty__hint">
        Crea la primera zona subiendo un archivo KML con el polígono de cobertura.
      </p>
      <Button
        v-if="canCreate"
        label="Crear zona"
        icon="pi pi-plus"
        @click="openCreate"
      />
    </div>

    <ZonesTable
      v-else
      :can-copy="isSuperAdmin && zonesStore.viewMode === 'global'"
      @select="onSelectFromTable"
      @edit="onEditFromTable"
      @copy="onCopyFromTable"
    />

    <CreateZoneModal
      v-model:visible="showCreateModal"
      :zone="editingZone"
      @created="onCreated"
      @updated="onUpdated"
    />

    <ZoneMapPreview
      v-model:visible="showMapPreview"
      :zone="previewZone"
      @edit="onEditFromPreview"
    />

    <CopyZoneModal
      v-model:visible="showCopyModal"
      :zone="copyZoneTarget"
      @copied="onCopied"
    />
  </div>
</template>

<style scoped>
.zones-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.zones-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.zones-page__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.zones-page__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.zones-page__count {
  font-size: 12px;
  color: var(--color-muted);
}

.tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  width: fit-content;
}

.tabs__item {
  padding: 7px 14px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.tabs__item:hover {
  color: var(--color-text);
}

.tabs__item--active {
  background: var(--color-bg);
  color: var(--color-text);
}

.zones-page__filters {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-commerce {
  min-width: 240px;
}

.search {
  position: relative;
  flex: 1;
  max-width: 420px;
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

.zones-page__error {
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
