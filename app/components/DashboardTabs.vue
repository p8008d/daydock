<script setup lang="ts">
import type { Dashboard } from '~~/shared/types'

defineProps<{
  dashboards: Dashboard[]
  activeId?: string
}>()

const emit = defineEmits<{
  switch: [id: string]
}>()
</script>

<template>
  <nav class="dashboard-tabs">
    <div class="tabs-container">
      <button
        v-for="dash in dashboards"
        :key="dash.id"
        class="tab"
        :class="{ active: dash.id === activeId }"
        @click="emit('switch', dash.id)"
      >
        <span class="tab-name">{{ dash.name }}</span>
      </button>
    </div>
  </nav>
</template>
