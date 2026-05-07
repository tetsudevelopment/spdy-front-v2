# API_CONTRACT.md — SPDY v2 Backend
> Referencia de contrato de API para el frontend Nuxt 3.
> Leer junto a `AGENT.md`. Este archivo describe **qué** expone el backend; `AGENT.md` describe **cómo** consumirlo desde el frontend.

---

## 1. Conexión y configuración base

```
Desarrollo:   http://localhost:3000
Producción:   https://api.spdy.com
```

```typescript
// nuxt.config.ts → runtimeConfig
NUXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

### Headers requeridos
```
Authorization: Bearer <accessToken>     // todos los endpoints protegidos
X-API-Key: spdy_sk_...                  // solo endpoints /coverage/public
Content-Type: application/json          // JSON requests
Content-Type: multipart/form-data       // uploads de archivos
```

### Códigos HTTP
| Código | Cuándo |
|--------|--------|
| 200 | GET, PATCH, POST sin recurso creado |
| 201 | POST que crea un recurso nuevo |
| 400 | Validación fallida / parámetros inválidos |
| 401 | Token inválido, expirado o credenciales incorrectas |
| 403 | Sin permisos para la acción |
| 404 | Recurso no encontrado |
| 409 | Conflicto (email duplicado, estado inválido) |
| 500 | Error interno del servidor |

### Formato de errores de validación
```json
{
  "error": "Validation failed",
  "details": [
    {
      "code": "too_small",
      "path": ["username"],
      "message": "Username must be at least 3 characters"
    }
  ]
}
```

### Paginación — dos patrones en uso
```typescript
// Patrón A (page + limit) — Commerce, Orders, Riders, Zones
{ "data": [...], "total": 100, "page": 1, "limit": 20 }

// Patrón B (offset + limit) — Users
{ "users": [...], "pagination": { "limit": 50, "offset": 0, "count": 20 } }
```

### Formato de fechas
- Timestamps: ISO 8601 — `2024-04-14T10:00:00Z`
- Solo fecha: `YYYY-MM-DD` — usado en `fechaNacimiento`

### Límites de archivos
| Tipo | Límite | Formatos |
|------|--------|---------|
| Logo de comercio | 5 MB | png, jpeg, webp |
| Foto de rider | 10 MB | png, jpeg, webp |
| Documentos de rider | 10 MB | PDF, imágenes |
| KML de zona | 10 MB | .kml |
| Proof of Delivery | 10 MB | png, jpeg, webp |

### URLs S3 (archivos subidos)
```
Logos:       https://s3.{region}.amazonaws.com/{bucket}/commerce/{id}/logo.{ext}
Foto rider:  https://s3.{region}.amazonaws.com/{bucket}/rider/{id}/photo.{ext}
Documentos:  https://s3.{region}.amazonaws.com/{bucket}/rider/{id}/{docType}.{ext}
KML zona:    https://s3.{region}.amazonaws.com/{bucket}/zone/{id}/zone.kml
POD foto:    https://s3.{region}.amazonaws.com/{bucket}/order/{id}/pod.{ext}
```

---

## 2. Autenticación — Flujos JWT

### Tokens
| Token | TTL | Uso |
|-------|-----|-----|
| `accessToken` | 15 min | Header `Authorization: Bearer` en todos los requests |
| `refreshToken` | 14 días | Solo en `POST /auth/refresh` (body) |
| `tempToken` | 10 min | Solo para flujo de cambio obligatorio de contraseña |

### Almacenamiento en el frontend
- `accessToken` → memoria reactiva (Pinia store) — nunca localStorage
- `refreshToken` → `localStorage`
- Ninguno en cookies — el backend no soporta httpOnly cookies

### Flujos

#### Login normal
```
POST /auth/login
Body: { username, password }

Respuesta exitosa:
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }

Si requiere cambio de contraseña:
{ "requiresPasswordChange": true, "tempToken": "eyJ..." }
→ Redirigir a /change-password con el tempToken
```

#### Cambio de contraseña obligatorio (primer login)
```
POST /auth/change-password
Authorization: Bearer <tempToken>
Body: { newPassword }

Respuesta: { accessToken, refreshToken, message }
→ Guardar tokens y redirigir al dashboard
```

#### Cambio de contraseña voluntario
```
POST /auth/change-password
Authorization: Bearer <accessToken>
Body: { currentPassword, newPassword }

Respuesta: { message }  // sin nuevos tokens
```

#### Refresh (interceptor 401)
```
POST /auth/refresh
Body: { refreshToken }

Respuesta exitosa: { accessToken, refreshToken }
Si falla (401): limpiar store + redirigir a /login
```

#### Logout
```
POST /auth/logout
Authorization: Bearer <accessToken>
Body: { refreshToken? }     // opcional

POST /auth/logout-all       // invalida todas las sesiones del usuario
Authorization: Bearer <accessToken>
```

### Política de contraseñas
- Mínimo 8 caracteres
- Al menos 1 mayúscula
- Al menos 1 número
- Al menos 1 carácter especial

---

## 3. Roles y permisos

```typescript
type Role = 'SuperAdmin' | 'CommerceAdmin' | 'PointSaleUser' | 'Rider' | 'Supervisor'
```

| Rol | Acceso |
|-----|--------|
| `SuperAdmin` | Todo (`*`) |
| `CommerceAdmin` | Gestión completa de su(s) commerce(s): usuarios, riders, órdenes, PdV, zonas |
| `PointSaleUser` | Crear/leer órdenes, leer riders |
| `Rider` | Sus propias órdenes y perfil |
| `Supervisor` | Solo lectura en todas las entidades |

**Uso en el frontend:** al recibir el JWT, decodificar el campo `role` para controlar visibilidad de secciones en el sidebar y acceso a rutas mediante el middleware `auth.global.ts`.

---

## 4. Endpoints por módulo

### 4.1 Auth (`/auth`)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| POST | `/auth/login` | No | Login |
| POST | `/auth/refresh` | No (token en body) | Renovar tokens |
| POST | `/auth/logout` | JWT | Cerrar sesión actual |
| POST | `/auth/logout-all` | JWT | Cerrar todas las sesiones |
| POST | `/auth/change-password` | JWT (access o temp) | Cambiar contraseña |

---

### 4.2 Usuarios (`/users`)

| Método | Endpoint | Permiso | Descripción |
|--------|----------|---------|-------------|
| POST | `/users` | `users:create` | Crear usuario |
| GET | `/users` | `users:read` (SuperAdmin) | Listar todos |
| GET | `/users/me` | Cualquiera | Perfil propio |
| POST | `/users/:userId/commerces` | `users:update` | Asignar commerces |
| DELETE | `/users/:userId/commerces/:commerceId` | `users:update` | Desasignar commerce |

**Body `POST /users`:**
```typescript
{
  username: string        // 3-30 chars, [a-zA-Z][a-zA-Z0-9_]*
  password: string        // cumple política
  role: Role
  fullName?: string
  email?: string
  phone?: string
  commerceIds?: string[]  // UUIDs
}
```

**Respuesta `GET /users/me`:**
```typescript
{
  id: string
  username: string
  role: Role
  fullName?: string
  email?: string
  phone?: string
  mustChangePassword: boolean
  isActive: boolean
  lastLoginAt?: string    // ISO
  createdAt: string
  commerces: { commerceId: string, commerceName: string }[]
}
```

---

### 4.3 Comercios (`/commerce`)

| Método | Endpoint | Permiso | Descripción |
|--------|----------|---------|-------------|
| POST | `/commerce` | `commerce:create` | Crear commerce (multipart) |
| GET | `/commerce` | `commerce:read` | Listar (SuperAdmin ve todos, CommerceAdmin ve los suyos) |
| GET | `/commerce/:id` | `commerce:read` | Detalle |
| PATCH | `/commerce/:id` | `commerce:update` | Actualizar |
| POST | `/commerce/:id/api-key` | `commerce:api-key` | Generar API key |

**Body `POST /commerce` — multipart/form-data:**
```typescript
{
  name: string              // requerido
  fleetType: FleetType      // requerido
  logo?: File               // png/jpeg/webp, max 5MB
  phone?: string
  email?: string
  address?: string
  nit?: string
  razonSocial?: string
  website?: string
  currency?: string         // default 'COP'
  timezone?: string         // default 'America/Bogota'
  baseFare?: string         // número como string
  dailyOrderLimit?: string
  maxRadiusKm?: string
}
```

**Importante:** `POST /commerce/:id/api-key` devuelve la key solo una vez:
```json
{ "apiKey": "spdy_sk_...", "warning": "Store this key securely..." }
```

---

### 4.4 Órdenes

| Método | Endpoint | Permiso | Descripción |
|--------|----------|---------|-------------|
| POST | `/commerce/:cId/orders` | `orders:create` | Crear orden |
| GET | `/commerce/:cId/orders` | `orders:read` | Listar órdenes |
| GET | `/commerce/:cId/orders/:oId` | `orders:read` | Detalle |
| PATCH | `/commerce/:cId/orders/:oId/status` | `orders:update` | Cambiar estado |
| GET | `/commerce/:cId/orders/:oId/history` | `orders:read` | Historial de estados |
| GET | `/commerce/:cId/orders/:oId/eligible-riders` | `orders:update` | Riders disponibles para asignar |
| POST | `/commerce/:cId/orders/:oId/assign` | `orders:update` | Asignar rider |
| POST | `/commerce/:cId/orders/:oId/proof-of-delivery` | `orders:update` | Subir POD (multipart) |
| PATCH | `/orders/:oId/status` | `orders:update:own` | Rider actualiza su orden |
| POST | `/orders/:oId/proof-of-delivery` | `orders:update:own` | Rider sube POD |
| POST | `/orders/:oId/return-completed` | `orders:update:own` | Rider confirma retorno |

**Estado de órdenes — state machine:**
```
creado → asignado → aceptado → en_punto_de_venta → en_transito
       → en_punto_de_entrega → entregado
cancelado  (desde cualquier estado no terminal)
```

**Filtros `GET /commerce/:cId/orders`:**
```typescript
{ status?, fleetType?, riderId?, page?, limit? }
```

**Body `POST /commerce/:cId/orders/:oId/assign`:**
```typescript
{
  riderId: string   // UUID
  force?: boolean   // override checks de elegibilidad
}
```
Respuesta incluye `warnings[]` si el rider tiene condiciones marginales.

---

### 4.5 Riders / Flota

Dos contextos: **global** (`/riders`) para SuperAdmin, **por commerce** (`/commerce/:cId/riders`) para CommerceAdmin.

| Método | Endpoint | Permiso | Descripción |
|--------|----------|---------|-------------|
| POST | `/riders` | `riders:create` (SA) | Crear rider global |
| GET | `/riders` | `riders:read` (SA) | Listar global |
| GET | `/riders/online` | `riders:read` | Riders online (filtrable por zone, fleet, commerce) |
| GET | `/riders/:rId` | `riders:read` | Detalle |
| PATCH | `/riders/:rId` | `riders:update` | Actualizar |
| DELETE | `/riders/:rId` | `riders:delete` | Soft delete |
| POST | `/commerce/:cId/riders` | `riders:create` | Crear rider privado |
| GET | `/commerce/:cId/riders` | `riders:read` | Listar riders del commerce |
| GET | `/commerce/:cId/riders/:rId` | `riders:read` | Detalle |
| PATCH | `/commerce/:cId/riders/:rId` | `riders:update` | Actualizar |
| DELETE | `/commerce/:cId/riders/:rId` | `riders:delete` | Soft delete |
| PATCH | `/commerce/:cId/riders/:rId/fleet-type` | `riders:update` (SA) | Cambiar tipo de flota |
| GET | `/commerce/:cId/riders/:rId/availability` | `riders:read` | Log de disponibilidad |
| PATCH | `/commerce/:cId/riders/:rId/availability` | `riders:update:own` o `riders:update` | Toggle online/offline |
| PATCH | `/commerce/:cId/riders/:rId/photo` | `riders:update` | Subir foto (multipart) |
| POST | `/commerce/:cId/riders/:rId/documents` | `riders:update` | Subir documento (multipart) |
| GET | `/commerce/:cId/riders/:rId/documents` | `riders:read` | Listar documentos |
| POST | `/commerce/:cId/riders/:rId/zones` | `riders:update` | Asignar zonas |
| DELETE | `/commerce/:cId/riders/:rId/zones/:zId` | `riders:update` | Desasignar zona |
| GET | `/commerce/:cId/riders/:rId/zones` | `riders:read` | Listar zonas del rider |

**Endpoint clave para monitoreo (polling temporal):**
```
GET /riders/online?commerceId=&zoneId=&fleetType=&page=&limit=
→ Lista riders activos y online para pintar en el mapa
```

---

### 4.6 Puntos de Venta (`/commerce/:cId/pdv`)

| Método | Endpoint | Permiso | Descripción |
|--------|----------|---------|-------------|
| POST | `/commerce/:cId/pdv` | `points-of-sale:create` | Crear PdV |
| GET | `/commerce/:cId/pdv` | `points-of-sale:read` | Listar |
| GET | `/commerce/:cId/pdv/:pdvId` | `points-of-sale:read` | Detalle con zonas |
| PATCH | `/commerce/:cId/pdv/:pdvId` | `points-of-sale:update` | Actualizar |
| POST | `/commerce/:cId/pdv/:pdvId/zones` | `points-of-sale:update` | Asignar zonas |
| DELETE | `/commerce/:cId/pdv/:pdvId/zones/:zId` | `points-of-sale:update` | Desasignar zona |

**Body `POST /commerce/:cId/pdv`:**
```typescript
{
  name: string
  address: string           // geocodifica automáticamente si no hay lat/lng
  lat?: number
  lng?: number
  phone?: string
  email?: string
  schedule?: object         // horario operativo (JSONB)
  responsibleUserId?: string
}
```

---

### 4.7 Zonas

Dos contextos: **global** (`/zones`) para SuperAdmin, **por commerce** (`/commerce/:cId/zones`).

| Método | Endpoint | Permiso | Descripción |
|--------|----------|---------|-------------|
| POST | `/zones` | `zones:create` (SA) | Crear zona global (multipart + KML) |
| GET | `/zones` | `zones:read` | Listar zonas globales |
| GET | `/zones/:zId` | `zones:read` | Detalle con geometría |
| POST | `/zones/copy` | `zones:create` (SA) | Copiar zona global a commerces |
| POST | `/zones/:zId/assign` | `zones:update` (SA) | Asignar zona global a commerces |
| DELETE | `/zones/:zId/remove` | `zones:update` | Desasignar zona de un commerce |
| POST | `/commerce/:cId/zones` | `zones:create` | Crear zona privada (multipart + KML) |
| GET | `/commerce/:cId/zones` | `zones:read` | Listar zonas del commerce |
| GET | `/commerce/:cId/zones/:zId` | `zones:read` | Detalle |
| PATCH | `/commerce/:cId/zones/:zId` | `zones:update` | Actualizar (puede incluir nuevo KML) |
| POST | `/commerce/:cId/zones/:zId/deactivate` | `zones:update` | Desactivar (soft delete) |

**KML → el backend convierte automáticamente a MultiPolygon GeoJSON + guarda en S3.**
El frontend recibe de vuelta la `kmlUrl` (S3) para cargarla en Leaflet con `leaflet-omnivore`.

---

### 4.8 Cobertura (`/coverage`)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/coverage/check` | JWT | Verificar si un punto está cubierto |
| GET | `/coverage/public` | API Key (`X-API-Key`) | Igual, para integraciones externas |

**Query params:**
```typescript
{
  pdvId: string     // UUID, requerido
  lat?: number
  lng?: number
  address?: string  // si no hay lat/lng, geocodifica vía Nominatim
}
```

**Respuesta:**
```json
{
  "covered": true,
  "zones": [{ "id": "uuid", "name": "Zona Centro", "color": "#3B82F6" }],
  "nearestPdv": { "id": "uuid", "name": "Punto A", "distanceMeters": 1200 },
  "distanceMeters": 1200
}
```

---

### 4.9 Health

```
GET /health → { "status": "ok", "timestamp": "..." }
```

---

## 5. Modelos de dominio (interfaces TypeScript para el frontend)

```typescript
// types/rider.types.ts
type RiderStatus   = 'activo' | 'inactivo' | 'suspendido'
type VehicleType   = 'bicicleta' | 'moto' | 'auto' | 'caminando'
type FleetType     = 'Privada' | 'Global' | 'Hibrida'

interface Rider {
  id: string
  userId?: string
  commerceId?: string
  status: RiderStatus
  fleetType: FleetType
  isOnline: boolean
  fullName: string
  phone: string
  email?: string
  cedula?: string
  licenciaConducir?: string
  fechaNacimiento?: string   // YYYY-MM-DD
  address?: string
  photoUrl?: string
  vehicleType: VehicleType
  vehicleBrand?: string
  vehicleModel?: string
  vehicleColor?: string
  licensePlate?: string
  createdAt: string
  updatedAt?: string
}
```

```typescript
// types/order.types.ts
type OrderStatus =
  | 'creado' | 'asignado' | 'aceptado'
  | 'en_punto_de_venta' | 'en_transito'
  | 'en_punto_de_entrega' | 'entregado' | 'cancelado'

interface Order {
  id: string
  commerceId: string
  pickupPdvId: string
  assignedRiderId?: string
  fleetType: FleetType
  status: OrderStatus
  customerName: string
  customerPhone: string
  deliveryAddress: string
  deliveryLat?: string
  deliveryLng?: string
  packageDescription?: string
  packageWeightKg?: string
  packageDimensions?: { alto: number; ancho: number; largo: number }
  specialNotes?: string
  codAmountCents: number
  codCollected: boolean
  codCollectedAt?: string
  assignedAt?: string
  acceptanceTimeoutMinutes?: number
  returnRequired: boolean
  returnCompletedAt?: string
  createdAt: string
  updatedAt?: string
}
```

```typescript
// types/zone.types.ts
interface Zone {
  id: string
  commerceId?: string       // null = zona global
  name: string
  color: string             // hex, default '#3B82F6'
  description?: string
  isGlobal: boolean
  isActive: boolean
  geometry?: string         // MultiPolygon WKT (PostGIS)
  kmlUrl?: string           // S3 URL — cargar en Leaflet con leaflet-omnivore
  createdAt: string
  updatedAt?: string
}
```

```typescript
// types/commerce.types.ts
interface Commerce {
  id: string
  name: string
  timezone: string
  isActive: boolean
  fleetType: FleetType
  phone?: string
  email?: string
  address?: string
  nit?: string
  razonSocial?: string
  logoUrl?: string
  website?: string
  currency: string
  baseFare?: string
  dailyOrderLimit?: number
  maxRadiusKm?: string
  podPhotoRequired: boolean
  acceptanceTimeoutMinutes?: number
  createdAt: string
  updatedAt?: string
}
```

```typescript
// types/pdv.types.ts
interface PointOfSale {
  id: string
  commerceId: string
  name: string
  address: string
  location?: { x: number; y: number }  // {x: lng, y: lat} — PostGIS Point
  phone?: string
  email?: string
  schedule?: object
  isActive: boolean
  createdAt: string
}
```

---

## 6. Enums consolidados

```typescript
// types/common.types.ts

type Role        = 'SuperAdmin' | 'CommerceAdmin' | 'PointSaleUser' | 'Rider' | 'Supervisor'
type FleetType   = 'Privada' | 'Global' | 'Hibrida'
type RiderStatus = 'activo' | 'inactivo' | 'suspendido'
type VehicleType = 'bicicleta' | 'moto' | 'auto' | 'caminando'
type OrderStatus =
  | 'creado' | 'asignado' | 'aceptado'
  | 'en_punto_de_venta' | 'en_transito'
  | 'en_punto_de_entrega' | 'entregado' | 'cancelado'
```

---

## 7. Notas críticas para el frontend

**WebSocket / tiempo real:** NO implementado. Usar polling a `GET /riders/online` con `setInterval` en `useRiderTracking.ts` mientras el backend lo desarrolla.

**Geocodificación:** el backend usa Nominatim (OSM) internamente — no llamar a Nominatim desde el frontend. Si se necesita geocodificar una dirección, enviarla como `address` en el body del PdV y el backend devuelve `lat/lng`.

**KML en zonas:** el backend almacena el KML en S3 y devuelve `kmlUrl`. En el mapa de Leaflet, cargar ese URL con `leaflet-omnivore`:
```typescript
import omnivore from '@mapbox/leaflet-omnivore'
omnivore.kml(zone.kmlUrl).addTo(map)
```

**Multi-tenancy:** la mayoría de endpoints están bajo `/commerce/:commerceId/`. El `commerceId` activo debe vivir en el store de auth (se obtiene de `GET /users/me → commerces[0].commerceId` para CommerceAdmin).

**Asignación de riders:** antes de asignar, llamar a `GET /commerce/:cId/orders/:oId/eligible-riders` para mostrar solo los disponibles. Si el operador quiere asignar uno no elegible, usar `force: true`.

**COD (Cash on Delivery):** `codAmountCents` es entero en centavos. Dividir por 100 para mostrar en pantalla. Ej: `50000 centavos = $500.00 COP`.

*Última actualización: Abril 2026 — SPDY v2*
