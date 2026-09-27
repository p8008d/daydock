import type { DashboardData } from './types'

// Compare visible content and order. Selecting a tab or regenerating IDs isn't
// customization. The comparison runs locally; only its boolean result is sent.
export function isDashboardCustomized(data: DashboardData, defaults: DashboardData): boolean {
  const content = (value: DashboardData) => value.dashboards.map(dashboard => ({
    name: dashboard.name,
    wallpaper: {
      type: dashboard.wallpaper?.type ?? 'gradient',
      value: dashboard.wallpaper?.value ?? 'gradient-midnight'
    },
    categories: dashboard.categories.map(category => ({
      name: category.name,
      items: category.items.map(item => ({
        name: item.name,
        url: item.url,
        description: item.description ?? ''
      }))
    }))
  }))
  return JSON.stringify(content(data)) !== JSON.stringify(content(defaults))
}
