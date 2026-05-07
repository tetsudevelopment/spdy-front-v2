declare module '@mapbox/leaflet-omnivore' {
  import type * as L from 'leaflet'

  interface Omnivore {
    kml(url: string, options?: Record<string, unknown>, layer?: L.GeoJSON): L.GeoJSON
    csv(url: string, options?: Record<string, unknown>, layer?: L.GeoJSON): L.GeoJSON
    gpx(url: string, options?: Record<string, unknown>, layer?: L.GeoJSON): L.GeoJSON
    geojson(url: string, options?: Record<string, unknown>, layer?: L.GeoJSON): L.GeoJSON
  }

  const omnivore: Omnivore
  export default omnivore
}
