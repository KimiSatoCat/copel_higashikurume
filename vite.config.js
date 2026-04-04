import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,      // ★ 新しいSWを即座にアクティブ化
        clientsClaim: true,     // ★ 既存の全タブを即座に制御下に置く
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } }
          },
          {
            urlPattern: /^https:\/\/.*\.googleapis\.com\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'firebase-api', networkTimeoutSeconds: 3 }
          },
        ]
      },
      manifest: {
        name: 'コペルプラス 東久留米教室',
        short_name: 'コペルプラス',
        description: '東久留米教室 勤務管理',
        theme_color: '#52BAA8',
        background_color: '#FFF8F2',
        display: 'standalone',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ],
  server: { port: 3000 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        }
      }
    }
  },
})
