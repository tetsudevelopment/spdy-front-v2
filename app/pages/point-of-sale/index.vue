<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useAuth } from '~/composables/useAuth'
import { useAppToast } from '~/composables/useToast'
import { useCommerceStore } from '~/modules/commerce/store/commerce.store'
import { usePdvStore } from '~/modules/pdv/store/pdv.store'
import PdvTable from '~/modules/pdv/components/PdvTable.vue'
import CreatePdvModal from '~/modules/pdv/components/CreatePdvModal.vue'
import AssignZonesModal from '~/modules/pdv/components/AssignZonesModal.vue'
import type { PointOfSale } from '~/modules/pdv/types/pdv.types'

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
const pdvStore = usePdvStore()

const isSuperAdmin = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')

const showCreateModal = ref<boolean>(false)
const showAssignZonesModal = ref<boolean>(false)
const editingPdv = ref<PointOfSale | null>(null)
const zonesPdv = ref<PointOfSale | null>(null)

// El Dropdown solo aparece si hay más de un commerce disponible o el rol es SA
// (SA puede tener 0 asignados pero sí acceso global).
const showCommerceSelector = computed<boolean>(() => {
  return isSuperAdmin.value || pdvStore.availableCommerces.length > 1
})

const hasCommerceSelected = computed<boolean>(
  () => pdvStore.selectedCommerceId !== null,
)

const noPdvsForSelected = computed<boolean>(() => {
  return (
    hasCommerceSelected.value &&
    !pdvStore.isLoading &&
    pdvStore.pdvs.length === 0 &&
    !pdvStore.error
  )
})

async function loadCommerces(): Promise<void> {
  if (isSuperAdmin.value) {
    // SA ve todos — tiramos del store de commerces para alimentar el dropdown.
    if (commerceStore.commerces.length === 0) {
      await commerceStore.fetchCommerces()
    }
    const list: CommerceOption[] = commerceStore.commerces.map((c) => ({
      commerceId: c.id,
      commerceName: c.name,
    }))
    pdvStore.setAvailableCommerces(list)
  } else {
    // CommerceAdmin / Supervisor — usan el campo commerces del propio user.
    const assigned = authUser.value?.commerces ?? []
    pdvStore.setAvailableCommerces([...assigned])
  }

  // Autoseleccionar el primero si aún no hay uno activo.
  if (!pdvStore.selectedCommerceId) {
    const first = pdvStore.availableCommerces[0]
    if (first) pdvStore.setSelectedCommerce(first.commerceId)
  }
}

onMounted(async () => {
  await loadCommerces()
})

// Si el usuario cambia (ej: logout/login), recargar la lista.
watch(
  () => authUser.value?.id,
  async () => {
    pdvStore.setSelectedCommerce(null)
    await loadCommerces()
  },
)

function onCommerceChange(value: string | null): void {
  pdvStore.setSelectedCommerce(value)
}

function onSearchInput(value: string | undefined): void {
  pdvStore.setSearch(value ?? '')
}

function openCreate(): void {
  editingPdv.value = null
  showCreateModal.value = true
}

function onEditFromTable(pdv: PointOfSale): void {
  editingPdv.value = pdv
  showCreateModal.value = true
}

function onSelectFromTable(pdv: PointOfSale): void {
  // Por ahora seleccionar = editar (no hay panel de detalle todavía).
  editingPdv.value = pdv
  showCreateModal.value = true
}

function onManageZones(pdv: PointOfSale): void {
  zonesPdv.value = pdv
  showAssignZonesModal.value = true
}

function onCreated(): void {
  toast.success('Punto de venta creado correctamente')
}

function onUpdated(): void {
  toast.success('Punto de venta actualizado correctamente')
  editingPdv.value = null
}

function onZonesSaved(): void {
  toast.success('Zonas actualizadas correctamente')
  // Actualiza la referencia del PdV en el modal con la versión refrescada
  // por el store (para que la lista de zonas asignadas se vea al instante).
  if (zonesPdv.value) {
    const fresh = pdvStore.pdvs.find((p) => p.id === zonesPdv.value?.id)
    if (fresh) zonesPdv.value = fresh
  }
}
</script>

<template>
  <div class="pdv-page">
    <Toast />

    <header class="pdv-page__header">
      <div class="pdv-page__title">
        <h1>Puntos de venta</h1>
        <span v-if="hasCommerceSelected" class="pdv-page__count">
          {{ pdvStore.filteredPdvs.length }}
        </span>
      </div>
      <Button
        label="Nuevo PdV"
        icon="pi pi-plus"
        severity="primary"
        :disabled="!hasCommerceSelected"
        @click="openCreate"
      />
    </header>

    <div class="pdv-page__filters">
      <Select
        v-if="showCommerceSelector"
        :model-value="pdvStore.selectedCommerceId"
        :options="[...pdvStore.availableCommerces]"
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
          :model-value="pdvStore.search"
          placeholder="Buscar por nombre, dirección, email o teléfono"
          class="search__input"
          :disabled="!hasCommerceSelected"
          @update:model-value="onSearchInput"
        />
      </span>
    </div>

    <div v-if="pdvStore.error" class="pdv-page__error">{{ pdvStore.error }}</div>

    <!-- Empty state: sin commerce seleccionado -->
    <div v-if="!hasCommerceSelected" class="empty">
      <i class="pi pi-building empty__icon" aria-hidden="true" />
      <h2 class="empty__title">Selecciona un comercio</h2>
      <p class="empty__hint">
        Elige un comercio en el selector para ver y gestionar sus puntos de venta.
      </p>
    </div>

    <!-- Empty state: commerce seleccionado pero sin PdVs -->
    <div v-else-if="noPdvsForSelected" class="empty">
      <i class="pi pi-shop empty__icon" aria-hidden="true" />
      <h2 class="empty__title">Este comercio aún no tiene puntos de venta</h2>
      <p class="empty__hint">
        Crea el primero para empezar a gestionar coberturas y asignaciones.
      </p>
      <Button label="Crear punto de venta" icon="pi pi-plus" @click="openCreate" />
    </div>

    <PdvTable
      v-else
      @select="onSelectFromTable"
      @edit="onEditFromTable"
      @manage-zones="onManageZones"
    />

    <CreatePdvModal
      v-model:visible="showCreateModal"
      :pdv="editingPdv"
      @created="onCreated"
      @updated="onUpdated"
    />

    <AssignZonesModal
      v-model:visible="showAssignZonesModal"
      :pdv="zonesPdv"
      @saved="onZonesSaved"
    />
  </div>
</template>

<style scoped>
.pdv-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pdv-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pdv-page__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.pdv-page__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.pdv-page__count {
  font-size: 12px;
  color: var(--color-muted);
}

.pdv-page__filters {
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

.pdv-page__error {
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
