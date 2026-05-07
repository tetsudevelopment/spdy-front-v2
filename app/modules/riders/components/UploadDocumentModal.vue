<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useRidersStore } from '../store/riders.store'
import type { Rider, RiderDocumentType } from '../types/rider.types'

interface Props {
  visible: boolean
  rider: Rider | null
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  uploaded: []
}>()

const store = useRidersStore()

const DOC_OPTIONS: ReadonlyArray<{ label: string; value: RiderDocumentType }> = [
  { label: 'Identificación',       value: 'identification' },
  { label: 'Licencia de conducir', value: 'driver_license' },
  { label: 'Tarjeta vehículo',     value: 'vehicle_registration' },
  { label: 'SOAT',                 value: 'soat' },
  { label: 'Otro',                 value: 'other' },
]

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png']
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
]

const docType = ref<RiderDocumentType | null>(null)
const file = ref<File | null>(null)
const fileError = ref<string | null>(null)
const submitError = ref<string | null>(null)
const isUploading = ref<boolean>(false)

const canSubmit = computed<boolean>(
  () => docType.value !== null && file.value !== null && !fileError.value,
)

function resetState(): void {
  docType.value = null
  file.value = null
  fileError.value = null
  submitError.value = null
}

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) resetState()
  },
)

function closeModal(): void {
  emit('update:visible', false)
}

function isAllowedFile(f: File): boolean {
  const name = f.name.toLowerCase()
  const extOk = ALLOWED_EXT.some((ext) => name.endsWith(ext))
  // Algunos navegadores reportan mime vacío — aceptamos si la extensión está OK.
  const mimeOk = f.type === '' || ALLOWED_MIME.includes(f.type)
  return extOk && mimeOk
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const chosen = input.files?.[0] ?? null
  fileError.value = null

  if (!chosen) {
    file.value = null
    return
  }
  if (!isAllowedFile(chosen)) {
    fileError.value = 'Formato no válido — usa PDF, JPG o PNG'
    input.value = ''
    return
  }
  if (chosen.size > MAX_BYTES) {
    fileError.value = 'El archivo supera los 10 MB'
    input.value = ''
    return
  }
  file.value = chosen
}

function removeFile(): void {
  file.value = null
  fileError.value = null
}

async function handleSubmit(): Promise<void> {
  if (!props.rider || !docType.value || !file.value) return
  submitError.value = null
  isUploading.value = true
  try {
    await store.uploadDocument(props.rider.id, docType.value, file.value)
    emit('uploaded')
    closeModal()
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'No se pudo subir el documento'
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '480px' }"
    header="Subir documento"
    :pt="{
      root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
      header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text);' },
      footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <div v-if="props.rider" class="form">
      <div v-if="submitError" class="alert">{{ submitError }}</div>

      <div class="field">
        <label class="field__label">Tipo de documento <span class="field__req">*</span></label>
        <Select
          v-model="docType"
          :options="[...DOC_OPTIONS]"
          option-label="label"
          option-value="value"
          placeholder="Selecciona un tipo"
        />
      </div>

      <div class="field">
        <label class="field__label">Archivo <span class="field__req">*</span></label>
        <div class="file-row">
          <label class="btn-secondary">
            <i class="pi pi-upload" aria-hidden="true" />
            {{ file ? 'Reemplazar archivo' : 'Seleccionar archivo' }}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              class="file-row__input"
              @change="onFileChange"
            />
          </label>

          <div v-if="file" class="file-row__chip">
            <i class="pi pi-file" aria-hidden="true" />
            <span class="file-row__name">{{ file.name }}</span>
            <button type="button" class="btn-link" @click="removeFile">Quitar</button>
          </div>

          <span class="file-row__hint">PDF, JPG o PNG · máx 10 MB</span>
        </div>
        <span v-if="fileError" class="field__error">{{ fileError }}</span>
      </div>
    </div>

    <template #footer>
      <div class="footer">
        <Button
          label="Cancelar"
          text
          severity="secondary"
          :disabled="isUploading"
          @click="closeModal"
        />
        <Button
          label="Subir documento"
          icon="pi pi-upload"
          :loading="isUploading"
          :disabled="!canSubmit"
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

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 12px;
  color: var(--color-muted);
  font-weight: 500;
}

.field__req {
  color: var(--color-error);
}

.field :deep(.p-select) {
  width: 100%;
}

.field__error {
  font-size: 11px;
  color: var(--color-error);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.file-row__input {
  display: none;
}

.file-row__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text);
  min-width: 0;
  max-width: 100%;
}

.file-row__chip i {
  color: var(--color-brand);
}

.file-row__name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-row__hint {
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
