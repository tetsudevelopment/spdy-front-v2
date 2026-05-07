<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import type { DayOfWeek, MeshShift } from '../types/schedule.types'
import { DAYS, DAY_LABELS, assignTracks, shiftToGridPosition } from '../utils/schedule.utils'

interface Props {
  shifts: MeshShift[]
  collapsedDays?: Set<DayOfWeek>
  // Si true, el botón "+ Añadir turno" y el click en chips quedan desactivados.
  // Útil en mallas archivadas.
  readOnly?: boolean
  // IDs de shifts a resaltar visualmente (overlap detectado por backend).
  // Borde rojo + ring; click sigue funcionando para que el operador pueda
  // editarlos.
  highlightedShiftIds?: Set<string>
}
const props = withDefaults(defineProps<Props>(), {
  collapsedDays: () => new Set<DayOfWeek>(),
  readOnly: false,
  highlightedShiftIds: () => new Set<string>(),
})

const emit = defineEmits<{
  'toggle-day': [day: DayOfWeek]
  'edit-shift': [shift: MeshShift]
  'add-shift': [day: DayOfWeek]
}>()

// Altura por track — 32px chip + 4px de separación vertical.
const TRACK_HEIGHT = 36
const TRACK_PADDING = 8
const CHIP_HEIGHT = 32

const HOURS: ReadonlyArray<string> = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, '0'),
)

interface DayRenderData {
  shifts: MeshShift[]
  tracks: number[]
  trackCount: number
}

// Agrupamos por día y dentro de cada día calculamos los tracks mezclando
// TODOS los turnos (no ya por rider). Shifts que no se solapan comparten
// track; los que sí se solapan se apilan verticalmente.
const byDay = computed<Record<DayOfWeek, DayRenderData>>(() => {
  const buckets: Record<DayOfWeek, MeshShift[]> = {
    monday: [], tuesday: [], wednesday: [], thursday: [],
    friday: [], saturday: [], sunday: [],
  }
  for (const s of props.shifts) buckets[s.dayOfWeek].push(s)

  const result: Record<DayOfWeek, DayRenderData> = {
    monday:    { shifts: [], tracks: [], trackCount: 0 },
    tuesday:   { shifts: [], tracks: [], trackCount: 0 },
    wednesday: { shifts: [], tracks: [], trackCount: 0 },
    thursday:  { shifts: [], tracks: [], trackCount: 0 },
    friday:    { shifts: [], tracks: [], trackCount: 0 },
    saturday:  { shifts: [], tracks: [], trackCount: 0 },
    sunday:    { shifts: [], tracks: [], trackCount: 0 },
  }
  for (const day of DAYS) {
    const shifts = buckets[day]
    const { tracks, count } = assignTracks(shifts)
    result[day] = { shifts, tracks, trackCount: count }
  }
  return result
})

function isCollapsed(day: DayOfWeek): boolean {
  return props.collapsedDays.has(day)
}

function dayShiftCount(day: DayOfWeek): number {
  return byDay.value[day].shifts.length
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] as string).charAt(0).toUpperCase()
  return `${(parts[0] as string).charAt(0)}${(parts[parts.length - 1] as string).charAt(0)}`.toUpperCase()
}

function trackAreaHeight(trackCount: number): string {
  const tracks = Math.max(1, trackCount)
  return `${tracks * TRACK_HEIGHT + TRACK_PADDING}px`
}

function chipStyle(shift: MeshShift, track: number): CSSProperties {
  const { left, width } = shiftToGridPosition(shift.startTime, shift.endTime)
  const color = shift.zone?.color ?? 'var(--color-brand)'
  return {
    left,
    width,
    top: `${track * TRACK_HEIGHT + TRACK_PADDING / 2}px`,
    height: `${CHIP_HEIGHT}px`,
    background: `color-mix(in srgb, ${color} 22%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 60%, transparent)`,
    color,
  }
}

function onDayClick(day: DayOfWeek): void {
  emit('toggle-day', day)
}

function onAddShift(day: DayOfWeek, e: Event): void {
  e.stopPropagation()
  emit('add-shift', day)
}

function chipTooltip(shift: MeshShift): string {
  const parts: string[] = []
  parts.push(shift.rider.fullName)
  parts.push(`${shift.startTime} – ${shift.endTime}`)
  if (shift.zone?.name) parts.push(`Zona: ${shift.zone.name}`)
  if (shift.notes) parts.push(shift.notes)
  return parts.join('\n')
}
</script>

<template>
  <div class="schedule">
    <!-- Header de horas — 24 celdas al 1/24 del ancho, sticky al top -->
    <div class="hours">
      <div
        v-for="(h, idx) in HOURS"
        :key="h"
        class="hours__cell"
        :class="{ 'hours__cell--first': idx === 0 }"
      >
        {{ h }}
      </div>
    </div>

    <!-- Secciones por día -->
    <section v-for="day in DAYS" :key="day" class="day">
      <button
        type="button"
        class="day__header"
        :class="{ 'day__header--collapsed': isCollapsed(day) }"
        :aria-expanded="!isCollapsed(day)"
        @click="onDayClick(day)"
      >
        <i
          class="day__caret"
          :class="isCollapsed(day) ? 'pi pi-chevron-right' : 'pi pi-chevron-down'"
          aria-hidden="true"
        />
        <span class="day__name">{{ DAY_LABELS[day] }}</span>
        <span class="day__count">
          {{ dayShiftCount(day) }}
          {{ dayShiftCount(day) === 1 ? 'turno' : 'turnos' }}
        </span>

        <!-- Preview horizontal cuando el día está colapsado -->
        <div v-if="isCollapsed(day) && dayShiftCount(day) > 0" class="day__preview">
          <span
            v-for="(shift, i) in byDay[day].shifts"
            :key="shift.id + ':' + i"
            class="day__preview-bar"
            :style="{
              left: shiftToGridPosition(shift.startTime, shift.endTime).left,
              width: shiftToGridPosition(shift.startTime, shift.endTime).width,
              background: shift.zone?.color ?? 'var(--color-brand)',
            }"
          />
        </div>
      </button>

      <div v-if="!isCollapsed(day)" class="day__body">
        <div v-if="byDay[day].shifts.length === 0" class="day__empty">
          Sin turnos asignados este día.
        </div>

        <div
          v-else
          class="track-area"
          :style="{ height: trackAreaHeight(byDay[day].trackCount) }"
        >
          <div class="track-area__grid" aria-hidden="true" />

          <button
            v-for="(shift, i) in byDay[day].shifts"
            :key="shift.id"
            type="button"
            class="chip"
            :class="{ 'chip--conflict': props.highlightedShiftIds.has(shift.id) }"
            :style="chipStyle(shift, byDay[day].tracks[i] ?? 0)"
            :title="chipTooltip(shift)"
            :disabled="props.readOnly"
            @click="emit('edit-shift', shift)"
          >
            <span class="chip__avatar">
              <img
                v-if="shift.rider.photoUrl"
                :src="shift.rider.photoUrl"
                :alt="shift.rider.fullName"
                class="chip__avatar-img"
              />
              <span v-else class="chip__initials">
                {{ initials(shift.rider.fullName) }}
              </span>
            </span>
            <span class="chip__name">{{ shift.rider.fullName }}</span>
            <span class="chip__sep">·</span>
            <span class="chip__time">
              {{ shift.startTime }}–{{ shift.endTime }}
            </span>
            <template v-if="shift.zone?.name">
              <span class="chip__sep">·</span>
              <span class="chip__zone">{{ shift.zone.name }}</span>
            </template>
          </button>
        </div>

        <button
          v-if="!props.readOnly"
          type="button"
          class="day__add"
          @click="onAddShift(day, $event)"
        >
          <i class="pi pi-plus" aria-hidden="true" />
          <span>Añadir turno en {{ DAY_LABELS[day] }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.schedule {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ---------- Hour header ---------- */
.hours {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.hours__cell {
  padding: 10px 0 8px;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--color-muted);
  border-left: 1px dashed color-mix(in srgb, var(--color-border) 70%, transparent);
}

.hours__cell--first {
  border-left: none;
}

/* ---------- Day section ---------- */
.day + .day {
  border-top: 1px solid var(--color-border);
}

.day__header {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto 1.2fr;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  background: var(--color-surface);
  border: none;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.day__header:hover {
  background: #1d1d1c;
}

.day__header--collapsed {
  background: #1a1a19;
}

.day__caret {
  font-size: 11px;
  color: var(--color-muted);
}

.day__name {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-text);
}

.day__count {
  font-size: 11px;
  color: var(--color-muted);
  font-weight: 600;
}

.day__preview {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--color-border) 50%, transparent);
  overflow: hidden;
}

.day__preview-bar {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 3px;
  opacity: 0.85;
}

.day__body {
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.day__empty {
  padding: 22px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--color-muted);
}

.day__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  margin: 0;
  background: transparent;
  border: none;
  border-top: 1px dashed var(--color-border);
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}

.day__add:hover {
  background: color-mix(in srgb, var(--color-brand) 6%, transparent);
}

/* ---------- Track area (chips apilados) ---------- */
.track-area {
  position: relative;
  min-height: 44px;
  background: var(--color-bg);
}

/* Líneas verticales de la grilla — 24 divisiones alineadas al hour header. */
.track-area__grid {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(100% / 24 - 1px),
    color-mix(in srgb, var(--color-border) 60%, transparent) calc(100% / 24 - 1px),
    color-mix(in srgb, var(--color-border) 60%, transparent) calc(100% / 24)
  );
  pointer-events: none;
}

/* ---------- Chip ---------- */
.chip {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 4px;
  border-radius: 8px;
  border: 1px solid;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.1px;
  cursor: pointer;
  overflow: hidden;
  line-height: 1;
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
  min-width: 20px;
}

.chip:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.15);
  box-shadow: 0 4px 14px color-mix(in srgb, currentColor 30%, transparent);
  z-index: 2;
}

.chip:disabled {
  cursor: default;
}

.chip--conflict {
  border-color: var(--color-error) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-error) 35%, transparent);
  z-index: 3;
}

.chip__avatar {
  width: 20px;
  height: 20px;
  border-radius: 9999px;
  background: color-mix(in srgb, currentColor 25%, transparent);
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  border: 1px solid color-mix(in srgb, currentColor 55%, transparent);
}

.chip__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chip__initials {
  line-height: 1;
}

.chip__name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit;
  min-width: 0;
}

.chip__sep {
  color: inherit;
  opacity: 0.55;
  font-weight: 700;
  flex-shrink: 0;
}

.chip__time {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
  color: inherit;
}

.chip__zone {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: inherit;
  opacity: 0.9;
  min-width: 0;
}
</style>
