// Daydock Dashboard - Storage Composable
import type { DashboardData, Dashboard, Category, Item, Wallpaper } from '~~/shared/types'
import type { ActivityEvent } from '~~/shared/activity'
import { storageKeys, readBrowserStorage, removeBrowserStorage } from '~~/shared/browserStorage'

const STORAGE_KEY = storageKeys.dashboard
const DEFAULT_DATA_URL = '/data/items.json'
const MAX_STORAGE_MB = 4 // Leave headroom below 5MB limit
const MAX_IMAGE_SIZE = 500 * 1024 // 500KB after compression

// Generate unique ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Reactive state
const state = ref<DashboardData | null>(null)

// Storage error event bus
type StorageErrorHandler = (error: { type: string; message: string; details?: any }) => void
const errorHandlers: StorageErrorHandler[] = []

export function onStorageError(handler: StorageErrorHandler) {
  errorHandlers.push(handler)
  return () => {
    const index = errorHandlers.indexOf(handler)
    if (index > -1) errorHandlers.splice(index, 1)
  }
}

function emitStorageError(type: string, message: string, details?: any) {
  console.error(`[Storage Error] ${type}: ${message}`, details)
  errorHandlers.forEach(handler => handler({ type, message, details }))
}

// ============ Validation Helpers ============

function isValidItem(item: any): item is Item {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    typeof item.url === 'string' &&
    item.url.length > 0
  )
}

function isValidCategory(category: any): category is Category {
  return (
    category &&
    typeof category === 'object' &&
    typeof category.id === 'string' &&
    category.id.length > 0 &&
    typeof category.name === 'string' &&
    category.name.length > 0 &&
    Array.isArray(category.items)
  )
}

function isValidDashboard(dashboard: any): dashboard is Dashboard {
  return (
    dashboard &&
    typeof dashboard === 'object' &&
    typeof dashboard.id === 'string' &&
    dashboard.id.length > 0 &&
    typeof dashboard.name === 'string' &&
    dashboard.name.length > 0 &&
    Array.isArray(dashboard.categories)
  )
}

function isValidDashboardData(data: any): data is DashboardData {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.dashboards) &&
    data.dashboards.length > 0 &&
    data.dashboards.every(isValidDashboard)
  )
}

// Sanitize and repair data structure
function sanitizeData(data: any): DashboardData | null {
  if (!data || typeof data !== 'object') return null
  if (!Array.isArray(data.dashboards)) return null

  const sanitizedDashboards: Dashboard[] = []

  for (const dash of data.dashboards) {
    if (!isValidDashboard(dash)) continue

    const sanitizedCategories: Category[] = []
    for (const cat of dash.categories) {
      if (!isValidCategory(cat)) continue

      const sanitizedItems: Item[] = []
      for (const item of cat.items) {
        if (isValidItem(item)) {
          sanitizedItems.push({
            id: item.id,
            name: item.name,
            url: item.url,
            description: item.description || ''
          })
        } else if (item && typeof item === 'object') {
          // Try to repair item with missing ID
          const repaired: Item = {
            id: item.id || generateId(),
            name: item.name || 'Unnamed',
            url: item.url || '#',
            description: item.description || ''
          }
          if (repaired.url !== '#') {
            sanitizedItems.push(repaired)
          }
        }
      }

      sanitizedCategories.push({
        id: cat.id,
        name: cat.name,
        items: sanitizedItems
      })
    }

    sanitizedDashboards.push({
      id: dash.id,
      name: dash.name,
      wallpaper: dash.wallpaper,
      categories: sanitizedCategories
    })
  }

  if (sanitizedDashboards.length === 0) return null

  // Ensure activeDashboard points to valid dashboard
  let activeDashboard = data.activeDashboard
  if (!activeDashboard || !sanitizedDashboards.find(d => d.id === activeDashboard)) {
    activeDashboard = sanitizedDashboards[0].id
  }

  return {
    activeDashboard,
    dashboards: sanitizedDashboards
  }
}

// ============ Storage Quota Helpers ============

function getStorageUsage(): { used: number; available: number; percentage: number } {
  if (import.meta.server) return { used: 0, available: MAX_STORAGE_MB * 1024 * 1024, percentage: 0 }

  try {
    let total = 0
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage.getItem(key)?.length || 0
      }
    }
    // Multiply by 2 for UTF-16 encoding
    const usedBytes = total * 2
    const maxBytes = MAX_STORAGE_MB * 1024 * 1024
    return {
      used: usedBytes,
      available: maxBytes - usedBytes,
      percentage: (usedBytes / maxBytes) * 100
    }
  } catch {
    return { used: 0, available: MAX_STORAGE_MB * 1024 * 1024, percentage: 0 }
  }
}

function checkStorageQuota(dataToSave: string): boolean {
  const usage = getStorageUsage()
  const newDataSize = dataToSave.length * 2
  const currentDataSize = (localStorage.getItem(STORAGE_KEY)?.length || 0) * 2
  const netIncrease = newDataSize - currentDataSize

  if (usage.used + netIncrease > MAX_STORAGE_MB * 1024 * 1024) {
    return false
  }
  return true
}

// ============ Image Compression ============

export async function compressImage(base64: string, maxSize: number = MAX_IMAGE_SIZE): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img

      // Scale down if too large
      const maxDimension = 1920
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      // Start with high quality and reduce if needed
      let quality = 0.8
      let result = canvas.toDataURL('image/jpeg', quality)

      // Iteratively reduce quality until size is acceptable
      while (result.length > maxSize && quality > 0.1) {
        quality -= 0.1
        result = canvas.toDataURL('image/jpeg', quality)
      }

      // If still too large, scale down dimensions
      while (result.length > maxSize && width > 400) {
        width = Math.round(width * 0.8)
        height = Math.round(height * 0.8)
        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)
        result = canvas.toDataURL('image/jpeg', 0.7)
      }

      resolve(result)
    }
    img.onerror = () => resolve(base64) // Return original on error
    img.src = base64
  })
}

export function useStorage() {
  const activity = useActivity()
  // ============ Core Data Methods ============

  function getData(): DashboardData | null {
    if (import.meta.server) return null

    if (state.value) return state.value

    try {
      const raw = readBrowserStorage(localStorage, 'dashboard')
      if (!raw) return null

      const parsed = JSON.parse(raw)

      // Validate and sanitize on load
      if (!isValidDashboardData(parsed)) {
        const sanitized = sanitizeData(parsed)
        if (sanitized) {
          emitStorageError('validation', 'Data was corrupted and has been repaired', { original: parsed })
          state.value = sanitized
          // Save repaired data
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized))
          } catch {}
          return sanitized
        } else {
          emitStorageError('validation', 'Data is corrupted and cannot be repaired. Please reset.')
          return null
        }
      }

      state.value = parsed
      return state.value
    } catch (e) {
      emitStorageError('parse', 'Failed to parse stored data', e)
      return null
    }
  }

  function setData(data: DashboardData, event: ActivityEvent | null = 'dashboard_edit'): boolean {
    if (import.meta.server) return false

    // Validate before saving
    if (!isValidDashboardData(data)) {
      emitStorageError('validation', 'Attempted to save invalid data structure')
      return false
    }

    try {
      const serialized = JSON.stringify(data)

      // Check quota before saving
      if (!checkStorageQuota(serialized)) {
        emitStorageError('quota', 'Storage quota exceeded. Try removing some wallpapers or dashboards.', {
          usage: getStorageUsage(),
          dataSize: serialized.length * 2
        })
        return false
      }

      const changed = localStorage.getItem(STORAGE_KEY) !== serialized
      localStorage.setItem(STORAGE_KEY, serialized)
      state.value = data
      if (changed && event) activity.track(event)
      return true
    } catch (e: any) {
      // Handle quota exceeded error
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        emitStorageError('quota', 'Storage quota exceeded. Try removing some wallpapers or dashboards.')
      } else {
        emitStorageError('save', 'Failed to save data', e)
      }
      return false
    }
  }

  async function loadDefaults(): Promise<DashboardData> {
    try {
      const response = await fetch(DEFAULT_DATA_URL + '?t=' + Date.now())
      if (!response.ok) throw new Error('Failed to load defaults')
      const data: DashboardData = await response.json()

      // Ensure IDs exist
      data.dashboards = data.dashboards.map(dash => ({
        ...dash,
        id: dash.id || generateId(),
        categories: dash.categories.map(cat => ({
          ...cat,
          id: cat.id || generateId(),
          items: cat.items.map(item => ({
            ...item,
            id: item.id || generateId()
          }))
        }))
      }))

      return data
    } catch (e) {
      console.error('Error loading defaults:', e)
      return { activeDashboard: null, dashboards: [] }
    }
  }

  async function init(): Promise<DashboardData> {
    let data = getData()
    if (!data || !data.dashboards || data.dashboards.length === 0) {
      data = await loadDefaults()
      if (!setData(data, null)) {
        emitStorageError('init', 'Failed to initialize storage with default data')
      }
    }

    // Ensure activeDashboard is valid
    if (data && data.dashboards.length > 0) {
      const validActive = data.dashboards.find(d => d.id === data!.activeDashboard)
      if (!validActive) {
        data.activeDashboard = data.dashboards[0].id
        setData(data, null)
      }
    }

    return data
  }

  // ============ Dashboard Methods ============

  function getDashboards(): Dashboard[] {
    const data = getData()
    return data ? data.dashboards : []
  }

  function getActiveDashboardId(): string | null {
    const data = getData()
    if (!data || data.dashboards.length === 0) return null

    // Ensure activeDashboard points to valid dashboard
    const valid = data.dashboards.find(d => d.id === data.activeDashboard)
    if (valid) return data.activeDashboard

    // Fix invalid reference
    return data.dashboards[0]?.id || null
  }

  function setActiveDashboard(dashboardId: string): boolean {
    const data = getData()
    if (!data) return false

    // Verify dashboard exists
    if (!data.dashboards.find(d => d.id === dashboardId)) {
      emitStorageError('reference', `Dashboard ${dashboardId} does not exist`)
      return false
    }

    data.activeDashboard = dashboardId
    return setData(data, 'dashboard_switch')
  }

  function getActiveDashboard(): Dashboard | null {
    const data = getData()
    if (!data || data.dashboards.length === 0) return null

    const active = data.dashboards.find(d => d.id === data.activeDashboard)
    if (active) return active

    // Fallback and fix reference
    const fallback = data.dashboards[0]
    if (fallback) {
      data.activeDashboard = fallback.id
      setData(data, null)
    }
    return fallback || null
  }

  function addDashboard(name: string): Dashboard | null {
    const data = getData()
    if (!data) return null

    const dashboard: Dashboard = {
      id: generateId(),
      name: name.trim() || 'New Dashboard',
      categories: []
    }

    data.dashboards.push(dashboard)
    if (!setData(data)) return null
    return dashboard
  }

  function updateDashboard(dashboardId: string, updates: Partial<Dashboard>): boolean {
    const data = getData()
    if (!data) return false

    const index = data.dashboards.findIndex(d => d.id === dashboardId)
    if (index === -1) {
      emitStorageError('reference', `Dashboard ${dashboardId} not found`)
      return false
    }

    // Don't allow changing ID
    const { id, ...safeUpdates } = updates
    data.dashboards[index] = { ...data.dashboards[index], ...safeUpdates }
    return setData(data)
  }

  function deleteDashboard(dashboardId: string): boolean {
    const data = getData()
    if (!data || data.dashboards.length <= 1) {
      emitStorageError('operation', 'Cannot delete the only dashboard')
      return false
    }

    data.dashboards = data.dashboards.filter(d => d.id !== dashboardId)

    if (data.activeDashboard === dashboardId) {
      data.activeDashboard = data.dashboards[0]?.id || null
    }

    return setData(data)
  }

  // ============ Category Methods ============

  function getCategories(dashboardId?: string): Category[] {
    const data = getData()
    if (!data || data.dashboards.length === 0) return []

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return []

    const dashboard = data.dashboards.find(d => d.id === targetId)
    return dashboard ? dashboard.categories : []
  }

  function addCategory(name: string, dashboardId?: string): Category | null {
    const data = getData()
    if (!data || data.dashboards.length === 0) return null

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return null

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) {
      emitStorageError('reference', `Dashboard ${targetId} not found`)
      return null
    }

    const category: Category = {
      id: generateId(),
      name: name.trim() || 'New Category',
      items: []
    }

    dashboard.categories.push(category)
    if (!setData(data)) return null
    return category
  }

  function updateCategory(categoryId: string, updates: Partial<Category>, dashboardId?: string): boolean {
    const data = getData()
    if (!data || data.dashboards.length === 0) return false

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return false

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) return false

    const index = dashboard.categories.findIndex(c => c.id === categoryId)
    if (index === -1) return false

    // Don't allow changing ID
    const { id, ...safeUpdates } = updates
    dashboard.categories[index] = { ...dashboard.categories[index], ...safeUpdates }
    return setData(data)
  }

  function deleteCategory(categoryId: string, dashboardId?: string): boolean {
    const data = getData()
    if (!data || data.dashboards.length === 0) return false

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return false

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) return false

    dashboard.categories = dashboard.categories.filter(c => c.id !== categoryId)
    return setData(data)
  }

  function reorderCategories(categoryIds: string[], dashboardId?: string): boolean {
    const data = getData()
    if (!data || data.dashboards.length === 0) return false

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return false

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) return false

    const categoryMap: Record<string, Category> = {}
    dashboard.categories.forEach(c => categoryMap[c.id] = c)

    dashboard.categories = categoryIds
      .map(id => categoryMap[id])
      .filter((c): c is Category => c !== undefined)

    return setData(data)
  }

  // ============ Item Methods ============

  function addItem(categoryId: string, name: string, url: string, description = '', dashboardId?: string): Item | null {
    const data = getData()
    if (!data || data.dashboards.length === 0) return null

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return null

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) return null

    const category = dashboard.categories.find(c => c.id === categoryId)
    if (!category) return null

    const item: Item = {
      id: generateId(),
      name: name.trim() || 'New Item',
      url: url.trim(),
      description: description.trim()
    }

    if (!item.url) {
      emitStorageError('validation', 'Item URL is required')
      return null
    }

    category.items.push(item)
    if (!setData(data)) return null
    return item
  }

  function updateItem(categoryId: string, itemId: string, updates: Partial<Item>, dashboardId?: string): boolean {
    const data = getData()
    if (!data || data.dashboards.length === 0) return false

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return false

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) return false

    const category = dashboard.categories.find(c => c.id === categoryId)
    if (!category) return false

    const itemIndex = category.items.findIndex(t => t.id === itemId)
    if (itemIndex === -1) return false

    // Don't allow changing ID
    const { id, ...safeUpdates } = updates
    category.items[itemIndex] = { ...category.items[itemIndex], ...safeUpdates }
    return setData(data)
  }

  function deleteItem(categoryId: string, itemId: string, dashboardId?: string): boolean {
    const data = getData()
    if (!data || data.dashboards.length === 0) return false

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return false

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) return false

    const category = dashboard.categories.find(c => c.id === categoryId)
    if (!category) return false

    category.items = category.items.filter(t => t.id !== itemId)
    return setData(data)
  }

  function moveItem(fromCategoryId: string, toCategoryId: string, itemId: string, newIndex?: number, dashboardId?: string): boolean {
    const data = getData()
    if (!data || data.dashboards.length === 0) return false

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return false

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) return false

    const fromCategory = dashboard.categories.find(c => c.id === fromCategoryId)
    const toCategory = dashboard.categories.find(c => c.id === toCategoryId)
    if (!fromCategory || !toCategory) return false

    const itemIndex = fromCategory.items.findIndex(t => t.id === itemId)
    if (itemIndex === -1) return false

    const [item] = fromCategory.items.splice(itemIndex, 1)

    if (newIndex !== undefined && newIndex >= 0) {
      toCategory.items.splice(newIndex, 0, item)
    } else {
      toCategory.items.push(item)
    }

    return setData(data)
  }

  function reorderItems(categoryId: string, itemIds: string[], dashboardId?: string): boolean {
    const data = getData()
    if (!data || data.dashboards.length === 0) return false

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return false

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) return false

    const category = dashboard.categories.find(c => c.id === categoryId)
    if (!category) return false

    // Build map of existing items
    const itemMap: Record<string, Item> = {}
    category.items.forEach(t => itemMap[t.id] = t)

    // Also check other categories for items that were dragged in
    for (const otherCat of dashboard.categories) {
      if (otherCat.id !== categoryId) {
        otherCat.items.forEach(t => {
          if (!itemMap[t.id]) itemMap[t.id] = t
        })
      }
    }

    // Reorder based on provided IDs
    const newItems = itemIds
      .map(id => itemMap[id])
      .filter((t): t is Item => t !== undefined)

    // Remove items that moved to this category from their original categories
    for (const otherCat of dashboard.categories) {
      if (otherCat.id !== categoryId) {
        otherCat.items = otherCat.items.filter(t => !itemIds.includes(t.id))
      }
    }

    category.items = newItems
    return setData(data)
  }

  // ============ Import/Export ============

  async function resetDashboard(dashboardId?: string): Promise<boolean> {
    const data = getData()
    if (!data) return false

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return false

    const index = data.dashboards.findIndex(d => d.id === targetId)
    if (index === -1) return false

    const defaults = await loadDefaults()

    // Try to find matching default by ID
    let defaultDash = defaults.dashboards.find(d => d.id === targetId)

    // If not found by ID, try to find by name (case-insensitive)
    if (!defaultDash) {
      const currentName = data.dashboards[index].name.toLowerCase()
      defaultDash = defaults.dashboards.find(d => d.name.toLowerCase() === currentName)
    }

    if (defaultDash) {
      // Reset to default but keep the current ID
      data.dashboards[index] = {
        ...defaultDash,
        id: targetId // Keep original ID
      }
    } else {
      // No matching default found - just clear categories but keep the dashboard
      data.dashboards[index] = {
        ...data.dashboards[index],
        categories: [],
        wallpaper: undefined
      }
    }

    return setData(data)
  }

  function exportDashboard(dashboardId?: string): boolean {
    if (import.meta.server) return false

    const data = getData()
    if (!data) return false

    const targetId = dashboardId || data.activeDashboard
    if (!targetId) return false

    const dashboard = data.dashboards.find(d => d.id === targetId)
    if (!dashboard) return false

    // Deep clone and validate before export
    const exportData: Dashboard = JSON.parse(JSON.stringify(dashboard))

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `daydock-${dashboard.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`
    a.click()

    URL.revokeObjectURL(url)
    activity.track('dashboard_export')
    return true
  }

  function importDashboard(file: File): Promise<Dashboard> {
    return new Promise((resolve, reject) => {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error('File too large (max 5MB)'))
        return
      }

      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const raw = e.target?.result as string
          let dashboard: any

          try {
            dashboard = JSON.parse(raw)
          } catch {
            throw new Error('Invalid JSON format')
          }

          // Deep validation
          if (!dashboard || typeof dashboard !== 'object') {
            throw new Error('Invalid dashboard format')
          }

          if (!dashboard.name || typeof dashboard.name !== 'string') {
            throw new Error('Dashboard must have a name')
          }

          if (!Array.isArray(dashboard.categories)) {
            throw new Error('Dashboard must have categories array')
          }

          // Sanitize and validate all nested structures
          const sanitizedCategories: Category[] = []

          for (let i = 0; i < dashboard.categories.length; i++) {
            const cat = dashboard.categories[i]

            if (!cat || typeof cat !== 'object') {
              console.warn(`Skipping invalid category at index ${i}`)
              continue
            }

            if (!cat.name || typeof cat.name !== 'string') {
              console.warn(`Skipping category without name at index ${i}`)
              continue
            }

            const sanitizedItems: Item[] = []

            if (Array.isArray(cat.items)) {
              for (let j = 0; j < cat.items.length; j++) {
                const item = cat.items[j]

                if (!item || typeof item !== 'object') continue

                if (!item.name || typeof item.name !== 'string') {
                  console.warn(`Skipping item without name in category ${cat.name}`)
                  continue
                }

                if (!item.url || typeof item.url !== 'string') {
                  console.warn(`Skipping item without URL in category ${cat.name}`)
                  continue
                }

                sanitizedItems.push({
                  id: (typeof item.id === 'string' && item.id) ? item.id : generateId(),
                  name: item.name.trim(),
                  url: item.url.trim(),
                  description: (typeof item.description === 'string') ? item.description.trim() : ''
                })
              }
            }

            sanitizedCategories.push({
              id: (typeof cat.id === 'string' && cat.id) ? cat.id : generateId(),
              name: cat.name.trim(),
              items: sanitizedItems
            })
          }

          // Create sanitized dashboard with new ID to avoid collisions
          const sanitizedDashboard: Dashboard = {
            id: generateId(), // Always generate new ID on import
            name: dashboard.name.trim(),
            categories: sanitizedCategories,
            wallpaper: dashboard.wallpaper && typeof dashboard.wallpaper === 'object'
              ? dashboard.wallpaper
              : undefined
          }

          const data = getData()
          if (!data) throw new Error('Storage not initialized')

          // Add as new dashboard (don't overwrite existing)
          data.dashboards.push(sanitizedDashboard)
          data.activeDashboard = sanitizedDashboard.id

          if (!setData(data)) {
            throw new Error('Failed to save imported dashboard (storage may be full)')
          }

          resolve(sanitizedDashboard)
        } catch (err: any) {
          reject(err)
        }
      }

      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  async function resetAll(): Promise<DashboardData> {
    const data = await loadDefaults()
    if (!setData(data)) {
      emitStorageError('reset', 'Failed to reset all data')
    }
    return data
  }

  // ============ Utility Methods ============

  function getStorageInfo() {
    return getStorageUsage()
  }

  function clearCorruptedData(): boolean {
    if (import.meta.server) return false
    try {
      removeBrowserStorage(localStorage, 'dashboard')
      state.value = null
      return true
    } catch {
      return false
    }
  }

  return {
    // Core
    init,
    getData,
    // Dashboards
    getDashboards,
    getActiveDashboardId,
    getActiveDashboard,
    setActiveDashboard,
    addDashboard,
    updateDashboard,
    deleteDashboard,
    // Categories
    getCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    // Items
    addItem,
    updateItem,
    deleteItem,
    moveItem,
    reorderItems,
    // Utils
    resetDashboard,
    exportDashboard,
    importDashboard,
    resetAll,
    generateId,
    // New utilities
    getStorageInfo,
    clearCorruptedData
  }
}
