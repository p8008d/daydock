// Daydock Dashboard Types

export interface Item {
  id: string
  name: string
  url: string
  description?: string
}

export interface Category {
  id: string
  name: string
  items: Item[]
}

export interface Wallpaper {
  type: 'default' | 'gradient' | 'image'
  value: string
}

export interface Dashboard {
  id: string
  name: string
  wallpaper?: Wallpaper
  categories: Category[]
}

export interface DashboardData {
  activeDashboard: string | null
  dashboards: Dashboard[]
}
