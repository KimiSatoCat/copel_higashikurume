import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import {
  signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged
} from 'firebase/auth'
import {
  doc, getDoc, setDoc, updateDoc, collection, getDocs, onSnapshot
} from 'firebase/firestore'
import { auth, db, provider, FACILITY_ID } from '../firebase'
import { ROLES, DEV_PASSWORD_HASH, DEV_TIMEOUT_MS } from '../theme'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)   // Firebase user
  const [profile, setProfile]     = useState(null)   // Firestore staff profile
  const [role, setRole]           = useState(null)   // ROLES.*
  const [devMode, setDevMode]     = useState(false)  // 開発者モード（5分限定）
  const [loading, setLoading]     = useState(true)
  const devTimerRef               = useRef(null)

  // Firebase auth状態監視
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        await loadProfile(u)
      } else {
        setProfile(null)
        setRole(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Firestoreからプロフィール・権限を読み込む
  const loadProfile = async (u) => {
    try {
      const ref = doc(db, 'facilities', FACILITY_ID, 'staff', u.uid)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data()
        setProfile(data)
        setRole(data.role || ROLES.STAFF)
      } else {
        // 初回ログイン：仮スタッフ登録
        const newProfile = {
          uid: u.uid,
          name: u.displayName || '',
          email: u.email || '',
          role: ROLES.STAFF,
          active: true,
          createdAt: new Date().toISOString(),
          photoURL: u.photoURL || '',
        }
        await setDoc(ref, newProfile)
        setProfile(newProfile)
        setRole(ROLES.STAFF)
      }
    } catch (err) {
      console.error('プロフィール読み込みエラー:', err)
    }
  }

  // Googleログイン
  const signIn = async () => {
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        throw err
      }
    }
  }

  // ログアウト
  const signOut = () => {
    clearDevMode()
    return firebaseSignOut(auth)
  }

  // 開発者パスワード検証（SHA-256）
  const verifyDevPassword = async (password) => {
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
    const hex  = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    return hex === DEV_PASSWORD_HASH
  }

  // 開発者モード有効化（5分タイマー）
  const enableDevMode = useCallback(() => {
    clearTimeout(devTimerRef.current)
    setDevMode(true)
    devTimerRef.current = setTimeout(clearDevMode, DEV_TIMEOUT_MS)
  }, [])

  const clearDevMode = useCallback(() => {
    clearTimeout(devTimerRef.current)
    setDevMode(false)
  }, [])

  // 残り時間（開発者モード）
  const [devSecsLeft, setDevSecsLeft] = useState(0)
  useEffect(() => {
    if (!devMode) { setDevSecsLeft(0); return }
    const tick = setInterval(() => {
      setDevSecsLeft(prev => {
        if (prev <= 1) { clearDevMode(); return 0 }
        return prev - 1
      })
    }, 1000)
    setDevSecsLeft(Math.floor(DEV_TIMEOUT_MS / 1000))
    return () => clearInterval(tick)
  }, [devMode, clearDevMode])

  // 権限チェックユーティリティ
  const can = {
    editSchedule: () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN, ROLES.EDITOR].includes(role),
    editStaff:    () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    editChildren: () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    viewReport:   () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    viewHidamariStats: () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    manageRoles:  () => devMode || role === ROLES.DEVELOPER,
    assignAdmin:  () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN].includes(role),
    isAdminOrAbove: () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
  }

  return (
    <AuthContext.Provider value={{
      user, profile, role, loading,
      devMode, devSecsLeft, enableDevMode, clearDevMode,
      signIn, signOut, verifyDevPassword,
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
