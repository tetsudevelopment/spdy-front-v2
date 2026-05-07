import type { Role } from '~/stores/auth.store'

export type UserRole = Role

export interface UserCommerce {
  commerceId: string
  commerceName: string
}

export interface User {
  id: string
  username: string
  role: UserRole
  fullName?: string
  email?: string
  phone?: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt?: string     // ISO
  createdAt: string        // ISO
  updatedAt?: string
  commerces: UserCommerce[]
}

export interface CreateUserDto {
  username: string
  password: string
  role: UserRole
  fullName?: string
  email?: string
  phone?: string
  commerceIds?: string[]
}

export interface UpdateUserDto {
  fullName?: string
  email?: string
  phone?: string
  role?: UserRole
  isActive?: boolean
}

// /users sigue el "Patrón B" del API_CONTRACT.md §1
export interface ListUsersResponse {
  users: User[]
  pagination: {
    limit: number
    offset: number
    count: number
  }
}

export interface ListUsersParams {
  limit?: number
  offset?: number
  search?: string
}

// Mínimo necesario para poblar el MultiSelect de comercios del modal de creación.
export interface CommerceLite {
  id: string
  name: string
}

export interface PaginatedCommerceLiteResponse {
  data: CommerceLite[]
  total: number
  page: number
  limit: number
}
