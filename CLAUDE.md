# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Daydock is a personal link dashboard built with Nuxt 4 and Vue 3. It allows users to organize bookmarks into categories across multiple dashboards, with drag-and-drop reordering and local storage persistence.

## Commands

```bash
npm run dev       # Start development server (port 3109)
npm run build     # Build for production
npm run preview   # Preview production build
npm run generate  # Generate static site
```

### Docker

```bash
docker-compose up -d     # Run production container
docker-compose build     # Rebuild image
```

## Architecture

### Directory Structure (Nuxt 4 App Directory)

- `app/` - Main application code (Nuxt 4 structure)
  - `pages/index.vue` - Single page application entry
  - `components/` - Vue components (auto-imported)
  - `composables/useStorage.ts` - Core data layer
  - `assets/css/main.css` - Global styles
- `shared/types.ts` - TypeScript interfaces shared between app and server
- `public/data/items.json` - Default dashboard data loaded on first visit
- `server/api/` - Activity collection endpoint

### Data Model

The app uses a hierarchical data structure:

```
DashboardData
├── activeDashboard: string | null
└── dashboards: Dashboard[]
    ├── id, name, wallpaper?
    └── categories: Category[]
        ├── id, name
        └── items: Item[]
            └── id, name, url, description?
```

### State Management

All state is managed through `useStorage()` composable which:
- Stores data in localStorage under key `daydock_dashboard_v1`
- Falls back to `/data/items.json` for default data on first load
- Uses a reactive `ref` for client-side state synchronization
- Provides CRUD operations for dashboards, categories, and items

### Component Communication

- Parent (`pages/index.vue`) provides `storage` and callback functions via Vue's `provide/inject`
- Child components emit `change` events after mutations
- Parent re-fetches data from storage on change events

### Drag and Drop

Uses `vue-draggable-plus` for:
- Reordering items within categories (`CategoryCard.vue`)
- Items can be dragged between categories via `group="items"`
