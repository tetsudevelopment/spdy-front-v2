<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useAuth } from '~/composables/useAuth'
import { useAppToast } from '~/composables/useToast'
import { useCommerceStore } from '~/modules/commerce/store/commerce.store'
import { useScheduleStore } from '~/modules/schedule/store/schedule.store'
import ScheduleGrid from '~/modules/schedule/components/ScheduleGrid.vue'
import CreateShiftModal from '~/modules/schedule/components/CreateShiftModal.vue'
import {
  DAYS,
  STATUS_LABELS,
  addDays,
  formatWeekRange,
  parseIsoDate,
  toIsoDate,
} from '~/modules/schedule/utils/schedule.utils'
import {
  ScheduleApiError,
  type DayOfWeek,
  type MeshShift,
} from '~/modules/schedule/types/schedule.types'

definePageMeta({
  layout: 'default',
  allowedRoles: ['SuperAdmin', 'CommerceAdmin', 'Supervisor'],
})

interface CommerceOption {
  commerceId: string
  commerceName: string
}

const route = useRoute()
const router = useRouter()
const { user: authUser } = useAuth()
const toast = useAppToast()
const commerceStore = useCommerceStore()
const scheduleStore = useScheduleStore()

const meshId = computed<string>(() => String(route.params.id ?? ''))

const isLoading = ref<boolean>(true)
const notFound = ref<boolean>(false)
const isTransitioning = ref<boolean>(false)

const showShiftModal = ref<boolean>(false)
const editingShift = ref<MeshShift | null>(null)
const defaultDay = ref<DayOfWeek | null>(null)
const collapsedDays = ref<Set<DayOfWeek>>(new Set(DAYS))

const mesh = computed(() => scheduleStore.currentMesh)

const isReadOnly = computed<boolean>(() => {
  if (!mesh.value) return true
  return mesh.value.state === 'archived'
})

const referencedTemplate = computed(() => {
  if (!mesh.value?.templateId) return null
  return scheduleStore.templates.find((t) => t.id === mesh.value?.templateId) ?? null
})

async function bootstrapAccess(): Promise<void> {
  let commerces: CommerceOption[] = []
  if (authUser.value?.role === 'SuperAdmin') {
    if (commerceStore.commerces.length === 0) await commerceStore.fetchCommerces()
    commerces = commerceStore.commerces.map((c) => ({
      commerceId: c.id,
      commerceName: c.name,
    }))
  } else {
    commerces = [...(authUser.value?.commerces ?? [])]
  }
  scheduleStore.configureAccess({
    isSuperAdmin: authUser.value?.role === 'SuperAdmin',
    commerces,
  })
  if (scheduleStore.availableZones.length === 0) {
    await scheduleStore.fetchAvailableZones()
  }
  if (scheduleStore.templates.length === 0) {
    await scheduleStore.fetchAllTemplates()
  }
}

async function load(): Promise<void> {
  isLoading.value = true
  notFound.value = false
  await bootstrapAccess()
  const found = await scheduleStore.fetchMeshById(meshId.value)
  if (!found) {
    notFound.value = true
    isLoading.value = false
    return
  }
  // Catálogos para el modal de turno: si la zona es privada, riders/pdvs del
  // commerce dueño de la zona. Si es global, fallback al primer commerce
  // accesible — el operador podrá asignar riders de ese commerce.
  // TODO: para mallas de zona global considerar agregar selector de commerce
  // dentro del modal de turno.
  const catalogCommerceId =
    found.commerceId
    ?? scheduleStore.accessibleCommerces[0]?.commerceId
    ?? null
  await scheduleStore.loadCatalogsForCommerce(catalogCommerceId)
  isLoading.value = false
}

onMounted(async () => {
  await load()
})

function toggleDay(day: DayOfWeek): void {
  const next = new Set(collapsedDays.value)
  if (next.has(day)) next.delete(day)
  else next.add(day)
  collapsedDays.value = next
}

function onAddShiftFromGrid(day: DayOfWeek): void {
  if (isReadOnly.value) return
  editingShift.value = null
  defaultDay.value = day
  showShiftModal.value = true
}

function onEditShiftFromGrid(shift: MeshShift): void {
  if (isReadOnly.value) return
  editingShift.value = shift
  defaultDay.value = null
  showShiftModal.value = true
}

function onAddShiftFromTopbar(): void {
  editingShift.value = null
  defaultDay.value = null
  showShiftModal.value = true
}

function onShiftCreated(warnings: string[] = []): void {
  toast.success('Turno creado')
  for (const w of warnings) toast.info(w)
}
function onShiftUpdated(warnings: string[] = []): void {
  toast.success('Turno actualizado')
  for (const w of warnings) toast.info(w)
  editingShift.value = null
}
function onShiftDeleted(): void {
  toast.success('Turno eliminado')
  editingShift.value = null
}

async function onPublish(): Promise<void> {
  if (!mesh.value) return
  isTransitioning.value = true
  try {
    const { warnings } = await scheduleStore.publishMesh(mesh.value.id)
    toast.success('Malla publicada')
    for (const w of warnings) toast.warn(w)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'No se pudo publicar la malla')
  } finally {
    isTransitioning.value = false
  }
}

async function onArchive(): Promise<void> {
  if (!mesh.value) return
  if (!confirm('¿Archivar esta malla? Dejará de estar activa pero se conservará el historial.')) return
  isTransitioning.value = true
  try {
    await scheduleStore.archiveMesh(mesh.value.id)
    toast.success('Malla archivada')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'No se pudo archivar la malla')
  } finally {
    isTransitioning.value = false
  }
}

const cloneDuplicateMeshId = ref<string | null>(null)

async function onClone(): Promise<void> {
  if (!mesh.value) return
  // Clona a la semana siguiente — el caso uso típico. Si el target ya existe
  // el backend devuelve 409 con existingMeshId y ofrecemos navegar allá.
  const start = parseIsoDate(mesh.value.weekStart)
  if (!start) {
    toast.error('Fecha de la malla original inválida')
    return
  }
  const targetWeekStart = toIsoDate(addDays(start, 7))
  isTransitioning.value = true
  cloneDuplicateMeshId.value = null
  try {
    const { mesh: cloned, warnings } = await scheduleStore.cloneMesh(mesh.value.id, {
      weekStart: targetWeekStart,
    })
    toast.success('Malla clonada')
    for (const w of warnings) toast.info(w)
    router.push(`/schedule/meshes/${cloned.id}`)
  } catch (e) {
    if (e instanceof ScheduleApiError && e.details.kind === 'clone-duplicate') {
      cloneDuplicateMeshId.value = e.details.existingMeshId
      toast.warn('Ya existe una malla en esa semana — puedes ir a la existente.')
    } else {
      toast.error(e instanceof Error ? e.message : 'No se pudo clonar la malla')
    }
  } finally {
    isTransitioning.value = false
  }
}

function goToExistingClone(): void {
  if (cloneDuplicateMeshId.value) {
    router.push(`/schedule/meshes/${cloneDuplicateMeshId.value}`)
  }
}

async function onDeleteMesh(): Promise<void> {
  if (!mesh.value) return
  if (!confirm(`¿Eliminar la malla "${mesh.value.name}"? Esta acción no se puede deshacer.`)) return
  try {
    await scheduleStore.deleteMesh(mesh.value.id)
    toast.success('Malla eliminada')
    router.push('/schedule')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'No se pudo eliminar la malla')
  }
}

function goBack(): void {
  router.push('/schedule')
}
</script>

<template>
  <div class="page">
    <Toast />

    <div v-if="isLoading" class="status">
      <i class="pi pi-spin pi-spinner" aria-hidden="true" />
      Cargando malla…
    </div>

    <div v-else-if="notFound" class="empty">
      <i class="pi pi-exclamation-triangle empty__icon" aria-hidden="true" />
      <h2 class="empty__title">Malla no encontrada</h2>
      <p class="empty__hint">
        Puede haber sido eliminada o pertenece a una zona a la que no tienes acceso.
      </p>
      <Button label="Volver a mallas" @click="goBack" />
    </div>

    <template v-else-if="mesh">
      <header class="page__header">
        <div class="page__left">
          <button type="button" class="back" @click="goBack">
            <i class="pi pi-arrow-left" aria-hidden="true" />
            Volver a mallas
          </button>
          <div class="page__title-row">
            <h1 class="page__title">{{ mesh.name }}</h1>
            <span class="status-badge" :class="`status-badge--${mesh.state}`">
              {{ STATUS_LABELS[mesh.state] }}
            </span>
          </div>
          <div class="page__meta">
            <span class="meta-item">
              <i class="pi pi-calendar" aria-hidden="true" />
              {{ formatWeekRange(mesh.weekStart, mesh.weekEnd) }}
            </span>
            <span
              v-if="mesh.zone"
              class="zone-pill"
              :style="{
                color: mesh.zone.color,
                background: `color-mix(in srgb, ${mesh.zone.color} 15%, transparent)`,
                borderColor: `color-mix(in srgb, ${mesh.zone.color} 40%, transparent)`,
              }"
            >
              <span class="zone-pill__dot" :style="{ background: mesh.zone.color }" />
              {{ mesh.zone.name }}
              <span class="zone-pill__kind">
                · {{ mesh.zone.isGlobal ? 'Global' : 'Privada' }}
              </span>
            </span>
            <span v-if="mesh.commerce" class="meta-item meta-item--faint">
              <i class="pi pi-building" aria-hidden="true" />
              {{ mesh.commerce.name }}
            </span>
            <span v-if="referencedTemplate" class="meta-item meta-item--faint">
              <i class="pi pi-th-large" aria-hidden="true" />
              Basada en modelo “{{ referencedTemplate.name }}”
            </span>
            <span class="meta-item meta-item--faint">
              <i class="pi pi-bolt" aria-hidden="true" />
              {{ mesh.shifts.length }}
              {{ mesh.shifts.length === 1 ? 'turno' : 'turnos' }}
            </span>
          </div>
        </div>

        <div class="page__actions">
          <Button
            v-if="mesh.state !== 'archived'"
            label="Añadir turno"
            icon="pi pi-plus"
            severity="secondary"
            outlined
            :disabled="isTransitioning"
            @click="onAddShiftFromTopbar"
          />
          <Button
            v-if="mesh.state === 'draft'"
            label="Publicar"
            icon="pi pi-check"
            severity="primary"
            :loading="isTransitioning"
            @click="onPublish"
          />
          <Button
            label="Clonar a próxima semana"
            icon="pi pi-copy"
            severity="secondary"
            outlined
            :disabled="isTransitioning"
            @click="onClone"
          />
          <Button
            v-if="mesh.state === 'published'"
            label="Archivar"
            icon="pi pi-inbox"
            severity="secondary"
            text
            :disabled="isTransitioning"
            @click="onArchive"
          />
          <Button
            label="Eliminar"
            icon="pi pi-trash"
            severity="danger"
            text
            :disabled="isTransitioning"
            @click="onDeleteMesh"
          />
        </div>
      </header>

      <div v-if="scheduleStore.error" class="alert">
        {{ scheduleStore.error }}
        <Button
          v-if="cloneDuplicateMeshId"
          label="Ir a la malla existente"
          severity="secondary"
          outlined
          size="small"
          class="alert__cta"
          @click="goToExistingClone"
        />
      </div>

      <div v-if="isReadOnly" class="readonly-notice">
        <i class="pi pi-lock" aria-hidden="true" />
        Esta malla está archivada. Es de solo lectura.
      </div>

      <div class="page__scroll">
        <ScheduleGrid
          :shifts="mesh.shifts"
          :collapsed-days="collapsedDays"
          :read-only="isReadOnly"
          :highlighted-shift-ids="scheduleStore.highlightedShiftIds"
          @toggle-day="toggleDay"
          @add-shift="onAddShiftFromGrid"
          @edit-shift="onEditShiftFromGrid"
        />
      </div>
    </template>

    <CreateShiftModal
      v-model:visible="showShiftModal"
      :mesh-id="meshId"
      :mesh-zone-id="mesh?.zoneId ?? null"
      :shift="editingShift"
      :default-day="defaultDay"
      @created="onShiftCreated"
      @updated="onShiftUpdated"
      @deleted="onShiftDeleted"
    />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 40px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-muted);
  font-size: 13px;
  justify-content: center;
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

.empty__icon { font-size: 40px; color: var(--color-muted); margin-bottom: 6px; }
.empty__title { margin: 0; font-size: 16px; font-weight: 700; color: var(--color-text); }
.empty__hint { margin: 0 0 10px; font-size: 13px; color: var(--color-muted); max-width: 380px; line-height: 1.5; }

.page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.page__left { min-width: 0; }

.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--color-muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
}
.back:hover { color: var(--color-text); }

.page__title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.page__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}

.page__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 8px;
  color: var(--color-muted);
  font-size: 12px;
  align-items: center;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.meta-item i { color: var(--color-muted); font-size: 12px; }
.meta-item--faint { opacity: 0.85; }

.zone-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 9999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.zone-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
}

.zone-pill__kind {
  opacity: 0.75;
  font-weight: 600;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border-radius: 9999px;
  font-size: 11px;
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

.page__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}

.alert__cta { flex-shrink: 0; }

.readonly-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 35%, transparent);
  color: var(--color-warning);
  border-radius: 9px;
  font-size: 12px;
  font-weight: 600;
}

.page__scroll {
  overflow-x: auto;
  border-radius: 12px;
}
</style>
