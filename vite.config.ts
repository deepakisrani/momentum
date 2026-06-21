import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from a GitHub Pages project site at /momentum/ in production;
// stays at root for local dev so `npm run dev` works unchanged.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/momentum/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Momentum',
        short_name: 'Momentum',
        theme_color: '#0c6aa6',
        background_color: '#0f1115',
        display: 'standalone',
        // Relative (no leading slash) so they resolve against the manifest's
        // own URL — correct under both the / dev base and the /momentum/ prod base.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    env: {
      VITE_SUPABASE_URL: 'http://localhost',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    },
  },
}))
