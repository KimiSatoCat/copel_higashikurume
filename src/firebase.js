import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// ─── Firebase 設定（.env から読み込み） ─────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db   = getFirestore(app)

// ─── Google OAuth プロバイダー設定 ──────────────────────────
// 重要: スコープはここで一括追加する
// ログイン時に一度だけユーザーの許可を求める
export const googleProvider = new GoogleAuthProvider()

// Firebase Auth の基本スコープ（自動で含まれる）
// + Google Calendar（読み書き）
// + Google Spreadsheets（読み書き）
googleProvider.addScope('https://www.googleapis.com/auth/calendar')
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events')
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets')

// ログインのたびにアカウント選択画面を表示する（開発中は便利）
// 本番では 'none' または削除することも可
googleProvider.setCustomParameters({
  // 毎回アカウント選択を表示（複数アカウントを持つ職員向け）
  prompt: 'select_account',
  // 日本語でUIを表示
  hl: 'ja',
})

export const FACILITY_ID = 'higashikurume'
