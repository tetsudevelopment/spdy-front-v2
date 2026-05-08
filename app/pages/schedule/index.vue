<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import Dialog from 'primevue/dialog'
import DataTable, { type DataTableRowClickEvent } from 'primevue/datatable'
import Column from 'primevue/column'
import { useAppToast } from '~/composables/useToast'
import { useActiveCommerceStore } from '~/stores/active-commerce.store'
import { useScheduleStore, type TemplateWithCommerce } from '~/modules/schedule/store/schedule.store'
import CreateMeshModal from '~/modules/schedule/components/CreateMeshModal.vue'
import {
  DAY_LABELS,
  STATUS_LABELS,
  formatWeekRange,
} from '~/modules/schedule/utils/schedule.utils'
import type {
  MeshStatus,
  ScheduledMeshListItem,
} from '~/modules/schedule/types/schedule.types'

definePageMeta({
  layout: 'default',
  allowedRoles: ['SuperAdmin', 'CommerceAdmin', 'Supervisor'],
})

const router = useRouter()
const toast = useAppToast()
const activeCommerceStore = useActiveCommerceStore()
const scheduleStore = useScheduleStore()

const isSuperAdmin = computed<boolean>(() => scheduleStore.isSuperAdmin)

const showMeshModal = ref<boolean>(false)

const STATUS_OPTIONS: ReadonlyArray<{ label: string; value: MeshStatus | null }> = [
  { label: 'Todas',     value: null },
  { label: 'Borrador',  value: 'draft' },
  { label: 'Publicada', value: 'published' },
  { label: 'Archivada', value: 'archived' },
]

// Opciones del filtro de zona en la tabla de mallas — derivadas de las zonas
// disponibles según el rol. Incluyen color para el template.
const zoneFilterOptions = computed(() => [
  { label: 'Todas las zonas', value: null, color: null, isGlobal: false },
  ...scheduleStore.availableZones.map((z) => ({
    label: z.name,
    value: z.id,
    color: z.color,
    isGlobal: z.isGlobal,
  })),
])

async function bootstrap(): Promise<void> {
  // El sidebar ya provee la lista de commerces accesibles vía
  // useActiveCommerceStore — el store de schedule la lee directamente y
  // calcula el scope (todos para SA en "Todos", uno cuando hay activo).
  // Zonas accesibles — necesarias para el modal y para filtrar mallas.
  await scheduleStore.fetchAvailableZones()
  // Mallas + modelos en paralelo — ya tenemos availableZones para el filtro.
  await Promise.all([
    scheduleStore.fetchMeshes(),
    scheduleStore.fetchAllTemplates(),
  ])
}

onMounted(async () => {
  await bootstrap()
})

// Cuando el usuario cambia el commerce en el sidebar, re-bootstrap. El store
// se encarga de limpiar state internamente vía su watcher; acá disparamos las
// fetches que la página espera ver.
watch(
  () => activeCommerceStore.activeCommerceId,
  async () => {
    await bootstrap()
  },
)

// ---------- Templates ----------

function openNewTemplate(): void {
  router.push('/schedule/templates/new')
}

function openEditTemplate(tpl: TemplateWithCommerce): void {
  router.push(`/schedule/templates/${tpl.id}/edit`)
}

async function onDeleteTemplate(tpl: TemplateWithCommerce, e: Event): Promise<void> {
  e.stopPropagation()
  if (!confirm(`¿Eliminar el modelo "${tpl.name}"? Las mallas ya creadas desde él no se ven afectadas.`)) return
  try {
    await scheduleStore.deleteTemplate(tpl.commerceId, tpl.id)
    toast.success('Modelo eliminado')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el modelo')
  }
}

function onTemplateRowClick(event: DataTableRowClickEvent): void {
  openEditTemplate(event.data as TemplateWithCommerce)
}

// ---------- Meshes ----------

function openNewMesh(): void {
  showMeshModal.value = true
}

function onMeshCreated(payload: { meshId: string; warnings: string[] }): void {
  toast.success('Malla creada correctamente')
  for (const w of payload.warnings) toast.info(w)
  router.push(`/schedule/meshes/${payload.meshId}`)
}

function openMeshDetail(mesh: ScheduledMeshListItem): void {
  router.push(`/schedule/meshes/${mesh.id}`)
}

// State del diálogo de confirmación de eliminación. Reemplaza el `confirm()`
// nativo para mantener el theming oscuro consistente y poder mostrar un
// mensaje extra cuando la malla está publicada (turnos vivos en operación).
const meshToDelete = ref<ScheduledMeshListItem | null>(null)
const showDeleteMeshDialog = ref<boolean>(false)
const isDeletingMesh = ref<boolean>(false)

function onDeleteMesh(mesh: ScheduledMeshListItem, e: Event): void {
  e.stopPropagation()
  meshToDelete.value = mesh
  showDeleteMeshDialog.value = true
}

function cancelDeleteMesh(): void {
  if (isDeletingMesh.value) return
  showDeleteMeshDialog.value = false
  meshToDelete.value = null
}

async function confirmDeleteMesh(): Promise<void> {
  if (!meshToDelete.value) return
  isDeletingMesh.value = true
  try {
    await scheduleStore.deleteMesh(meshToDelete.value.id)
    toast.success('Malla eliminada')
    showDeleteMeshDialog.value = false
    meshToDelete.value = null
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'No se pudo eliminar la malla')
  } finally {
    isDeletingMesh.value = false
  }
}

function onMeshRowClick(event: DataTableRowClickEvent): void {
  openMeshDetail(event.data as ScheduledMeshListItem)
}

// El list endpoint del backend no expande refs — la zona se resuelve
// localmente contra el catálogo cargado en el store.
function zoneOf(mesh: ScheduledMeshListItem): { name: string; color: string } | null {
  const z = scheduleStore.zoneById.get(mesh.zoneId)
  if (!z) return null
  return { name: z.name, color: z.color }
}

function onStatusFilterChange(value: MeshStatus | null): void {
  scheduleStore.setMeshStatusFilter(value)
}

function onZoneFilterChange(value: string | null): void {
  scheduleStore.setMeshZoneFilter(value)
}

function dayPreview(tpl: TemplateWithCommerce): string {
  const days = new Set<string>()
  for (const s of tpl.shifts) days.add(DAY_LABELS[s.dayOfWeek].slice(0, 3))
  if (days.size === 0) return '—'
  return Array.from(days).join(' · ')
}
</script>

<template>
  <div class="schedule-page">
    <Toast />

    <header class="schedule-page__header">
      <div class="schedule-page__title">
        <h1>Mallas de turno</h1>
      </div>
      <div class="schedule-page__actions">
        <Button
          label="Nuevo modelo"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          @click="openNewTemplate"
        />
        <Button
          label="Nueva malla"
          icon="pi pi-plus"
          severity="primary"
          :disabled="scheduleStore.availableZones.length === 0"
          @click="openNewMesh"
        />
      </div>
    </header>

    <div v-if="scheduleStore.error" class="schedule-page__error">
      {{ scheduleStore.error }}
    </div>

    <div class="dashboard">
      <!-- Columna izquierda: Modelos -->
      <section class="panel panel--templates">
        <header class="panel__header">
          <div>
            <h2 class="panel__title">Modelos de malla</h2>
            <p class="panel__subtitle">
              Plantillas reusables — sin fecha, sin riders. Son la base para
              crear mallas programadas rápido.
            </p>
          </div>
          <span class="panel__count">{{ scheduleStore.totalTemplates }}</span>
        </header>

        <DataTable
          :value="scheduleStore.templates"
          :loading="scheduleStore.isLoading"
          data-key="id"
          :pt="{ root: { class: 'tpl-table' } }"
          empty-message="Aún no hay modelos"
          @row-click="onTemplateRowClick"
        >
          <Column field="name" header="Nombre">
            <template #body="{ data }: { data: TemplateWithCommerce }">
              <div class="cell-title">
                <span class="cell-title__primary">{{ data.name }}</span>
                <span
                  v-if="isSuperAdmin && data.commerceName"
                  class="cell-title__secondary cell-title__secondary--commerce"
                >
                  <i class="pi pi-building" aria-hidden="true" />
                  {{ data.commerceName }}
                </span>
                <span v-else-if="data.description" class="cell-title__secondary">
                  {{ data.description }}
                </span>
                <span v-else class="cell-title__preview">{{ dayPreview(data) }}</span>
              </div>
            </template>
          </Column>
          <Column header="Turnos" style="width: 90px">
            <template #body="{ data }: { data: TemplateWithCommerce }">
              <span class="mono">{{ data.shifts.length }}</span>
            </template>
          </Column>
          <Column header="" style="width: 100px">
            <template #body="{ data }: { data: TemplateWithCommerce }">
              <div class="row-actions">
                <Button
                  icon="pi pi-pencil"
                  text
                  rounded
                  aria-label="Editar"
                  @click.stop="openEditTemplate(data)"
                />
                <Button
                  icon="pi pi-trash"
                  text
                  rounded
                  severity="danger"
                  aria-label="Eliminar"
                  @click.stop="onDeleteTemplate(data, $event)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </section>

      <!-- Columna derecha: Mallas programadas -->
      <section class="panel panel--meshes">
        <header class="panel__header">
          <div>
            <h2 class="panel__title">Mallas programadas</h2>
            <p class="panel__subtitle">
              Instancias con semana y riders asignados. Una malla por zona por semana.
            </p>
          </div>
          <span class="panel__count">{{ scheduleStore.totalMeshes }}</span>
        </header>

        <div class="panel__filters">
          <Select
            :model-value="scheduleStore.meshStatusFilter"
            :options="[...STATUS_OPTIONS]"
            option-label="label"
            option-value="value"
            placeholder="Estado"
            class="filter-status"
            show-clear
            @update:model-value="onStatusFilterChange"
          />
          <Select
            :model-value="scheduleStore.meshZoneFilter"
            :options="zoneFilterOptions"
            option-label="label"
            option-value="value"
            placeholder="Zona"
            class="filter-zone"
            show-clear
            @update:model-value="onZoneFilterChange"
          >
            <template #option="{ option }: { option: typeof zoneFilterOptions.value[number] }">
              <div class="zone-opt">
                <span
                  v-if="option.color"
                  class="zone-opt__dot"
                  :style="{ background: option.color }"
                />
                <span v-else class="zone-opt__dot zone-opt__dot--neutral" />
                <span>{{ option.label }}</span>
              </div>
            </template>
          </Select>
        </div>

        <DataTable
          :value="scheduleStore.filteredMeshes"
          :loading="scheduleStore.isLoading"
          data-key="id"
          :pt="{ root: { class: 'mesh-table' } }"
          empty-message="Sin mallas programadas"
          @row-click="onMeshRowClick"
        >
          <Column header="Estado" style="width: 120px">
            <template #body="{ data }: { data: ScheduledMeshListItem }">
              <span class="status-badge" :class="`status-badge--${data.state}`">
                {{ STATUS_LABELS[data.state] }}
              </span>
            </template>
          </Column>
          <Column field="name" header="Nombre">
            <template #body="{ data }: { data: ScheduledMeshListItem }">
              <div class="cell-title cell-title--mesh">
                <span
                  class="cell-title__dot"
                  :style="{ background: zoneOf(data)?.color ?? 'var(--color-muted)' }"
                />
                <div class="cell-title__text">
                  <span class="cell-title__primary">{{ data.name }}</span>
                  <span class="cell-title__secondary">
                    {{ formatWeekRange(data.weekStart, data.weekEnd) }}
                  </span>
                </div>
              </div>
            </template>
          </Column>
          <Column header="Zona" style="width: 180px">
            <template #body="{ data }: { data: ScheduledMeshListItem }">
              <template v-if="zoneOf(data)">
                <span
                  class="zone-chip"
                  :style="{
                    color: zoneOf(data)!.color,
                    background: `color-mix(in srgb, ${zoneOf(data)!.color} 15%, transparent)`,
                    borderColor: `color-mix(in srgb, ${zoneOf(data)!.color} 40%, transparent)`,
                  }"
                >{{ zoneOf(data)!.name }}</span>
              </template>
              <span v-else class="cell-muted">—</span>
            </template>
          </Column>
          <Column header="" style="width: 120px">
            <template #body="{ data }: { data: ScheduledMeshListItem }">
              <div class="row-actions">
                <Button
                  icon="pi pi-eye"
                  text
                  rounded
                  aria-label="Ver malla"
                  :pt="{ root: { style: 'color: var(--color-brand);' } }"
                  @click.stop="openMeshDetail(data)"
                />
                <Button
                  icon="pi pi-trash"
                  text
                  rounded
                  severity="danger"
                  aria-label="Eliminar"
                  @click.stop="onDeleteMesh(data, $event)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </section>
    </div>

    <CreateMeshModal
      v-model:visible="showMeshModal"
      @created="onMeshCreated"
    />

    <Dialog
      :visible="showDeleteMeshDialog"
      modal
      :closable="!isDeletingMesh"
      :draggable="false"
      :style="{ width: '460px' }"
      header="Eliminar malla"
      :pt="{
        root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
        header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
        content: { style: 'background: var(--color-surface); color: var(--color-text);' },
        footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
      }"
      @update:visible="(v: boolean) => { if (!v) cancelDeleteMesh() }"
    >
      <div v-if="meshToDelete" class="confirm-delete">
        <p class="confirm-delete__text">
          ¿Seguro que querés eliminar la malla
          <strong>"{{ meshToDelete.name }}"</strong>?
          Esta acción no se puede deshacer.
        </p>
        <div
          v-if="meshToDelete.state === 'published'"
          class="confirm-delete__warning"
        >
          <i class="pi pi-exclamation-triangle" aria-hidden="true" />
          <span>
            Esta malla está publicada. Eliminarla afectará los turnos que
            estén operativos.
          </span>
        </div>
      </div>
      <template #footer>
        <div class="confirm-delete__footer">
          <Button
            label="Cancelar"
            text
            severity="secondary"
            :disabled="isDeletingMesh"
            @click="cancelDeleteMesh"
          />
          <Button
            label="Eliminar"
            icon="pi pi-trash"
            severity="danger"
            :loading="isDeletingMesh"
            @click="confirmDeleteMesh"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.schedule-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.schedule-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.schedule-page__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.schedule-page__actions {
  display: flex;
  gap: 10px;
}

.schedule-page__error {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}

.dashboard {
  display: grid;
  grid-template-columns: 40% 1fr;
  gap: 16px;
  align-items: flex-start;
}

@media (max-width: 1100px) {
  .dashboard { grid-template-columns: 1fr; }
}

.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}

.panel__title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}

.panel__subtitle {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--color-muted);
  line-height: 1.45;
}

.panel__count {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-brand);
}

.panel__filters {
  display: flex;
  gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--color-border);
}

.filter-status,
.filter-zone {
  min-width: 160px;
  flex: 1;
}

:deep(.tpl-table .p-datatable-thead > tr > th),
:deep(.mesh-table .p-datatable-thead > tr > th) {
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

:deep(.tpl-table .p-datatable-tbody > tr),
:deep(.mesh-table .p-datatable-tbody > tr) {
  background: var(--color-surface);
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

:deep(.tpl-table .p-datatable-tbody > tr:hover),
:deep(.mesh-table .p-datatable-tbody > tr:hover) {
  background: #1d1d1c;
}

:deep(.tpl-table .p-datatable-tbody > tr > td),
:deep(.mesh-table .p-datatable-tbody > tr > td) {
  font-size: 13px;
  border: none;
}

.cell-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cell-title--mesh {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.cell-title__dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 0%, transparent);
}

.cell-title__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cell-title__primary {
  font-weight: 600;
  color: var(--color-text);
}

.cell-title__secondary {
  font-size: 11px;
  color: var(--color-muted);
}

.cell-title__secondary--commerce {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cell-title__secondary--commerce i {
  font-size: 10px;
}

.cell-title__preview {
  font-size: 10px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
}

.cell-muted {
  color: var(--color-muted);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--color-text);
}

.row-actions {
  display: flex;
  gap: 2px;
}

.zone-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.zone-opt__dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.zone-opt__dot--neutral {
  background: var(--color-muted);
  opacity: 0.5;
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

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
  border: 1px solid transparent;
}

.status-badge--draft {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-muted) 30%, transparent);
}

.status-badge--published {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-brand) 40%, transparent);
}

.status-badge--archived {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-warning) 40%, transparent);
}

/* Diálogo de confirmación de eliminación */
.confirm-delete {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

.confirm-delete__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
}

.confirm-delete__text strong {
  color: var(--color-text);
  font-weight: 700;
}

.confirm-delete__warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 40%, transparent);
  color: var(--color-warning);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.45;
}

.confirm-delete__warning i {
  font-size: 13px;
  margin-top: 1px;
  flex-shrink: 0;
}

.confirm-delete__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
