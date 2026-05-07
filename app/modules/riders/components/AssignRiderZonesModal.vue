<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import { useAuth } from '~/composables/useAuth'
import { useRidersStore } from '../store/riders.store'
import { RidersService } from '../services/riders.service'
import { humanizeAuthError } from '~/utils/error.utils'
import type { Rider, RiderZoneRef, ZoneSummary } from '../types/rider.types'

interface Props {
  visible: boolean
  rider: Rider | null
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

const store = useRidersStore()
const { user: authUser } = useAuth()

const isSuperAdmin = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')
const isGlobalRider = computed<boolean>(() => props.rider?.fleetType === 'Global')

// Map commerceId → nombre, para etiquetar zonas privadas en el dropdown.
// Se nutre de los commerces accesibles que el riders page ya puebla en mount.
const commerceNameById = computed<Map<string, string>>(() => {
  const m = new Map<string, string>()
  for (const c of store.availableCommerces) m.set(c.commerceId, c.commerceName)
  return m
})

const availableZones = ref<ZoneSummary[]>([])
const isLoadingZones = ref<boolean>(false)
const isSaving = ref<boolean>(false)
const submitError = ref<string | null>(null)

// Refrescamos al abrir porque el listado de riders puede no venir con zones.
const detailZones = ref<RiderZoneRef[] | null>(null)
const selectedZoneIds = ref<string[]>([])

const currentAssigned = computed<RiderZoneRef[]>(() => {
  if (detailZones.value !== null) return detailZones.value
  return props.rider?.zones ?? []
})

const hasChanges = computed<boolean>(() => {
  const current = new Set(currentAssigned.value.map((z) => z.id))
  const next = new Set(selectedZoneIds.value)
  if (current.size !== next.size) return true
  for (const id of current) if (!next.has(id)) return true
  return false
})

// Reglas de filtrado del MultiSelect:
//   - Privado (cualquier actor): zonas privadas del commerce dueño.
//   - Global + CommerceAdmin: SOLO privadas del commerce del actor.
//     No mostramos globales — el CA no puede tocarlas, y tampoco las
//     privadas de otros commerces.
//   - Global + SuperAdmin: globales + privadas de TODOS los commerces
//     accesibles (no solo el activo del topbar). El SA debe poder asignar
//     zonas de cualquier commerce a un rider Global.
async function loadZones(): Promise<void> {
  isLoadingZones.value = true
  submitError.value = null
  try {
    const tasks: Array<Promise<ZoneSummary[]>> = []

    if (isGlobalRider.value && isSuperAdmin.value) {
      // Globales del sistema + privadas de cada commerce accesible. Sin un
      // endpoint agregado en el backend, abanicamos en paralelo.
      tasks.push(RidersService.listGlobalZones())
      for (const c of store.availableCommerces) {
        tasks.push(RidersService.listZonesForCommerce(c.commerceId))
      }
    } else {
      // Privado: commerce dueño. Global + CommerceAdmin: commerce del actor
      // (selectedCommerceId). Si el dueño no viene, caemos al activo.
      const ownerCommerceId = props.rider?.fleetType === 'Privada'
        ? (props.rider.commerceId ?? store.selectedCommerceId)
        : store.selectedCommerceId
      if (ownerCommerceId) {
        tasks.push(RidersService.listZonesForCommerce(ownerCommerceId))
      }
    }

    if (tasks.length === 0) {
      availableZones.value = []
      return
    }
    const results = await Promise.all(tasks)
    const merged = results.flat().filter((z) => z.isActive)
    // Dedup por id: una zona global asignada a un commerce aparece tanto en
    // /zones como en /commerce/:cId/zones. La versión que viene de /zones llega
    // con commerceId=null y la otra también (el backend respeta el null), pero
    // si en algún caso difieren, queremos quedarnos con la versión "global"
    // para que los assigns/removes ruteen al endpoint legacy correcto.
    const byId = new Map<string, ZoneSummary>()
    for (const z of merged) {
      const existing = byId.get(z.id)
      if (existing && existing.commerceId === null) continue
      byId.set(z.id, z)
    }
    availableZones.value = Array.from(byId.values())
  } catch (e) {
    submitError.value = humanizeAuthError(e)
  } finally {
    isLoadingZones.value = false
  }
}

async function hydrateDetail(): Promise<void> {
  if (!props.rider) return
  const fresh = await store.fetchById(props.rider.id)
  detailZones.value = fresh?.zones ?? []
  selectedZoneIds.value = (fresh?.zones ?? []).map((z) => z.id)
}

watch(
  () => props.visible,
  async (isVisible) => {
    if (!isVisible) {
      detailZones.value = null
      selectedZoneIds.value = []
      return
    }
    submitError.value = null
    await Promise.all([hydrateDetail(), loadZones()])
  },
)

function closeModal(): void {
  emit('update:visible', false)
}

async function removeAssigned(zoneId: string): Promise<void> {
  if (!props.rider) return
  // Para Privados: contra el commerce dueño del rider.
  // Para Globales: contra el commerce dueño de la ZONA (que puede ser != al
  // commerce activo del topbar). Si la zona es global (commerceId === null),
  // usamos el endpoint legacy /riders/:rId/zones/:zId. Si por alguna razón la
  // zona no está en el catálogo (caso raro), caemos al commerce activo.
  submitError.value = null
  try {
    if (props.rider.fleetType === 'Privada') {
      const cId = props.rider.commerceId ?? store.selectedCommerceId
      if (!cId) return
      await RidersService.removeZone(cId, props.rider.id, zoneId)
    } else {
      const zone = availableZones.value.find((z) => z.id === zoneId)
      const owner = zone ? zone.commerceId : (store.selectedCommerceId ?? null)
      if (owner === null) {
        await RidersService.removeGlobalZone(props.rider.id, zoneId)
      } else {
        await RidersService.removeZone(owner, props.rider.id, zoneId)
      }
    }

    selectedZoneIds.value = selectedZoneIds.value.filter((id) => id !== zoneId)
    if (detailZones.value) {
      detailZones.value = detailZones.value.filter((z) => z.id !== zoneId)
    }
    // Refrescamos el rider en el store para que la tabla muestre el cambio.
    await store.fetchById(props.rider.id)
    emit('saved')
  } catch (e) {
    submitError.value = humanizeAuthError(e)
  }
}

async function handleSave(): Promise<void> {
  if (!props.rider) return
  if (!hasChanges.value) {
    closeModal()
    return
  }
  isSaving.value = true
  submitError.value = null
  try {
    // Pasamos el catálogo (con commerceId por zona) para que el store pueda
    // enrutar cada add/remove al commerce dueño — clave para riders Globales.
    await store.assignZones(props.rider.id, selectedZoneIds.value, availableZones.value)
    emit('saved')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudieron guardar las zonas'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '560px' }"
    header="Asignar zonas al domiciliario"
    :pt="{
      root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
      header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text);' },
      footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <div v-if="props.rider" class="zones">
      <div v-if="submitError" class="alert">{{ submitError }}</div>

      <div class="rider-ref">
        <span class="rider-ref__label">Domiciliario</span>
        <span class="rider-ref__name">
          {{ props.rider.fullName }}
          <span
            class="fleet-tag"
            :class="props.rider.fleetType === 'Global' ? 'fleet-tag--global' : 'fleet-tag--private'"
          >{{ props.rider.fleetType === 'Global' ? 'Global' : 'Privado' }}</span>
        </span>
      </div>

      <div v-if="isGlobalRider && !isSuperAdmin" class="scope-notice">
        <i class="pi pi-info-circle" aria-hidden="true" />
        <span>
          Solo puedes asignar las zonas privadas de tu commerce a este rider global.
        </span>
      </div>

      <section v-if="currentAssigned.length > 0" class="current">
        <h3 class="section-title">Zonas asignadas</h3>
        <div class="chips">
          <span
            v-for="z in currentAssigned"
            :key="z.id"
            class="chip"
            :style="{
              color: z.color,
              background: `color-mix(in srgb, ${z.color} 15%, transparent)`,
              borderColor: `color-mix(in srgb, ${z.color} 40%, transparent)`,
            }"
          >
            {{ z.name }}
            <button
              type="button"
              class="chip__remove"
              aria-label="Quitar zona"
              :style="{ color: z.color }"
              @click="removeAssigned(z.id)"
            >
              <i class="pi pi-times" aria-hidden="true" />
            </button>
          </span>
        </div>
      </section>
      <section v-else class="current current--empty">
        <h3 class="section-title">Zonas asignadas</h3>
        <p class="muted">Este domiciliario aún no tiene zonas.</p>
      </section>

      <section class="picker">
        <h3 class="section-title">Seleccionar zonas</h3>
        <MultiSelect
          v-model="selectedZoneIds"
          :options="availableZones"
          option-label="name"
          option-value="id"
          :loading="isLoadingZones"
          placeholder="Elige zonas para asignar"
          filter
          display="chip"
          :pt="{ root: { style: 'width: 100%; background: transparent;' } }"
        >
          <template #option="{ option }: { option: ZoneSummary }">
            <div class="zone-option">
              <span class="zone-option__dot" :style="{ background: option.color }" />
              <span class="zone-option__name">{{ option.name }}</span>
              <span
                v-if="option.commerceId === null"
                class="zone-tag zone-tag--global"
              >GLOBAL</span>
              <span v-else class="zone-tag zone-tag--private">PRIVADA</span>
              <span
                v-if="option.commerceId && commerceNameById.get(option.commerceId)"
                class="zone-option__commerce"
              >{{ commerceNameById.get(option.commerceId) }}</span>
            </div>
          </template>
        </MultiSelect>
        <p class="hint">
          Al guardar se asignan las nuevas y se quitan las que ya no estén seleccionadas.
        </p>
      </section>
    </div>

    <template #footer>
      <div class="footer">
        <Button
          label="Cancelar"
          text
          severity="secondary"
          :disabled="isSaving"
          @click="closeModal"
        />
        <Button
          label="Guardar"
          :loading="isSaving"
          :disabled="!hasChanges"
          @click="handleSave"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.zones {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 6px;
}

.alert {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}

.rider-ref {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rider-ref__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-muted);
  font-weight: 700;
}

.rider-ref__name {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fleet-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.fleet-tag--private {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-muted) 30%, transparent);
}

.fleet-tag--global {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-brand) 35%, transparent);
}

.scope-notice {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--color-brand) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-brand) 30%, transparent);
  border-radius: 9px;
  font-size: 12px;
  color: var(--color-text);
  line-height: 1.45;
}

.scope-notice i {
  color: var(--color-brand);
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.section-title {
  margin: 0 0 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-muted);
  font-weight: 700;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 10px;
  border-radius: 9999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.chip__remove {
  background: transparent;
  border: none;
  cursor: pointer;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  padding: 0;
  opacity: 0.7;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.chip__remove:hover {
  opacity: 1;
  background: color-mix(in srgb, currentColor 20%, transparent);
}

.current--empty .muted {
  font-size: 12px;
  color: var(--color-muted);
  margin: 0;
}

.picker :deep(.p-multiselect) {
  width: 100%;
}

.zone-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.zone-option__name {
  flex-shrink: 0;
}

.zone-option__commerce {
  font-size: 11px;
  color: var(--color-muted);
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.zone-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  border: 1px solid transparent;
  flex-shrink: 0;
}

.zone-tag--global {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-brand) 35%, transparent);
}

.zone-tag--private {
  color: var(--color-info, #2563eb);
  background: color-mix(in srgb, var(--color-info, #2563eb) 14%, transparent);
  border-color: color-mix(in srgb, var(--color-info, #2563eb) 35%, transparent);
}

.zone-option__dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--color-muted);
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
