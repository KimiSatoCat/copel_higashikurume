import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db, FACILITY_ID } from './firebase'
import { useAuth } from './contexts/AuthContext'
import { useSync } from './hooks/useSync'
import { FONT, C } from './theme'
import { scheduleDailyReport } from './utils/sheets'
import Login    from './screens/Login'
import Home     from './screens/Home'
import Calendar from './screens/Calendar'
import Sessions from './screens/Sessions'
import IdeaPost from './screens/IdeaPost'
import Hidamari from './screens/Hidamari'
import Settings from './screens/Settings'
import BottomNav from './components/BottomNav'
import SideNav   from './components/SideNav'

function useIsDesktop() {
  const [is, setIs] = useState(() => window.innerWidth >= 768)
  useEffect(() => {
    const fn = () => setIs(window.innerWidth >= 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return is
}

export default function App() {
  const { user, loading, getGoogleToken, can, profile } = useAuth()
  const [tab, setTab] = useState('home')
  const isDesktop     = useIsDesktop()

  // 同期関数（Firestoreは常時接続しているのでキャッシュを再検証するだけ）
  const syncFn = useCallback(async () => {
    // Firestoreのオフラインキャッシュを再検証（軽量）
    const today = new Date()
    const ym    = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`
    await getDoc(doc(db, 'facilities', FACILITY_ID, 'schedules', ym))
  }, [])

  const { syncing, lastSync, isActive, manualSync, formatNext } = useSync(syncFn)

  // 毎日17:00 スプレッドシート自動保存
  useEffect(() => {
    if (!user) return
    const getDataFn = async () => {
      const today   = new Date()
      const year    = today.getFullYear()
      const month   = today.getMonth() + 1
      const day     = today.getDate()
      const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      const snap    = await getDoc(doc(db, 'facilities', FACILITY_ID, 'sessions', dateKey))
      return { year, month, day, slots: snap.exists() ? snap.data().slots || [] : [] }
    }
    return scheduleDailyReport(getGoogleToken, getDataFn)
  }, [user, getGoogleToken])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.bg, fontFamily:FONT }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>🌿</div>
        <div style={{ fontSize:18, color:C.sub }}>準備中…</div>
      </div>
    </div>
  )

  if (!user) return <Login />

  const screens = {
    home:     <Home     />,
    calendar: <Calendar />,
    sessions: <Sessions />,
    ideas:    <IdeaPost />,
    hidamari: <Hidamari />,
    settings: <Settings />,
  }

  // 同期バー（管理者のみ表示）
  const SyncBar = () => {
    if (!can.isAdminOrAbove()) return null
    return (
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 16px', background:C.card, borderBottom:`1px solid ${C.border}`, fontSize:12, color:C.sub, flexShrink:0 }}>
        <div style={{ width:7, height:7, borderRadius:'50%', background:isActive?C.green:C.muted, flexShrink:0 }}/>
        <span style={{ flex:1 }}>
          {syncing ? '同期中…' : formatNext()}
        </span>
        {lastSync && (
          <span style={{ color:C.muted }}>
            最終更新: {lastSync.toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'})}
          </span>
        )}
        <button onClick={manualSync} disabled={syncing}
          style={{ padding:'3px 10px', borderRadius:6, border:`1px solid ${C.border}`, background:'transparent', fontSize:11, color:syncing?C.muted:C.primary, cursor:syncing?'default':'pointer', fontFamily:FONT, fontWeight:600 }}>
          {syncing ? '更新中…' : '情報を更新'}
        </button>
      </div>
    )
  }

  // PC レイアウト
  if (isDesktop) {
    return (
      <div style={{ display:'flex', height:'100vh', background:C.bg, fontFamily:FONT, overflow:'hidden' }}>
        <SideNav active={tab} setActive={setTab} />
        <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'14px 28px', background:C.card, borderBottom:`1.5px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ fontSize:17, fontWeight:700, color:C.text }}>
              {tab==='home'?'🏠 ホーム':tab==='calendar'?'📅 みんなのスケジュール':tab==='sessions'?'🧩 だれが・どのコマ・どの子ども':tab==='ideas'?'📬 アイデアポスト':tab==='hidamari'?'☀️ こころのひだまり':'⚙️ 設定'}
            </div>
            <div style={{ fontSize:11, color:C.muted }}>コペルプラス 東久留米教室</div>
          </div>
          <SyncBar />
          <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding: tab==='calendar'||tab==='hidamari' ? 0 : '20px 28px' }}>
            {screens[tab] ?? <Home />}
          </div>
        </main>
      </div>
    )
  }

  // スマートフォン レイアウト
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:C.bg, fontFamily:FONT, maxWidth:480, margin:'0 auto', overflow:'hidden' }}>
      <SyncBar />
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
        {screens[tab] ?? <Home />}
      </div>
      <BottomNav active={tab} setActive={setTab} />
    </div>
  )
}
