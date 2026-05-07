// Utilidades puras para mallas de turno. Todo es determinista y sin estado
// global — alimentan rendering, validación y formatos.

import type { DayOfWeek, MeshStatus } from '../types/schedule.types'

export const DAYS: ReadonlyArray<DayOfWeek> = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday:    'Lunes',
  tuesday:   'Martes',
  wednesday: 'Miércoles',
  thursday:  'Jueves',
  friday:    'Viernes',
  saturday:  'Sábado',
  sunday:    'Domingo',
}

export const STATUS_LABELS: Record<MeshStatus, string> = {
  draft:     'Borrador',
  published: 'Publicada',
  archived:  'Archivada',
}

// 'HH:mm' → decimal [0, 24). Devuelve NaN si el formato es inválido.
export function timeToDecimal(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return Number.NaN
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return Number.NaN
  return hours + minutes / 60
}

export function decimalToTime(decimal: number): string {
  const clamped = Math.max(0, Math.min(24, decimal))
  const totalMinutes = Math.round(clamped * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

export function isValidTimeRange(startTime: string, endTime: string): boolean {
  const s = timeToDecimal(startTime)
  const e = timeToDecimal(endTime)
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false
  return s < e
}

// Posición del chip sobre 24 columnas.
export function shiftToGridPosition(
  startTime: string,
  endTime: string,
): { left: string; width: string } {
  const start = timeToDecimal(startTime)
  const end = timeToDecimal(endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { left: '0%', width: '0%' }
  }
  const leftPct = (start / 24) * 100
  const widthPct = ((end - start) / 24) * 100
  return { left: `${leftPct}%`, width: `${widthPct}%` }
}

interface ShiftTimeRange {
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
}

export function shiftsOverlap(a: ShiftTimeRange, b: ShiftTimeRange): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false
  const aStart = timeToDecimal(a.startTime)
  const aEnd = timeToDecimal(a.endTime)
  const bStart = timeToDecimal(b.startTime)
  const bEnd = timeToDecimal(b.endTime)
  if ([aStart, aEnd, bStart, bEnd].some((n) => !Number.isFinite(n))) return false
  return aStart < bEnd && bStart < aEnd
}

// Asigna "tracks" (pistas verticales) para apilar chips dentro de la misma
// fila rider/día cuando se solapan. Greedy first-fit.
export function assignTracks<T extends ShiftTimeRange>(
  shifts: T[],
): { tracks: number[]; count: number } {
  if (shifts.length === 0) return { tracks: [], count: 0 }
  const indexed = shifts.map((shift, index) => ({ shift, index }))
  indexed.sort((a, b) => {
    const diff = timeToDecimal(a.shift.startTime) - timeToDecimal(b.shift.startTime)
    if (diff !== 0) return diff
    return timeToDecimal(a.shift.endTime) - timeToDecimal(b.shift.endTime)
  })

  const trackEnds: number[] = []
  const result: number[] = new Array(shifts.length).fill(0)

  for (const { shift, index } of indexed) {
    const start = timeToDecimal(shift.startTime)
    const end = timeToDecimal(shift.endTime)
    let assigned = -1
    for (let t = 0; t < trackEnds.length; t++) {
      const trackEnd = trackEnds[t] ?? 0
      if (trackEnd <= start) {
        assigned = t
        trackEnds[t] = end
        break
      }
    }
    if (assigned === -1) {
      trackEnds.push(end)
      assigned = trackEnds.length - 1
    }
    result[index] = assigned
  }
  return { tracks: result, count: trackEnds.length }
}

// ---------- Fechas ----------

// Formatea 'YYYY-MM-DD' a 'dd/MM/yyyy' en es-CO.
export function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export function formatWeekRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`
}

// Lunes de la semana en la que cae `date` (ISO week). Normaliza en local TZ.
// Uso: otras vistas que sigan la convención lunes-domingo. Para el modelo de
// mallas usamos `getWeekRange` (domingo-sábado).
export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // Lunes = 1; si es domingo (0), retrocedemos 6 días; resto, retrocedemos day-1.
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Rango domingo-sábado de la semana que contiene `date`. Las mallas de turno
// siempre cubren una semana completa — el modal de creación snap-ea cualquier
// fecha del usuario a este rango.
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())  // retrocede al domingo
  const end = new Date(start)
  end.setDate(start.getDate() + 6)                 // avanza al sábado
  end.setHours(0, 0, 0, 0)
  return { start, end }
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  if (Number.isNaN(date.getTime())) return null
  return date
}
