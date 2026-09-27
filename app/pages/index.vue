<script setup lang="ts">
import type { Dashboard, Category } from '~~/shared/types'
import { onStorageError } from '~/composables/useStorage'

const storage = useStorage()
const activity = useActivity()
const activityEnabled = String(useRuntimeConfig().public.activityEnabled) === 'true'

// Error notification state
const errorMessage = ref<string | null>(null)
const showError = ref(false)
let errorTimeout: ReturnType<typeof setTimeout> | null = null

function showErrorNotification(message: string) {
  if (errorTimeout) clearTimeout(errorTimeout)
  errorMessage.value = message
  showError.value = true
  errorTimeout = setTimeout(() => {
    showError.value = false
    errorMessage.value = null
  }, 5000)
}

function dismissError() {
  if (errorTimeout) clearTimeout(errorTimeout)
  showError.value = false
  errorMessage.value = null
}

// Subscribe to storage errors
onMounted(() => {
  const unsubscribe = onStorageError((error) => {
    showErrorNotification(error.message)
  })
  onUnmounted(unsubscribe)
})

// State
const isLoading = ref(true)
const isEditMode = ref(false)
const dashboards = ref<Dashboard[]>([])
const activeDashboard = ref<Dashboard | null>(null)
const categories = ref<Category[]>([])

// Wallpaper state
const wallpaperClass = ref('')
const wallpaperStyle = ref('')

// Add category modal
const showAddCategory = ref(false)
const newCategoryName = ref('')

function addCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return

  storage.addCategory(name)
  showAddCategory.value = false
  newCategoryName.value = ''
  categories.value = storage.getCategories()
}

// Initialize on client
onMounted(async () => {
  const hadSavedData = !!storage.getData()
  await storage.init()
  loadData()
  isLoading.value = false
  activity.start(hadSavedData)
})

function loadData() {
  dashboards.value = storage.getDashboards()
  activeDashboard.value = storage.getActiveDashboard()
  categories.value = storage.getCategories()
  loadWallpaper()
}

function switchDashboard(id: string) {
  storage.setActiveDashboard(id)
  loadData()
}

function loadWallpaper() {
  const dashboard = storage.getActiveDashboard()
  let wp = dashboard?.wallpaper

  if (!wp) {
    wp = { type: 'gradient', value: 'gradient-midnight' }
  }

  if (wp.type === 'gradient') {
    wallpaperClass.value = wp.value
    wallpaperStyle.value = ''
  } else if (wp.type === 'image') {
    wallpaperClass.value = 'custom-image'
    wallpaperStyle.value = `background-image: url(${wp.value})`
  }
}

// Event handlers from child components
function onCategoriesChange() {
  categories.value = storage.getCategories()
}

function onDashboardsChange() {
  dashboards.value = storage.getDashboards()
  activeDashboard.value = storage.getActiveDashboard()
}

function onWallpaperChange() {
  loadWallpaper()
}

// Toggle edit mode
function toggleEditMode() {
  isEditMode.value = !isEditMode.value
}

// Provide data to child components
provide('storage', storage)
provide('loadData', loadData)
provide('isEditMode', isEditMode)
provide('toggleEditMode', toggleEditMode)
provide('onCategoriesChange', onCategoriesChange)
provide('onDashboardsChange', onDashboardsChange)
provide('onWallpaperChange', onWallpaperChange)
</script>

<template>
  <div class="app">
    <!-- Error Toast Notification -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="showError" class="error-toast" @click="dismissError">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{{ errorMessage }}</span>
          <button class="error-toast-close" @click.stop="dismissError">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- Wallpaper Background -->
    <div
      class="wallpaper"
      :class="wallpaperClass"
      :style="wallpaperStyle"
    />

    <!-- Header -->
    <AppHeader
      :dashboard="activeDashboard"
      @wallpaper-change="onWallpaperChange"
      @dashboards-change="onDashboardsChange"
      @categories-change="onCategoriesChange"
    />

    <!-- Dashboard Tabs -->
    <DashboardTabs
      :dashboards="dashboards"
      :active-id="activeDashboard?.id"
      @switch="switchDashboard"
    />

    <!-- Main Content -->
    <section class="dashboard-hero">
      <div class="dashboard-container">
        <template v-if="isLoading">
          <div class="loading">Loading...</div>
        </template>
        <template v-else-if="categories.length === 0">
          <div class="empty-state">
            <svg class="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
            <h3 class="empty-state-title">No categories yet</h3>
            <p class="empty-state-text">Add your first category to get started</p>
            <button class="btn btn-primary" @click="showAddCategory = true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Add Category
            </button>
          </div>
        </template>
        <template v-else>
          <CategoryCard
            v-for="category in categories"
            :key="category.id"
            :category="category"
            @change="onCategoriesChange"
          />
        </template>
      </div>
    </section>

    <!-- Content Sections -->
    <section class="content-section">
      <div class="content-container">
        <h2 class="content-title">Your everyday links, docked.</h2>
        <p class="content-text">
          Make a home for your favorite links.<br>
          Drag to organize. Click to launch. Saves locally.
        </p>
      </div>
    </section>

    <section class="features-section">
      <div class="content-container">
        <div class="features-grid">
          <div class="feature">
            <span class="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <path d="M14 2v6h6M12 18v-6M9 15h6"/>
              </svg>
            </span>
            <span class="feature-text">Drag & drop organization</span>
          </div>
          <div class="feature">
            <span class="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </span>
            <span class="feature-text">One-click launch</span>
          </div>
          <div class="feature">
            <span class="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </span>
            <span class="feature-text">Local storage (private)</span>
          </div>
          <div class="feature">
            <span class="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </span>
            <span class="feature-text">Fully customizable</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-container">
        <span class="footer-copyright">&copy; 2026 Daydock</span>
        <span v-if="activityEnabled" class="activity-notice">
          Basic usage statistics use a random browser ID. Your bookmarks stay in your browser.
          <a href="?activity=off">Opt out</a>
        </span>
      </div>
    </footer>

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
  </div>
</template>

<style>
.loading {
  text-align: center;
  padding: 4rem;
  color: rgba(255, 255, 255, 0.6);
}

/* Error Toast */
.error-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(220, 38, 38, 0.95);
  color: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  max-width: 90vw;
  cursor: pointer;
}

.error-toast svg {
  flex-shrink: 0;
}

.error-toast span {
  font-size: 14px;
  line-height: 1.4;
}

.error-toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: white;
  opacity: 0.7;
  cursor: pointer;
  padding: 4px;
  margin: -4px;
  margin-left: 4px;
  transition: opacity 0.2s;
}

.error-toast-close:hover {
  opacity: 1;
}

/* Toast animation */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
</style>
