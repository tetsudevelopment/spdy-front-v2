<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch, type ShallowRef } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import type { Zone } from '../types/zone.types'

interface Props {
  visible: boolean
  zone: Zone | null
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  edit: [zone: Zone]
}>()

// Leaflet y omnivore se importan dinámicamente para no romper SSR (aunque la
// app ya corre en SPA, este patrón evita paquetes que tocan `window` durante
// la evaluación del módulo en contextos futuros).
type LeafletModule = typeof import('leaflet')
type OmnivoreModule = typeof import('@mapbox/leaflet-omnivore')

const mapEl = ref<HTMLDivElement | null>(null)
const leaflet: ShallowRef<LeafletModule | null> = shallowRef(null)
const omni: ShallowRef<OmnivoreModule | null> = shallowRef(null)

let mapInstance: import('leaflet').Map | null = null
let kmlLayer: import('leaflet').Layer | null = null
let loadedZoneId: string | null = null
const isLoadingMap = ref<boolean>(false)
const loadError = ref<string | null>(null)

const tileUrl = (): string => useRuntimeConfig().public.mapTileUrl as string

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

function clearKmlLayer(): void {
  if (kmlLayer && mapInstance) {
    mapInstance.removeLayer(kmlLayer)
    kmlLayer = null
  }
}

function destroyMap(): void {
  clearKmlLayer()
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }
  loadedZoneId = null
}

async function ensureLibs(): Promise<void> {
  if (leaflet.value && omni.value) return
  const [leafletMod, omnivoreMod] = await Promise.all([
    import('leaflet'),
    import('@mapbox/leaflet-omnivore'),
  ])
  await import('leaflet/dist/leaflet.css')
  leaflet.value = leafletMod.default ?? leafletMod
  omni.value = omnivoreMod.default ?? omnivoreMod
}

async function setupMap(): Promise<void> {
  if (!props.zone || !mapEl.value) return
  await ensureLibs()
  const L = leaflet.value
  if (!L || !mapEl.value) return

  // Recreamos la instancia cuando cambia la zona — es más seguro que mutarla.
  if (mapInstance) destroyMap()

  isLoadingMap.value = true
  loadError.value = null

  mapInstance = L.map(mapEl.value, {
    center: [4.7110, -74.0721],
    zoom: 12,
    zoomControl: true,
    attributionControl: false,
  })
  L.tileLayer(tileUrl(), { maxZoom: 19 }).addTo(mapInstance)
  renderZoneKml()
  loadedZoneId = props.zone.id
}

function renderZoneKml(): void {
  const L = leaflet.value
  const omnivore = omni.value
  if (!L || !omnivore || !mapInstance || !props.zone?.kmlUrl) {
    isLoadingMap.value = false
    return
  }
  clearKmlLayer()
  const zone = props.zone
  const layer = omnivore
    .kml(zone.kmlUrl)
    .on('ready', () => {
      isLoadingMap.value = false
      if (!mapInstance || !kmlLayer) return
      const bounds = (kmlLayer as import('leaflet').FeatureGroup).getBounds?.()
      if (bounds && bounds.isValid()) {
        mapInstance.fitBounds(bounds, { padding: [20, 20] })
      }
    })
    .on('error', () => {
      isLoadingMap.value = false
      loadError.value = 'No se pudo cargar el archivo KML'
    })
  layer.setStyle?.({
    color: zone.color,
    weight: 2,
    fillColor: zone.color,
    fillOpacity: 0.18,
  })
  layer.addTo(mapInstance)
  kmlLayer = layer
}

// Dispara el setup cuando el diálogo se abre y tiene zona. Cuando se cierra,
// destruimos la instancia para liberar memoria.
watch(
  () => [props.visible, props.zone?.id] as const,
  async ([isVisible, zoneId], _prev) => {
    if (!isVisible) {
      destroyMap()
      return
    }
    // Esperamos un tick del render para que mapEl exista en el DOM.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    if (!zoneId) return
    if (loadedZoneId === zoneId) return
    await setupMap()
  },
  { immediate: false },
)

onBeforeUnmount(() => {
  destroyMap()
})

function closeModal(): void {
  emit('update:visible', false)
}

function onEdit(): void {
  if (props.zone) emit('edit', props.zone)
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '900px', height: '640px' }"
    :pt="{
      root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
      header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text); padding: 0; height: calc(100% - 120px);' },
      footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <template #header>
      <div class="header">
        <span
          v-if="props.zone"
          class="header__dot"
          :style="{
            background: props.zone.color,
            borderColor: `color-mix(in srgb, ${props.zone.color} 50%, transparent)`,
          }"
        />
        <span class="header__title">{{ props.zone?.name ?? 'Vista previa de zona' }}</span>
      </div>
    </template>

    <ClientOnly>
      <div v-if="props.zone" class="preview">
        <aside class="preview__side">
          <section class="side-block">
            <h3 class="side-block__title">Nombre</h3>
            <p class="side-block__value">{{ props.zone.name }}</p>
          </section>

          <section class="side-block">
            <h3 class="side-block__title">Descripción</h3>
            <p v-if="props.zone.description" class="side-block__value">
              {{ props.zone.description }}
            </p>
            <p v-else class="side-block__value side-block__value--muted">Sin descripción</p>
          </section>

          <section class="side-block side-block--row">
            <div>
              <h3 class="side-block__title">Tipo</h3>
              <span
                class="pill"
                :class="props.zone.isGlobal ? 'pill--global' : 'pill--private'"
              >
                {{ props.zone.isGlobal ? 'Global' : 'Privada' }}
              </span>
            </div>
            <div>
              <h3 class="side-block__title">Estado</h3>
              <span
                class="badge"
                :class="props.zone.isActive ? 'badge--active' : 'badge--inactive'"
              >
                {{ props.zone.isActive ? 'Activa' : 'Inactiva' }}
              </span>
            </div>
          </section>

          <section class="side-block side-block--row">
            <div>
              <h3 class="side-block__title">Color</h3>
              <div class="color-chip">
                <span
                  class="color-chip__dot"
                  :style="{ background: props.zone.color }"
                />
                <code>{{ props.zone.color }}</code>
              </div>
            </div>
            <div>
              <h3 class="side-block__title">Prioridad</h3>
              <span class="mono">
                {{ typeof props.zone.priority === 'number' ? props.zone.priority : '—' }}
              </span>
            </div>
          </section>

          <section class="side-block">
            <h3 class="side-block__title">Actualizada</h3>
            <p class="side-block__value side-block__value--muted">
              {{ formatDate(props.zone.updatedAt ?? props.zone.createdAt) }}
            </p>
          </section>
        </aside>

        <div class="preview__map">
          <div ref="mapEl" class="preview__canvas" />
          <div v-if="isLoadingMap" class="preview__overlay">
            <i class="pi pi-spin pi-spinner" aria-hidden="true" />
            <span>Cargando zona…</span>
          </div>
          <div v-else-if="loadError" class="preview__overlay preview__overlay--error">
            <i class="pi pi-exclamation-triangle" aria-hidden="true" />
            <span>{{ loadError }}</span>
          </div>
        </div>
      </div>
    </ClientOnly>

    <template #footer>
      <div class="footer">
        <Button
          v-if="props.zone"
          label="Editar zona"
          icon="pi pi-pencil"
          severity="secondary"
          outlined
          @click="onEdit"
        />
        <Button label="Cerrar" severity="secondary" text @click="closeModal" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.header__dot {
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  border: 2px solid;
  box-sizing: border-box;
  flex-shrink: 0;
}

.header__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100%;
  min-height: 480px;
}

.preview__side {
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

.side-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.side-block--row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.side-block__title {
  margin: 0;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-muted);
  font-weight: 700;
}

.side-block__value {
  margin: 0;
  font-size: 13px;
  color: var(--color-text);
  line-height: 1.45;
}

.side-block__value--muted {
  color: var(--color-muted);
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.pill--global {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}

.pill--private {
  color: #60a5fa;
  background: color-mix(in srgb, #60a5fa 15%, transparent);
}

.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
}

.badge--active {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}

.badge--inactive {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
}

.color-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text);
}

.color-chip__dot {
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  border: 1px solid var(--color-border);
}

.color-chip code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  text-transform: lowercase;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: var(--color-text);
}

.preview__map {
  position: relative;
  background: #181e18;
  min-height: 480px;
}

.preview__canvas {
  width: 100%;
  height: 100%;
  background: #181e18;
}

.preview__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-bg) 60%, transparent);
  font-size: 12px;
  pointer-events: none;
}

.preview__overlay i {
  font-size: 20px;
}

.preview__overlay--error {
  color: var(--color-error);
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
