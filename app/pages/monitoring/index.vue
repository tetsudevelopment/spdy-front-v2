<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { useMonitoringStore } from '~/modules/monitoring/store/monitoring.store'
import { useRiderTracking } from '~/modules/monitoring/composables/useRiderTracking'
import { useDashboardSocket } from '~/modules/monitoring/composables/useDashboardSocket'
import { useAuthStore } from '~/stores/auth.store'
import MonitoringKpis from '~/modules/monitoring/components/MonitoringKpis.vue'
import ServicesFilters from '~/modules/monitoring/components/ServicesFilters.vue'
import ServicesTable from '~/modules/monitoring/components/ServicesTable.vue'
import RidersActivePanel from '~/modules/monitoring/components/RidersActivePanel.vue'
import RidersOfflinePanel from '~/modules/monitoring/components/RidersOfflinePanel.vue'
import ZonesSidebar from '~/modules/monitoring/components/ZonesSidebar.vue'
import ZonesMap from '~/modules/monitoring/components/ZonesMap.vue'
import CreateServiceModal from '~/modules/monitoring/components/CreateServiceModal.vue'
import type { MonitoringTab } from '~/modules/monitoring/types/monitoring.types'

definePageMeta({
  layout: 'default',
})

const store = useMonitoringStore()
const auth = useAuthStore()

// WebSocket real-time feed for order events.
// The composable handles reconnection, auth rejection, and cleanup via onUnmounted.
const { status: wsStatus, connect: wsConnect, close: wsClose } = useDashboardSocket(
  store.handleWsMessage,
)

// Polling — periodic reconcile + fallback for global riders (no commerce).
// Live positions for private (commerce) riders now arrive via rider_location WS events
// and are stored in monitoring.store.riderLivePositions.
// The 60 s interval is intentionally long; it is only a reconcile / safety net.
// See useRiderTracking.ts for the full rationale.
const tracking = useRiderTracking(60_000)

const showCreateModal = ref(false)

const activeCommerceId = computed<string | null>(() => {
  return auth.user?.commerces?.[0]?.commerceId ?? null
})

onMounted(async () => {
  await store.fetchZones()
  // Initial data load; WS events will keep orders up to date after this.
  await tracking.start()
  // Connect the real-time dashboard socket.
  wsConnect()
})

onUnmounted(() => {
  wsClose()
})

function onTabChange(value: string | number): void {
  store.setTab(String(value) as MonitoringTab)
}
</script>

<template>
  <div class="monitoring">
    <div class="monitoring__header">
      <MonitoringKpis />
      <Button
        v-if="activeCommerceId"
        label="Nueva entrega"
        icon="pi pi-plus"
        class="monitoring__new-btn"
        @click="showCreateModal = true"
      />
    </div>

    <CreateServiceModal
      v-if="activeCommerceId"
      v-model:visible="showCreateModal"
      :commerce-id="activeCommerceId"
      @created="store.refreshAll()"
    />

    <Tabs
      :value="store.activeTab"
      class="monitoring__tabs"
      @update:value="onTabChange"
    >
      <TabList>
        <Tab value="services">
          <i class="pi pi-box tab-icon" aria-hidden="true" /> Servicios
        </Tab>
        <Tab value="riders">
          <i class="pi pi-users tab-icon" aria-hidden="true" /> Domiciliarios
        </Tab>
        <Tab value="zones">
          <i class="pi pi-map-marker tab-icon" aria-hidden="true" /> Zonas
        </Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="services">
          <ServicesFilters />
          <ServicesTable />
        </TabPanel>

        <TabPanel value="riders">
          <div class="riders-grid">
            <RidersActivePanel />
            <RidersOfflinePanel />
          </div>
        </TabPanel>

        <TabPanel value="zones">
          <div class="zones-grid">
            <ZonesSidebar />
            <ClientOnly>
              <ZonesMap />
              <template #fallback>
                <div class="zones-grid__fallback">Cargando mapa…</div>
              </template>
            </ClientOnly>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.monitoring {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.monitoring__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.monitoring__new-btn {
  flex-shrink: 0;
}

.monitoring__tabs {
  background: transparent;
}

.tab-icon {
  margin-right: 8px;
  font-size: 13px;
}

.riders-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.zones-grid {
  display: flex;
  gap: 16px;
  min-height: 560px;
}

.zones-grid__fallback {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-muted);
  font-size: 13px;
}

:deep(.p-tablist) {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 4px;
}

:deep(.p-tablist-tab-list) {
  gap: 4px;
}

:deep(.p-tab) {
  background: transparent;
  color: var(--color-muted);
  border: none;
  border-radius: 7px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
}

:deep(.p-tab:hover) {
  color: var(--color-text);
}

:deep(.p-tab-active) {
  background: var(--color-bg);
  color: var(--color-text);
}

:deep(.p-tabpanels) {
  background: transparent;
  padding: 16px 0 0;
}

@media (max-width: 900px) {
  .riders-grid {
    grid-template-columns: 1fr;
  }
  .zones-grid {
    flex-direction: column;
  }
}
</style>
