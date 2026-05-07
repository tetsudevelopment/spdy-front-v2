// Mallas de turno — modelo de 3 niveles, alineado al contrato backend.
//   1. ScheduleTemplate: plantilla reusable sin fecha ni riders.
//   2. ScheduledMesh:    instancia con semana, zona y state machine (draft/published/archived).
//   3. MeshShift:        turno dentro de una malla; SIEMPRE con rider asignado.
//
// Estados en wire (en inglés) coinciden con el backend; los labels para UI
// viven en utils/schedule.utils.ts (STATUS_LABELS).

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export type MeshState = 'draft' | 'published' | 'archived'

// Alias legacy — el código viejo usaba `MeshStatus`; mantenemos el nombre
// como sinónimo para minimizar churn en consumidores.
export type MeshStatus = MeshState

// ---------- Refs expandidos (zero N+1 — el backend los popula) ----------

export interface RiderRef {
  id: string
  fullName: string
  photoUrl?: string
  vehicleType: string
}
export interface PdvRef {
  id: string
  name: string
}
// Zona enriquecida con commerceId/isGlobal — la malla necesita estos campos
// para saber a qué commerce "pertenece" y para el filtrado por rol.
export interface ZoneRef {
  id: string
  name: string
  color: string
  commerceId?: string | null   // null cuando la zona es global
  isGlobal?: boolean
}
export interface CommerceMini {
  id: string
  name: string
}

// ---------- Templates (plantillas sin fecha, sin rider) ----------

export interface TemplateShift {
  id: string
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  pdvId?: string
  zoneId?: string
  riderId?: string  // template puede pre-asignar rider (opcional)
  notes?: string
}

export interface ScheduleTemplate {
  id: string
  commerceId: string
  name: string
  description?: string
  shifts: TemplateShift[]
  createdAt: string
  updatedAt?: string
}

export interface CreateTemplateDto {
  name: string
  description?: string
  shifts: Array<Omit<TemplateShift, 'id'>>
}

export interface UpdateTemplateDto {
  name?: string
  description?: string
  shifts?: Array<Omit<TemplateShift, 'id'>>
}

// ---------- Mesh shifts (turnos reales con rider asignado) ----------

export interface MeshShift {
  id: string
  meshId: string
  riderId: string
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  pdvId?: string
  zoneId?: string
  notes?: string
  rider: RiderRef
  pdv?: PdvRef | null
  zone?: ZoneRef | null
}

// pdvId/pdv quedan en el response (`MeshShift`) por compat con shifts viejos
// que pudieran traerlos, pero el FE ya no los envía ni los muestra. La zona
// de la malla cubre la noción operativa que antes intentaba capturar PdV.
export interface CreateMeshShiftDto {
  riderId: string
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  zoneId?: string
  notes?: string
}

export interface UpdateMeshShiftDto {
  riderId?: string
  dayOfWeek?: DayOfWeek
  startTime?: string
  endTime?: string
  zoneId?: string
  notes?: string
}

// ---------- Scheduled meshes ----------
//
// El backend separa list vs detail intencionalmente:
//   - GET /scheduled-meshes      → array de items planos (sin zone/shifts/template).
//   - GET /scheduled-meshes/:id  → detalle con refs expandidos.
//
// El FE refleja esa separación con dos tipos. `ScheduledMeshDetail` extiende
// `ScheduledMeshListItem` para que un detalle pueda consumirse donde se
// espera un list item. El alias `ScheduledMesh = ScheduledMeshDetail` se
// mantiene por back-compat con código que ya tipa para detail.

export interface ScheduledMeshListItem {
  id: string
  zoneId: string
  commerceId: string
  name: string
  weekStart: string                 // 'YYYY-MM-DD'
  weekEnd: string                   // derivado: weekStart + 6 días
  state: MeshState
  // Alias legacy — algunos componentes leen `.status`. Mantenemos ambos.
  status: MeshState
  isRecurring: boolean
  templateId?: string | null
  createdAt: string
  updatedAt?: string
}

export interface ScheduledMeshDetail extends ScheduledMeshListItem {
  shifts: MeshShift[]
  zone: ZoneRef
  commerce?: CommerceMini | null
  template?: { id: string; name: string } | null
}

// Alias retroactivo — el grueso del código existente espera el shape detail.
export type ScheduledMesh = ScheduledMeshDetail

export interface CreateMeshDto {
  name: string
  zoneId: string
  weekStart: string
  isRecurring?: boolean
  // Backend lo nombra `fromTemplateId` (en respuesta vuelve como `templateId`).
  fromTemplateId?: string
  // Compatibilidad con UI vieja: si viene aquí lo mapeamos a fromTemplateId.
  templateId?: string
  weekEnd?: string                  // ignorado por backend, derivado de weekStart
  saveAsTemplate?: boolean          // ignorado por backend; el FE lo materializa con un POST extra
}

export interface UpdateMeshDto {
  name?: string
  weekStart?: string
  zoneId?: string
  isRecurring?: boolean
}

export interface CloneMeshDto {
  weekStart: string
  name?: string
}

export interface ListMeshesParams {
  // Filtro principal: lista de zoneIds permitidos para el usuario. Si viene
  // undefined (SuperAdmin con acceso total) se devuelven todas las mallas.
  allowedZoneIds?: string[]
  zoneId?: string
  state?: MeshState | null
}

// ---------- Warnings & errores estructurados (backend-shaped) ----------

// Algunos endpoints retornan `warnings: string[]` junto al payload normal.
// Las strings vienen ya en español, listas para mostrar al usuario.
export interface WithWarnings<T> {
  data: T
  warnings: string[]
}

// 409 — overlap dentro de la misma malla al crear/editar un shift.
export interface SingleOverlapDetail {
  kind: 'within-single'
  conflictingShiftId: string
  conflictingTimeRange: string
  conflictingDayOfWeek: DayOfWeek
}

// 409 — overlap dentro de la malla al publicar (puede haber varios riders
// con varios solapamientos).
export interface MultiOverlapGroup {
  riderId: string
  riderName: string
  dayOfWeek: DayOfWeek
  shiftIds: string[]
}
export interface MultiOverlapDetail {
  kind: 'within-multi'
  conflicts: MultiOverlapGroup[]
}

// 409 — transición de estado inválida.
export interface StateMachineDetail {
  kind: 'state-machine'
  currentState: MeshState
}

// 409 — clone hacia una weekStart ya ocupada por otra malla en la misma zona.
export interface CloneDuplicateDetail {
  kind: 'clone-duplicate'
  existingMeshId: string
}

export type ScheduleErrorDetails =
  | SingleOverlapDetail
  | MultiOverlapDetail
  | StateMachineDetail
  | CloneDuplicateDetail

// Wrapper sobre Error que carga los detalles estructurados que devuelve el
// backend en respuestas 409. La UI puede hacer `instanceof ScheduleApiError`
// para sacar la rama correcta y reaccionar (resaltar shifts, ofrecer CTA).
export class ScheduleApiError extends Error {
  details: ScheduleErrorDetails
  constructor(message: string, details: ScheduleErrorDetails) {
    super(message)
    this.name = 'ScheduleApiError'
    this.details = details
  }
}
