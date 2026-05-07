<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Drawer from 'primevue/drawer'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import { useAppToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { useRidersStore } from '../store/riders.store'
import type {
  Rider,
  RiderDocument,
  RiderDocumentType,
  RiderStatus,
  RiderZoneRef,
  VehicleType,
} from '../types/rider.types'
import UploadDocumentModal from './UploadDocumentModal.vue'
import ResetRiderPasswordModal from './ResetRiderPasswordModal.vue'

interface Props {
  visible: boolean
  rider: Rider | null
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  edit: [rider: Rider]
}>()

const store = useRidersStore()
const toast = useAppToast()
const { user: authUser } = useAuth()

const showUploadModal = ref<boolean>(false)
const showResetPasswordModal = ref<boolean>(false)
const photoInput = ref<HTMLInputElement | null>(null)
const isUploadingPhoto = ref<boolean>(false)

// Sólo SA y CA tienen `riders:reset-password` (Supervisor y otros roles
// quedan fuera). Además, sobre un Rider Global el CommerceAdmin no puede
// resetear contraseña — sólo puede gestionar zonas. El backend ya envía
// `commerceCanResetPassword=false` en ese caso; ocultamos en UI por
// defensa en profundidad.
const canResetPassword = computed<boolean>(() => {
  const role = authUser.value?.role
  if (role !== 'SuperAdmin' && role !== 'CommerceAdmin') return false
  const flag = props.rider?.commerceCanResetPassword
  return flag !== false
})

const canEdit = computed<boolean>(() => {
  return (props.rider?.commerceCanEdit ?? true) !== false
})

const isGlobalRider = computed<boolean>(() => {
  return props.rider?.fleetType === 'Global'
})

const isSuperAdmin = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')

const showGlobalNotice = computed<boolean>(() => {
  // El aviso aparece cuando el actor está viendo un Rider Global y no tiene
  // edición plena (típicamente CommerceAdmin). Para SuperAdmin el aviso es
  // ruido — sí puede gestionar todo.
  return isGlobalRider.value && !canEdit.value
})

// El drawer recibe el rider por prop — lo re-leemos del store si está en la
// lista para tener la versión más fresca (zones, documents).
const rider = computed<Rider | null>(() => {
  if (!props.rider) return null
  const inStore = store.riders.find((r) => r.id === props.rider?.id)
  return inStore ?? props.rider
})

// Refrescamos el detalle al abrir para traer documents si el listado no los
// incluía.
watch(
  () => [props.visible, props.rider?.id] as const,
  async ([isVisible, rid]) => {
    if (!isVisible || !rid) return
    await store.fetchById(rid)
  },
)

const VEHICLE_LABEL: Record<VehicleType, string> = {
  moto:      'Moto',
  bicicleta: 'Bicicleta',
  auto:      'Auto',
  caminando: 'Caminando',
}

const DOC_META: Record<RiderDocumentType, { label: string; icon: string }> = {
  identification:        { label: 'Identificación',       icon: 'pi pi-id-card' },
  driver_license:        { label: 'Licencia de conducir', icon: 'pi pi-id-card' },
  vehicle_registration:  { label: 'Tarjeta vehículo',     icon: 'pi pi-car' },
  soat:                  { label: 'SOAT',                 icon: 'pi pi-shield' },
  other:                 { label: 'Otro',                 icon: 'pi pi-file' },
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] as string).charAt(0).toUpperCase()
  return `${(parts[0] as string).charAt(0)}${(parts[parts.length - 1] as string).charAt(0)}`.toUpperCase()
}

function statusBorder(status: RiderStatus | undefined): string {
  if (status === 'online')   return 'avatar--online'
  if (status === 'on_route') return 'avatar--on-route'
  return 'avatar--offline'
}

function statusLabel(status: RiderStatus | undefined): string {
  if (status === 'online')   return 'Online'
  if (status === 'on_route') return 'En ruta'
  return 'Offline'
}

function statusBadgeClass(status: RiderStatus | undefined): string {
  if (status === 'online')   return 'status-badge--online'
  if (status === 'on_route') return 'status-badge--on-route'
  return 'status-badge--offline'
}

function docIcon(type: RiderDocumentType): string {
  const name = type.toLowerCase()
  if (name.includes('pdf')) return 'pi pi-file-pdf'
  return DOC_META[type]?.icon ?? 'pi pi-file'
}

function docFileIcon(doc: RiderDocument): string {
  // Si el archivo es claramente PDF por nombre, usamos el ícono específico.
  if (doc.fileName.toLowerCase().endsWith('.pdf')) return 'pi pi-file-pdf'
  return DOC_META[doc.type]?.icon ?? 'pi pi-file'
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function closePanel(): void {
  emit('update:visible', false)
}

function onEdit(): void {
  if (rider.value) emit('edit', rider.value)
}

async function onAvailabilityChange(next: boolean): Promise<void> {
  if (!rider.value) return
  const target = next ? 'available' : 'unavailable'
  try {
    await store.toggleAvailability(rider.value.id, target)
    toast.success(
      next ? 'Domiciliario marcado como disponible' : 'Domiciliario marcado como no disponible',
    )
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'No se pudo actualizar la disponibilidad')
  }
}

function triggerPhotoUpload(): void {
  photoInput.value?.click()
}

async function onPhotoSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file || !rider.value) return

  const allowed = ['image/png', 'image/jpeg', 'image/webp']
  if (!allowed.includes(file.type)) {
    toast.error('Formato no válido — usa PNG, JPEG o WebP')
    input.value = ''
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    toast.error('La foto supera los 10 MB')
    input.value = ''
    return
  }

  isUploadingPhoto.value = true
  try {
    await store.updatePhoto(rider.value.id, file)
    toast.success('Foto actualizada')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'No se pudo actualizar la foto')
  } finally {
    isUploadingPhoto.value = false
    input.value = ''
  }
}

function onDocumentUploaded(): void {
  toast.success('Documento subido correctamente')
}

function openResetPassword(): void {
  showResetPasswordModal.value = true
}

// Wrapper boolean para el toggle — el backend usa literales string.
const isAvailable = computed<boolean>({
  get: () => rider.value?.availability === 'available',
  set: (v) => {
    void onAvailabilityChange(v)
  },
})

// Para CommerceAdmin viendo un Rider Global, ocultamos zonas de OTROS commerces
// (el backend devuelve la lista completa). El filtrado usa el set cacheado en
// el store, poblado al montar /riders. Para SA o Privados no se filtra.
const zonesList = computed<RiderZoneRef[]>(() => {
  const zones = rider.value?.zones ?? []
  if (!isGlobalRider.value) return zones
  if (isSuperAdmin.value) return zones
  const allowed = store.actorAccessibleZoneIds
  if (!allowed) return zones
  return zones.filter((z) => allowed.has(z.id))
})
const documentsList = computed<RiderDocument[]>(() => rider.value?.documents ?? [])
</script>

<template>
  <Drawer
    :visible="props.visible"
    position="right"
    :pt="{
      root: { style: 'width: 520px; background: var(--color-surface); border-left: 1px solid var(--color-border);' },
      header: { style: 'background: var(--color-surface); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text); padding: 0;' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <template #header>
      <div class="drawer-header">
        <span class="drawer-header__title">Perfil del domiciliario</span>
      </div>
    </template>

    <div v-if="rider" class="panel">
      <div class="panel__fleet">
        <span
          class="fleet-badge"
          :class="rider.fleetType === 'Global' ? 'fleet-badge--global' : 'fleet-badge--private'"
        >
          {{ rider.fleetType === 'Global' ? 'Rider Global' : 'Rider Privado' }}
        </span>
      </div>

      <div v-if="showGlobalNotice" class="global-notice">
        <i class="pi pi-info-circle" aria-hidden="true" />
        <span>
          Este es un rider de la flota global. Solo puedes gestionar las zonas
          de tu commerce que tenga asignadas.
        </span>
      </div>

      <header class="panel__hero">
        <div class="panel__avatar-wrap">
          <div class="avatar-lg" :class="statusBorder(rider.currentStatus)">
            <img v-if="rider.photoUrl" :src="rider.photoUrl" :alt="rider.fullName" class="avatar-lg__img" />
            <span v-else class="avatar-lg__initials">{{ initials(rider.fullName) }}</span>
          </div>
          <button
            v-if="canEdit"
            type="button"
            class="avatar-change"
            :disabled="isUploadingPhoto"
            @click="triggerPhotoUpload"
          >
            <i
              :class="isUploadingPhoto ? 'pi pi-spin pi-spinner' : 'pi pi-camera'"
              aria-hidden="true"
            />
            <span>{{ isUploadingPhoto ? 'Subiendo…' : 'Cambiar foto' }}</span>
          </button>
          <input
            ref="photoInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="photo-input"
            @change="onPhotoSelected"
          />
        </div>

        <div class="panel__hero-info">
          <h2 class="panel__name">{{ rider.fullName }}</h2>
          <p class="panel__doc">
            <span v-if="rider.cedula">{{ rider.cedula }}</span>
            <span v-else class="panel__doc--muted">Sin cédula</span>
          </p>
          <span class="status-badge" :class="statusBadgeClass(rider.currentStatus)">
            <span class="status-badge__dot" />
            {{ statusLabel(rider.currentStatus) }}
          </span>
        </div>
      </header>

      <section class="panel__section">
        <h3 class="panel__section-title">Información personal</h3>
        <dl class="panel__grid">
          <div class="panel__item">
            <dt>Teléfono</dt>
            <dd>{{ rider.phone }}</dd>
          </div>
          <div class="panel__item">
            <dt>Email</dt>
            <dd>
              <span v-if="rider.email">{{ rider.email }}</span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
          <div class="panel__item">
            <dt>Vehículo</dt>
            <dd>{{ VEHICLE_LABEL[rider.vehicleType] }}</dd>
          </div>
          <div class="panel__item">
            <dt>Placa</dt>
            <dd>
              <span v-if="rider.licensePlate" class="mono">{{ rider.licensePlate }}</span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="panel__section">
        <h3 class="panel__section-title">Estado operativo</h3>
        <div v-if="canEdit" class="avail-row">
          <div class="avail-row__info">
            <span class="avail-row__label">Disponibilidad</span>
            <span class="avail-row__hint">
              Controla si el rider puede recibir nuevas asignaciones.
            </span>
          </div>
          <ToggleSwitch v-model="isAvailable" />
        </div>
        <dl class="panel__grid">
          <div class="panel__item">
            <dt>Estado actual</dt>
            <dd>{{ statusLabel(rider.currentStatus) }}</dd>
          </div>
          <div class="panel__item">
            <dt>Última ubicación</dt>
            <dd class="small">
              <span v-if="rider.lastLocationAt">{{ formatDate(rider.lastLocationAt) }}</span>
              <span v-else class="muted">Sin registro</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="panel__section">
        <h3 class="panel__section-title">Zonas asignadas</h3>
        <div v-if="zonesList.length > 0" class="chips">
          <span
            v-for="z in zonesList"
            :key="z.id"
            class="chip"
            :style="{
              color: z.color,
              background: `color-mix(in srgb, ${z.color} 15%, transparent)`,
              borderColor: `color-mix(in srgb, ${z.color} 40%, transparent)`,
            }"
          >{{ z.name }}</span>
        </div>
        <p v-else class="muted small">Sin zonas asignadas</p>
      </section>

      <section class="panel__section">
        <div class="section-header">
          <h3 class="panel__section-title">Documentos</h3>
          <button
            v-if="canEdit"
            type="button"
            class="btn-link-add"
            @click="showUploadModal = true"
          >
            <i class="pi pi-plus" aria-hidden="true" />
            Subir documento
          </button>
        </div>
        <ul v-if="documentsList.length > 0" class="doc-list">
          <li v-for="doc in documentsList" :key="doc.id" class="doc">
            <i :class="docFileIcon(doc)" class="doc__icon" aria-hidden="true" />
            <div class="doc__info">
              <span class="doc__title">{{ DOC_META[doc.type].label }}</span>
              <span class="doc__meta">
                {{ doc.fileName }} · {{ formatDate(doc.uploadedAt) }}
              </span>
            </div>
            <a
              :href="doc.fileUrl"
              class="doc__download"
              target="_blank"
              rel="noopener"
              aria-label="Descargar documento"
            >
              <i class="pi pi-download" aria-hidden="true" />
            </a>
          </li>
        </ul>
        <p v-else class="muted small">Sin documentos cargados</p>
      </section>

      <section v-if="canResetPassword" class="panel__section">
        <h3 class="panel__section-title">Acciones</h3>
        <button type="button" class="action-row" @click="openResetPassword">
          <i class="pi pi-key action-row__icon" aria-hidden="true" />
          <div class="action-row__text">
            <span class="action-row__title">Cambiar contraseña</span>
            <span class="action-row__hint">
              Sobrescribe la contraseña del rider para la app móvil.
            </span>
          </div>
          <i class="pi pi-chevron-right action-row__caret" aria-hidden="true" />
        </button>
      </section>

      <footer class="panel__footer">
        <Button
          v-if="canEdit"
          label="Editar"
          icon="pi pi-pencil"
          severity="secondary"
          outlined
          @click="onEdit"
        />
        <Button
          label="Cerrar"
          text
          severity="secondary"
          @click="closePanel"
        />
      </footer>
    </div>
  </Drawer>

  <UploadDocumentModal
    v-model:visible="showUploadModal"
    :rider="rider"
    @uploaded="onDocumentUploaded"
  />

  <ResetRiderPasswordModal
    v-model:visible="showResetPasswordModal"
    :rider="rider"
  />
</template>

<style scoped>
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 4px;
}

.drawer-header__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel__fleet {
  padding: 16px 24px 0;
}

.fleet-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  border: 1px solid transparent;
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

.global-notice {
  display: flex;
  gap: 10px;
  margin: 12px 24px 0;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--color-brand) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-brand) 30%, transparent);
  border-radius: 9px;
  font-size: 12px;
  color: var(--color-text);
  line-height: 1.45;
}

.global-notice i {
  color: var(--color-brand);
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.panel__hero {
  display: flex;
  gap: 18px;
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--color-border);
}

.panel__avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.avatar-lg {
  width: 88px;
  height: 88px;
  border-radius: 9999px;
  border: 3px solid var(--color-border);
  background: color-mix(in srgb, var(--color-brand) 12%, transparent);
  color: var(--color-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  font-size: 28px;
  font-weight: 700;
}

.avatar-lg--online   { border-color: var(--color-brand); }
.avatar-lg--on-route { border-color: var(--color-warning); }
.avatar-lg--offline  { border-color: var(--color-border); }

.avatar-lg__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-change {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-muted);
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.avatar-change:hover:not(:disabled) {
  border-color: var(--color-brand);
  color: var(--color-brand);
}

.avatar-change:disabled {
  opacity: 0.6;
  cursor: wait;
}

.photo-input {
  display: none;
}

.panel__hero-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  justify-content: center;
}

.panel__name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.panel__doc {
  margin: 0;
  font-size: 12px;
  color: var(--color-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.panel__doc--muted {
  font-style: italic;
  font-family: inherit;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  width: fit-content;
  letter-spacing: 0.2px;
}

.status-badge__dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
}

.status-badge--online {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}
.status-badge--online .status-badge__dot { background: var(--color-brand); }

.status-badge--on-route {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
}
.status-badge--on-route .status-badge__dot { background: var(--color-warning); }

.status-badge--offline {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
}
.status-badge--offline .status-badge__dot { background: var(--color-muted); }

.panel__section {
  padding: 18px 24px;
  border-bottom: 1px solid var(--color-border);
}

.panel__section-title {
  margin: 0 0 14px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-muted);
  font-weight: 700;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.btn-link-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  margin: 0 0 14px;
}

.btn-link-add:hover {
  text-decoration: underline;
}

.panel__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 18px;
}

.panel__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.panel__item dt {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-muted);
  font-weight: 600;
}

.panel__item dd {
  margin: 0;
  font-size: 13px;
  color: var(--color-text);
  word-break: break-word;
}

.panel__item .muted {
  color: var(--color-muted);
}

.panel__item .small {
  font-size: 12px;
}

.panel__item .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  letter-spacing: 0.4px;
}

.avail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.avail-row__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.avail-row__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.avail-row__hint {
  font-size: 11px;
  color: var(--color-muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid transparent;
}

.muted {
  color: var(--color-muted);
}

.small {
  font-size: 12px;
}

.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 9px;
}

.doc__icon {
  font-size: 16px;
  color: var(--color-brand);
}

.doc__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.doc__title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
}

.doc__meta {
  font-size: 11px;
  color: var(--color-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc__download {
  color: var(--color-muted);
  border: 1px solid var(--color-border);
  padding: 5px 8px;
  border-radius: 7px;
  transition: border-color 0.15s ease, color 0.15s ease;
  text-decoration: none;
}

.doc__download:hover {
  color: var(--color-brand);
  border-color: var(--color-brand);
}

.action-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  cursor: pointer;
  text-align: left;
  color: var(--color-text);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.action-row:hover {
  border-color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 6%, transparent);
}

.action-row__icon {
  font-size: 16px;
  color: var(--color-brand);
}

.action-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.action-row__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}

.action-row__hint {
  font-size: 11px;
  color: var(--color-muted);
}

.action-row__caret {
  color: var(--color-muted);
  font-size: 11px;
}

.panel__footer {
  margin-top: auto;
  padding: 18px 24px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
}
</style>
