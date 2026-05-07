# AGENT.md — Sistema de Monitoreo de Domiciliarios
> Documento de referencia para agentes de IA (Claude Code u otros).
> Leer completamente antes de generar, modificar o revisar cualquier archivo del proyecto.

---

## 1. Visión general del producto

Sistema web de **monitoreo operacional** para gestión de domiciliarios (riders), pedidos/servicios, comercios y zonas geográficas. Permite a operadores ver en tiempo real la ubicación de los riders sobre mapas de zonas, administrar turnos mediante mallas horarias semanales, y gestionar el registro de riders y comercios.

**Módulos principales:**

| Módulo | Responsabilidad |
|---|---|
| **Monitoreo** | Dashboard operacional con 3 pestañas: Servicios, Domiciliarios y Zonas |
| **Domiciliarios** | CRUD de riders, perfil, estado, historial, documentos |
| **Comercios** | CRUD de comercios y sus puntos de venta |
| **Zonas** | Gestión de zonas geográficas con carga de KMLs |
| **Mallas** | Asignación de turnos a riders por franja horaria (Lun–Dom, 00:00–23:59) |

### Módulo de Monitoreo — detalle de pestañas ✓ Diseño aprobado

La página de monitoreo (`/monitoring`) tiene una barra de KPIs siempre visible en la parte superior y tres pestañas de contenido:

**KPIs superiores (siempre visibles, 4 tarjetas):**
- Servicios activos (con indicador de cuántos sin asignar en amarillo)
- Riders online (sobre total de activos)
- En tránsito (con tiempo promedio de entrega)
- Entregados hoy (con variación porcentual vs día anterior)

**Pestaña 1 — Servicios (vista por defecto):**
- Tabla completa de todos los servicios/órdenes del día
- Columnas: ID, Cliente, Dirección de entrega, Rider asignado, Zona, Estado, Hora
- Barra de filtros encima de la tabla con: selector de ciudad, selector de zona, selector de estado, campo de búsqueda libre (filtra por ID, cliente o nombre del rider)
- El contador de resultados se actualiza en tiempo real al filtrar
- Estados con color: Sin asignar (gris), Asignado (azul), En punto de venta (violeta), En tránsito (amarillo), En punto de entrega (amarillo), Entregado (verde), Cancelado (rojo)

**Pestaña 2 — Domiciliarios:**
- Layout de dos columnas: izquierda activos, derecha offline/inactivos
- Cada rider muestra: avatar con iniciales, nombre, vehículo y zona, badge de estado, hora de conexión
- Activos: badge verde, hora "Desde HH:MM"
- Offline: badge gris, texto "Últ. vez [fecha/hora]"
- Riders en ruta activa se distinguen con badge amarillo "En ruta"

**Pestaña 3 — Zonas:**
- Layout de dos columnas: lista de zonas a la izquierda (260px), mapa a la derecha (flexible)
- Lista de zonas: cada ítem muestra punto de color de la zona, nombre y cantidad de riders asignados
- Al seleccionar una zona: se activa con borde verde izquierdo y se actualiza el mapa
- El mapa muestra el polígono de la zona (cargado desde `kmlUrl` vía `leaflet-omnivore`) y los riders dentro
- Cada rider en el mapa es un punto de color según estado (verde=online, amarillo=en ruta, gris=offline)
- Al hacer hover/clic sobre un rider aparece un tooltip con: nombre completo, estado y tipo de vehículo
- Leyenda en el footer del mapa: Online / En ruta / Offline con sus colores

---

## 2. Stack tecnológico

### Frontend
| Tecnología | Versión | Rol |
|---|---|---|
| **Nuxt 3** | ^3.x | Framework principal (SSR/SPA híbrido) |
| **Vue 3** | ^3.x | UI framework (Composition API) |
| **TypeScript** | ^5.x | Tipado estático en todo el proyecto |
| **Pinia** | ^2.x | State management global |
| **TailwindCSS** | ^3.x | Estilos utilitarios (layouts, espaciados, custom styles) |
| **PrimeVue** | ^4.x | Librería de componentes UI (DataTable, Dialog, Calendar, Toast, etc.) |
| **@primevue/themes** | ^4.x | Sistema de temas de PrimeVue (Aura theme como base) |
| **Leaflet** | ^1.9.x | Motor de mapas (open source, sin costo) |
| **leaflet-omnivore** | ^0.3.x | Carga y visualización de archivos KML en Leaflet |
| **Socket.io-client** | ^4.x | WebSockets para monitoreo en tiempo real *(pendiente confirmar con backend)* |
| **VeeValidate + Zod** | ^4.x / ^3.x | Validación de formularios con tipado |
| **@vueuse/core** | ^10.x | Composables de utilidad (useWebSocket, useDark, etc.) |

### Backend (referencia — repositorio separado, proyecto SPDY v2)
| Tecnología | Rol |
|---|---|
| **Fastify 5** | Framework backend — NO es NestJS |
| **Drizzle ORM** | ORM sobre PostgreSQL + PostGIS |
| **PostgreSQL + PostGIS** | Base de datos con soporte geoespacial |
| **Redis** | Blacklist de tokens JWT y caché |
| **AWS S3** | Archivos: logos, KMLs, fotos, documentos |
| **JWT (@fastify/jwt)** | Auth stateless — Access 15min / Refresh 14d |
| **Nominatim (OSM)** | Geocodificación sin costo |
| **REST API** | Protocolo de comunicación principal |

> Ver `API_CONTRACT.md` para endpoints, DTOs, flujos de auth y enums.

### Decisiones pendientes de confirmar con el equipo
- [ ] **Tiempo real (monitoreo de riders):** WebSocket/SSE **NO implementado** en el backend actual. Usar **polling** como solución temporal. Actualizar `composables/useRiderTracking.ts` cuando el backend lo soporte.
- [x] **Proveedor de mapas**: Leaflet + OpenStreetMap. Sin costo, sin API key, soporte nativo KML. ✓ Confirmado.
- [x] **UI/Estilos**: PrimeVue 4 + TailwindCSS. ✓ Confirmado.

### Convenciones PrimeVue
- Usar siempre los componentes de PrimeVue para: tablas (`DataTable`), modales (`Dialog`), formularios (`InputText`, `Dropdown`, `Calendar`), notificaciones (`Toast`), badges (`Badge`, `Tag`).
- Tailwind se usa para: grids de layout, márgenes, paddings, colores custom fuera del tema, clases responsivas.
- **No mezclar** estilos inline con clases de Tailwind sobre componentes PrimeVue — usar `pt` (PassThrough API) para personalizar internos de PrimeVue.
- El tema base es `Aura` de PrimeVue. Los tokens de color del tema se definen en `nuxt.config.ts` bajo el plugin de PrimeVue usando la paleta de marca definida abajo.

---

## 2.5 Sistema de colores — Identidad visual ✓ Confirmado

> Estos colores son DEFINITIVOS. No usar otros colores de fondo, acento o superficie sin justificación explícita.

### Paleta base
| Token | Hex | Uso |
|-------|-----|-----|
| `--color-bg` | `#161616` | Fondo principal de la app (body, page background) |
| `--color-surface` | `#262625` | Superficies secundarias: sidebar, cards, modales, headers de tabla |
| `--color-brand` | `#49fb7c` | Color de acción: botones primarios, indicadores activos, highlights, foco |

### Reglas de uso
- **`#161616`**: fondo de página (`<body>`, layouts). Nunca usarlo como color de texto.
- **`#262625`**: cards, sidebar, nav, inputs (fondo), headers de sección. Siempre un nivel por encima del fondo base.
- **`#49fb7c`**: botones de acción principal, badges "activo/online", bordes de foco en inputs, indicadores de rider activo en el mapa, chips seleccionados en la malla. **Nunca** como color de fondo de superficies grandes.
- Texto principal sobre fondos oscuros: `#FFFFFF` o `#F0F0F0`.
- Texto secundario / muted: `#8A8A88`.
- Bordes y separadores: `#333332` (entre `--color-bg` y `--color-surface`).
- Estados de error: `#ff4d4f`. Estados de advertencia: `#faad14`.

### Variables CSS globales (`assets/css/main.css`)
```css
:root {
  --color-bg:      #161616;
  --color-surface: #262625;
  --color-brand:   #49fb7c;

  --color-text-primary:   #F0F0F0;
  --color-text-secondary: #8A8A88;
  --color-border:         #333332;

  --color-error:   #ff4d4f;
  --color-warning: #faad14;
}
```

### Configuración en Tailwind (`tailwind.config.ts`)
```typescript
theme: {
  extend: {
    colors: {
      bg:      '#161616',
      surface: '#262625',
      brand:   '#49fb7c',
      border:  '#333332',
      muted:   '#8A8A88',
    }
  }
}
```

### Configuración en PrimeVue (tema Aura — `nuxt.config.ts`)
```typescript
primevue: {
  options: {
    theme: {
      preset: Aura,
      options: { darkModeSelector: 'html' }
    }
  }
}
```
Sobrescribir tokens de PrimeVue en `assets/css/primevue-overrides.css`:
```css
:root {
  --p-primary-color:          #49fb7c;
  --p-primary-contrast-color: #161616;  /* texto sobre botón verde */
  --p-surface-0:   #161616;
  --p-surface-100: #262625;
  --p-surface-200: #333332;
  --p-content-background: #262625;
  --p-overlay-modal-background: #262625;
}
```

### Aplicación por módulo
| Elemento UI | Color |
|-------------|-------|
| Fondo de página | `#161616` |
| Sidebar | `#262625` |
| Cards / panels | `#262625` |
| Botón primario | `#49fb7c` con texto `#161616` |
| Badge rider activo/online | `#49fb7c` con texto `#161616` |
| Indicador en mapa (rider online) | `#49fb7c` |
| Chip de turno en la malla | `#49fb7c` con texto `#161616` |
| Inputs (fondo) | `#262625` con borde `#333332` |
| Inputs (foco) | borde `#49fb7c` |
| Texto principal | `#F0F0F0` |
| Texto secundario | `#8A8A88` |
| Separadores / bordes | `#333332` |

---

## 3. Arquitectura — Feature-based Modular

Se adopta arquitectura **modular por dominio (feature-based)** con principios de separación de responsabilidades inspirados en arquitectura hexagonal:

- Cada módulo es autocontenido: tiene sus páginas, componentes, store, servicios y types.
- La lógica de negocio vive en composables y servicios, **nunca en los componentes**.
- Los componentes solo consumen datos del store o composables y emiten eventos.
- La comunicación con el backend está aislada en la capa `services/`.

```
No se deben importar servicios directamente desde componentes (.vue).
Los componentes importan composables o stores; los composables/stores importan servicios.
```

---

## 4. Estructura de directorios

```
/
├── assets/                        # Estilos globales, fuentes, imágenes estáticas
│   └── css/
│       └── main.css               # Imports de Tailwind + variables CSS globales
│
├── components/                    # Componentes UI reutilizables (sin lógica de dominio)
│   ├── common/                    # Botones, inputs, modales, tablas, badges genéricos
│   ├── map/                       # Componentes de mapa reutilizables
│   │   ├── MapBase.vue            # Wrapper de Leaflet (inicialización, destroy)
│   │   ├── MapKmlLayer.vue        # Carga y renderiza un archivo KML sobre el mapa
│   │   ├── MapRiderMarker.vue     # Marcador de rider con estado (activo/inactivo/alerta)
│   │   └── MapZonePolygon.vue     # Polígono de zona con tooltip
│   └── layout/                   # Header, Sidebar, Footer, Breadcrumb
│
├── modules/                       # Módulos de dominio — núcleo de la aplicación
│   ├── monitoring/                # Módulo: Monitoreo operacional
│   │   ├── components/
│   │   │   ├── MonitoringKpis.vue         # Barra de 4 KPIs siempre visible
│   │   │   ├── ServicesTable.vue          # Tabla de servicios con filtros
│   │   │   ├── ServicesFilters.vue        # Filtros: ciudad, zona, estado, búsqueda libre
│   │   │   ├── RidersActivePanel.vue      # Panel de domiciliarios activos (col izquierda)
│   │   │   ├── RidersOfflinePanel.vue     # Panel de domiciliarios offline (col derecha)
│   │   │   ├── ZonesSidebar.vue           # Lista lateral de zonas seleccionables
│   │   │   └── ZonesMap.vue              # Mapa Leaflet con zona + riders + tooltips
│   │   ├── composables/
│   │   │   └── useRiderTracking.ts        # Polling a /riders/online (temporal hasta que back implemente WS)
│   │   ├── services/
│   │   │   └── monitoring.service.ts
│   │   ├── store/
│   │   │   └── monitoring.store.ts        # Estado: tab activa, filtros, servicios, riders online
│   │   └── types/
│   │       └── monitoring.types.ts
│   │
│   ├── riders/                    # Módulo: Domiciliarios
│   │   ├── components/
│   │   ├── composables/
│   │   │   └── useRiders.ts
│   │   ├── services/
│   │   │   └── riders.service.ts
│   │   ├── store/
│   │   │   └── riders.store.ts
│   │   └── types/
│   │       └── rider.types.ts
│   │
│   ├── commerce/                  # Módulo: Comercios y puntos de venta
│   │   ├── components/
│   │   ├── composables/
│   │   │   └── useCommerce.ts
│   │   ├── services/
│   │   │   └── commerce.service.ts
│   │   ├── store/
│   │   │   └── commerce.store.ts
│   │   └── types/
│   │       └── commerce.types.ts
│   │
│   ├── zones/                     # Módulo: Zonas geográficas
│   │   ├── components/
│   │   ├── composables/
│   │   │   └── useZones.ts
│   │   ├── services/
│   │   │   └── zones.service.ts
│   │   ├── store/
│   │   │   └── zones.store.ts
│   │   └── types/
│   │       └── zone.types.ts
│   │
│   └── schedule/                  # Módulo: Mallas de turno
│       ├── components/
│       │   └── ScheduleGrid.vue   # Grilla Lun–Dom × franjas horarias
│       ├── composables/
│       │   └── useSchedule.ts
│       ├── services/
│       │   └── schedule.service.ts
│       ├── store/
│       │   └── schedule.store.ts
│       └── types/
│           └── schedule.types.ts
│
├── pages/                         # Rutas de Nuxt (file-based routing)
│   ├── index.vue                  # Redirige a /monitoring
│   ├── monitoring/
│   │   └── index.vue              # Vista de monitoreo: KPIs + 3 pestañas (Servicios / Domiciliarios / Zonas)
│   ├── riders/
│   │   ├── index.vue              # Listado de domiciliarios
│   │   ├── [id].vue               # Perfil del rider
│   │   └── new.vue                # Registro de nuevo rider
│   ├── commerce/
│   │   ├── index.vue
│   │   ├── [id].vue
│   │   └── new.vue
│   ├── zones/
│   │   ├── index.vue
│   │   └── [id].vue
│   └── schedule/
│       └── index.vue              # Vista de mallas
│
├── composables/                   # Composables globales (no ligados a un módulo)
│   ├── useApi.ts                  # Wrapper de $fetch con base URL, auth headers, interceptores
│   ├── useAuth.ts                 # Sesión, login, logout, token refresh
│   └── useToast.ts                # Sistema de notificaciones global
│
├── services/                      # Servicios globales o transversales
│   └── http.client.ts             # Instancia base de $fetch con configuración global
│
├── stores/                        # Stores globales (no de módulo)
│   ├── auth.store.ts              # Estado de autenticación
│   └── ui.store.ts                # Estado UI global (sidebar, theme, loading)
│
├── types/                         # Tipos e interfaces globales / compartidos
│   ├── api.types.ts               # Tipos de respuesta HTTP genéricos (ApiResponse<T>, PaginatedResponse<T>)
│   ├── auth.types.ts              # User, Token, Session
│   └── common.types.ts            # Enums y tipos utilitarios compartidos
│
├── utils/                         # Funciones puras utilitarias
│   ├── date.utils.ts              # Formateo de fechas, cálculo de franjas horarias
│   ├── map.utils.ts               # Helpers para Leaflet (bounds, center, KML parsing)
│   └── schedule.utils.ts          # Validación y normalización de horarios de malla
│
├── middleware/                    # Middleware de Nuxt
│   └── auth.global.ts             # Protección global de rutas (redirige si no autenticado)
│
├── plugins/                       # Plugins de Nuxt
│   ├── leaflet.client.ts          # Inicializa Leaflet solo en cliente (no SSR)
│   └── socket.client.ts           # Inicializa Socket.io-client solo en cliente
│
├── layouts/
│   ├── default.vue                # Layout con sidebar + header
│   └── auth.vue                   # Layout limpio para login
│
├── nuxt.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── AGENT.md                       # Este archivo
```

---

## 5. Convenciones de TypeScript

### Regla fundamental
> **Todo debe estar tipado. Prohibido usar `any`.** Si el tipo es desconocido usar `unknown` y hacer type narrowing.

### Nomenclatura de tipos
```typescript
// Interfaces para entidades de dominio
interface Rider { ... }
interface RiderProfile extends Rider { ... }

// Types para uniones, aliases y utilidades
type RiderStatus = 'active' | 'inactive' | 'on_delivery' | 'offline'
type RiderWithZone = Rider & { zone: Zone }

// Enums solo para valores que no cambian en runtime
enum DayOfWeek {
  Monday = 'monday',
  Tuesday = 'tuesday',
  // ...
  Sunday = 'sunday'
}

// Genéricos para respuestas de API
interface ApiResponse<T> {
  data: T
  message: string
  statusCode: number
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number
  page: number
  limit: number
}
```

### Ubicación de tipos
- **Tipos de módulo**: en `modules/{modulo}/types/{modulo}.types.ts`
- **Tipos compartidos entre módulos**: en `types/`
- **Props y emits de componentes**: definidos inline con `defineProps<{}>()` y `defineEmits<{}>()`
- **Nunca duplicar** un tipo en dos lugares — si lo necesitan dos módulos, va a `types/`

---

## 6. Convenciones de componentes Vue

```vue
<script setup lang="ts">
// 1. Imports externos
import { ref, computed, onMounted } from 'vue'

// 2. Imports internos (composables, stores, utils)
import { useRiders } from '~/modules/riders/composables/useRiders'

// 3. Props y emits (siempre tipados)
interface Props {
  riderId: string
  showStatus?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  showStatus: true
})

const emit = defineEmits<{
  selected: [rider: Rider]
  statusChanged: [status: RiderStatus]
}>()

// 4. Composables y stores
const { rider, isLoading, fetchRider } = useRiders()

// 5. Estado local
const isExpanded = ref(false)

// 6. Computed
const displayName = computed(() => rider.value?.fullName ?? '—')

// 7. Lifecycle
onMounted(() => fetchRider(props.riderId))
</script>

<template>
  <!-- template aquí -->
</template>
```

**Reglas:**
- Siempre `<script setup lang="ts">` — nunca Options API.
- Nombres de componentes: `PascalCase` en archivos y en el template.
- Un componente = una responsabilidad. Si supera ~200 líneas, dividir.
- No lógica de negocio en el template — extraer a computed o composables.

---

## 7. Convenciones de Pinia Stores

```typescript
// modules/riders/store/riders.store.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Rider, RiderStatus } from '../types/rider.types'
import { RidersService } from '../services/riders.service'

export const useRidersStore = defineStore('riders', () => {
  // State
  const riders = ref<Rider[]>([])
  const selectedRider = ref<Rider | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const activeRiders = computed(() =>
    riders.value.filter(r => r.status === 'active')
  )

  // Actions
  async function fetchRiders(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      riders.value = await RidersService.getAll()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error desconocido'
    } finally {
      isLoading.value = false
    }
  }

  return { riders, selectedRider, isLoading, error, activeRiders, fetchRiders }
})
```

**Reglas:**
- Siempre setup syntax (`() => { ... }`), no options syntax.
- El store solo contiene estado y acciones — sin lógica de UI.
- Errores siempre capturados dentro del store, no en el componente.

---

## 8. Convenciones de servicios (capa de API)

```typescript
// modules/riders/services/riders.service.ts
import { useApi } from '~/composables/useApi'
import type { Rider, CreateRiderDto, UpdateRiderDto } from '../types/rider.types'
import type { PaginatedResponse } from '~/types/api.types'

const BASE = '/riders'

export const RidersService = {
  async getAll(page = 1, limit = 20): Promise<PaginatedResponse<Rider>> {
    const api = useApi()
    return api.get<PaginatedResponse<Rider>>(BASE, { query: { page, limit } })
  },

  async getById(id: string): Promise<Rider> {
    const api = useApi()
    return api.get<Rider>(`${BASE}/${id}`)
  },

  async create(dto: CreateRiderDto): Promise<Rider> {
    const api = useApi()
    return api.post<Rider>(BASE, dto)
  },

  async update(id: string, dto: UpdateRiderDto): Promise<Rider> {
    const api = useApi()
    return api.patch<Rider>(`${BASE}/${id}`, dto)
  },

  async remove(id: string): Promise<void> {
    const api = useApi()
    return api.delete(`${BASE}/${id}`)
  }
}
```

**Reglas:**
- Los servicios son objetos planos con métodos — no clases.
- Los DTOs (Data Transfer Objects) son types separados de la interfaz de entidad.
- Nunca lógica de estado aquí — solo llamadas HTTP.

---

## 9. Módulo de Mapas — Leaflet + KML

### Configuración (plugin client-only)
```typescript
// plugins/leaflet.client.ts
// Leaflet no funciona en SSR — solo se carga en el cliente
import 'leaflet/dist/leaflet.css'
```

### Carga de KML en zonas
```typescript
// utils/map.utils.ts
// Usar leaflet-omnivore para parsear KML
// omnivore.kml(url) devuelve un GeoJSON layer compatible con Leaflet
```

### Reglas de mapas
- Todo componente de mapa debe usar `<ClientOnly>` en el template o `ssr: false` en `definePageMeta`.
- El componente `MapBase.vue` es el único que inicializa la instancia de Leaflet. Los demás componentes de mapa reciben la instancia por prop o composable.
- Los KMLs de zonas se cargan desde URLs del backend — nunca archivos estáticos en el frontend.
- Al destruir el componente (`onUnmounted`), siempre llamar `map.remove()` para evitar memory leaks.

---

## 10. Módulo de Mallas (Schedule)

### Modelo de datos
```typescript
// modules/schedule/types/schedule.types.ts

type TimeString = `${string}:${string}:${string}` // HH:MM:SS

interface ScheduleShift {
  id: string
  riderId: string
  day: DayOfWeek        // 'monday' | 'tuesday' | ... | 'sunday'
  startTime: TimeString // '08:00:00'
  endTime: TimeString   // '16:00:00'
  zoneId?: string
}

interface DaySchedule {
  day: DayOfWeek
  shifts: ScheduleShift[]  // múltiples riders pueden compartir el mismo día y horario
}

interface WeeklySchedule {
  zoneId: string
  weekStart: string        // ISO date — lunes de la semana
  days: DaySchedule[]
}
```

### Diseño visual del componente `ScheduleGrid` ✓ Aprobado

**Orientación de ejes (DEFINITIVO — no cambiar):**
- **Eje X (columnas):** horas del día, de `00:00` a `23:00`, 24 columnas.
- **Eje Y (filas):** días de la semana, Lunes a Domingo.

**Comportamiento de filas (días):**
- Cada día es una fila **colapsable**. Por defecto colapsada.
- La fila colapsada muestra el nombre del día, el conteo de riders asignados, y una previsualización con barras de color proporcionales al turno de cada rider.
- Al expandir, aparecen las **subfilas de riders**: una por cada rider asignado ese día.
- Cada subfila muestra el nombre del rider a la izquierda (columna fija de 100px) y un **chip** pintado desde la columna de hora inicio hasta la columna de hora fin.
- Múltiples riders en el mismo día se **apilan verticalmente**, cada uno en su propia subfila.
- Al final de cada día expandido aparece el botón **"+ Agregar turno"**.

**Layout técnico — CSS Grid (NO usar `<table>`):**
```css
/* Header de horas */
.header-row {
  display: grid;
  grid-template-columns: 100px repeat(24, minmax(0, 1fr));
}

/* Subfilas de riders */
.rider-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  position: relative;
}
```
- `minmax(0, 1fr)` garantiza que las 24 columnas se distribuyan proporcionalmente **sin desbordarse** en pantallas normales.
- El scroll horizontal solo ocurre cuando la pantalla física no puede contener el mínimo. En tablet y desktop nunca hay scroll horizontal.
- El chip se posiciona con `left` y `width` en **porcentaje** calculados sobre 24 horas:
  ```typescript
  const leftPct  = (shift.start / 24) * 100  // % desde la izquierda
  const widthPct = ((shift.end - shift.start) / 24) * 100  // % de ancho
  ```
- El chip usa `position: absolute` dentro del `.rider-grid` que tiene `position: relative`.

**Flujo de agregar turno:**
1. Usuario expande un día → clic en "+ Agregar turno".
2. Se abre un modal con: selector de rider, hora inicio (`<input type="time">`), hora fin.
3. Validación: hora fin debe ser estrictamente mayor a hora inicio.
4. Al confirmar, el shift se agrega al estado local y el chip se pinta inmediatamente.
5. El guardado al backend se hace con un botón global "Guardar malla" — no por cada shift.

**Flujo de quitar turno:**
- Clic sobre el chip → confirmación → se elimina del estado local y desaparece.

**Reglas adicionales:**
- Un mismo rider puede tener más de un turno en el mismo día (turnos partidos).
- No hay límite de riders por día.
- El rango horario válido es `00:00` – `23:59`.
- Al guardar, enviar al backend el array de `ScheduleShift[]` — nunca el estado visual de la grilla.

---

## 11. Tiempo real — Monitoreo de riders

### Estado actual: NO implementado en el backend
El backend (SPDY v2) **no tiene WebSocket ni SSE** en su versión actual. La vista de monitoreo debe implementarse con **polling HTTP** mientras se desarrolla la capa de tiempo real.

```typescript
// modules/monitoring/composables/useRiderTracking.ts
// Solución temporal: polling cada N segundos al endpoint REST
// GET /commerce/:id/fleet/riders?status=activo → posiciones actuales

// Cuando el backend implemente WS/SSE, reemplazar el intervalo
// por la conexión correspondiente sin cambiar la interfaz del composable.

// Eventos futuros esperados del servidor (diseño tentativo):
// 'rider:position' → { riderId: string, lat: number, lng: number, timestamp: string }
// 'rider:status'   → { riderId: string, status: RiderStatus }
// 'order:update'   → { orderId: string, status: OrderStatus, riderId: string }
```

**Regla:** El composable `useRiderTracking` se monta **solo en la página de monitoreo**. Limpiar el intervalo de polling en `onUnmounted` para no consumir recursos en otras rutas.

---

## 12. Autenticación

> Detalle completo de endpoints y flujos en `API_CONTRACT.md` — Sección 2.

**Resumen para el frontend:**
- El backend devuelve `{ accessToken, refreshToken }` en login exitoso.
- Caso especial: si el usuario debe cambiar contraseña, devuelve `{ requiresPasswordChange: true, tempToken }`. El frontend debe redirigir al flujo de cambio obligatorio.
- Almacenar `accessToken` en memoria (variable reactiva) y `refreshToken` en `localStorage`. **No usar `httpOnly` cookie** — el backend no la soporta actualmente, usa header `Authorization: Bearer`.
- El `accessToken` expira en **15 minutos**. El `refreshToken` en **14 días**.
- El middleware `auth.global.ts` protege todas las rutas excepto `/login` y `/change-password`.
- El composable `useAuth.ts` expone: `login()`, `logout()`, `logoutAll()`, `changePassword()`, `user`, `isAuthenticated`, `accessToken`.
- El composable `useApi.ts` inyecta automáticamente `Authorization: Bearer {accessToken}` en cada request.
- Interceptor de 401 en `useApi.ts`: intentar `POST /auth/refresh` con el `refreshToken`; si falla, limpiar estado y redirigir a `/login`.

**Roles disponibles** (afectan qué secciones mostrar en el sidebar):
```typescript
type Role = 'SuperAdmin' | 'CommerceAdmin' | 'PointSaleUser' | 'Rider' | 'Supervisor'
```

---

## 13. Manejo de errores

```typescript
// Patrón estándar en stores
try {
  // operación
} catch (e) {
  error.value = e instanceof Error ? e.message : 'Error inesperado'
  // Opcional: disparar toast global
  useToast().error(error.value)
} finally {
  isLoading.value = false
}
```

- Los errores de API siempre se logean en el store — nunca silenciosamente.
- Los componentes muestran el estado de error del store — no manejan errores por su cuenta.
- Para errores no recuperables (500, red caída), mostrar un componente `<ErrorBanner>` global.

---

## 14. Diseño UX — Layout y navegación ✓ Aprobado

> Esta sección documenta el diseño visual aprobado. Claude Code debe respetarlo sin reinterpretarlo.

### Layout general
- La app usa un layout de **dos columnas**: sidebar fijo de `240px` a la izquierda + área principal que ocupa el resto del ancho.
- El **sidebar** tiene fondo `#262625`, con logo en la parte superior, navegación en el centro y datos del usuario en la parte inferior.
- El **topbar** tiene fondo `#262625`, muestra el título de la página actual con un punto animado verde si la vista es en vivo, y acciones contextuales a la derecha.
- El **área de contenido** tiene fondo `#161616`.

### Sidebar — estructura
```
Logo (SPDY + subtítulo)
────────────────────────
SECCIÓN: Principal
  · Monitoreo          ← badge con número de servicios activos
SECCIÓN: Gestión
  · Domiciliarios
  · Comercios
  · Puntos de venta
SECCIÓN: Territorial
  · Zonas
  · Mallas de turno
────────────────────────
Avatar + Nombre + Rol + punto verde de sesión activa
```

**Ítem activo del sidebar:**
- Fondo `#49fb7c10`
- Barra vertical izquierda de `3px` color `#49fb7c`
- Label y ícono en `#49fb7c`
- Ítem inactivo en hover: fondo `#2e2e2d`

### Página de monitoreo — estructura visual
```
[Topbar: "Monitoreo en vivo" · punto animado verde · subtítulo ciudad/hora]
[KPIs: Servicios activos | Riders online | En tránsito | Entregados hoy]
[Tabs: Servicios | Domiciliarios | Zonas]
─────────────────────────────────────────
[Contenido de la pestaña activa]
```

### Pestaña Servicios
```
[Filtros: Ciudad | Zona | Estado | Búsqueda libre]  [N servicios →]
[Tabla: ID | Cliente | Dirección | Rider | Zona | Estado | Hora]
```
- Tabla sobre card `#262625` con bordes `#333332`
- Filas con hover `#1d1d1c`
- ID en monospace gris
- Estado como pill con color semántico (ver sección 2.5 del AGENT.md)

### Pestaña Domiciliarios
```
[Activos (N)    ]  [Inactivos / Offline (N)]
[─────────────  ]  [────────────────────── ]
[Avatar | Nombre]  [Avatar | Nombre        ]
[Vehículo·Zona  ]  [Vehículo·Zona          ]
[Badge | HH:MM  ]  [Badge | Últ. vez       ]
```
- Dos columnas iguales (`1fr 1fr`)
- Activos: avatar con borde `#49fb7c`, badge "Online" en verde, hora "Desde HH:MM" en verde
- En ruta: avatar con borde `#faad14`, badge "En ruta" en amarillo
- Offline: avatar con borde `#333332`, badge gris, texto "Últ. vez …" en gris

### Pestaña Zonas
```
[Lista zonas 260px]  [Mapa Leaflet flexible              ]
[─────────────────]  [───────────────────────────────────]
[● Zona Norte  4 ]  [Polígono de zona + riders como puntos]
[● Zona Sur    3 ]  [Hover rider → tooltip: nombre+estado]
[● Zona Centro 2 ]  [Footer: ● Online ● En ruta ● Offline]
```
- Zona seleccionada: `border-left: 3px solid #49fb7c`, fondo `#49fb7c08`, label en `#49fb7c`
- Mapa con fondo oscuro `#181e18`, grid sutil verde al 12% de opacidad
- Riders: puntos de 13px con borde `#161616` y glow según estado
- Tooltip del rider: card `#262625` con nombre en negrita, fila de estado con punto de color, tipo de vehículo

### Página de login (`/login`) — layout y flujos ✓ Diseño aprobado

Usa el layout `auth.vue` — sin sidebar, fondo `#161616` a pantalla completa. La card del formulario está centrada vertical y horizontalmente. Dos círculos difuminados en `#49fb7c` con opacidad muy baja (`0.03–0.04`) dan profundidad al fondo sin distraer.

**Card central (max-width: 420px):**
- Fondo `#262625`, borde `1px solid #333332`, `border-radius: 16px`, padding `44px 40px`
- Logo SPDY centrado arriba: cuadrado verde `#49fb7c` con ícono de check blanco, nombre y subtítulo

**Inputs:**
- Fondo `#1a1a19`, borde `1px solid #333332`, foco `border-color: #49fb7c`
- Padding `12px 16px`, `border-radius: 9px`, `font-size: 14px`
- Placeholder `#4a4a49`
- Error: `border-color: #ff4d4f`
- El campo de contraseña tiene un ícono de ojo integrado (`position: absolute; right: 13px`) — **sin fondo, sin borde, sin aspecto de botón** — solo el SVG del ojo que cambia opacidad al activarse. Se implementa como `<button>` con `background: none; border: none; outline: none`

**Botón principal:**
- Fondo `#49fb7c`, texto `#161616`, `font-weight: 700`, `border-radius: 9px`, padding `13px`, ancho `100%`

**Sin enlace de "olvidé mi contraseña"** — no existe flujo de recuperación por email.

**Estado 1 — Login normal:**
```
Logo centrado
"Bienvenido de nuevo" / "Ingresa tus credenciales para continuar"
Alert de error (oculto, visible en credenciales inválidas)
Campo: Usuario
Campo: Contraseña + ojo integrado
Botón: "Iniciar sesión" (verde)
```

**Estado 2 — Cambio obligatorio (primer login):**
```
Indicador de pasos: [✓ Autenticado] ──── [● Nueva contraseña]
"Crea tu contraseña" / "Es tu primer acceso..."
Campo: Nueva contraseña + ojo + panel de 4 reglas con puntos que se vuelven verdes en tiempo real
Campo: Confirmar contraseña + ojo
Error si no coinciden
Botón: "Guardar y entrar" (verde)
```

**Flujo en `useAuth.ts`:**
```typescript
// Respuesta login exitoso normal:
// { accessToken, refreshToken } → guardar en store → redirigir a /monitoring

// Respuesta primer login:
// { requiresPasswordChange: true, tempToken } → guardar tempToken → mostrar Estado 2

// POST /auth/change-password con Authorization: Bearer <tempToken>
// Respuesta: { accessToken, refreshToken } → guardar → redirigir a /monitoring

// Error 401/403 → mostrar alert-box en rojo dentro del card
```
| Elemento | Especificación |
|----------|----------------|
| Botón primario | Fondo `#49fb7c`, texto `#161616`, `font-weight: 600`, `border-radius: 8px` |
| Botón secundario | Fondo transparente, borde `#333332`, texto `#8A8A88`, hover texto `#F0F0F0` |
| Cards/panels | Fondo `#262625`, borde `1px solid #333332`, `border-radius: 11-12px` |
| Inputs/selects | Fondo `#262625`, borde `#333332`, foco `border-color: #49fb7c` |
| KPI cards | Padding `18px 20px`, valor en `28-32px` bold, label en `10px` uppercase gris |
| Tabs | Contenedor `#262625` con padding `4px`, tab activa en `#161616` con texto blanco |
| Badges de estado | Pequeñas pills `11px bold`, fondo con 15% de opacidad del color del estado |

---

## 15. Reglas generales del agente

1. **Leer este archivo completo** antes de generar cualquier código.
2. **No crear archivos fuera de la estructura definida** en la sección 4, salvo justificación explícita.
3. **No usar `any`** en TypeScript. Si el tipo es genuinamente desconocido, usar `unknown`.
4. **No importar servicios desde componentes** — siempre pasar por composable o store.
5. **No inicializar Leaflet en SSR** — usar `<ClientOnly>` o `ssr: false`.
6. **Cada módulo es autocontenido** — no cruzar imports entre módulos directamente; usar `types/` o `composables/` globales como puente.
7. **Validar con Zod** todo dato que venga del backend antes de tiparlo como entidad de dominio.
8. **Nombrar archivos** en `kebab-case` (archivos) y `PascalCase` (componentes Vue). Stores y composables en `camelCase`.
9. **Si una decisión pendiente afecta el código** (protocolo RT, proveedor de mapas), dejar un comentario `// TODO: confirmar con equipo —` y continuar con la implementación asumida.
10. **No generar datos hardcodeados** en componentes — siempre desde store/composable con datos del backend o mocks tipados.

---

## 16. Variables de entorno

```env
# .env.example
NUXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
NUXT_PUBLIC_SOCKET_URL=http://localhost:3001
NUXT_PUBLIC_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

Acceder en el código via `useRuntimeConfig()`:
```typescript
const config = useRuntimeConfig()
const apiUrl = config.public.apiBaseUrl
```

---

*Última actualización: Abril 2026 — Sistema de Monitoreo de Domiciliarios v1.0 — Diseño UI aprobado*
