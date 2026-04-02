import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,  // ★ MultiTab→SingleTab（リーダー選出のオーバーヘッドを排除）
} from 'firebase/firestore'

const app = initializeApp({
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)

// ★ SingleTabManager: タブ間リーダー選出を省略 → 起動が速い
// ★ cacheSizeBytes: CACHE_SIZE_UNLIMITED は使わない（デフォルト40MBで十分）
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager({ forceOwnership: true })
  })
})

export const googleProvider = new GoogleAuthProvider()
googleProvider.addScope('https://www.googleapis.com/auth/calendar')
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events')
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets')
googleProvider.setCustomParameters({ prompt: 'select_account', hl: 'ja' })

export const FACILITY_ID = 'higashikurume'
