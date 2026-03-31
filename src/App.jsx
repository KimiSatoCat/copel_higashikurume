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

export default function App() {
  const { user, loading, getGoogleToken } = useAuth()
  const [tab, setTab] = useState('home')

  // ─── 毎日17:00にスプレッドシートへ自動保存 ─────────────────
  useEffect(() => {
    if (!user) return

    // 今日のセッションデータを取得する関数
    const getDataFn = async () => {
      const today   = new Date()
      const year    = today.getFullYear()
      const month   = today.getMonth() + 1
      const day     = today.getDate()
      const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      const ref     = doc(db, 'facilities', FACILITY_ID, 'sessions', dateKey)
      const snap    = await getDoc(ref)
      return {
        year, month, day,
        slots: snap.exists() ? (snap.data().slots || []) : [],
      }
    }

    const cleanup = scheduleDailyReport(getGoogleToken, getDataFn)
    return cleanup
  }, [user, getGoogleToken])

  // ─── 読み込み中 ────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.bg, fontFamily:FONT }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>🌿</div>
        <div style={{ fontSize:18, color:C.sub }}>読み込み中…</div>
      </div>
    </div>
  )

  // ─── 未ログイン ─────────────────────────────────────────────
  if (!user) return <Login />

  // ─── メイン画面 ────────────────────────────────────────────
  const screens = {
    home:     <Home     />,
    calendar: <Calendar />,
    sessions: <Sessions />,
    ideas:    <IdeaPost />,
    hidamari: <Hidamari />,
    settings: <Settings />,
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:C.bg, fontFamily:FONT, maxWidth:480, margin:'0 auto', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
        {screens[tab] ?? <Home />}
      </div>
      <BottomNav active={tab} setActive={setTab} />
    </div>
  )
}
