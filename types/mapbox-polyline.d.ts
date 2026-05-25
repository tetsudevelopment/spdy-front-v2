declare module '@mapbox/polyline' {
  /**
   * Decodes an encoded polyline string into an array of [lat, lng] pairs.
   */
  export function decode(encoded: string, precision?: number): [number, number][]

  /**
   * Encodes an array of [lat, lng] pairs into an encoded polyline string.
   */
  export function encode(coordinates: [number, number][], precision?: number): string

  /**
   * Converts a GeoJSON LineString or MultiLineString to an encoded polyline.
   */
  export function fromGeoJSON(
    geojson: { type: string; coordinates: [number, number][] },
    precision?: number,
  ): string

  /**
   * Converts an encoded polyline string to a GeoJSON LineString.
   */
  export function toGeoJSON(
    encoded: string,
    precision?: number,
  ): { type: 'LineString'; coordinates: [number, number][] }
}
