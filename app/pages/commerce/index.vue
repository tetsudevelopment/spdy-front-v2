<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useAuth } from '~/composables/useAuth'
import { useAppToast } from '~/composables/useToast'
import { useCommerceStore } from '~/modules/commerce/store/commerce.store'
import CommercesTable from '~/modules/commerce/components/CommercesTable.vue'
import CreateCommerceModal from '~/modules/commerce/components/CreateCommerceModal.vue'
import CommerceDetailPanel from '~/modules/commerce/components/CommerceDetailPanel.vue'
import type { Commerce, FleetType } from '~/modules/commerce/types/commerce.types'

definePageMeta({
  layout: 'default',
  allowedRoles: ['SuperAdmin'],
})

const store = useCommerceStore()
const { user: authUser } = useAuth()
const toast = useAppToast()

const canCreate = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')

const showCreateModal = ref<boolean>(false)
const showDetailPanel = ref<boolean>(false)
const detailCommerce = ref<Commerce | null>(null)
const editingCommerce = ref<Commerce | null>(null)

const fleetOptions: ReadonlyArray<{ label: string; value: FleetType | null }> = [
  { label: 'Todas',   value: null },
  { label: 'Privada', value: 'Privada' },
  { label: 'Global',  value: 'Global' },
  { label: 'Híbrida', value: 'Hibrida' },
]

onMounted(async () => {
  await store.fetchCommerces()
})

function onSearchInput(value: string | undefined): void {
  store.setSearch(value ?? '')
}

function onFleetChange(value: FleetType | null): void {
  store.setFleetTypeFilter(value)
}

function openCreate(): void {
  editingCommerce.value = null
  showCreateModal.value = true
}

function openDetail(commerce: Commerce): void {
  detailCommerce.value = commerce
  showDetailPanel.value = true
}

function onEditFromDetail(commerce: Commerce): void {
  showDetailPanel.value = false
  editingCommerce.value = commerce
  showCreateModal.value = true
}

function onCreated(): void {
  toast.success('Comercio creado correctamente')
}

function onUpdated(): void {
  toast.success('Comercio actualizado correctamente')
  // Reabrimos el detalle con los datos frescos que el store ya refrescó
  if (editingCommerce.value) {
    const updated = store.commerces.find((c) => c.id === editingCommerce.value?.id)
    if (updated) {
      detailCommerce.value = updated
      showDetailPanel.value = true
    }
  }
  editingCommerce.value = null
}
</script>

<template>
  <div class="commerce-page">
    <Toast />

    <header class="commerce-page__header">
      <div class="commerce-page__title">
        <h1>Comercios</h1>
        <span class="commerce-page__count">{{ store.filteredCommerces.length }}</span>
      </div>
      <Button
        v-if="canCreate"
        label="Nuevo comercio"
        icon="pi pi-plus"
        severity="primary"
        @click="openCreate"
      />
    </header>

    <div class="commerce-page__filters">
      <span class="search">
        <i class="pi pi-search search__icon" aria-hidden="true" />
        <InputText
          :model-value="store.search"
          placeholder="Buscar por nombre, NIT, email o razón social"
          class="search__input"
          @update:model-value="onSearchInput"
        />
      </span>

      <Select
        :model-value="store.fleetTypeFilter"
        :options="[...fleetOptions]"
        option-label="label"
        option-value="value"
        placeholder="Tipo de flota"
        class="filter-fleet"
        show-clear
        @update:model-value="onFleetChange"
      />
    </div>

    <div v-if="store.error" class="commerce-page__error">{{ store.error }}</div>

    <CommercesTable @select="openDetail" />

    <CreateCommerceModal
      v-model:visible="showCreateModal"
      :commerce="editingCommerce"
      @created="onCreated"
      @updated="onUpdated"
    />

    <CommerceDetailPanel
      v-model:visible="showDetailPanel"
      :commerce="detailCommerce"
      @edit="onEditFromDetail"
    />
  </div>
</template>

<style scoped>
.commerce-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.commerce-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.commerce-page__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.commerce-page__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.commerce-page__count {
  font-size: 12px;
  color: var(--color-muted);
}

.commerce-page__filters {
  display: flex;
  gap: 12px;
  align-items: center;
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

.filter-fleet {
  min-width: 180px;
}

.commerce-page__error {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}
</style>
