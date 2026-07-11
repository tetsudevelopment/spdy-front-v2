declare module '@mapbox/leaflet-omnivore' {
  import type * as L from 'leaflet'

  // Each format is a callable (fetches a URL) that also exposes `.parse`,
  // which builds the layer from an in-memory string instead of fetching.
  interface OmnivoreFormat {
    (url: string, options?: Record<string, unknown>, layer?: L.GeoJSON): L.GeoJSON
    parse(data: string, options?: Record<string, unknown>, layer?: L.GeoJSON): L.GeoJSON
  }

  interface Omnivore {
    kml: OmnivoreFormat
    csv: OmnivoreFormat
    gpx: OmnivoreFormat
    geojson: OmnivoreFormat
  }

  const omnivore: Omnivore
  export default omnivore
}
