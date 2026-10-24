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
      // We register the SW ourselves in main.tsx (periodic update check), so
      // disable the auto-injected registration to avoid double-registering.
      injectRegister: null,
      manifest: {
        name: 'Momentum',
        short_name: 'Momentum',
        theme_color: '#d4ff4d',
        background_color: '#090b0d',
        display: 'standalone',
        // Relative (no leading slash) so they resolve against the manifest's
        // own URL — correct under both the / dev base and the /momentum/ prod base.
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
        // Unlocks the richer install dialog. `wide` = desktop, the other = mobile.
        screenshots: [
          { src: 'screenshot-wide.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Momentum' },
          { src: 'screenshot-narrow.png', sizes: '1080x1920', type: 'image/png', label: 'Momentum' },
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
