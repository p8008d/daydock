<script setup lang="ts">
import type { Dashboard } from '~~/shared/types'
import { compressImage } from '~/composables/useStorage'

const props = defineProps<{
  dashboard: Dashboard | null
}>()

const emit = defineEmits<{
  wallpaperChange: []
  dashboardsChange: []
  categoriesChange: []
}>()

const storage = inject('storage') as ReturnType<typeof useStorage>

// Dropdown state
const showDropdown = ref(false)

// Settings modal
const showSettings = ref(false)
const dashboardName = ref('')

// Add dashboard modal
const showAddDashboard = ref(false)
const newDashboardName = ref('')

// Add category modal
const showAddCategory = ref(false)
const newCategoryName = ref('')

// Header scroll state
const isScrolled = ref(false)

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

function handleScroll() {
  isScrolled.value = window.scrollY > 20
}

// Close dropdown on outside click
function closeDropdown() {
  showDropdown.value = false
}

// Open settings
function openSettings() {
  if (props.dashboard) {
    dashboardName.value = props.dashboard.name
  }
  showSettings.value = true
}

// Dashboard name change
let nameTimeout: ReturnType<typeof setTimeout>
function onNameChange() {
  clearTimeout(nameTimeout)
  nameTimeout = setTimeout(() => {
    const name = dashboardName.value.trim()
    if (name && props.dashboard) {
      storage.updateDashboard(props.dashboard.id, { name })
      emit('dashboardsChange')
    }
  }, 500)
}

// Delete dashboard
function deleteDashboard() {
  const dashboards = storage.getDashboards()
  if (dashboards.length <= 1) {
    alert('Cannot delete the only dashboard')
    return
  }

  if (props.dashboard && confirm(`Delete "${props.dashboard.name}" and all its categories?`)) {
    storage.deleteDashboard(props.dashboard.id)
    showSettings.value = false
    emit('dashboardsChange')
    emit('categoriesChange')
    emit('wallpaperChange')
  }
}

// Export/Import/Reset
function exportDashboard() {
  storage.exportDashboard()
}

async function importDashboard(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    await storage.importDashboard(file)
    showSettings.value = false
    emit('dashboardsChange')
    emit('categoriesChange')
    emit('wallpaperChange')
  } catch (err: any) {
    alert('Import failed: ' + err.message)
  }

  input.value = ''
}

async function resetDashboard() {
  if (props.dashboard && confirm(`Reset "${props.dashboard.name}" to defaults?`)) {
    const success = await storage.resetDashboard()
    if (success) {
      showSettings.value = false
      emit('categoriesChange')
      emit('wallpaperChange')
    } else {
      alert('No default found for this dashboard')
    }
  }
}

async function resetAll() {
  if (confirm('Reset ALL dashboards to defaults? This will remove all customizations.')) {
    await storage.resetAll()
    showSettings.value = false
    emit('dashboardsChange')
    emit('categoriesChange')
    emit('wallpaperChange')
  }
}

// Wallpaper selection
const wallpaperOptions = [
  { type: 'image', value: '/images/ai_bg.webp' },
  { type: 'image', value: '/images/trad_bg.webp' },
  { type: 'image', value: '/images/sec_bg.webp' },
  { type: 'image', value: '/images/prod_bg.webp' },
  { type: 'gradient', value: 'gradient-midnight' },
  { type: 'gradient', value: 'gradient-sunset' },
  { type: 'gradient', value: 'gradient-ocean' },
  { type: 'gradient', value: 'gradient-cosmic' }
]

function selectWallpaper(type: string, value: string) {
  if (props.dashboard) {
    storage.updateDashboard(props.dashboard.id, { wallpaper: { type: type as any, value } })
    emit('wallpaperChange')
  }
}

function isActiveWallpaper(type: string, value: string): boolean {
  const wp = props.dashboard?.wallpaper
  if (!wp) return false
  return wp.type === type && wp.value === value
}

async function uploadWallpaper(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > 5 * 1024 * 1024) {
    alert('Image too large (max 5MB)')
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target?.result as string
    try {
      // Compress image to reduce storage usage
      const compressed = await compressImage(base64)
      selectWallpaper('image', compressed)
    } catch (err) {
      console.error('Failed to compress image:', err)
      // Fallback to original if compression fails
      selectWallpaper('image', base64)
    }
  }
  reader.readAsDataURL(file)
  input.value = ''
}

// Add dashboard
function addDashboard() {
  const name = newDashboardName.value.trim()
  if (!name) return

  const dashboard = storage.addDashboard(name)
  if (dashboard) {
    storage.setActiveDashboard(dashboard.id)
    showAddDashboard.value = false
    newDashboardName.value = ''
    emit('dashboardsChange')
    emit('categoriesChange')
    emit('wallpaperChange')
  }
}

// Add category
function addCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return

  storage.addCategory(name)
  showAddCategory.value = false
  newCategoryName.value = ''
  emit('categoriesChange')
}
</script>

<template>
  <header class="header" :class="{ scrolled: isScrolled }">
    <div class="header-container">
      <a href="/" class="logo" aria-label="Daydock home">
        <img src="/logo.svg" alt="Daydock" class="logo-icon">
      </a>
      <nav class="header-actions">
        <!-- Add Dropdown -->
        <div class="header-dropdown" :class="{ open: showDropdown }">
          <button class="btn-icon" title="Add" @click.stop="showDropdown = !showDropdown">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          <div v-if="showDropdown" class="dropdown-menu" @click="closeDropdown">
            <button class="dropdown-item" @click="showAddDashboard = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 3v18M3 9h6"/>
              </svg>
              Dashboard
            </button>
            <button class="dropdown-item" @click="showAddCategory = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              Category
            </button>
          </div>
        </div>

        <!-- Settings Button -->
        <button class="btn-icon" title="Settings" @click="openSettings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
      </nav>
    </div>
  </header>

  <!-- Click outside to close dropdown -->
  <div v-if="showDropdown" class="dropdown-overlay" @click="closeDropdown" />

  <!-- Settings Modal -->
  <Teleport to="body">
    <div v-if="showSettings" class="modal open" @click.self="showSettings = false">
      <div class="modal-backdrop" @click="showSettings = false" />
      <div class="modal-content">
        <div class="modal-header">
          <h3>Dashboard Settings</h3>
          <button class="btn-icon modal-close" @click="showSettings = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <!-- Dashboard Name -->
          <div class="settings-group">
            <label class="settings-label">Name</label>
            <input v-model="dashboardName" type="text" class="input" placeholder="Dashboard name" @input="onNameChange">
          </div>

          <!-- Wallpaper -->
          <div class="settings-group">
            <label class="settings-label">Wallpaper</label>
            <div class="wallpaper-grid">
              <button
                v-for="(opt, i) in wallpaperOptions"
                :key="i"
                class="wallpaper-option"
                :class="{ active: isActiveWallpaper(opt.type, opt.value) }"
                @click="selectWallpaper(opt.type, opt.value)"
              >
                <div
                  class="wallpaper-preview"
                  :class="opt.type === 'gradient' ? opt.value : ''"
                  :style="opt.type === 'image' ? `background-image: url(${opt.value})` : ''"
                />
              </button>
            </div>
            <div class="wallpaper-upload">
              <label class="btn btn-secondary wallpaper-upload-btn">
                Custom Image
                <input type="file" accept="image/*" hidden @change="uploadWallpaper">
              </label>
            </div>
          </div>

          <!-- Data -->
          <div class="settings-group">
            <label class="settings-label">Data</label>
            <div class="settings-buttons">
              <button class="btn btn-secondary" @click="exportDashboard">Export</button>
              <label class="btn btn-secondary">
                Import
                <input type="file" accept=".json" hidden @change="importDashboard">
              </label>
              <button class="btn btn-danger" @click="resetDashboard">Reset</button>
            </div>
          </div>

          <!-- Danger Zone -->
          <div class="settings-group settings-group--danger">
            <label class="settings-label">Danger Zone</label>
            <div class="settings-buttons-vertical">
              <button class="btn btn-danger btn-full" @click="deleteDashboard">Delete This Dashboard</button>
              <button class="btn btn-secondary btn-full" @click="resetAll">Reset All Dashboards</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Add Dashboard Modal -->
  <Teleport to="body">
    <div v-if="showAddDashboard" class="modal open" @click.self="showAddDashboard = false">
      <div class="modal-backdrop" @click="showAddDashboard = false" />
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add Dashboard</h3>
          <button class="btn-icon modal-close" @click="showAddDashboard = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="addDashboard">
            <div class="form-group">
              <label class="form-label">Name *</label>
              <input v-model="newDashboardName" type="text" class="input" placeholder="e.g., Work" required>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="showAddDashboard = false">Cancel</button>
              <button type="submit" class="btn btn-primary">Add</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Add Category Modal -->
  <Teleport to="body">
    <div v-if="showAddCategory" class="modal open" @click.self="showAddCategory = false">
      <div class="modal-backdrop" @click="showAddCategory = false" />
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add Category</h3>
          <button class="btn-icon modal-close" @click="showAddCategory = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="addCategory">
            <div class="form-group">
              <label class="form-label">Name *</label>
              <input v-model="newCategoryName" type="text" class="input" placeholder="e.g., Tools" required>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="showAddCategory = false">Cancel</button>
              <button type="submit" class="btn btn-primary">Add</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dropdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
}
</style>
