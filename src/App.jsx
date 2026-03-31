import { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db, FACILITY_ID } from './firebase'
import { useAuth } from './contexts/AuthContext'
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

// 768px以上をPCとみなす
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768)
  useEffect(() => {
    const fn = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return isDesktop
}

export default function App() {
  const { user, loading, getGoogleToken } = useAuth()
  const [tab, setTab]   = useState('home')
  const isDesktop       = useIsDesktop()

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

  // 読み込み中
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.bg, fontFamily:FONT }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>🌿</div>
        <div style={{ fontSize:18, color:C.sub }}>読み込み中…</div>
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

  // ─── PC レイアウト（サイドバー＋メインコンテンツ） ─────────
  if (isDesktop) {
    return (
      <div style={{ display:'flex', height:'100vh', background:C.bg, fontFamily:FONT, overflow:'hidden' }}>
        <SideNav active={tab} setActive={setTab} />
        <main style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
          {/* PC用ヘッダー */}
          <div style={{ padding:'16px 28px', background:C.card, borderBottom:`1.5px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ fontSize:18, fontWeight:700, color:C.text }}>
              {tab==='home'?'🏠 ホーム':tab==='calendar'?'📅 みんなのスケジュール':tab==='sessions'?'🧩 だれが・どのコマ・どの子ども':tab==='ideas'?'📬 アイデアポスト':tab==='hidamari'?'☀️ こころのひだまり':'⚙️ 設定'}
            </div>
            <div style={{ fontSize:12, color:C.muted }}>コペルプラス 東久留米教室</div>
          </div>
          {/* コンテンツ */}
          <div style={{ padding: tab==='hidamari'?0 : tab==='calendar'?0 : '24px 28px', maxWidth: tab==='calendar'?'none':'960px' }}>
            {screens[tab] ?? <Home />}
          </div>
        </main>
      </div>
    )
  }

  // ─── スマートフォン レイアウト ──────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:C.bg, fontFamily:FONT, maxWidth:480, margin:'0 auto', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
        {screens[tab] ?? <Home />}
      </div>
      <BottomNav active={tab} setActive={setTab} />
    </div>
  )
}
