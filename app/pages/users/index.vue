<script setup lang="ts">
import { onMounted, ref } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { useUsersStore } from '~/modules/users/store/users.store'
import UsersTable from '~/modules/users/components/UsersTable.vue'
import CreateUserModal from '~/modules/users/components/CreateUserModal.vue'
import type { User } from '~/modules/users/types/user.types'

definePageMeta({
  layout: 'default',
  allowedRoles: ['SuperAdmin'],
})

const store = useUsersStore()
const toast = useToast()

const showModal = ref<boolean>(false)
const selectedUser = ref<User | null>(null)

onMounted(async () => {
  await store.fetchUsers()
})

function openCreate(): void {
  selectedUser.value = null
  showModal.value = true
}

function openEdit(user: User): void {
  selectedUser.value = user
  showModal.value = true
}

function onCreated(): void {
  toast.add({
    severity: 'success',
    summary: 'Usuario creado',
    detail: 'El usuario se creó correctamente',
    life: 3500,
  })
}

function onUpdated(): void {
  toast.add({
    severity: 'success',
    summary: 'Usuario actualizado',
    detail: 'Los cambios se guardaron correctamente',
    life: 3500,
  })
}

function onDelete(user: User): void {
  toast.add({
    severity: 'warn',
    summary: 'Acción pendiente',
    detail: `Eliminar usuario "${user.username}" — endpoint no disponible aún`,
    life: 4000,
  })
}

function onSearchInput(value: string | undefined): void {
  store.setSearch(value ?? '')
}
</script>

<template>
  <div class="users-page">
    <Toast />

    <header class="users-page__header">
      <div class="users-page__title">
        <h1>Usuarios</h1>
        <span class="users-page__count">{{ store.filteredUsers.length }}</span>
      </div>
      <Button
        label="Nuevo usuario"
        icon="pi pi-plus"
        severity="primary"
        @click="openCreate"
      />
    </header>

    <div class="users-page__search">
      <span class="search">
        <i class="pi pi-search search__icon" aria-hidden="true" />
        <InputText
          :model-value="store.search"
          placeholder="Buscar por usuario, nombre o email"
          class="search__input"
          @update:model-value="onSearchInput"
        />
      </span>
    </div>

    <div v-if="store.error" class="users-page__error">{{ store.error }}</div>

    <UsersTable
      @edit="openEdit"
      @delete="onDelete"
    />

    <CreateUserModal
      v-model:visible="showModal"
      :user="selectedUser"
      @created="onCreated"
      @updated="onUpdated"
    />
  </div>
</template>

<style scoped>
.users-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.users-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.users-page__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.users-page__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.users-page__count {
  font-size: 12px;
  color: var(--color-muted);
}

.users-page__search {
  display: flex;
  max-width: 420px;
}

.search {
  position: relative;
  flex: 1;
}

.search__icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-muted);
  font-size: 13px;
  pointer-events: none;
  z-index: 1;
}

.search__input {
  width: 100%;
  padding-left: 34px !important;
}

.users-page__error {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  color: var(--color-error);
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}
</style>
