import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db, FACILITY_ID } from './firebase'
import { useAuth } from './contexts/AuthContext'
import { useSync } from './hooks/useSync'
import { FONT, C } from './theme'
import { scheduleDailyReport } from './utils/sheets'
import Login    from './screens/Login'
import Home     from './screens/Home'
import BottomNav from './components/BottomNav'
import SideNav   from './components/SideNav'

// ★ 遅延マウント型KeepAlive
// - 一度も訪問していない画面はマウントしない（起動が軽い）
// - 訪問した画面はdisplay:noneで保持（状態・リスナーが消えない）
const LAZY_SCREENS = {
  calendar: () => import('./screens/Calendar'),
  sessions: () => import('./screens/Sessions'),
  ideas:    () => import('./screens/IdeaPost'),
  hidamari: () => import('./screens/Hidamari'),
  settings: () => import('./screens/Settings'),
}

function useIsDesktop() {
  const [is, setIs] = useState(() => window.innerWidth >= 768)
  useEffect(() => {
    const fn = () => setIs(window.innerWidth >= 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return is
}

function RoleBadge({ role }) {
  if (!role || role === 'staff') return null
  const MAP = { developer:'開発者', admin:'責任者', sub_admin:'副責任者', editor:'編集者' }
  return (
    <span style={{ background:C.primaryLight, color:C.primaryDark, borderRadius:99, padding:'2px 8px', fontSize:11, fontWeight:700 }}>
      {MAP[role]}
    </span>
  )
}

// 遅延読み込みコンポーネントを管理するフック
function useLazyScreens() {
  const [loaded, setLoaded] = useState({})
  const components = useRef({})

  const ensureLoaded = useCallback(async (id) => {
    if (loaded[id] || id === 'home') return
    const loader = LAZY_SCREENS[id]
    if (!loader) return
    const mod = await loader()
    components.current[id] = mod.default
    setLoaded(prev => ({ ...prev, [id]: true }))
  }, [loaded])

  return { loaded, components: components.current, ensureLoaded }
}

export default function App() {
  const { user, loading, getGoogleToken, can, role } = useAuth()
  const [tab, setTab] = useState('home')
  const [visited, setVisited] = useState({ home: true })
  const { loaded, components, ensureLoaded } = useLazyScreens()
  const isDesktop = useIsDesktop()

  // タブ切り替え時に遅延読み込み
  const switchTab = useCallback(async (id) => {
    setTab(id)
    if (!visited[id]) {
      setVisited(prev => ({ ...prev, [id]: true }))
      await ensureLoaded(id)
    }
  }, [visited, ensureLoaded])

  const syncFn = useCallback(async () => {
    try {
      const today = new Date()
      const ym = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`
      await getDoc(doc(db, 'facilities', FACILITY_ID, 'schedules', ym))
    } catch (err) {
      console.warn('[sync] Firestore:', err.code || err.message)
    }
  }, [])

  const { syncing, lastSync, isActive, manualSync, formatNext } = useSync(syncFn)

  useEffect(() => {
    if (!user) return
    const getDataFn = async () => {
      try {
        const today   = new Date()
        const year    = today.getFullYear()
        const month   = today.getMonth() + 1
        const day     = today.getDate()
        const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
        const snap    = await getDoc(doc(db, 'facilities', FACILITY_ID, 'sessions', dateKey))
        return { year, month, day, slots: snap.exists() ? snap.data().slots || [] : [] }
      } catch (err) {
        console.warn('[sheets] data fetch failed:', err.code)
        const today = new Date()
        return { year: today.getFullYear(), month: today.getMonth()+1, day: today.getDate(), slots: [] }
      }
    }
    return scheduleDailyReport(getGoogleToken, getDataFn)
  }, [user, getGoogleToken])

  // ホーム訪問後2秒でSettingsをプリロード（よく使うため）
  useEffect(() => {
    if (!user) return
    const t = setTimeout(() => ensureLoaded('settings'), 2000)
    return () => clearTimeout(t)
  }, [user, ensureLoaded])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.bg, fontFamily:FONT }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:14 }}>🌿</div>
        <div style={{ fontSize:15, color:C.sub }}>準備中…</div>
      </div>
    </div>
  )

  if (!user) return <Login />

  // 各画面のレンダリング（visited=trueになった画面のみマウント）
  const renderScreen = (id) => {
    if (!visited[id]) return null
    if (id === 'home') return <Home onNavigate={switchTab}/>

    const Comp = components[id]
    if (!Comp) {
      // ロード中スピナー
      return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
          <div style={{ width:22, height:22, borderRadius:'50%', border:`3px solid ${C.primaryLight}`, borderTopColor:C.primary, animation:'spin .6s linear infinite' }}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )
    }
    return <Comp />
  }

  const ALL_TABS = ['home','calendar','sessions','ideas','hidamari','settings']

  const SyncBar = () => {
    if (!can.isAdminOrAbove()) return null
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 14px', background:C.card, borderBottom:`1px solid ${C.border}`, fontSize:11, color:C.sub, flexShrink:0 }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:isActive?C.green:C.muted, flexShrink:0 }}/>
        <span style={{ flex:1 }}>{syncing?'同期中…':formatNext()}</span>
        {lastSync && <span style={{ color:C.muted }}>更新: {lastSync.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</span>}
        <button onClick={manualSync} disabled={syncing}
          style={{ padding:'2px 9px', borderRadius:5, border:`1px solid ${C.border}`, background:'transparent', fontSize:11, color:syncing?C.muted:C.primary, cursor:syncing?'default':'pointer', fontFamily:FONT, fontWeight:600 }}>
          {syncing?'更新中…':'情報を更新'}
        </button>
      </div>
    )
  }

  const TAB_TITLE = {
    home:'🏠 ホーム', calendar:'📅 みんなのスケジュール',
    sessions:'🧩 だれが・どのコマ・どの子ども', ideas:'📬 アイデアポスト',
    hidamari:'☀️ こころのひだまり', settings:'⚙️ 設定',
  }

  // 全タブのコンテナ（visitedなものだけマウント、activeのみ表示）
  const ScreenContainer = () => (
    <>
      {ALL_TABS.map(id => (
        <div key={id}
          style={{ display: tab===id ? 'flex' : 'none', flexDirection:'column', height:'100%', overflow:'hidden' }}>
          {renderScreen(id)}
        </div>
      ))}
    </>
  )

  if (isDesktop) {
    return (
      <div style={{ display:'flex', height:'100vh', background:C.bg, fontFamily:FONT, overflow:'hidden' }}>
        <SideNav active={tab} setActive={switchTab} />
        <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px 28px', background:C.card, borderBottom:`1.5px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{TAB_TITLE[tab]}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <RoleBadge role={role}/>
              <div style={{ fontSize:11, color:C.muted }}>コペルプラス 東久留米教室</div>
            </div>
          </div>
          <SyncBar />
          <div style={{ flex:1, overflow:'hidden' }}>
            <ScreenContainer />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:C.bg, fontFamily:FONT, maxWidth:480, margin:'0 auto', overflow:'hidden' }}>
      <SyncBar />
      <div style={{ flex:1, overflow:'hidden' }}>
        <ScreenContainer />
      </div>
      <BottomNav active={tab} setActive={switchTab} />
    </div>
  )
}
