<script setup lang="ts">
import { computed, ref } from 'vue'
import Drawer from 'primevue/drawer'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useAuth } from '~/composables/useAuth'
import { useAppToast } from '~/composables/useToast'
import { humanizeAuthError } from '~/utils/error.utils'
import { CommerceService } from '../services/commerce.service'
import type { Commerce, FleetType } from '../types/commerce.types'

interface Props {
  visible: boolean
  commerce: Commerce | null
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  edit: [commerce: Commerce]
}>()

const { user: authUser } = useAuth()
const toast = useAppToast()

const canGenerateApiKey = computed<boolean>(
  () => authUser.value?.role === 'SuperAdmin',
)

const isGeneratingKey = ref<boolean>(false)
const apiKeyValue = ref<string | null>(null)
const apiKeyDialogVisible = ref<boolean>(false)
const copied = ref<boolean>(false)

interface FleetMeta {
  label: string
  tone: 'blue' | 'green' | 'yellow'
}

const FLEET_META: Record<FleetType, FleetMeta> = {
  Privada: { label: 'Privada',  tone: 'blue' },
  Global:  { label: 'Global',   tone: 'green' },
  Hibrida: { label: 'Híbrida',  tone: 'yellow' },
}

function initial(name: string): string {
  const first = name.trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(amount: string | undefined, currency: string): string {
  if (!amount) return '—'
  const num = Number(amount)
  if (!Number.isFinite(num)) return amount
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(num)
}

function closePanel(): void {
  emit('update:visible', false)
}

function onEdit(): void {
  if (!props.commerce) return
  emit('edit', props.commerce)
}

async function generateApiKey(): Promise<void> {
  if (!props.commerce) return
  isGeneratingKey.value = true
  try {
    const res = await CommerceService.generateApiKey(props.commerce.id)
    apiKeyValue.value = res.apiKey
    apiKeyDialogVisible.value = true
    copied.value = false
  } catch (e) {
    toast.error(humanizeAuthError(e))
  } finally {
    isGeneratingKey.value = false
  }
}

async function copyApiKey(): Promise<void> {
  if (!apiKeyValue.value) return
  try {
    await navigator.clipboard.writeText(apiKeyValue.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    toast.error('No se pudo copiar al portapapeles')
  }
}

function closeApiKeyDialog(): void {
  apiKeyDialogVisible.value = false
  apiKeyValue.value = null
  copied.value = false
}
</script>

<template>
  <Drawer
    :visible="props.visible"
    position="right"
    :pt="{
      root: { style: 'width: 480px; background: var(--color-surface); border-left: 1px solid var(--color-border);' },
      header: { style: 'background: var(--color-surface); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text); padding: 0;' },
    }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <template #header>
      <div class="drawer-header">
        <span class="drawer-header__title">Detalle del comercio</span>
      </div>
    </template>

    <div v-if="props.commerce" class="panel">
      <header class="panel__hero">
        <div class="panel__logo">
          <img
            v-if="props.commerce.logoUrl"
            :src="props.commerce.logoUrl"
            :alt="props.commerce.name"
            class="panel__logo-img"
          />
          <div v-else class="panel__logo-avatar">
            {{ initial(props.commerce.name) }}
          </div>
        </div>
        <div class="panel__hero-info">
          <h2 class="panel__name">{{ props.commerce.name }}</h2>
          <p v-if="props.commerce.razonSocial" class="panel__subtitle">
            {{ props.commerce.razonSocial }}
          </p>
          <div class="panel__tags">
            <span
              class="pill"
              :class="`pill--${FLEET_META[props.commerce.fleetType].tone}`"
            >
              {{ FLEET_META[props.commerce.fleetType].label }}
            </span>
            <span
              class="badge"
              :class="props.commerce.isActive ? 'badge--active' : 'badge--inactive'"
            >
              {{ props.commerce.isActive ? 'Activo' : 'Inactivo' }}
            </span>
          </div>
        </div>
      </header>

      <section class="panel__section">
        <h3 class="panel__section-title">Información general</h3>
        <dl class="panel__grid">
          <div class="panel__item">
            <dt>NIT</dt>
            <dd>
              <span v-if="props.commerce.nit" class="mono">{{ props.commerce.nit }}</span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
          <div class="panel__item">
            <dt>Email</dt>
            <dd>
              <span v-if="props.commerce.email">{{ props.commerce.email }}</span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
          <div class="panel__item">
            <dt>Teléfono</dt>
            <dd>
              <span v-if="props.commerce.phone">{{ props.commerce.phone }}</span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
          <div class="panel__item">
            <dt>Sitio web</dt>
            <dd>
              <a
                v-if="props.commerce.website"
                :href="props.commerce.website"
                target="_blank"
                rel="noopener"
                class="link"
              >{{ props.commerce.website }}</a>
              <span v-else class="muted">—</span>
            </dd>
          </div>
          <div class="panel__item panel__item--wide">
            <dt>Dirección</dt>
            <dd>
              <span v-if="props.commerce.address">{{ props.commerce.address }}</span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="panel__section">
        <h3 class="panel__section-title">Configuración operativa</h3>
        <dl class="panel__grid">
          <div class="panel__item">
            <dt>Tarifa base</dt>
            <dd>
              <span v-if="props.commerce.baseFare">
                {{ formatMoney(props.commerce.baseFare, props.commerce.currency) }}
              </span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
          <div class="panel__item">
            <dt>Límite diario</dt>
            <dd>
              <span v-if="props.commerce.dailyOrderLimit !== undefined">
                {{ props.commerce.dailyOrderLimit }} pedidos
              </span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
          <div class="panel__item">
            <dt>Radio máximo</dt>
            <dd>
              <span v-if="props.commerce.maxRadiusKm">{{ props.commerce.maxRadiusKm }} km</span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
          <div class="panel__item">
            <dt>Timeout aceptación</dt>
            <dd>
              <span v-if="props.commerce.acceptanceTimeoutMinutes !== undefined">
                {{ props.commerce.acceptanceTimeoutMinutes }} min
              </span>
              <span v-else class="muted">—</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="panel__section">
        <h3 class="panel__section-title">Configuración técnica</h3>
        <dl class="panel__grid">
          <div class="panel__item">
            <dt>Moneda</dt>
            <dd>{{ props.commerce.currency }}</dd>
          </div>
          <div class="panel__item">
            <dt>Zona horaria</dt>
            <dd>{{ props.commerce.timezone }}</dd>
          </div>
          <div class="panel__item">
            <dt>Foto POD</dt>
            <dd>{{ props.commerce.podPhotoRequired ? 'Requerida' : 'Opcional' }}</dd>
          </div>
          <div class="panel__item">
            <dt>Creado</dt>
            <dd class="muted small">{{ formatDate(props.commerce.createdAt) }}</dd>
          </div>
          <div class="panel__item panel__item--wide">
            <dt>Última actualización</dt>
            <dd class="muted small">{{ formatDate(props.commerce.updatedAt) }}</dd>
          </div>
        </dl>
      </section>

      <footer class="panel__footer">
        <Button
          label="Editar"
          icon="pi pi-pencil"
          severity="secondary"
          outlined
          @click="onEdit"
        />
        <Button
          v-if="canGenerateApiKey"
          label="Generar API Key"
          icon="pi pi-key"
          :loading="isGeneratingKey"
          @click="generateApiKey"
        />
        <Button
          label="Cerrar"
          text
          severity="secondary"
          @click="closePanel"
        />
      </footer>
    </div>
  </Drawer>

  <!-- Dialog de API Key — solo visible tras generarla -->
  <Dialog
    :visible="apiKeyDialogVisible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '540px' }"
    header="API Key generada"
    :pt="{
      root: { style: 'background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;' },
      header: { style: 'background: var(--color-surface); color: var(--color-text); border-bottom: 1px solid var(--color-border);' },
      content: { style: 'background: var(--color-surface); color: var(--color-text);' },
      footer: { style: 'background: var(--color-surface); border-top: 1px solid var(--color-border);' },
    }"
    @update:visible="(v: boolean) => { if (!v) closeApiKeyDialog() }"
  >
    <div class="key">
      <div class="key__warning">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        <span>Esta key no se puede recuperar después de cerrar esta ventana</span>
      </div>

      <div class="key__box">
        <code class="key__value">{{ apiKeyValue }}</code>
        <button
          type="button"
          class="key__copy"
          :aria-label="copied ? 'Copiada' : 'Copiar al portapapeles'"
          @click="copyApiKey"
        >
          <i :class="copied ? 'pi pi-check' : 'pi pi-copy'" aria-hidden="true" />
          <span>{{ copied ? 'Copiada' : 'Copiar' }}</span>
        </button>
      </div>

      <p class="key__hint">
        Guárdala en un gestor de secretos. La usarás como header
        <code class="mono-inline">X-API-Key</code> en los endpoints públicos.
      </p>
    </div>

    <template #footer>
      <Button
        label="Cerrar"
        severity="secondary"
        @click="closeApiKeyDialog"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 4px;
}

.drawer-header__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel__hero {
  display: flex;
  gap: 16px;
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--color-border);
}

.panel__logo {
  flex-shrink: 0;
}

.panel__logo-img {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid var(--color-border);
}

.panel__logo-avatar {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-brand) 12%, transparent);
  color: var(--color-brand);
  font-size: 28px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel__hero-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.panel__name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.panel__subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--color-muted);
}

.panel__tags {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.panel__section {
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.panel__section-title {
  margin: 0 0 14px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-muted);
  font-weight: 700;
}

.panel__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 18px;
}

.panel__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.panel__item--wide {
  grid-column: 1 / -1;
}

.panel__item dt {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-muted);
  font-weight: 600;
}

.panel__item dd {
  margin: 0;
  font-size: 13px;
  color: var(--color-text);
  word-break: break-word;
}

.panel__item .muted {
  color: var(--color-muted);
}

.panel__item .small {
  font-size: 12px;
}

.panel__item .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.link {
  color: var(--color-brand);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
}

.pill--blue {
  color: #60a5fa;
  background: color-mix(in srgb, #60a5fa 15%, transparent);
}
.pill--green {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}
.pill--yellow {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
}

.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 9999px;
}

.badge--active {
  color: var(--color-brand);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}

.badge--inactive {
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 15%, transparent);
}

.panel__footer {
  margin-top: auto;
  padding: 18px 24px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
}

/* API Key dialog */
.key {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 6px;
}

.key__warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 45%, transparent);
  color: var(--color-warning);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 600;
}

.key__warning i {
  font-size: 14px;
  margin-top: 1px;
}

.key__box {
  background: #1a1a19;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.key__value {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: var(--color-text);
  word-break: break-all;
  user-select: all;
}

.key__copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 6px 12px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.key__copy:hover {
  border-color: var(--color-brand);
  color: var(--color-brand);
}

.key__hint {
  margin: 0;
  font-size: 11px;
  color: var(--color-muted);
}

.mono-inline {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  background: var(--color-bg);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
}
</style>
