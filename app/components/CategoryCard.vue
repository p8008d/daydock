<script setup lang="ts">
import type { Category, Item } from '~~/shared/types'
import { VueDraggable } from 'vue-draggable-plus'

const props = defineProps<{
  category: Category
}>()

const emit = defineEmits<{
  change: []
}>()

const storage = inject('storage') as ReturnType<typeof useStorage>
const isEditMode = inject('isEditMode') as Ref<boolean>
const toggleEditMode = inject('toggleEditMode') as () => void

// Local state for drag
const items = ref([...props.category.items])

// Watch for external changes
watch(() => props.category.items, (newItems) => {
  items.value = [...newItems]
}, { deep: true })

// Category name editing
const nameInput = ref<HTMLInputElement | null>(null)
const categoryName = ref(props.category.name)
let saveTimeout: ReturnType<typeof setTimeout>

function onNameInput() {
  if (!isEditMode.value) return
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    const name = categoryName.value.trim()
    if (name && name !== props.category.name) {
      storage.updateCategory(props.category.id, { name })
      emit('change')
    }
  }, 500)
}

// Delete category
function deleteCategory() {
  if (!isEditMode.value) return
  if (confirm(`Delete "${props.category.name}" and all its items?`)) {
    storage.deleteCategory(props.category.id)
    emit('change')
  }
}

// Add item modal
const showAddModal = ref(false)
const newItemName = ref('')
const newItemUrl = ref('')
const newItemDescription = ref('')

function openAddModal() {
  if (!isEditMode.value) return
  newItemName.value = ''
  newItemUrl.value = ''
  newItemDescription.value = ''
  showAddModal.value = true
}

function addItem() {
  const name = newItemName.value.trim()
  const url = newItemUrl.value.trim()
  const description = newItemDescription.value.trim()

  if (!name || !url) return

  storage.addItem(props.category.id, name, url, description)
  showAddModal.value = false
  emit('change')
}

// Edit item modal
const showEditModal = ref(false)
const editingItem = ref<Item | null>(null)
const editItemName = ref('')
const editItemUrl = ref('')
const editItemDescription = ref('')

function openEditModal(item: Item) {
  if (!isEditMode.value) return
  editingItem.value = item
  editItemName.value = item.name
  editItemUrl.value = item.url
  editItemDescription.value = item.description || ''
  showEditModal.value = true
}

function saveItem() {
  if (!editingItem.value) return

  const name = editItemName.value.trim()
  const url = editItemUrl.value.trim()
  const description = editItemDescription.value.trim()

  if (!name || !url) return

  storage.updateItem(props.category.id, editingItem.value.id, { name, url, description })
  showEditModal.value = false
  emit('change')
}

function deleteItem() {
  if (!editingItem.value) return

  if (confirm(`Delete "${editingItem.value.name}"?`)) {
    storage.deleteItem(props.category.id, editingItem.value.id)
    showEditModal.value = false
    emit('change')
  }
}

// Drag handlers
function onDragEnd() {
  if (!isEditMode.value) return
  const itemIds = items.value.map(i => i.id)
  const success = storage.reorderItems(props.category.id, itemIds)
  if (!success) {
    // Revert to stored state on failure
    const storedCategories = storage.getCategories()
    const storedCategory = storedCategories.find(c => c.id === props.category.id)
    if (storedCategory) {
      items.value = [...storedCategory.items]
    }
  }
  emit('change')
}

function onDragAdd() {
  if (!isEditMode.value) return
  const itemIds = items.value.map(i => i.id)
  const success = storage.reorderItems(props.category.id, itemIds)
  if (!success) {
    // Revert to stored state on failure
    const storedCategories = storage.getCategories()
    const storedCategory = storedCategories.find(c => c.id === props.category.id)
    if (storedCategory) {
      items.value = [...storedCategory.items]
    }
  }
  emit('change')
}
</script>

<template>
  <section class="category" :class="{ 'edit-mode': isEditMode }" :data-category-id="category.id">
    <div class="category-header">
      <h2 class="category-title">
        <input
          v-if="isEditMode"
          ref="nameInput"
          v-model="categoryName"
          type="text"
          class="category-title-input"
          @input="onNameInput"
        >
        <span v-else>{{ category.name }}</span>
      </h2>
      <div class="category-actions">
        <template v-if="isEditMode">
          <button class="action-btn" @click="openAddModal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Add
          </button>
          <button class="action-btn action-btn--danger" @click="deleteCategory">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Delete
          </button>
        </template>
        <button class="action-btn" :class="{ 'action-btn--active': isEditMode }" @click="toggleEditMode">
          <svg v-if="!isEditMode" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
          {{ isEditMode ? 'Done' : 'Edit' }}
        </button>
      </div>
    </div>

    <div class="items-grid">
      <VueDraggable
        v-model="items"
        class="items-grid-inner"
        group="items"
        :animation="200"
        ghost-class="ghost"
        :disabled="!isEditMode"
        :delay="100"
        :delay-on-touch-only="true"
        :touch-start-threshold="3"
        @end="onDragEnd"
        @add="onDragAdd"
      >
        <ItemCard
          v-for="item in items"
          :key="item.id"
          :item="item"
          :category-id="category.id"
          :edit-mode="isEditMode"
          @edit="openEditModal"
        />
      </VueDraggable>
      <button v-if="isEditMode" class="add-item-card" @click="openAddModal">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>

    <!-- Add Item Modal -->
    <Teleport to="body">
      <div v-if="showAddModal" class="modal open" @click.self="showAddModal = false">
        <div class="modal-backdrop" @click="showAddModal = false" />
        <div class="modal-content">
          <div class="modal-header">
            <h3>Add Item</h3>
            <button class="btn-icon modal-close" @click="showAddModal = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="addItem">
              <div class="form-group">
                <label class="form-label">Name *</label>
                <input v-model="newItemName" type="text" class="input" placeholder="e.g., Google" required>
              </div>
              <div class="form-group">
                <label class="form-label">URL *</label>
                <input v-model="newItemUrl" type="url" class="input" placeholder="https://..." required>
              </div>
              <div class="form-group">
                <label class="form-label">Description</label>
                <input v-model="newItemDescription" type="text" class="input" placeholder="Optional description">
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" @click="showAddModal = false">Cancel</button>
                <button type="submit" class="btn btn-primary">Add</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Edit Item Modal -->
    <Teleport to="body">
      <div v-if="showEditModal" class="modal open" @click.self="showEditModal = false">
        <div class="modal-backdrop" @click="showEditModal = false" />
        <div class="modal-content">
          <div class="modal-header">
            <h3>Edit Item</h3>
            <button class="btn-icon modal-close" @click="showEditModal = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="saveItem">
              <div class="form-group">
                <label class="form-label">Name *</label>
                <input v-model="editItemName" type="text" class="input" required>
              </div>
              <div class="form-group">
                <label class="form-label">URL *</label>
                <input v-model="editItemUrl" type="url" class="input" required>
              </div>
              <div class="form-group">
                <label class="form-label">Description</label>
                <input v-model="editItemDescription" type="text" class="input">
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-danger" @click="deleteItem">Delete</button>
                <button type="button" class="btn btn-secondary" @click="showEditModal = false">Cancel</button>
                <button type="submit" class="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.ghost {
  opacity: 0.5;
  background: rgba(59, 130, 246, 0.2);
}

.items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-3);
}

.items-grid-inner {
  display: contents;
}

.category-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

@media (min-width: 640px) {
  .category-actions {
    gap: var(--space-3);
  }
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: color var(--transition-fast);
  padding: 0;
}

@media (min-width: 640px) {
  .action-btn {
    font-size: var(--text-sm);
  }
}

.action-btn:hover {
  color: var(--text-primary);
}

.action-btn--active {
  color: var(--accent);
}

.action-btn--danger:hover {
  color: var(--danger);
}
</style>
