// Daydock Dashboard - Nuxt 4 Configuration
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  devServer: { port: 3109 },
  runtimeConfig: {
    activityDir: './data/activity',
    public: {
      activityEnabled: process.env.NODE_ENV === 'production'
    }
  },

  // Nuxt 4 app directory structure
  future: {
    compatibilityVersion: 4
  },

  // Global CSS
  css: ['~/assets/css/main.css'],

  // App configuration
  app: {
    head: {
      title: 'Daydock',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Daydock — your everyday links, docked. Organize bookmarks into customizable dashboards, with no account required.' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap' }
      ]
    }
  },

  // Modules
  modules: [],

  // SSR enabled for SEO
  ssr: true,

  // Nitro server configuration
  nitro: {
    preset: 'node-server'
  }
})
