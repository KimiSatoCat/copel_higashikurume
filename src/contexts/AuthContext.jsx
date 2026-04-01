import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import {
  signInWithPopup, signOut as firebaseSignOut,
  onAuthStateChanged, GoogleAuthProvider,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider, FACILITY_ID } from '../firebase'
import { ROLES, DEV_PASSWORD_HASH } from '../theme'

const AuthContext = createContext(null)
const TOKEN_MS = 58 * 60 * 1000

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [role,    setRole]    = useState(ROLES.STAFF)
  // ★ loading は Firebase Auth の確認が終わったら即 false にする
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)
  const googleTokenRef = useRef(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      // ★ Firestoreを待たず、Auth確定時点で loading=false にする
      setLoading(false)
      if (u) {
        // プロフィールはバックグラウンドで取得（UIをブロックしない）
        loadProfileBackground(u)
      } else {
        setProfile(null)
        setRole(ROLES.STAFF)
        googleTokenRef.current = null
      }
    })
    return () => unsub()
  }, [])

  // バックグラウンドでプロフィールを取得（失敗してもアプリは止まらない）
  const loadProfileBackground = async (u) => {
    try {
      const ref  = doc(db, 'facilities', FACILITY_ID, 'staff', u.uid)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data()
        setProfile(data)
        setRole(data.role || ROLES.STAFF)
      } else {
        // 初回ログイン：最低限の情報でプロフィール作成
        const newProfile = {
          uid:          u.uid,
          name:         u.displayName || '',
          hiraganaFirst:'',
          hiraganaName: '',
          email:        u.email || '',
          role:         ROLES.STAFF,
          active:       true,
          photoURL:     u.photoURL || '',
          createdAt:    new Date().toISOString(),
        }
        await setDoc(ref, newProfile)
        setProfile(newProfile)
        setRole(ROLES.STAFF)
      }
    } catch (err) {
      // ★ Firestoreエラーでもアプリは止まらない。最低限の状態で続行
      console.warn('[AuthContext] profile load failed (will retry on next action):', err.code)
      // Googleアカウントの情報だけで仮プロフィールを設定
      setProfile({
        uid:   u.uid,
        name:  u.displayName || '',
        email: u.email || '',
        role:  ROLES.STAFF,
        photoURL: u.photoURL || '',
      })
      setRole(ROLES.STAFF)
    }
  }

  // 外部から呼べる loadProfile（設定保存後の更新など）
  const loadProfile = useCallback(async (u) => {
    await loadProfileBackground(u || auth.currentUser)
  }, [])

  // プロフィールをローカルで即時更新
  const updateLocalProfile = useCallback((data) => {
    setProfile(prev => ({ ...prev, ...data }))
    if (data.role) setRole(data.role)
  }, [])

  // Googleログイン
  const signIn = async () => {
    try {
      const result     = await signInWithPopup(auth, googleProvider)
      const credential  = GoogleAuthProvider.credentialFromResult(result)
      if (credential?.accessToken) {
        googleTokenRef.current = { token: credential.accessToken, expiresAt: Date.now() + TOKEN_MS }
      }
      return result
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') return null
      if (err.code === 'auth/popup-blocked') throw new Error('ポップアップがブロックされました。ブラウザの設定で許可してください。')
      throw err
    }
  }

  const getGoogleToken = useCallback(async () => {
    const cached = googleTokenRef.current
    if (cached && Date.now() < cached.expiresAt) return cached.token
    const result     = await signInWithPopup(auth, googleProvider)
    const credential  = GoogleAuthProvider.credentialFromResult(result)
    if (!credential?.accessToken) throw new Error('トークンを取得できませんでした')
    googleTokenRef.current = { token: credential.accessToken, expiresAt: Date.now() + TOKEN_MS }
    return credential.accessToken
  }, [])

  const signOut = async () => {
    setDevMode(false)
    googleTokenRef.current = null
    await firebaseSignOut(auth)
  }

  const verifyDevPassword = async (password) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
    return hex === DEV_PASSWORD_HASH
  }

  const enableDevMode = useCallback(() => setDevMode(true),  [])
  const clearDevMode  = useCallback(() => setDevMode(false), [])

  const can = {
    editSchedule:   () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN, ROLES.EDITOR].includes(role),
    editStaff:      () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    editChildren:   () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    viewReport:     () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    assignAdmin:    () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN].includes(role),
    isAdminOrAbove: () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
  }

  return (
    <AuthContext.Provider value={{ user, profile, role, loading, devMode, enableDevMode, clearDevMode, signIn, signOut, getGoogleToken, verifyDevPassword, loadProfile, updateLocalProfile, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
