import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  build: {
    // 警告しきい値を引き上げ（各チャンクは十分小さくなる）
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React コアは別チャンク（最も変更が少なくキャッシュが長持ち）
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react'
          }
          // Firebase は機能ごとに分割（使う機能だけロード）
          if (id.includes('node_modules/firebase/auth'))      return 'firebase-auth'
          if (id.includes('node_modules/firebase/firestore')) return 'firebase-firestore'
          if (id.includes('node_modules/firebase'))           return 'firebase-core'
          // exceljs / xlsx は Calendar でしか使わないので自動分割に任せる（明示的に分けない）
        }
      }
    }
  },
})
