import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { humanizeAuthError } from '~/utils/error.utils'
import { ScheduleService } from '../services/schedule.service'
import { PdvService } from '~/modules/pdv/services/pdv.service'
import { RidersService } from '~/modules/riders/services/riders.service'
import { ZonesService } from '~/modules/zones/services/zones.service'
import type { PointOfSale } from '~/modules/pdv/types/pdv.types'
import type { Rider, ZoneSummary } from '~/modules/riders/types/rider.types'
import type { Zone } from '~/modules/zones/types/zone.types'
import {
  ScheduleApiError,
  type CloneMeshDto,
  type CreateMeshDto,
  type CreateMeshShiftDto,
  type CreateTemplateDto,
  type MeshShift,
  type MeshState,
  type ScheduleErrorDetails,
  type ScheduleTemplate,
  type ScheduledMeshDetail,
  type ScheduledMeshListItem,
  type UpdateMeshDto,
  type UpdateMeshShiftDto,
  type UpdateTemplateDto,
  type ZoneRef,
} from '../types/schedule.types'

interface CommerceRef {
  commerceId: string
  commerceName: string
}

// Template enriquecido con el nombre del commerce dueño — el dashboard lo
// muestra como subtítulo cuando el usuario tiene varios commerces.
export interface TemplateWithCommerce extends ScheduleTemplate {
  commerceName?: string
}

export const useScheduleStore = defineStore('schedule', () => {
  // Tenant / rol
  const accessibleCommerces = ref<CommerceRef[]>([])
  const isSuperAdmin = ref<boolean>(false)

  // Catálogos globales
  const availableZones = ref<Zone[]>([])
  const riders = ref<Rider[]>([])
  const pdvs = ref<PointOfSale[]>([])
  const zoneSummaries = ref<ZoneSummary[]>([])

  // Datos
  const templates = ref<TemplateWithCommerce[]>([])
  // `meshes` es la lista plana del dashboard (sin refs expandidos). Las
  // mutaciones (create/publish/clone) reciben Detail; lo guardamos como
  // ListItem porque Detail es un superset estructural y la tabla no necesita
  // los refs (los resuelve por zoneId contra el catálogo de zonas).
  const meshes = ref<ScheduledMeshListItem[]>([])
  // `currentMesh` es el mesh abierto en el detail; aquí sí queremos refs
  // expandidos (zone, shifts, commerce, template).
  const currentMesh = ref<ScheduledMeshDetail | null>(null)
  const currentTemplate = ref<ScheduleTemplate | null>(null)

  // Filtros del dashboard
  const meshZoneFilter = ref<string | null>(null)
  const meshStatusFilter = ref<MeshState | null>(null)

  // Estado UI
  const isLoading = ref<boolean>(false)
  const isSaving = ref<boolean>(false)
  const error = ref<string | null>(null)

  // Detalles del último error 409 estructurado — la UI los lee para
  // resaltar shifts conflictivos, ofrecer CTA "Ir a malla existente", etc.
  const lastErrorDetails = ref<ScheduleErrorDetails | null>(null)
  // IDs de shifts a resaltar tras un overlap dentro de la malla. La grilla
  // los pinta con borde rojo. La UI lo limpia al cerrar el aviso.
  const highlightedShiftIds = ref<Set<string>>(new Set())

  // Lookups
  const riderById = computed<Map<string, Rider>>(() => {
    const map = new Map<string, Rider>()
    for (const r of riders.value) map.set(r.id, r)
    return map
  })
  const pdvById = computed<Map<string, PointOfSale>>(() => {
    const map = new Map<string, PointOfSale>()
    for (const p of pdvs.value) map.set(p.id, p)
    return map
  })
  const zoneById = computed<Map<string, Zone | ZoneSummary>>(() => {
    const map = new Map<string, Zone | ZoneSummary>()
    for (const z of availableZones.value) map.set(z.id, z)
    for (const z of zoneSummaries.value) if (!map.has(z.id)) map.set(z.id, z)
    return map
  })
  const commerceNameById = computed<Map<string, string>>(() => {
    const map = new Map<string, string>()
    for (const c of accessibleCommerces.value) map.set(c.commerceId, c.commerceName)
    return map
  })

  const allowedZoneIdsComputed = computed<string[] | undefined>(() => {
    if (isSuperAdmin.value) return undefined
    return availableZones.value.map((z) => z.id)
  })

  const filteredMeshes = computed<ScheduledMeshListItem[]>(() => {
    return meshes.value.filter((m) => {
      if (meshZoneFilter.value && m.zoneId !== meshZoneFilter.value) return false
      if (meshStatusFilter.value && m.state !== meshStatusFilter.value) return false
      return true
    })
  })

  const totalTemplates = computed<number>(() => templates.value.length)
  const totalMeshes = computed<number>(() => meshes.value.length)
  const publishedMeshes = computed<number>(
    () => meshes.value.filter((m) => m.state === 'published').length,
  )

  // Deduplica zonas por id — puede venir la misma zona global varias veces si
  // está asignada a >1 commerces del usuario.
  function dedupeZones(list: Zone[]): Zone[] {
    const seen = new Map<string, Zone>()
    for (const z of list) if (!seen.has(z.id)) seen.set(z.id, z)
    return Array.from(seen.values())
  }

  // Resuelve el commerceId que aloja la malla. El backend scope-a las mallas
  // por commerce vía URL: si la zona es privada, el commerce es el dueño;
  // si es global, fallback al primero accesible (el operador podrá luego
  // mover/recrear si quiere otro tenant).
  function resolveMeshCommerceId(zoneRef: ZoneRef): string | null {
    if (zoneRef.commerceId) return zoneRef.commerceId
    return accessibleCommerces.value[0]?.commerceId ?? null
  }

  // Localiza la malla en el store y devuelve su commerceId — necesario para
  // construir la URL en cualquier mutación posterior.
  function commerceIdForMesh(meshId: string): string | null {
    const local = meshes.value.find((m) => m.id === meshId)
      ?? (currentMesh.value?.id === meshId ? currentMesh.value : null)
    return local?.commerceId ?? null
  }

  // ---------- Manejo uniforme de errores ----------
  // Captura ScheduleApiError → guarda detalles para la UI; el resto pasa por
  // humanizeAuthError. Siempre re-lanza para que el llamador decida.
  function handleError(e: unknown): never {
    if (e instanceof ScheduleApiError) {
      lastErrorDetails.value = e.details
      // Para overlaps within-mesh sembramos los IDs a resaltar.
      if (e.details.kind === 'within-single') {
        highlightedShiftIds.value = new Set([e.details.conflictingShiftId])
      } else if (e.details.kind === 'within-multi') {
        highlightedShiftIds.value = new Set(
          e.details.conflicts.flatMap((c) => c.shiftIds),
        )
      }
      error.value = e.message
      throw e
    }
    const msg = humanizeAuthError(e)
    error.value = msg
    throw new Error(msg)
  }

  function clearStructuredError(): void {
    lastErrorDetails.value = null
    highlightedShiftIds.value = new Set()
  }

  // ---------- Access / bootstrap ----------

  function configureAccess(
    opts: { isSuperAdmin: boolean; commerces: CommerceRef[] },
  ): void {
    isSuperAdmin.value = opts.isSuperAdmin
    accessibleCommerces.value = opts.commerces
  }

  async function fetchAvailableZones(): Promise<void> {
    error.value = null
    try {
      const collected: Zone[] = []
      if (isSuperAdmin.value) {
        const globals = await ZonesService.getAll({ page: 1, limit: 100 })
        collected.push(...globals.data)
        for (const c of accessibleCommerces.value) {
          const res = await ZonesService.getAll({ page: 1, limit: 100, commerceId: c.commerceId })
          collected.push(...res.data)
        }
      } else {
        for (const c of accessibleCommerces.value) {
          const res = await ZonesService.getAll({ page: 1, limit: 100, commerceId: c.commerceId })
          collected.push(...res.data)
        }
      }
      availableZones.value = dedupeZones(collected).filter((z) => z.isActive)
    } catch (e) {
      error.value = humanizeAuthError(e)
    }
  }

  async function loadCatalogsForCommerce(commerceId: string | null): Promise<void> {
    if (!commerceId) {
      riders.value = []
      pdvs.value = []
      zoneSummaries.value = []
      return
    }
    try {
      await Promise.all([
        RidersService.getAll(commerceId, { page: 1, limit: 100 }).then((r) => {
          riders.value = r.data
        }).catch((e) => { error.value = humanizeAuthError(e) }),
        PdvService.getAll(commerceId, { page: 1, limit: 100 }).then((r) => {
          pdvs.value = r.data
        }).catch((e) => { error.value = humanizeAuthError(e) }),
        RidersService.listZonesForCommerce(commerceId).then((list) => {
          zoneSummaries.value = list.filter((z) => z.isActive)
        }).catch((e) => { error.value = humanizeAuthError(e) }),
      ])
    } catch (e) {
      error.value = humanizeAuthError(e)
    }
  }

  // ---------- Templates ----------

  async function fetchAllTemplates(): Promise<void> {
    if (accessibleCommerces.value.length === 0) {
      templates.value = []
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const all: TemplateWithCommerce[] = []
      for (const c of accessibleCommerces.value) {
        const list = await ScheduleService.listTemplates(c.commerceId)
        for (const t of list) {
          all.push({ ...t, commerceName: c.commerceName })
        }
      }
      templates.value = all
    } catch (e) {
      error.value = humanizeAuthError(e)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchTemplateById(
    commerceId: string,
    templateId: string,
  ): Promise<ScheduleTemplate | null> {
    error.value = null
    try {
      const tpl = await ScheduleService.getTemplate(commerceId, templateId)
      currentTemplate.value = tpl
      const idx = templates.value.findIndex((t) => t.id === templateId)
      if (idx !== -1) {
        templates.value[idx] = {
          ...tpl,
          commerceName: templates.value[idx]?.commerceName,
        }
      }
      return tpl
    } catch (e) {
      // Una 404 al buscar template en otro commerce es esperado durante el
      // loop de "find-by-id" del editor — no es un error visible.
      return null
    }
  }

  async function createTemplate(
    commerceId: string,
    dto: CreateTemplateDto,
  ): Promise<ScheduleTemplate> {
    isSaving.value = true
    error.value = null
    try {
      const created = await ScheduleService.createTemplate(commerceId, dto)
      templates.value = [
        ...templates.value,
        { ...created, commerceName: commerceNameById.value.get(commerceId) },
      ]
      return created
    } catch (e) {
      handleError(e)
    } finally {
      isSaving.value = false
    }
  }

  async function updateTemplate(
    commerceId: string,
    templateId: string,
    dto: UpdateTemplateDto,
  ): Promise<ScheduleTemplate> {
    isSaving.value = true
    error.value = null
    try {
      const updated = await ScheduleService.updateTemplate(commerceId, templateId, dto)
      const idx = templates.value.findIndex((t) => t.id === templateId)
      if (idx !== -1) {
        templates.value[idx] = {
          ...updated,
          commerceName: templates.value[idx]?.commerceName,
        }
      }
      if (currentTemplate.value?.id === templateId) currentTemplate.value = updated
      return updated
    } catch (e) {
      handleError(e)
    } finally {
      isSaving.value = false
    }
  }

  async function deleteTemplate(commerceId: string, templateId: string): Promise<void> {
    error.value = null
    try {
      await ScheduleService.deleteTemplate(commerceId, templateId)
      templates.value = templates.value.filter((t) => t.id !== templateId)
      if (currentTemplate.value?.id === templateId) currentTemplate.value = null
    } catch (e) {
      handleError(e)
    }
  }

  // ---------- Meshes ----------

  // El backend scope-a mallas por commerce. Iteramos los accesibles y
  // concatenamos. El filtro por allowedZoneIds y la dedupe quedan in-memory.
  async function fetchMeshes(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const collected: ScheduledMeshListItem[] = []
      const seen = new Set<string>()
      for (const c of accessibleCommerces.value) {
        const list = await ScheduleService.listMeshes(c.commerceId, {
          allowedZoneIds: allowedZoneIdsComputed.value,
        })
        for (const m of list) {
          if (!seen.has(m.id)) {
            seen.add(m.id)
            collected.push(m)
          }
        }
      }
      meshes.value = collected
    } catch (e) {
      error.value = humanizeAuthError(e)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchMeshById(meshId: string): Promise<ScheduledMeshDetail | null> {
    isLoading.value = true
    error.value = null
    try {
      // Si ya conocemos el commerce de este meshId, vamos directo. Si no,
      // probamos contra cada commerce accesible hasta encontrarlo.
      const known = commerceIdForMesh(meshId)
      const candidates = known
        ? [known]
        : accessibleCommerces.value.map((c) => c.commerceId)
      for (const cId of candidates) {
        try {
          const mesh = await ScheduleService.getMesh(cId, meshId)
          currentMesh.value = mesh
          const idx = meshes.value.findIndex((m) => m.id === meshId)
          if (idx !== -1) meshes.value[idx] = mesh
          else meshes.value = [...meshes.value, mesh]
          return mesh
        } catch {
          // 404 en este commerce; sigue probando.
        }
      }
      return null
    } finally {
      isLoading.value = false
    }
  }

  // Expone el lookup de zona (con commerceId) — útil para consumidores.
  function resolveZoneRef(zoneId: string): ZoneRef | null {
    const z = availableZones.value.find((x) => x.id === zoneId)
    if (!z) return null
    return {
      id: z.id,
      name: z.name,
      color: z.color,
      commerceId: z.commerceId ?? null,
      isGlobal: z.isGlobal,
    }
  }

  // Devuelve la malla creada + warnings que el backend adjuntó (ej: items del
  // template sin rider que no se materializaron). La UI muestra los warnings
  // como toast informativo después de la navegación.
  async function createMesh(
    dto: CreateMeshDto,
  ): Promise<{ mesh: ScheduledMeshDetail; warnings: string[] }> {
    const zoneRef = resolveZoneRef(dto.zoneId)
    if (!zoneRef) throw new Error('La zona seleccionada ya no está disponible')
    const commerceId = resolveMeshCommerceId(zoneRef)
    if (!commerceId) throw new Error('No hay un comercio destino para alojar la malla')

    isSaving.value = true
    error.value = null
    clearStructuredError()
    try {
      const { data: created, warnings } = await ScheduleService.createMesh(commerceId, dto)
      meshes.value = [...meshes.value, created]
      return { mesh: created, warnings }
    } catch (e) {
      handleError(e)
    } finally {
      isSaving.value = false
    }
  }

  async function updateMesh(meshId: string, dto: UpdateMeshDto): Promise<ScheduledMeshDetail> {
    const cId = commerceIdForMesh(meshId)
    if (!cId) throw new Error('No se pudo localizar el comercio de la malla')
    isSaving.value = true
    error.value = null
    clearStructuredError()
    try {
      const updated = await ScheduleService.updateMesh(cId, meshId, dto)
      const idx = meshes.value.findIndex((m) => m.id === meshId)
      if (idx !== -1) meshes.value[idx] = updated
      if (currentMesh.value?.id === meshId) currentMesh.value = updated
      return updated
    } catch (e) {
      handleError(e)
    } finally {
      isSaving.value = false
    }
  }

  async function deleteMesh(meshId: string): Promise<void> {
    const cId = commerceIdForMesh(meshId)
    if (!cId) throw new Error('No se pudo localizar el comercio de la malla')
    error.value = null
    try {
      await ScheduleService.deleteMesh(cId, meshId)
      meshes.value = meshes.value.filter((m) => m.id !== meshId)
      if (currentMesh.value?.id === meshId) currentMesh.value = null
    } catch (e) {
      handleError(e)
    }
  }

  async function publishMesh(
    meshId: string,
  ): Promise<{ mesh: ScheduledMeshDetail; warnings: string[] }> {
    const cId = commerceIdForMesh(meshId)
    if (!cId) throw new Error('No se pudo localizar el comercio de la malla')
    isSaving.value = true
    error.value = null
    clearStructuredError()
    try {
      const { data: updated, warnings } = await ScheduleService.publishMesh(cId, meshId)
      const idx = meshes.value.findIndex((m) => m.id === meshId)
      if (idx !== -1) meshes.value[idx] = updated
      if (currentMesh.value?.id === meshId) currentMesh.value = updated
      return { mesh: updated, warnings }
    } catch (e) {
      handleError(e)
    } finally {
      isSaving.value = false
    }
  }

  async function archiveMesh(meshId: string): Promise<ScheduledMeshDetail> {
    const cId = commerceIdForMesh(meshId)
    if (!cId) throw new Error('No se pudo localizar el comercio de la malla')
    isSaving.value = true
    error.value = null
    clearStructuredError()
    try {
      const updated = await ScheduleService.archiveMesh(cId, meshId)
      const idx = meshes.value.findIndex((m) => m.id === meshId)
      if (idx !== -1) meshes.value[idx] = updated
      if (currentMesh.value?.id === meshId) currentMesh.value = updated
      return updated
    } catch (e) {
      handleError(e)
    } finally {
      isSaving.value = false
    }
  }

  async function cloneMesh(
    meshId: string,
    dto: CloneMeshDto,
  ): Promise<{ mesh: ScheduledMeshDetail; warnings: string[] }> {
    const cId = commerceIdForMesh(meshId)
    if (!cId) throw new Error('No se pudo localizar el comercio de la malla')
    isSaving.value = true
    error.value = null
    clearStructuredError()
    try {
      const { data: created, warnings } = await ScheduleService.cloneMesh(cId, meshId, dto)
      meshes.value = [...meshes.value, created]
      return { mesh: created, warnings }
    } catch (e) {
      handleError(e)
    } finally {
      isSaving.value = false
    }
  }

  // ---------- MeshShift CRUD ----------

  async function addShift(
    meshId: string,
    dto: CreateMeshShiftDto,
  ): Promise<{ shift: MeshShift; warnings: string[] }> {
    const cId = commerceIdForMesh(meshId)
    if (!cId) throw new Error('No se pudo localizar el comercio de la malla')
    isSaving.value = true
    error.value = null
    clearStructuredError()
    try {
      const { data: shift, warnings } = await ScheduleService.addShiftToMesh(cId, meshId, dto)
      // El dashboard (`meshes[]`) no muestra shifts — sólo metadata. Sólo
      // actualizamos `currentMesh` (Detail), que es el que renderiza la grilla.
      if (currentMesh.value?.id === meshId) {
        currentMesh.value = {
          ...currentMesh.value,
          shifts: [...currentMesh.value.shifts, shift],
        }
      }
      return { shift, warnings }
    } catch (e) {
      handleError(e)
    } finally {
      isSaving.value = false
    }
  }

  async function updateShift(
    meshId: string,
    shiftId: string,
    dto: UpdateMeshShiftDto,
  ): Promise<{ shift: MeshShift; warnings: string[] }> {
    const cId = commerceIdForMesh(meshId)
    if (!cId) throw new Error('No se pudo localizar el comercio de la malla')
    isSaving.value = true
    error.value = null
    clearStructuredError()
    try {
      const { data: updated, warnings } = await ScheduleService.updateShiftInMesh(
        cId, meshId, shiftId, dto,
      )
      if (currentMesh.value?.id === meshId) {
        const sIdx = currentMesh.value.shifts.findIndex((s) => s.id === shiftId)
        if (sIdx !== -1) {
          const nextShifts = [...currentMesh.value.shifts]
          nextShifts[sIdx] = updated
          currentMesh.value = { ...currentMesh.value, shifts: nextShifts }
        }
      }
      return { shift: updated, warnings }
    } catch (e) {
      handleError(e)
    } finally {
      isSaving.value = false
    }
  }

  async function removeShift(meshId: string, shiftId: string): Promise<void> {
    const cId = commerceIdForMesh(meshId)
    if (!cId) throw new Error('No se pudo localizar el comercio de la malla')
    error.value = null
    try {
      await ScheduleService.removeShiftFromMesh(cId, meshId, shiftId)
      if (currentMesh.value?.id === meshId) {
        currentMesh.value = {
          ...currentMesh.value,
          shifts: currentMesh.value.shifts.filter((s) => s.id !== shiftId),
        }
      }
    } catch (e) {
      handleError(e)
    }
  }

  // ---------- Mutators ----------

  function setMeshZoneFilter(value: string | null): void {
    meshZoneFilter.value = value
  }
  function setMeshStatusFilter(value: MeshState | null): void {
    meshStatusFilter.value = value
  }
  function setCurrentMesh(mesh: ScheduledMeshDetail | null): void {
    currentMesh.value = mesh
  }
  function setCurrentTemplate(tpl: ScheduleTemplate | null): void {
    currentTemplate.value = tpl
  }

  // Al cambiar el set de commerces/rol, revalidamos todo.
  watch([accessibleCommerces, isSuperAdmin], async () => {
    meshes.value = []
    templates.value = []
    availableZones.value = []
    currentMesh.value = null
    currentTemplate.value = null
    clearStructuredError()
  })

  return {
    // state
    accessibleCommerces, isSuperAdmin,
    availableZones, riders, pdvs, zoneSummaries,
    templates, meshes, currentMesh, currentTemplate,
    meshZoneFilter, meshStatusFilter,
    isLoading, isSaving, error,
    lastErrorDetails, highlightedShiftIds,
    // getters
    filteredMeshes, totalTemplates, totalMeshes, publishedMeshes,
    riderById, pdvById, zoneById, commerceNameById, allowedZoneIdsComputed,
    // actions — bootstrap
    configureAccess, fetchAvailableZones, loadCatalogsForCommerce,
    resolveZoneRef,
    // actions — templates
    fetchAllTemplates, fetchTemplateById, createTemplate, updateTemplate, deleteTemplate,
    // actions — meshes
    fetchMeshes, fetchMeshById, createMesh, updateMesh, deleteMesh,
    publishMesh, archiveMesh, cloneMesh,
    // actions — shifts
    addShift, updateShift, removeShift,
    // filters / utils
    setMeshZoneFilter, setMeshStatusFilter, setCurrentMesh, setCurrentTemplate,
    clearStructuredError,
  }
})
