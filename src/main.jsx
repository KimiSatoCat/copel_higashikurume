import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'

// 古いService Workerを全て削除（PWA廃止後の残骸を消去）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister())
    if (regs.length > 0) console.log(`[SW] ${regs.length}件のService Workerを削除しました`)
  })
}

// 本番URL（固定）
const PRODUCTION_HOST = 'copel-higashikurume.vercel.app'

// ランダムなプレビューURLで開かれた場合は本番URLへリダイレクト
const currentHost = window.location.hostname
if (
  currentHost !== PRODUCTION_HOST &&
  currentHost !== 'localhost' &&
  currentHost !== '127.0.0.1' &&
  currentHost.endsWith('.vercel.app')
) {
  window.location.replace(
    `https://${PRODUCTION_HOST}${window.location.pathname}${window.location.search}`
  )
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  )
}
