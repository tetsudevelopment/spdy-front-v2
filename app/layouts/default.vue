<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useMonitoringStore } from '~/modules/monitoring/store/monitoring.store'

import type { Role } from '~/stores/auth.store'

interface NavItem {
  label: string
  to: string
  icon: string
  badge?: number | null
  roles?: ReadonlyArray<Role>  // si se omite → visible para todos los autenticados
}

interface NavSection {
  title: string
  items: NavItem[]
}

// Matriz de visibilidad del menú. Mantenerla SINCRONIZADA con `allowedRoles`
// del `definePageMeta` de cada página — el sidebar oculta el item, el
// middleware `role-guard.global` rebota la navegación directa por URL.
const allSections: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Monitoreo', to: '/monitoring', icon: 'pi pi-th-large', badge: null },
    ],
  },
  {
    title: 'Gestión',
    items: [
      {
        label: 'Domiciliarios',
        to: '/riders',
        icon: 'pi pi-user',
        roles: ['SuperAdmin', 'CommerceAdmin'],
      },
      {
        label: 'Comercios',
        to: '/commerce',
        icon: 'pi pi-building',
        roles: ['SuperAdmin'],
      },
      {
        label: 'Usuarios',
        to: '/users',
        icon: 'pi pi-users',
        roles: ['SuperAdmin'],
      },
      {
        label: 'Puntos de venta',
        to: '/point-of-sale',
        icon: 'pi pi-shop',
        roles: ['SuperAdmin', 'CommerceAdmin'],
      },
    ],
  },
  {
    title: 'Territorial',
    items: [
      {
        label: 'Zonas',
        to: '/zones',
        icon: 'pi pi-map-marker',
        roles: ['SuperAdmin', 'CommerceAdmin'],
      },
      {
        label: 'Mallas de turno',
        to: '/schedule',
        icon: 'pi pi-calendar',
        roles: ['SuperAdmin', 'CommerceAdmin', 'Supervisor'],
      },
    ],
  },
]

const route = useRoute()
const { user, logout } = useAuth()
const monitoringStore = useMonitoringStore()

const activeServicesBadge = computed<number | null>(() => {
  const kpi = monitoringStore.kpis.find((k) => k.key === 'active_services')
  const value = kpi?.value
  return typeof value === 'number' && value > 0 ? value : null
})

const sections = computed<NavSection[]>(() => {
  const role = user.value?.role
  return allSections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => {
          if (!item.roles) return true
          return role ? item.roles.includes(role) : false
        })
        .map((item) =>
          item.to === '/monitoring'
            ? { ...item, badge: activeServicesBadge.value }
            : item,
        ),
    }))
    .filter((section) => section.items.length > 0)
})

const pageTitle = computed<string>(() => {
  const path = route.path
  for (const section of sections.value) {
    for (const item of section.items) {
      if (path === item.to || path.startsWith(`${item.to}/`)) return item.label
    }
  }
  return 'SPDY'
})

const isLive = computed<boolean>(() => route.path.startsWith('/monitoring'))

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar__logo">
        <div class="sidebar__logo-mark">
          <i class="pi pi-check" />
        </div>
        <div class="sidebar__logo-text">
          <span class="sidebar__logo-title">SPDY</span>
          <span class="sidebar__logo-subtitle">Monitoreo operacional</span>
        </div>
      </div>

      <nav class="sidebar__nav">
        <div v-for="section in sections" :key="section.title" class="sidebar__section">
          <div class="sidebar__section-title">{{ section.title }}</div>
          <NuxtLink
            v-for="item in section.items"
            :key="item.to"
            :to="item.to"
            class="sidebar__item"
            :class="{ 'sidebar__item--active': isActive(item.to) }"
          >
            <i :class="item.icon" class="sidebar__item-icon" />
            <span class="sidebar__item-label">{{ item.label }}</span>
            <span v-if="item.badge" class="sidebar__item-badge">{{ item.badge }}</span>
          </NuxtLink>
        </div>
      </nav>

      <div class="sidebar__user">
        <div class="sidebar__user-avatar">
          <i class="pi pi-user-circle" aria-hidden="true" />
        </div>
        <div class="sidebar__user-info">
          <div class="sidebar__user-name">{{ user?.fullName ?? user?.username ?? '—' }}</div>
          <div class="sidebar__user-role">{{ user?.role ?? '' }}</div>
        </div>
        <span class="sidebar__user-dot" />
        <button
          type="button"
          class="sidebar__user-logout"
          aria-label="Cerrar sesión"
          @click="logout"
        >
          <i class="pi pi-sign-out" />
        </button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar__title">
          <span v-if="isLive" class="topbar__live-dot" />
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="topbar__actions">
          <slot name="topbar-actions" />
        </div>
      </header>

      <section class="content">
        <slot />
      </section>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  background: var(--color-bg);
  color: var(--color-text);
}

/* Sidebar */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: 22px 14px;
  position: sticky;
  top: 0;
  height: 100vh;
}

.sidebar__logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px 18px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 18px;
}

.sidebar__logo-mark {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: var(--color-brand);
  color: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
}

.sidebar__logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.sidebar__logo-title {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: var(--color-text);
}

.sidebar__logo-subtitle {
  font-size: 10px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.sidebar__section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--color-muted);
  padding: 0 10px 8px;
}

.sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--color-text);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s ease, color 0.15s ease;
}

.sidebar__item:hover {
  background: #2e2e2d;
}

.sidebar__item--active {
  background: color-mix(in srgb, var(--color-brand) 10%, transparent);
  color: var(--color-brand);
}

.sidebar__item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-brand);
}

.sidebar__item--active .sidebar__item-icon {
  color: var(--color-brand);
}

.sidebar__item-icon {
  font-size: 15px;
  color: var(--color-muted);
}

.sidebar__item-label {
  flex: 1;
}

.sidebar__item-badge {
  background: var(--color-brand);
  color: var(--color-bg);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 9999px;
}

.sidebar__user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px;
  border-top: 1px solid var(--color-border);
  margin-top: 14px;
}

.sidebar__user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text);
}

.sidebar__user-avatar i {
  font-size: 22px;
  color: var(--color-muted);
}

.sidebar__user-info {
  flex: 1;
  min-width: 0;
}

.sidebar__user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__user-role {
  font-size: 10px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar__user-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--color-brand);
  box-shadow: 0 0 8px color-mix(in srgb, var(--color-brand) 60%, transparent);
}

.sidebar__user-logout {
  background: transparent;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
}

.sidebar__user-logout:hover {
  color: var(--color-text);
  background: #2e2e2d;
}

/* Main */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topbar {
  height: 64px;
  padding: 0 28px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 10;
}

.topbar__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar__title h1 {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.topbar__live-dot {
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  background: var(--color-brand);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-brand) 60%, transparent);
  animation: live-pulse 1.8s ease-out infinite;
}

@keyframes live-pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-brand) 55%, transparent); }
  70%  { box-shadow: 0 0 0 10px color-mix(in srgb, var(--color-brand) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-brand) 0%, transparent); }
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.content {
  flex: 1;
  padding: 24px 28px;
  background: var(--color-bg);
  overflow-y: auto;
}
</style>
