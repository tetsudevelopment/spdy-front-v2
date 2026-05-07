// Cliente HTTP del módulo Mallas de Turno (24 endpoints, ver
// docs/modules/mallas-de-turno.md del backend). Todas las llamadas viajan
// con JWT (vía `authenticatedFetch`) y header `X-Commerce-ID`.
//
// El backend define el wire format en inglés:
//   - states: 'draft' | 'published' | 'archived'
//   - listas planas (sin paginación) — el FE filtra in-memory
//   - errores 409 estructurados (ver `ScheduleApiError` en types)
//   - warnings: string[] en español, ya formateados — la UI los muestra tal cual
//
// Mantenemos el alias `status` además de `state` en `ScheduledMesh` para
// reducir blast radius en componentes existentes.

import { z } from 'zod'
import { authenticatedFetch } from '~/services/http.client'
import {
  ScheduleApiError,
  type CloneMeshDto,
  type CreateMeshDto,
  type CreateMeshShiftDto,
  type CreateTemplateDto,
  type ListMeshesParams,
  type MeshShift,
  type MeshState,
  type ScheduleErrorDetails,
  type ScheduleTemplate,
  type ScheduledMeshDetail,
  type ScheduledMeshListItem,
  type TemplateShift,
  type UpdateMeshDto,
  type UpdateMeshShiftDto,
  type UpdateTemplateDto,
  type WithWarnings,
} from '../types/schedule.types'
import { addDays, parseIsoDate, toIsoDate } from '../utils/schedule.utils'

// ---------- Helpers de URL/headers ----------

function templateBase(commerceId: string): string {
  return `/commerce/${commerceId}/shift-templates`
}

function meshBase(commerceId: string): string {
  return `/commerce/${commerceId}/scheduled-meshes`
}

function shiftBase(commerceId: string, meshId: string): string {
  return `${meshBase(commerceId)}/${meshId}/shifts`
}

function tenantHeaders(commerceId: string): Record<string, string> {
  return { 'X-Commerce-ID': commerceId }
}

// ---------- Zod schemas (defensivos: aceptan campos opcionales por tolerancia) ----------

const dayOfWeekSchema = z.enum([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
])

const stateSchema = z.enum(['draft', 'published', 'archived'])

const riderRefSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  photoUrl: z.string().nullish(),
  vehicleType: z.string(),
})

const pdvRefSchema = z.object({
  id: z.string(),
  name: z.string(),
}).nullable().optional()

const zoneRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  commerceId: z.string().nullable().optional(),
  isGlobal: z.boolean().optional(),
}).nullable().optional()

// El backend serializa columnas opcionales como `null` (no las omite). Los
// campos string opcionales aceptan `string | null | undefined` para no
// reventar el parse cuando el shift se creó sin PdV / sin notas — el mapper
// abajo los normaliza a `undefined` para alinear con el tipo FE `MeshShift`.
const meshShiftSchema = z.object({
  id: z.string(),
  riderId: z.string(),
  dayOfWeek: dayOfWeekSchema,
  startTime: z.string(),
  endTime: z.string(),
  pdvId: z.string().nullish(),
  zoneId: z.string().nullish(),
  notes: z.string().nullish(),
  rider: riderRefSchema,
  pdv: pdvRefSchema,
  zone: zoneRefSchema,
})

// Campos planos que viajan tanto en list como en detail. El detail extiende
// agregando refs expandidos (zone, shifts, commerce, template).
const meshBaseSchema = z.object({
  id: z.string(),
  commerceId: z.string(),
  name: z.string(),
  zoneId: z.string(),
  weekStart: z.string(),
  isRecurring: z.boolean().optional().default(false),
  state: stateSchema,
  templateId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
})

// LIST: items planos sin refs expandidos. El catálogo de zonas en el store
// resuelve color/nombre por zoneId localmente.
const meshListItemSchema = meshBaseSchema

// DETAIL: agrega zone (requerido), shifts, commerce y template.
const meshDetailSchema = meshBaseSchema.extend({
  shifts: z.array(meshShiftSchema).optional().default([]),
  zone: z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    commerceId: z.string().nullable().optional(),
    isGlobal: z.boolean().optional(),
  }),
  commerce: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  template: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
})

// Mismo principio que meshShiftSchema: los string opcionales pueden venir
// como `null` en el wire format, los normalizamos a undefined en el mapper.
const templateItemSchema = z.object({
  id: z.string(),
  dayOfWeek: dayOfWeekSchema,
  startTime: z.string(),
  endTime: z.string(),
  pdvId: z.string().nullish(),
  zoneId: z.string().nullish(),
  riderId: z.string().nullish(),
  notes: z.string().nullish(),
})

const templateSchema = z.object({
  id: z.string(),
  commerceId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  items: z.array(templateItemSchema).optional().default([]),
  // Algunos endpoints podrían exponer `shifts` como alias — lo aceptamos.
  shifts: z.array(templateItemSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
})

const warningsSchema = z.array(z.string()).optional().default([])

// Forma genérica usada por endpoints que adjuntan warnings al payload.
function extractWarnings(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return []
  const w = (raw as { warnings?: unknown }).warnings
  return warningsSchema.parse(w)
}

// El backend envuelve los endpoints que pueden retornar warnings:
//   { mesh: {...}, warnings: [...] }     // create/publish/archive/clone mesh
//   { shift: {...}, warnings: [...] }    // create/update shift
// `unwrap` separa el wrapper y devuelve la entidad lista para validar con
// Zod. Si la respuesta vino plana (algún endpoint sin wrapper), la pasa tal
// cual — así el helper sirve también como tolerancia futura.
function unwrap(raw: unknown, key: 'mesh' | 'shift'): { entity: unknown; warnings: string[] } {
  if (typeof raw === 'object' && raw !== null && key in raw) {
    const r = raw as Record<string, unknown>
    return { entity: r[key], warnings: extractWarnings(raw) }
  }
  return { entity: raw, warnings: extractWarnings(raw) }
}

// ---------- Mappers wire → modelo FE ----------

function deriveWeekEnd(weekStart: string): string {
  const d = parseIsoDate(weekStart)
  if (!d) return weekStart
  return toIsoDate(addDays(d, 6))
}

function mapMeshListItem(raw: unknown): ScheduledMeshListItem {
  const parsed = meshListItemSchema.parse(raw)
  return {
    id: parsed.id,
    commerceId: parsed.commerceId,
    zoneId: parsed.zoneId,
    name: parsed.name,
    weekStart: parsed.weekStart,
    weekEnd: deriveWeekEnd(parsed.weekStart),
    state: parsed.state,
    status: parsed.state,
    isRecurring: parsed.isRecurring,
    templateId: parsed.templateId ?? null,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  }
}

function mapMeshDetail(raw: unknown): ScheduledMeshDetail {
  const parsed = meshDetailSchema.parse(raw)
  const shifts: MeshShift[] = parsed.shifts.map((s) => ({
    id: s.id,
    meshId: parsed.id,
    riderId: s.riderId,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    // El wire format devuelve null para campos vacíos; el tipo FE espera
    // string | undefined. Normalizamos acá una sola vez.
    pdvId: s.pdvId ?? undefined,
    zoneId: s.zoneId ?? undefined,
    notes: s.notes ?? undefined,
    rider: { ...s.rider, photoUrl: s.rider.photoUrl ?? undefined },
    pdv: s.pdv ?? undefined,
    zone: s.zone ?? undefined,
  }))
  return {
    id: parsed.id,
    commerceId: parsed.commerceId,
    zoneId: parsed.zoneId,
    name: parsed.name,
    weekStart: parsed.weekStart,
    weekEnd: deriveWeekEnd(parsed.weekStart),
    state: parsed.state,
    status: parsed.state,
    isRecurring: parsed.isRecurring,
    templateId: parsed.templateId ?? null,
    shifts,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    zone: {
      id: parsed.zone.id,
      name: parsed.zone.name,
      color: parsed.zone.color,
      commerceId: parsed.zone.commerceId ?? null,
      isGlobal: parsed.zone.isGlobal,
    },
    commerce: parsed.commerce ?? null,
    template: parsed.template ?? null,
  }
}

function mapShift(raw: unknown, meshId: string): MeshShift {
  const s = meshShiftSchema.parse(raw)
  return {
    id: s.id,
    meshId,
    riderId: s.riderId,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    pdvId: s.pdvId ?? undefined,
    zoneId: s.zoneId ?? undefined,
    notes: s.notes ?? undefined,
    rider: { ...s.rider, photoUrl: s.rider.photoUrl ?? undefined },
    pdv: s.pdv ?? undefined,
    zone: s.zone ?? undefined,
  }
}

function mapTemplate(raw: unknown): ScheduleTemplate {
  const parsed = templateSchema.parse(raw)
  const items = parsed.items.length > 0 ? parsed.items : (parsed.shifts ?? [])
  const shifts: TemplateShift[] = items.map((item) => ({
    id: item.id,
    dayOfWeek: item.dayOfWeek,
    startTime: item.startTime,
    endTime: item.endTime,
    pdvId: item.pdvId ?? undefined,
    zoneId: item.zoneId ?? undefined,
    riderId: item.riderId ?? undefined,
    notes: item.notes ?? undefined,
  }))
  return {
    id: parsed.id,
    commerceId: parsed.commerceId,
    name: parsed.name,
    description: parsed.description,
    shifts,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  }
}

// ---------- Detección y wrapping de errores 409 estructurados ----------

interface FetchErrorLike {
  statusCode?: number
  status?: number
  response?: { status?: number }
  data?: { error?: string; message?: string } & Record<string, unknown>
  message?: string
}

function asFetchError(err: unknown): FetchErrorLike | null {
  if (typeof err !== 'object' || err === null) return null
  return err as FetchErrorLike
}

function statusOf(err: FetchErrorLike): number | null {
  return err.statusCode ?? err.status ?? err.response?.status ?? null
}

function messageOf(err: FetchErrorLike): string {
  return err.data?.error ?? err.data?.message ?? err.message ?? 'Error inesperado'
}

// Matchea el shape estructurado de un 409 contra los 4 tipos conocidos.
function detectErrorDetails(err: FetchErrorLike): ScheduleErrorDetails | null {
  const data = err.data
  if (!data || typeof data !== 'object') return null

  // Single overlap (within-mesh, en POST/PATCH shift)
  if (typeof data.conflictingShiftId === 'string') {
    return {
      kind: 'within-single',
      conflictingShiftId: data.conflictingShiftId,
      conflictingTimeRange: typeof data.conflictingTimeRange === 'string'
        ? data.conflictingTimeRange
        : '',
      conflictingDayOfWeek: data.conflictingDayOfWeek as SingleOverlapDayCast,
    }
  }
  // Multi overlap (within-mesh, en publish)
  if (Array.isArray(data.conflicts)) {
    const conflicts = data.conflicts
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        riderId: String(c.riderId ?? ''),
        riderName: String(c.riderName ?? ''),
        dayOfWeek: c.dayOfWeek as SingleOverlapDayCast,
        shiftIds: Array.isArray(c.shiftIds) ? c.shiftIds.map(String) : [],
      }))
    return { kind: 'within-multi', conflicts }
  }
  // State machine
  if (typeof data.currentState === 'string'
      && (data.currentState === 'draft'
          || data.currentState === 'published'
          || data.currentState === 'archived')) {
    return { kind: 'state-machine', currentState: data.currentState }
  }
  // Clone duplicate
  if (typeof data.existingMeshId === 'string') {
    return { kind: 'clone-duplicate', existingMeshId: data.existingMeshId }
  }
  return null
}

// Cast inocuo: el backend manda day strings que coinciden con el enum;
// confiamos en el contrato y narrowingeamos al tipo nominal.
type SingleOverlapDayCast = ScheduleErrorDetails extends { conflictingDayOfWeek: infer D } ? D : never

// Re-throw con tipo enriquecido cuando aplica; deja el original si no.
function rethrow(err: unknown): never {
  const fe = asFetchError(err)
  if (fe && statusOf(fe) === 409) {
    const details = detectErrorDetails(fe)
    if (details) throw new ScheduleApiError(messageOf(fe), details)
  }
  throw err
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    rethrow(err)
  }
}

// ---------- Service ----------

export const ScheduleService = {

  // ===================== Templates =====================

  async listTemplates(commerceId: string): Promise<ScheduleTemplate[]> {
    const raw = await call(() => authenticatedFetch<unknown[]>(templateBase(commerceId), {
      headers: tenantHeaders(commerceId),
    }))
    if (!Array.isArray(raw)) return []
    return raw.map(mapTemplate)
  },

  async getTemplate(commerceId: string, templateId: string): Promise<ScheduleTemplate> {
    const raw = await call(() => authenticatedFetch<unknown>(`${templateBase(commerceId)}/${templateId}`, {
      headers: tenantHeaders(commerceId),
    }))
    return mapTemplate(raw)
  },

  // POST template = solo metadata. Los items van por endpoint dedicado; tras
  // crear el template le agregamos cada item en serie y volvemos a leer el
  // detalle con todo expandido (refs y count consistentes).
  async createTemplate(
    commerceId: string,
    dto: CreateTemplateDto,
  ): Promise<ScheduleTemplate> {
    const created = await call(() => authenticatedFetch<unknown>(templateBase(commerceId), {
      method: 'POST',
      body: { name: dto.name, description: dto.description ?? undefined },
      headers: tenantHeaders(commerceId),
    }))
    const parsed = templateSchema.parse(created)
    if (dto.shifts.length > 0) {
      for (const item of dto.shifts) {
        await call(() => authenticatedFetch<unknown>(`${templateBase(commerceId)}/${parsed.id}/items`, {
          method: 'POST',
          body: item,
          headers: tenantHeaders(commerceId),
        }))
      }
    }
    return ScheduleService.getTemplate(commerceId, parsed.id)
  },

  // Update orquesta: PATCH metadata si cambió + reemplaza items completos.
  // Estrategia simple: borra todos los existentes y reinserta. Acceptable
  // mientras el editor del FE no preserve los itemIds originales.
  async updateTemplate(
    commerceId: string,
    templateId: string,
    dto: UpdateTemplateDto,
  ): Promise<ScheduleTemplate> {
    const metadata: Record<string, unknown> = {}
    if (dto.name !== undefined) metadata.name = dto.name
    if (dto.description !== undefined) metadata.description = dto.description
    if (Object.keys(metadata).length > 0) {
      await call(() => authenticatedFetch<unknown>(`${templateBase(commerceId)}/${templateId}`, {
        method: 'PATCH',
        body: metadata,
        headers: tenantHeaders(commerceId),
      }))
    }
    if (dto.shifts !== undefined) {
      const current = await ScheduleService.getTemplate(commerceId, templateId)
      for (const existing of current.shifts) {
        await call(() => authenticatedFetch<unknown>(
          `${templateBase(commerceId)}/${templateId}/items/${existing.id}`,
          { method: 'DELETE', headers: tenantHeaders(commerceId) },
        ))
      }
      for (const item of dto.shifts) {
        await call(() => authenticatedFetch<unknown>(
          `${templateBase(commerceId)}/${templateId}/items`,
          { method: 'POST', body: item, headers: tenantHeaders(commerceId) },
        ))
      }
    }
    return ScheduleService.getTemplate(commerceId, templateId)
  },

  async deleteTemplate(commerceId: string, templateId: string): Promise<void> {
    await call(() => authenticatedFetch(`${templateBase(commerceId)}/${templateId}`, {
      method: 'DELETE',
      headers: tenantHeaders(commerceId),
    }))
  },

  // ===================== Meshes =====================

  // Lista plana scoped a un commerce. El store agrega filtros in-memory
  // (allowedZoneIds, zoneId, state) cuando consume; pasamos los que entiende
  // el backend para reducir transferencia.
  async listMeshes(
    commerceId: string,
    params: ListMeshesParams = {},
  ): Promise<ScheduledMeshListItem[]> {
    const query: Record<string, string | number | boolean> = {}
    if (params.state) query.state = params.state
    if (params.zoneId) query.zoneId = params.zoneId
    const raw = await call(() => authenticatedFetch<unknown[]>(meshBase(commerceId), {
      query,
      headers: tenantHeaders(commerceId),
    }))
    if (!Array.isArray(raw)) return []
    const meshes = raw.map(mapMeshListItem)
    if (params.allowedZoneIds !== undefined) {
      const allowed = new Set(params.allowedZoneIds)
      return meshes.filter((m) => allowed.has(m.zoneId))
    }
    return meshes
  },

  async getMesh(commerceId: string, meshId: string): Promise<ScheduledMeshDetail> {
    const raw = await call(() => authenticatedFetch<unknown>(`${meshBase(commerceId)}/${meshId}`, {
      headers: tenantHeaders(commerceId),
    }))
    return mapMeshDetail(raw)
  },

  // Backend acepta `fromTemplateId` y opcionalmente devuelve warnings
  // ("3 items del template no fueron creados porque no tenían rider asignado").
  // La respuesta de creación SÍ trae refs expandidos — usa el detail mapper.
  async createMesh(
    commerceId: string,
    dto: CreateMeshDto,
  ): Promise<WithWarnings<ScheduledMeshDetail>> {
    const body: Record<string, unknown> = {
      name: dto.name,
      zoneId: dto.zoneId,
      weekStart: dto.weekStart,
      isRecurring: dto.isRecurring ?? false,
    }
    const fromTemplateId = dto.fromTemplateId ?? dto.templateId
    if (fromTemplateId) body.fromTemplateId = fromTemplateId

    const raw = await call(() => authenticatedFetch<unknown>(meshBase(commerceId), {
      method: 'POST',
      body,
      headers: tenantHeaders(commerceId),
    }))
    const { entity, warnings } = unwrap(raw, 'mesh')
    return { data: mapMeshDetail(entity), warnings }
  },

  // Solo aceptado en state='draft'. Backend responde 409 state-machine si no.
  async updateMesh(
    commerceId: string,
    meshId: string,
    dto: UpdateMeshDto,
  ): Promise<ScheduledMeshDetail> {
    const raw = await call(() => authenticatedFetch<unknown>(`${meshBase(commerceId)}/${meshId}`, {
      method: 'PATCH',
      body: dto,
      headers: tenantHeaders(commerceId),
    }))
    return mapMeshDetail(raw)
  },

  async deleteMesh(commerceId: string, meshId: string): Promise<void> {
    await call(() => authenticatedFetch(`${meshBase(commerceId)}/${meshId}`, {
      method: 'DELETE',
      headers: tenantHeaders(commerceId),
    }))
  },

  // draft → published. Devuelve la malla actualizada + warnings cross-mesh.
  // (El helper `authenticatedFetch` inyecta `{}` automáticamente en POSTs
  // sin body — ver http.client.ts.)
  async publishMesh(
    commerceId: string,
    meshId: string,
  ): Promise<WithWarnings<ScheduledMeshDetail>> {
    const raw = await call(() => authenticatedFetch<unknown>(
      `${meshBase(commerceId)}/${meshId}/publish`,
      { method: 'POST', headers: tenantHeaders(commerceId) },
    ))
    const { entity, warnings } = unwrap(raw, 'mesh')
    return { data: mapMeshDetail(entity), warnings }
  },

  // published → archived. El backend envuelve en `{ mesh: {...} }` aunque no
  // lleve warnings, por consistencia con publish/clone.
  async archiveMesh(commerceId: string, meshId: string): Promise<ScheduledMeshDetail> {
    const raw = await call(() => authenticatedFetch<unknown>(
      `${meshBase(commerceId)}/${meshId}/archive`,
      { method: 'POST', headers: tenantHeaders(commerceId) },
    ))
    const { entity } = unwrap(raw, 'mesh')
    return mapMeshDetail(entity)
  },

  async cloneMesh(
    commerceId: string,
    meshId: string,
    dto: CloneMeshDto,
  ): Promise<WithWarnings<ScheduledMeshDetail>> {
    const raw = await call(() => authenticatedFetch<unknown>(
      `${meshBase(commerceId)}/${meshId}/clone`,
      { method: 'POST', body: dto, headers: tenantHeaders(commerceId) },
    ))
    const { entity, warnings } = unwrap(raw, 'mesh')
    return { data: mapMeshDetail(entity), warnings }
  },

  // ===================== Shifts dentro de una malla =====================

  async addShiftToMesh(
    commerceId: string,
    meshId: string,
    dto: CreateMeshShiftDto,
  ): Promise<WithWarnings<MeshShift>> {
    const raw = await call(() => authenticatedFetch<unknown>(shiftBase(commerceId, meshId), {
      method: 'POST',
      body: dto,
      headers: tenantHeaders(commerceId),
    }))
    const { entity, warnings } = unwrap(raw, 'shift')
    return { data: mapShift(entity, meshId), warnings }
  },

  async updateShiftInMesh(
    commerceId: string,
    meshId: string,
    shiftId: string,
    dto: UpdateMeshShiftDto,
  ): Promise<WithWarnings<MeshShift>> {
    const raw = await call(() => authenticatedFetch<unknown>(
      `${shiftBase(commerceId, meshId)}/${shiftId}`,
      { method: 'PATCH', body: dto, headers: tenantHeaders(commerceId) },
    ))
    const { entity, warnings } = unwrap(raw, 'shift')
    return { data: mapShift(entity, meshId), warnings }
  },

  async removeShiftFromMesh(
    commerceId: string,
    meshId: string,
    shiftId: string,
  ): Promise<void> {
    await call(() => authenticatedFetch(
      `${shiftBase(commerceId, meshId)}/${shiftId}`,
      { method: 'DELETE', headers: tenantHeaders(commerceId) },
    ))
  },
}

// Tipo helper exportado para que el store/UI sepan tipear los retornos.
export type { MeshState, WithWarnings, ScheduleErrorDetails }
