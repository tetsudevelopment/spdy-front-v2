<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type ShallowRef, shallowRef } from 'vue'
import { useMonitoringStore } from '../store/monitoring.store'
import { riderVisualStatus } from '../store/monitoring.store'
import type { MonitoringRider, MonitoringZone } from '../types/monitoring.types'

// Leaflet y omnivore se importan dinámicamente en onMounted para evitar
// que el servidor evalúe módulos que dependen de `window`.
type LeafletModule = typeof import('leaflet')
type OmnivoreModule = typeof import('@mapbox/leaflet-omnivore')

const store = useMonitoringStore()

const mapEl = ref<HTMLDivElement | null>(null)
const leaflet: ShallowRef<LeafletModule | null> = shallowRef(null)
const omni: ShallowRef<OmnivoreModule | null> = shallowRef(null)

let mapInstance: import('leaflet').Map | null = null
let kmlLayer: import('leaflet').Layer | null = null
let riderLayerGroup: import('leaflet').LayerGroup | null = null
let resizeObserver: ResizeObserver | null = null

const tileUrl = computed<string>(
  () => useRuntimeConfig().public.mapTileUrl as string,
)

const selectedZone = computed<MonitoringZone | null>(() => {
  const id = store.selectedZoneId
  if (!id) return null
  return store.zones.find((z) => z.id === id) ?? null
})

function statusColor(r: MonitoringRider): string {
  const vs = riderVisualStatus(r)
  const styles = getComputedStyle(document.documentElement)
  switch (vs) {
    case 'online':   return styles.getPropertyValue('--color-brand').trim()   || '#49fb7c'
    case 'on_route': return styles.getPropertyValue('--color-warning').trim() || '#faad14'
    case 'offline':  return styles.getPropertyValue('--color-muted').trim()   || '#8A8A88'
  }
}

function statusLabel(r: MonitoringRider): string {
  switch (riderVisualStatus(r)) {
    case 'online':   return 'Online'
    case 'on_route': return 'En ruta'
    case 'offline':  return 'Offline'
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildRiderMarker(r: MonitoringRider): import('leaflet').CircleMarker | null {
  const L = leaflet.value
  // Prefer the live WS position; fall back to the REST-loaded position.
  const live = store.riderLivePositions.get(r.id)
  const lat = live?.lat ?? r.currentLat
  const lng = live?.lng ?? r.currentLng
  if (!L || lat == null || lng == null) return null
  const color = statusColor(r)
  const marker = L.circleMarker([lat, lng], {
    radius: 7,
    color: '#161616',
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
  })
  marker.bindTooltip(
    `<div class="rider-tooltip">
       <div class="rider-tooltip__name">${escapeHtml(r.fullName)}</div>
       <div class="rider-tooltip__row">
         <span class="rider-tooltip__dot" style="background:${color}"></span>
         ${statusLabel(r)}
       </div>
       <div class="rider-tooltip__vehicle">${escapeHtml(r.vehicleType)}</div>
     </div>`,
    { direction: 'top', offset: [0, -6], opacity: 1, className: 'rider-tooltip-wrap' },
  )
  return marker
}

function clearKmlLayer(): void {
  if (kmlLayer && mapInstance) {
    mapInstance.removeLayer(kmlLayer)
    kmlLayer = null
  }
}

function clearRiderLayer(): void {
  if (riderLayerGroup && mapInstance) {
    mapInstance.removeLayer(riderLayerGroup)
    riderLayerGroup = null
  }
}

function renderRiders(): void {
  const L = leaflet.value
  if (!L || !mapInstance) return
  clearRiderLayer()
  const group = L.layerGroup()
  for (const r of store.ridersInSelectedZone) {
    const m = buildRiderMarker(r)
    if (m) group.addLayer(m)
  }
  group.addTo(mapInstance)
  riderLayerGroup = group
}

function renderZone(): void {
  const L = leaflet.value
  const omnivore = omni.value
  if (!L || !omnivore || !mapInstance) return
  clearKmlLayer()
  const zone = selectedZone.value
  if (!zone?.kmlUrl) return
  const layer = omnivore
    .kml(zone.kmlUrl)
    .on('ready', () => {
      if (!mapInstance || !kmlLayer) return
      const bounds = (kmlLayer as import('leaflet').FeatureGroup).getBounds?.()
      if (bounds && bounds.isValid()) {
        mapInstance.fitBounds(bounds, { padding: [20, 20] })
      }
    })
  layer.setStyle?.({
    color: zone.color,
    weight: 2,
    fillColor: zone.color,
    fillOpacity: 0.12,
  })
  layer.addTo(mapInstance)
  kmlLayer = layer
}

onMounted(async () => {
  const [leafletMod, omnivoreMod] = await Promise.all([
    import('leaflet'),
    import('@mapbox/leaflet-omnivore'),
  ])
  // CSS de Leaflet se carga dinámicamente junto al módulo
  await import('leaflet/dist/leaflet.css')

  leaflet.value = leafletMod.default ?? leafletMod
  omni.value = omnivoreMod.default ?? omnivoreMod

  const L = leaflet.value
  if (!mapEl.value || !L) return

  mapInstance = L.map(mapEl.value, {
    center: [4.7110, -74.0721],
    zoom: 12,
    zoomControl: true,
    attributionControl: false,
  })
  L.tileLayer(tileUrl.value, { maxZoom: 19 }).addTo(mapInstance)
  renderZone()
  renderRiders()

  // Leaflet sizes its tile grid from the container at init time. When the map
  // mounts while its container is hidden or not yet laid out (inside the "Zonas"
  // tab, or before the flex layout settles), the size is wrong and tiles render
  // blank until something forces a resize — the classic "map only shows after
  // opening DevTools" symptom. Recalculate once the element has its real size,
  // and on every subsequent container resize (tab switches, sidebar, viewport).
  requestAnimationFrame(() => mapInstance?.invalidateSize())
  resizeObserver = new ResizeObserver(() => mapInstance?.invalidateSize())
  resizeObserver.observe(mapEl.value)
})

watch(() => store.selectedZoneId, () => {
  renderZone()
  renderRiders()
})

watch(
  () => store.ridersInSelectedZone,
  () => renderRiders(),
  { deep: true },
)

// Re-render markers whenever a live rider_location WS event updates a position
// for any rider that belongs to the currently selected zone.
watch(
  () => store.riderLivePositions,
  (positions) => {
    const zoneRiderIds = new Set(store.ridersInSelectedZone.map((r) => r.id))
    for (const riderId of positions.keys()) {
      if (zoneRiderIds.has(riderId)) {
        renderRiders()
        break
      }
    }
  },
)

// The map lives inside the (initially hidden) "Zonas" PrimeVue tab. A zone drawn
// while the tab is hidden gets fitBounds-ed against a 0-size container, so it
// looks blank until manually re-selected. When the tab becomes active, recompute
// the Leaflet size and redraw the selected zone against the now-correct viewport.
watch(
  () => store.activeTab,
  (tab) => {
    if (tab !== 'zones') return
    requestAnimationFrame(() => {
      mapInstance?.invalidateSize()
      renderZone()
      renderRiders()
    })
  },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  clearRiderLayer()
  clearKmlLayer()
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }
})
</script>

<template>
  <div class="zones-map">
    <div ref="mapEl" class="zones-map__canvas" />
    <div class="zones-map__legend">
      <span class="zones-map__legend-item">
        <span class="zones-map__legend-dot zones-map__legend-dot--online" />
        Online
      </span>
      <span class="zones-map__legend-item">
        <span class="zones-map__legend-dot zones-map__legend-dot--route" />
        En ruta
      </span>
      <span class="zones-map__legend-item">
        <span class="zones-map__legend-dot zones-map__legend-dot--offline" />
        Offline
      </span>
    </div>
  </div>
</template>

<style scoped>
.zones-map {
  position: relative;
  flex: 1;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  background: #181e18;
}

.zones-map__canvas {
  width: 100%;
  height: 100%;
  min-height: 480px;
  background: #181e18;
}

.zones-map__legend {
  position: absolute;
  left: 14px;
  bottom: 14px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 9px;
  font-size: 11px;
  color: var(--color-muted);
  z-index: 400;
}

.zones-map__legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.zones-map__legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  border: 2px solid var(--color-bg);
}

.zones-map__legend-dot--online  { background: var(--color-brand); }
.zones-map__legend-dot--route   { background: var(--color-warning); }
.zones-map__legend-dot--offline { background: var(--color-muted); }
</style>

<style>
.rider-tooltip-wrap.leaflet-tooltip {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: none;
}

.rider-tooltip-wrap.leaflet-tooltip::before {
  display: none;
}

.rider-tooltip__name {
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 4px;
}

.rider-tooltip__row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-muted);
}

.rider-tooltip__dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
}

.rider-tooltip__vehicle {
  font-size: 10px;
  color: var(--color-muted);
  text-transform: capitalize;
  margin-top: 2px;
}
</style>
