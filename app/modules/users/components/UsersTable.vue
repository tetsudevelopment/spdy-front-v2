<script setup lang="ts">
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useAuth } from '~/composables/useAuth'
import { useUsersStore } from '../store/users.store'
import type { User, UserRole } from '../types/user.types'

const emit = defineEmits<{
  edit: [user: User]
  delete: [user: User]
}>()

const store = useUsersStore()
const { user: authUser } = useAuth()

const canDelete = computed<boolean>(() => authUser.value?.role === 'SuperAdmin')

interface RoleMeta {
  label: string
  tone: 'red' | 'blue' | 'violet' | 'green' | 'yellow'
}

const ROLE_META: Record<UserRole, RoleMeta> = {
  SuperAdmin:    { label: 'SuperAdmin',     tone: 'red' },
  CommerceAdmin: { label: 'CommerceAdmin',  tone: 'blue' },
  PointSaleUser: { label: 'PointSaleUser',  tone: 'violet' },
  Rider:         { label: 'Rider',          tone: 'green' },
  Supervisor:    { label: 'Supervisor',     tone: 'yellow' },
}

function roleMeta(role: UserRole): RoleMeta {
  return ROLE_META[role]
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function commercesLabel(user: User): string {
  const list = user.commerces ?? []
  if (list.length === 0) return '—'
  if (list.length === 1) return list[0]?.commerceName ?? '—'
  const first = list[0]?.commerceName ?? ''
  return `${first} +${list.length - 1}`
}
</script>

<template>
  <div class="table-card">
    <DataTable
      :value="store.filteredUsers"
      :loading="store.isLoading"
      data-key="id"
      scrollable
      scroll-height="flex"
      :pt="{ root: { class: 'users-table' } }"
      empty-message="Sin usuarios"
    >
      <Column field="username" header="Usuario" style="width: 180px">
        <template #body="{ data }: { data: User }">
          <span class="cell-username">{{ data.username }}</span>
        </template>
      </Column>

      <Column header="Nombre completo">
        <template #body="{ data }: { data: User }">
          <span v-if="data.fullName">{{ data.fullName }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </Column>

      <Column header="Rol" style="width: 160px">
        <template #body="{ data }: { data: User }">
          <span class="pill" :class="`pill--${roleMeta(data.role).tone}`">
            {{ roleMeta(data.role).label }}
          </span>
        </template>
      </Column>

      <Column header="Comercios">
        <template #body="{ data }: { data: User }">
          <span v-if="(data.commerces ?? []).length === 0" class="cell-muted">—</span>
          <span v-else>{{ commercesLabel(data) }}</span>
        </template>
      </Column>

      <Column header="Último acceso" style="width: 170px">
        <template #body="{ data }: { data: User }">
          <span class="cell-muted">{{ formatDate(data.lastLoginAt) }}</span>
        </template>
      </Column>

      <Column header="Activo" style="width: 100px">
        <template #body="{ data }: { data: User }">
          <span
            class="badge"
            :class="data.isActive ? 'badge--active' : 'badge--inactive'"
          >
            {{ data.isActive ? 'Activo' : 'Inactivo' }}
          </span>
        </template>
      </Column>

      <Column header="" style="width: 100px">
        <template #body="{ data }: { data: User }">
          <div class="actions">
            <Button
              icon="pi pi-pencil"
              text
              rounded
              aria-label="Editar usuario"
              :pt="{ root: { style: 'color: var(--color-brand);' } }"
              @click="emit('edit', data)"
            />
            <Button
              v-if="canDelete"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              aria-label="Eliminar usuario"
              @click="emit('delete', data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.table-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

:deep(.users-table .p-datatable-thead > tr > th) {
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

:deep(.users-table .p-datatable-tbody > tr) {
  background: var(--color-surface);
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
}

:deep(.users-table .p-datatable-tbody > tr:hover) {
  background: #1d1d1c;
}

:deep(.users-table .p-datatable-tbody > tr > td) {
  font-size: 13px;
  border: none;
}

.cell-username {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--color-text);
}

.cell-muted {
  color: var(--color-muted);
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.pill--red {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
}
.pill--blue {
  color: #60a5fa;
  background: color-mix(in srgb, #60a5fa 15%, transparent);
}
.pill--violet {
  color: #a78bfa;
  background: color-mix(in srgb, #a78bfa 15%, transparent);
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

.actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>
