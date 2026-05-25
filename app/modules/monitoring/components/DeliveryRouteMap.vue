<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type ShallowRef, shallowRef } from 'vue'

// Purely presentational — no store access, no emits (D25)
const props = withDefaults(
  defineProps<{
    origin: { lat: number; lng: number }
    destination: { lat: number; lng: number }
    polyline: string | null
    degraded?: boolean
  }>(),
  {
    degraded: false,
  },
)

// Leaflet imported dynamically (avoids SSR window errors — same pattern as ZonesMap.vue)
type LeafletModule = typeof import('leaflet')

const mapEl = ref<HTMLDivElement | null>(null)
const leaflet: ShallowRef<LeafletModule | null> = shallowRef(null)

let mapInstance: import('leaflet').Map | null = null
let routeLayer: import('leaflet').Layer | null = null

const tileUrl = computed<string>(() => {
  const cfg = useRuntimeConfig()
  return (cfg.public.mapTileUrl as string | undefined) ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
})

async function drawRoute(): Promise<void> {
  const L = leaflet.value
  const map = mapInstance
  if (!L || !map) return

  if (routeLayer) {
    map.removeLayer(routeLayer)
    routeLayer = null
  }

  // Markers
  L.marker([props.origin.lat, props.origin.lng], { title: 'Pickup' }).addTo(map)
  L.marker([props.destination.lat, props.destination.lng], { title: 'Destination' }).addTo(map)

  if (props.polyline && !props.degraded) {
    // Decode Google-encoded polyline via @mapbox/polyline
    const polylineLib = await import('@mapbox/polyline')
    const coords = polylineLib.decode(props.polyline) as [number, number][]
    const line = L.polyline(coords, { color: '#3B82F6', weight: 4, opacity: 0.8 }).addTo(map)
    routeLayer = line
    map.fitBounds(line.getBounds(), { padding: [40, 40] })
  } else {
    // Haversine fallback: dashed straight line (degraded=true or no polyline)
    const line = L.polyline(
      [
        [props.origin.lat, props.origin.lng],
        [props.destination.lat, props.destination.lng],
      ],
      { color: '#F59E0B', weight: 3, opacity: 0.7, dashArray: '8, 8' },
    ).addTo(map)
    routeLayer = line
    map.fitBounds(line.getBounds(), { padding: [40, 40] })
  }
}

async function initMap(): Promise<void> {
  if (!mapEl.value) return

  const L = (await import('leaflet')).default
  leaflet.value = L as unknown as LeafletModule

  // Fix default icon path for Nuxt/Vite builds
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
    iconUrl: '/leaflet/marker-icon.png',
    shadowUrl: '/leaflet/marker-shadow.png',
  })

  const center: [number, number] = [
    (props.origin.lat + props.destination.lat) / 2,
    (props.origin.lng + props.destination.lng) / 2,
  ]

  mapInstance = L.map(mapEl.value).setView(center, 13)
  L.tileLayer(tileUrl.value, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapInstance)

  await drawRoute()
}

onMounted(async () => {
  await initMap()
})

onBeforeUnmount(() => {
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }
})

// Redraw route when props change
watch(
  () => [props.polyline, props.degraded, props.origin.lat, props.origin.lng, props.destination.lat, props.destination.lng],
  async () => {
    await drawRoute()
  },
)
</script>

<template>
  <div
    ref="mapEl"
    class="h-64 w-full rounded-lg overflow-hidden"
    aria-label="Delivery route map"
  />
</template>
