import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db, FACILITY_ID } from './firebase'
import { useAuth } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { useSync } from './hooks/useSync'
import { FONT, C } from './theme'
import { scheduleDailyReport } from './utils/sheets'

import Login    from './screens/Login'
import BottomNav from './components/BottomNav'
import SideNav   from './components/SideNav'

// 各画面は初回表示時にのみJSを読み込む（初期バンドルを軽量化）
const Home     = lazy(() => import('./screens/Home'))
const Calendar = lazy(() => import('./screens/Calendar'))
const Sessions = lazy(() => import('./screens/Sessions'))
const IdeaPost = lazy(() => import('./screens/IdeaPost'))
const Hidamari = lazy(() => import('./screens/Hidamari'))
const Settings = lazy(() => import('./screens/Settings'))

const SCREEN_MAP = { home:Home, calendar:Calendar, sessions:Sessions, ideas:IdeaPost, hidamari:Hidamari, settings:Settings }
const ALL_TABS   = Object.keys(SCREEN_MAP)

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

// 画面切り替え中のフォールバック（Suspense用）
function ScreenFallback() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', background:C.bg }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:10 }}>🌿</div>
        <div style={{ fontSize:13, color:C.sub, fontFamily:FONT }}>読み込み中…</div>
      </div>
    </div>
  )
}

// 全タブを常時マウントし、非アクティブはCSSで非表示（即時切り替え）
function KeepAliveScreens({ tab, setTab, visited }) {
  return (
    <>
      <style>{`
        .ka-screen { position:absolute; inset:0; overflow-y:auto; overflow-x:hidden; }
        .ka-screen.active { opacity:1; pointer-events:auto; z-index:1; }
        .ka-screen.inactive { opacity:0; pointer-events:none; z-index:0; }
      `}</style>
      {ALL_TABS.map(id => {
        if (!visited[id]) return null
        const Comp = SCREEN_MAP[id]
        const isActive = tab === id
        return (
          <div key={id} className={`ka-screen ${isActive ? 'active' : 'inactive'}`}>
            <Suspense fallback={<ScreenFallback />}>
              {id === 'home' ? <Home onNavigate={setTab}/> : <Comp />}
            </Suspense>
          </div>
        )
      })}
    </>
  )
}

export default function App() {
  const { user, loading, getGoogleToken, can, role } = useAuth()
  const [tab,     setTabState] = useState('home')
  const [visited, setVisited]  = useState({ home: true })
  const isDesktop = useIsDesktop()

  const setTab = useCallback((id) => {
    setTabState(id)
    setVisited(prev => prev[id] ? prev : { ...prev, [id]: true })
  }, [])

  const syncFn = useCallback(async () => {
    try {
      const today = new Date()
      const ym = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`
      await getDoc(doc(db, 'facilities', FACILITY_ID, 'schedules', ym))
    } catch (err) {
      console.warn('[sync]', err.code || err.message)
    }
  }, [])

  const { syncing, lastSync, isActive, manualSync, statusText } = useSync(syncFn)

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
      } catch {
        const t = new Date()
        return { year:t.getFullYear(), month:t.getMonth()+1, day:t.getDate(), slots:[] }
      }
    }
    return scheduleDailyReport(getGoogleToken, getDataFn)
  }, [user, getGoogleToken])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.bg, fontFamily:FONT }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:14 }}>🌿</div>
        <div style={{ fontSize:15, color:C.sub }}>準備中…</div>
      </div>
    </div>
  )

  if (!user) return <Login />

  const SyncBar = () => {
    if (!can.isAdminOrAbove()) return null
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 14px', background:C.card, borderBottom:`1px solid ${C.border}`, fontSize:11, color:C.sub, flexShrink:0 }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:isActive?C.green:C.muted, flexShrink:0 }}/>
        <span style={{ flex:1 }}>{syncing?'同期中…':statusText}</span>
        {lastSync && <span style={{ color:C.muted }}>更新: {lastSync.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</span>}
        <button onClick={manualSync} disabled={syncing}
          style={{ padding:'2px 9px', borderRadius:5, border:`1px solid ${C.border}`, background:'transparent', fontSize:11, color:syncing?C.muted:C.primary, cursor:syncing?'default':'pointer', fontFamily:FONT, fontWeight:600 }}>
          {syncing?'更新中…':'情報を更新'}
        </button>
      </div>
    )
  }

  const TAB_TITLE = { home:'🏠 ホーム', calendar:'📅 みんなのスケジュール', sessions:'🧩 だれが・どのコマ・どの子ども', ideas:'📬 アイデアポスト', hidamari:'☀️ こころのひだまり', settings:'⚙️ 設定' }

  if (isDesktop) {
    return (
      <DataProvider user={user}>
      <div style={{ display:'flex', height:'100vh', background:C.bg, fontFamily:FONT, overflow:'hidden' }}>
        <SideNav active={tab} setActive={setTab} />
        <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px 28px', background:C.card, borderBottom:`1.5px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{TAB_TITLE[tab]}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <RoleBadge role={role}/>
              <div style={{ fontSize:11, color:C.muted }}>コペルプラス 東久留米教室</div>
            </div>
          </div>
          <SyncBar />
          <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
            <KeepAliveScreens tab={tab} setTab={setTab} visited={visited} />
          </div>
        </main>
      </div>
      </DataProvider>
    )
  }

  return (
    <DataProvider user={user}>
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:C.bg, fontFamily:FONT, maxWidth:480, margin:'0 auto', overflow:'hidden' }}>
      <SyncBar />
      <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
        <KeepAliveScreens tab={tab} setTab={setTab} visited={visited} />
      </div>
      <BottomNav active={tab} setActive={setTab} />
    </div>
    </DataProvider>
  )
}
