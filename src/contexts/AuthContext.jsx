import {
  createContext, useContext, useState, useEffect, useRef, useCallback
} from 'react'
import {
  signInWithPopup, signOut as firebaseSignOut,
  onAuthStateChanged, GoogleAuthProvider,
} from 'firebase/auth'
import {
  doc, getDoc, setDoc, onSnapshot, collection
} from 'firebase/firestore'
import { auth, db, googleProvider, FACILITY_ID } from '../firebase'
import { ROLES, DEV_PASSWORD_HASH, DEV_TIMEOUT_MS } from '../theme'

const AuthContext = createContext(null)

// ─── Google Access Token の有効期限（58分でマージン取る） ─────
const TOKEN_LIFETIME_MS = 58 * 60 * 1000

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)   // Firebase Auth ユーザー
  const [profile, setProfile] = useState(null)   // Firestore の職員プロフィール
  const [role,    setRole]    = useState(null)   // ROLES.*
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)
  const [devSecsLeft, setDevSecsLeft] = useState(0)
  const devTimerRef = useRef(null)

  // ─── Google OAuth Access Token（メモリのみ保持） ─────────────
  // sessionStorage/localStorage には保存しない（セキュリティのため）
  const googleTokenRef = useRef(null)   // { token: string, expiresAt: number }

  // ─── Firebase Auth 状態監視 ──────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        await loadProfile(u)
      } else {
        setProfile(null)
        setRole(null)
        googleTokenRef.current = null
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // ─── Firestore からプロフィールを読み込む ─────────────────────
  const loadProfile = async (u) => {
    try {
      const ref  = doc(db, 'facilities', FACILITY_ID, 'staff', u.uid)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data()
        setProfile(data)
        setRole(data.role || ROLES.STAFF)
      } else {
        // 初回ログイン：Google のプロフィール情報で仮登録
        const newProfile = {
          uid:       u.uid,
          name:      u.displayName || '',
          hiraganaName: '',
          email:     u.email || '',
          role:      ROLES.STAFF,
          active:    true,
          photoURL:  u.photoURL || '',
          createdAt: new Date().toISOString(),
        }
        await setDoc(ref, newProfile)
        setProfile(newProfile)
        setRole(ROLES.STAFF)
      }
    } catch (err) {
      console.error('[AuthContext] プロフィール読み込みエラー:', err)
    }
  }

  // ─── Google ログイン（メイン） ───────────────────────────────
  // signInWithPopup の結果から access token を保存する
  const signIn = async () => {
    try {
      const result    = await signInWithPopup(auth, googleProvider)
      const credential = GoogleAuthProvider.credentialFromResult(result)

      // ★ access token を保存（Googleカレンダー・スプレッドシートAPIで使用）
      if (credential?.accessToken) {
        googleTokenRef.current = {
          token:     credential.accessToken,
          expiresAt: Date.now() + TOKEN_LIFETIME_MS,
        }
        console.log('[Auth] Google access token を取得しました')
      }

      return result
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') return null
      if (err.code === 'auth/popup-blocked') {
        throw new Error('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。')
      }
      throw err
    }
  }

  // ─── Google Access Token の取得（期限切れなら再取得） ─────────
  // ★ カレンダー連携・スプレッドシート連携はこれを使う
  const getGoogleToken = useCallback(async () => {
    const cached = googleTokenRef.current
    if (cached && Date.now() < cached.expiresAt) {
      console.log('[Auth] キャッシュ済みトークンを使用')
      return cached.token
    }

    console.log('[Auth] トークン期限切れ → 再取得します')
    // トークンが期限切れ or 未取得 → 再ログインポップアップ
    // ユーザーには「再認証が必要」として一度だけポップアップが出る
    try {
      const result     = await signInWithPopup(auth, googleProvider)
      const credential  = GoogleAuthProvider.credentialFromResult(result)
      if (!credential?.accessToken) {
        throw new Error('アクセストークンを取得できませんでした')
      }
      googleTokenRef.current = {
        token:     credential.accessToken,
        expiresAt: Date.now() + TOKEN_LIFETIME_MS,
      }
      return credential.accessToken
    } catch (err) {
      console.error('[Auth] トークン再取得エラー:', err)
      throw new Error('Google の認証に失敗しました。もう一度お試しください。')
    }
  }, [])

  // ─── ログアウト ──────────────────────────────────────────────
  const signOut = async () => {
    clearDevMode()
    googleTokenRef.current = null
    await firebaseSignOut(auth)
  }

  // ─── 開発者パスワード検証（SHA-256） ─────────────────────────
  const verifyDevPassword = async (password) => {
    const buf = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(password)
    )
    const hex = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    return hex === DEV_PASSWORD_HASH
  }

  // ─── 開発者モード（5分タイマー） ─────────────────────────────
  const enableDevMode = useCallback(() => {
    clearTimeout(devTimerRef.current)
    setDevMode(true)
    devTimerRef.current = setTimeout(clearDevMode, DEV_TIMEOUT_MS)
  }, [])

  const clearDevMode = useCallback(() => {
    clearTimeout(devTimerRef.current)
    setDevMode(false)
  }, [])

  useEffect(() => {
    if (!devMode) { setDevSecsLeft(0); return }
    setDevSecsLeft(Math.floor(DEV_TIMEOUT_MS / 1000))
    const tick = setInterval(() => {
      setDevSecsLeft(prev => {
        if (prev <= 1) { clearDevMode(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [devMode, clearDevMode])

  // ─── 権限チェック ────────────────────────────────────────────
  const can = {
    editSchedule: () =>
      devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN, ROLES.EDITOR].includes(role),
    editStaff: () =>
      devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    editChildren: () =>
      devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    viewReport: () =>
      devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    viewHidamariStats: () =>
      devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    manageRoles: () =>
      devMode || role === ROLES.DEVELOPER,
    assignAdmin: () =>
      devMode || [ROLES.DEVELOPER, ROLES.ADMIN].includes(role),
    isAdminOrAbove: () =>
      devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
  }

  return (
    <AuthContext.Provider value={{
      user, profile, role, loading,
      devMode, devSecsLeft, enableDevMode, clearDevMode,
      signIn, signOut,
      getGoogleToken,    // ★ カレンダー・スプレッドシート連携で使う
      verifyDevPassword,
      loadProfile, can,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
