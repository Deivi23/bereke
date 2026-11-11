import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // На GitHub Pages приложение живёт в подпапке (/bereke/), локально — в корне.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        // wasm-сканер должен быть доступен без интернета
        globPatterns: ['**/*.{js,css,html,svg,wasm,png,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: 'Береке — учёт магазина',
        short_name: 'Береке',
        description: 'Учёт товаров, цены и ценники для магазина',
        lang: 'ru',
        theme_color: '#0f2a3d',
        background_color: '#eef3f5',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
