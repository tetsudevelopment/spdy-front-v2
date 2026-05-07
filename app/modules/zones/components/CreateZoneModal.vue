<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import ColorPicker from 'primevue/colorpicker'
import RadioButton from 'primevue/radiobutton'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useAuth } from '~/composables/useAuth'
import { useZonesStore } from '../store/zones.store'
import type {
  CreateZoneDto,
  UpdateZoneDto,
  Zone,
} from '../types/zone.types'

interface Props {
  visible: boolean
  zone?: Zone | null
}
const props = withDefaults(defineProps<Props>(), { zone: null })

const emit = defineEmits<{
  'update:visible': [value: boolean]
  created: []
  updated: []
}>()

const store = useZonesStore()
const { user: authUser } = useAuth()

const isEditMode = computed<boolean>(() => props.zone !== null)
const isSuperAdmin = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')
const modalTitle = computed<string>(() =>
  isEditMode.value ? 'Editar zona' : 'Nueva zona',
)
const submitLabel = computed<string>(() =>
  isEditMode.value ? 'Guardar cambios' : 'Crear zona',
)
const isBusy = computed<boolean>(() => store.isCreating || store.isUpdating)

const DEFAULT_COLOR = '#49fb7c'
const KML_MAX_BYTES = 10 * 1024 * 1024

// PrimeVue ColorPicker emite el hex sin el '#' cuando format='hex'. Guardamos
// internamente la versión normalizada (con '#') y la sincronizamos en un wrapper.
type ZoneKind = 'global' | 'private'

interface FormState {
  name: string
  description: string
  color: string        // siempre con '#' prefijado
  priority: number | null
  kind: ZoneKind
  commerceId: string | null
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    color: DEFAULT_COLOR,
    priority: 0,
    // Por defecto: SA crea Global; CA siempre crea Private contra su commerce.
    kind: isSuperAdmin.value ? 'global' : 'private',
    commerceId: isSuperAdmin.value ? null : store.selectedCommerceId,
  }
}

function formFromZone(z: Zone): FormState {
  return {
    name: z.name,
    description: z.description ?? '',
    color: normalizeHex(z.color),
    priority: typeof z.priority === 'number' ? z.priority : 0,
    kind: z.isGlobal ? 'global' : 'private',
    commerceId: z.commerceId,
  }
}

function normalizeHex(hex: string): string {
  const trimmed = hex.trim()
  if (!trimmed) return DEFAULT_COLOR
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

const form = reactive<FormState>(emptyForm())
const kmlFile = ref<File | null>(null)
const fileError = ref<string | null>(null)
const submitError = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<keyof FormState | 'kml', string>>>({})

// v-model wrapper para el ColorPicker: recibe hex sin '#' y lo prefija.
const colorForPicker = computed<string>({
  get: () => form.color.replace(/^#/, ''),
  set: (value: string) => {
    form.color = normalizeHex(value)
  },
})

const schema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es requerido'),
    description: z.string().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido — usa hex #rrggbb'),
    priority: z.number().int('La prioridad debe ser un entero').nullable(),
    kind: z.enum(['global', 'private']),
    commerceId: z.string().uuid('Comercio inválido').nullable(),
  })
  .refine((v) => v.kind === 'global' || v.commerceId !== null, {
    message: 'Selecciona un comercio para zonas privadas',
    path: ['commerceId'],
  })

function resetForm(): void {
  if (props.zone) {
    Object.assign(form, formFromZone(props.zone))
  } else {
    Object.assign(form, emptyForm())
  }
  kmlFile.value = null
  fileError.value = null
  fieldErrors.value = {}
  submitError.value = null
}

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) resetForm()
  },
)

function closeModal(): void {
  emit('update:visible', false)
}

function isKmlFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.kml') || name.endsWith('.kmz')
}

function onKmlChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  fileError.value = null

  if (!file) {
    kmlFile.value = null
    return
  }
  if (!isKmlFile(file)) {
    fileError.value = 'El archivo debe tener extensión .kml o .kmz'
    input.value = ''
    return
  }
  if (file.size > KML_MAX_BYTES) {
    fileError.value = 'El archivo supera los 10 MB'
    input.value = ''
    return
  }
  kmlFile.value = file
}

function removeKml(): void {
  kmlFile.value = null
  fileError.value = null
}

function applyZodErrors(err: z.ZodError): void {
  const errors: Partial<Record<keyof FormState | 'kml', string>> = {}
  for (const issue of err.issues) {
    const key = issue.path[0]
    if (typeof key === 'string') {
      errors[key as keyof FormState] = issue.message
    }
  }
  fieldErrors.value = errors
}

async function handleSubmit(): Promise<void> {
  submitError.value = null
  fieldErrors.value = {}
  fileError.value = null

  const parsed = schema.safeParse(form)
  if (!parsed.success) {
    applyZodErrors(parsed.error)
    return
  }

  // Regla: en creación el KML es obligatorio. En edición es opcional (si no
  // se envía, el backend conserva el actual).
  if (!isEditMode.value && !kmlFile.value) {
    fileError.value = 'Debes subir un archivo KML'
    return
  }

  const data = parsed.data
  if (isEditMode.value && props.zone) {
    await handleUpdate(data)
  } else {
    await handleCreate(data)
  }
}

async function handleCreate(data: z.infer<typeof schema>): Promise<void> {
  if (!kmlFile.value) return
  const dto: CreateZoneDto = {
    name: data.name,
    color: data.color,
    kml: kmlFile.value,
    commerceId: data.kind === 'global' ? null : data.commerceId,
  }
  if (data.description) dto.description = data.description
  if (typeof data.priority === 'number') dto.priority = data.priority

  try {
    await store.createZone(dto)
    emit('created')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo crear la zona'
  }
}

async function handleUpdate(data: z.infer<typeof schema>): Promise<void> {
  if (!props.zone) return
  const dto: UpdateZoneDto = {}
  const current = props.zone

  if (data.name !== current.name) dto.name = data.name
  if (data.description !== (current.description ?? '')) dto.description = data.description
  if (data.color.toLowerCase() !== current.color.toLowerCase()) dto.color = data.color
  if (data.priority !== (current.priority ?? 0) && typeof data.priority === 'number') {
    dto.priority = data.priority
  }
  // Solo se manda el KML si el usuario cargó un archivo nuevo.
  if (kmlFile.value) dto.kml = kmlFile.value

  try {
    await store.updateZone(current.id, current.commerceId, dto)
    emit('updated')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo actualizar la zona'
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '640px' }"
    :header="modalTitle"
    :pt="{
      root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
      header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text);' },
      footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <form class="form" @submit.prevent="handleSubmit">
      <div v-if="submitError" class="alert">{{ submitError }}</div>

      <!-- Tipo de zona — solo SA al crear (en edición no se cambia el dueño) -->
      <div v-if="isSuperAdmin && !isEditMode" class="field">
        <label class="field__label">Tipo de zona</label>
        <div class="radio-row">
          <label class="radio-opt">
            <RadioButton v-model="form.kind" input-id="kind-global" value="global" />
            <span>Global</span>
            <span class="radio-opt__hint">Disponible para todos los comercios</span>
          </label>
          <label class="radio-opt">
            <RadioButton v-model="form.kind" input-id="kind-private" value="private" />
            <span>Privada</span>
            <span class="radio-opt__hint">Solo para un comercio específico</span>
          </label>
        </div>
      </div>

      <div v-if="isSuperAdmin && !isEditMode && form.kind === 'private'" class="field">
        <label class="field__label">Comercio destino <span class="field__req">*</span></label>
        <Select
          v-model="form.commerceId"
          :options="[...store.availableCommerces]"
          option-label="commerceName"
          option-value="commerceId"
          placeholder="Selecciona un comercio"
          :class="{ 'field__input--error': fieldErrors.commerceId }"
        />
        <span v-if="fieldErrors.commerceId" class="field__error">{{ fieldErrors.commerceId }}</span>
      </div>

      <div class="row">
        <div class="field field--grow">
          <label class="field__label">Nombre <span class="field__req">*</span></label>
          <InputText
            v-model="form.name"
            placeholder="Zona Centro"
            :class="{ 'field__input--error': fieldErrors.name }"
          />
          <span v-if="fieldErrors.name" class="field__error">{{ fieldErrors.name }}</span>
        </div>

        <div class="field field--color">
          <label class="field__label">Color <span class="field__req">*</span></label>
          <div class="color-row">
            <ColorPicker
              v-model="colorForPicker"
              format="hex"
              :pt="{ preview: { style: `background: ${form.color};` } }"
            />
            <InputText
              v-model="form.color"
              class="color-hex"
              placeholder="#49fb7c"
              :class="{ 'field__input--error': fieldErrors.color }"
            />
          </div>
          <span v-if="fieldErrors.color" class="field__error">{{ fieldErrors.color }}</span>
        </div>
      </div>

      <div class="field">
        <label class="field__label">Descripción</label>
        <Textarea
          v-model="form.description"
          placeholder="Describe la cobertura o uso de la zona"
          rows="3"
          auto-resize
        />
      </div>

      <div class="field field--priority">
        <label class="field__label">Prioridad</label>
        <InputNumber
          v-model="form.priority"
          :min="0"
          :max="999"
          show-buttons
          placeholder="0"
        />
        <span class="field__hint">
          Mayor prioridad se evalúa primero cuando varias zonas cubren un mismo punto.
        </span>
      </div>

      <!-- Archivo KML -->
      <div class="field">
        <label class="field__label">
          Archivo KML
          <span v-if="!isEditMode" class="field__req">*</span>
        </label>
        <div class="kml-row">
          <label class="btn-secondary">
            <i class="pi pi-upload" aria-hidden="true" />
            {{ kmlFile ? 'Reemplazar archivo' : 'Seleccionar archivo' }}
            <input
              type="file"
              accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
              class="kml-row__input"
              @change="onKmlChange"
            />
          </label>

          <div v-if="kmlFile" class="kml-row__file">
            <i class="pi pi-file" aria-hidden="true" />
            <span class="kml-row__name">{{ kmlFile.name }}</span>
            <button type="button" class="btn-link" @click="removeKml">Quitar</button>
          </div>
          <div v-else-if="isEditMode && props.zone?.kmlUrl" class="kml-row__file kml-row__file--current">
            <i class="pi pi-file" aria-hidden="true" />
            <span class="kml-row__name">KML actual conservado</span>
          </div>

          <span class="kml-row__hint">.kml o .kmz · máx 10 MB</span>
        </div>
        <span v-if="fileError" class="field__error">{{ fileError }}</span>
      </div>
    </form>

    <template #footer>
      <div class="footer">
        <Button
          label="Cancelar"
          text
          severity="secondary"
          :disabled="isBusy"
          @click="closeModal"
        />
        <Button
          :label="submitLabel"
          :loading="isBusy"
          @click="handleSubmit"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
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

.row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field--grow {
  flex: 1;
}

.field--color {
  width: 220px;
  flex-shrink: 0;
}

.field--priority {
  max-width: 200px;
}

.field__label {
  font-size: 12px;
  color: var(--color-muted);
  font-weight: 500;
}

.field__req {
  color: var(--color-error);
}

.field__hint {
  font-size: 11px;
  color: var(--color-muted);
}

.field :deep(.p-inputtext),
.field :deep(.p-textarea),
.field :deep(.p-select),
.field :deep(.p-inputnumber),
.field :deep(.p-inputnumber-input) {
  width: 100%;
}

.field__input--error :deep(.p-inputtext),
.field__input--error :deep(.p-select) {
  border-color: var(--color-error) !important;
}

.field__error {
  font-size: 11px;
  color: var(--color-error);
}

.radio-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.radio-opt {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  cursor: pointer;
  background: #1a1a19;
  font-size: 13px;
  color: var(--color-text);
}

.radio-opt:hover {
  border-color: color-mix(in srgb, var(--color-brand) 50%, var(--color-border));
}

.radio-opt__hint {
  grid-column: 2;
  font-size: 11px;
  color: var(--color-muted);
}

.color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-hex {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-transform: lowercase;
}

.kml-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.kml-row__input {
  display: none;
}

.kml-row__file {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text);
  max-width: 100%;
  min-width: 0;
}

.kml-row__file--current {
  color: var(--color-muted);
}

.kml-row__file i {
  color: var(--color-brand);
}

.kml-row__name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kml-row__hint {
  font-size: 11px;
  color: var(--color-muted);
  margin-left: auto;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.btn-secondary:hover {
  border-color: var(--color-brand);
  color: var(--color-brand);
}

.btn-link {
  background: transparent;
  border: none;
  color: var(--color-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.btn-link:hover {
  color: var(--color-error);
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
