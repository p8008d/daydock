<script setup lang="ts">
import type { Item } from '~~/shared/types'

const props = defineProps<{
  item: Item
  categoryId: string
  editMode: boolean
}>()

const emit = defineEmits<{
  edit: [item: Item]
}>()

// Get favicon URL
function getFaviconUrl(url: string): string | null {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  } catch {
    return null
  }
}

const faviconUrl = computed(() => getFaviconUrl(props.item.url))
const activity = useActivity()

function onOpen(event: MouseEvent) {
  if (event.isTrusted && (event.button === 0 || event.button === 1)) {
    activity.track('bookmark_open')
  }
}

function onSettingsClick(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  if (props.editMode) {
    emit('edit', props.item)
  }
}
</script>

<template>
  <a
    class="item-card"
    :href="item.url"
    target="_blank"
    rel="noopener noreferrer"
    :data-item-id="item.id"
    :data-category-id="categoryId"
    @click="onOpen"
    @auxclick="onOpen"
  >
    <div class="item-header">
      <div class="item-icon">
        <img
          v-if="faviconUrl"
          :src="faviconUrl"
          alt=""
          loading="lazy"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        >
      </div>
      <span class="item-name">{{ item.name }}</span>
    </div>
    <div v-if="item.description" class="item-description">
      {{ item.description }}
    </div>
    <button
      v-if="editMode"
      class="item-settings-btn"
      title="Edit item"
      @click="onSettingsClick"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="2"/>
        <circle cx="12" cy="12" r="2"/>
        <circle cx="12" cy="19" r="2"/>
      </svg>
    </button>
  </a>
</template>
