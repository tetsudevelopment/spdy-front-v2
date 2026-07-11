<script setup lang="ts">
// Client-side preview of a LOCAL .kml file (before it is uploaded/saved).
// Parses the file in the browser with omnivore.kml.parse() — no network — and
// renders the polygon on a small Leaflet map so the operator can eyeball the
// coverage before committing.
import { onBeforeUnmount, ref, shallowRef, watch, type ShallowRef } from 'vue'

type LeafletModule = typeof import('leaflet')
type OmnivoreModule = typeof import('@mapbox/leaflet-omnivore')

interface Props {
  file: File | null
  color?: string
}
const props = withDefaults(defineProps<Props>(), { color: '#49fb7c' })

const mapEl = ref<HTMLDivElement | null>(null)
const leaflet: ShallowRef<LeafletModule | null> = shallowRef(null)
const omni: ShallowRef<OmnivoreModule | null> = shallowRef(null)

let mapInstance: import('leaflet').Map | null = null
let kmlLayer: import('leaflet').GeoJSON | null = null
let resizeObserver: ResizeObserver | null = null

const isLoading = ref<boolean>(false)
const error = ref<string | null>(null)

const tileUrl = (): string => useRuntimeConfig().public.mapTileUrl as string

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

function clearLayer(): void {
  if (kmlLayer && mapInstance) {
    mapInstance.removeLayer(kmlLayer)
    kmlLayer = null
  }
}

async function ensureMap(): Promise<void> {
  await ensureLibs()
  const L = leaflet.value
  if (!L || !mapEl.value || mapInstance) return
  mapInstance = L.map(mapEl.value, {
    center: [4.711, -74.0721],
    zoom: 11,
    zoomControl: true,
    attributionControl: false,
  })
  L.tileLayer(tileUrl(), { maxZoom: 19 }).addTo(mapInstance)
  // The map lives inside a Dialog/scroll container; recalc on every resize so
  // tiles never render blank (same Leaflet "container size at init" gotcha).
  resizeObserver = new ResizeObserver(() => mapInstance?.invalidateSize())
  resizeObserver.observe(mapEl.value)
}

async function renderFile(file: File): Promise<void> {
  error.value = null
  if (file.name.toLowerCase().endsWith('.kmz')) {
    error.value = 'Vista previa disponible solo para archivos .kml'
    return
  }
  isLoading.value = true
  try {
    // Wait one frame so the (v-if) canvas exists in the DOM with a real size.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await ensureMap()
    const omnivore = omni.value
    if (!omnivore || !mapInstance) return

    const text = await file.text()
    clearLayer()
    const layer = omnivore.kml.parse(text)
    if (!layer) {
      error.value = 'No se pudo leer el KML'
      return
    }
    layer.setStyle?.({
      color: props.color,
      weight: 2,
      fillColor: props.color,
      fillOpacity: 0.18,
    })
    layer.addTo(mapInstance)
    kmlLayer = layer

    mapInstance.invalidateSize()
    const bounds = layer.getBounds?.()
    if (bounds && bounds.isValid()) {
      mapInstance.fitBounds(bounds, { padding: [20, 20] })
    } else {
      error.value = 'El KML no contiene un polígono válido'
    }
  } catch {
    error.value = 'No se pudo procesar el archivo KML'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.file,
  (file) => {
    if (!file) {
      clearLayer()
      return
    }
    void renderFile(file)
  },
  { immediate: true },
)

// Live-restyle the polygon when the operator changes the zone color.
watch(
  () => props.color,
  (c) => {
    kmlLayer?.setStyle?.({ color: c, weight: 2, fillColor: c, fillOpacity: 0.18 })
  },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  clearLayer()
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }
})
</script>

<template>
  <div class="kml-preview">
    <div ref="mapEl" class="kml-preview__canvas" />
    <div v-if="isLoading" class="kml-preview__overlay">
      <i class="pi pi-spin pi-spinner" aria-hidden="true" />
      <span>Procesando KML…</span>
    </div>
    <div v-else-if="error" class="kml-preview__overlay kml-preview__overlay--error">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>
  </div>
</template>

<style scoped>
.kml-preview {
  position: relative;
  height: 300px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  background: #181e18;
}

.kml-preview__canvas {
  width: 100%;
  height: 100%;
  background: #181e18;
}

.kml-preview__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-bg) 55%, transparent);
  font-size: 12px;
  pointer-events: none;
}

.kml-preview__overlay i {
  font-size: 18px;
}

.kml-preview__overlay--error {
  color: var(--color-error);
}
</style>
