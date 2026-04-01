import {
  createContext, useContext, useState, useEffect, useRef, useCallback
} from 'react'
import {
  signInWithPopup, signOut as firebaseSignOut,
  onAuthStateChanged, GoogleAuthProvider,
} from 'firebase/auth'
import {
  doc, getDoc, setDoc,
} from 'firebase/firestore'
import { auth, db, googleProvider, FACILITY_ID } from '../firebase'
import { ROLES, DEV_PASSWORD_HASH } from '../theme'

const AuthContext = createContext(null)

const TOKEN_LIFETIME_MS = 58 * 60 * 1000

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [role,    setRole]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)  // 開発者モード（タイムアウトなし）

  const googleTokenRef = useRef(null)

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

  const loadProfile = async (u) => {
    try {
      const ref  = doc(db, 'facilities', FACILITY_ID, 'staff', u.uid)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data()
        setProfile(data)
        setRole(data.role || ROLES.STAFF)
      } else {
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
      console.error('[AuthContext] loadProfile error:', err)
    }
  }

  const signIn = async () => {
    try {
      const result     = await signInWithPopup(auth, googleProvider)
      const credential  = GoogleAuthProvider.credentialFromResult(result)
      if (credential?.accessToken) {
        googleTokenRef.current = {
          token:     credential.accessToken,
          expiresAt: Date.now() + TOKEN_LIFETIME_MS,
        }
      }
      return result
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') return null
      if (err.code === 'auth/popup-blocked') {
        throw new Error('ポップアップがブロックされました。ブラウザの設定で許可してください。')
      }
      throw err
    }
  }

  const getGoogleToken = useCallback(async () => {
    const cached = googleTokenRef.current
    if (cached && Date.now() < cached.expiresAt) return cached.token
    try {
      const result     = await signInWithPopup(auth, googleProvider)
      const credential  = GoogleAuthProvider.credentialFromResult(result)
      if (!credential?.accessToken) throw new Error('トークンを取得できませんでした')
      googleTokenRef.current = {
        token:     credential.accessToken,
        expiresAt: Date.now() + TOKEN_LIFETIME_MS,
      }
      return credential.accessToken
    } catch (err) {
      throw new Error('Google認証に失敗しました。再度お試しください。')
    }
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

  // 開発者モード：タイムアウトなし・手動でのみ終了
  const enableDevMode  = useCallback(() => setDevMode(true),  [])
  const clearDevMode   = useCallback(() => setDevMode(false), [])

  // プロフィールをローカルで即時更新（Firestore保存後に呼ぶ）
  const updateLocalProfile = useCallback((data) => {
    setProfile(prev => ({ ...prev, ...data }))
    if (data.role) setRole(data.role)
  }, [])

  const can = {
    editSchedule:   () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN, ROLES.EDITOR].includes(role),
    editStaff:      () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    editChildren:   () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    viewReport:     () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
    assignAdmin:    () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN].includes(role),
    isAdminOrAbove: () => devMode || [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUB_ADMIN].includes(role),
  }

  return (
    <AuthContext.Provider value={{
      user, profile, role, loading,
      devMode, enableDevMode, clearDevMode,
      signIn, signOut,
      getGoogleToken,
      verifyDevPassword,
      loadProfile,
      updateLocalProfile,
      can,
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
