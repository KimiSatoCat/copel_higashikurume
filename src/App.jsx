import { useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import { FONT, C } from './theme'
import Login    from './screens/Login'
import Home     from './screens/Home'
import Calendar from './screens/Calendar'
import Sessions from './screens/Sessions'
import IdeaPost from './screens/IdeaPost'
import Hidamari from './screens/Hidamari'
import Settings from './screens/Settings'
import BottomNav from './components/BottomNav'

export default function App() {
  const { user, loading } = useAuth()
  const [tab, setTab] = useState('home')

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.bg, fontFamily:FONT }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🌿</div>
        <div style={{ fontSize:18, color:C.sub }}>読み込み中...</div>
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

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:C.bg, fontFamily:FONT, maxWidth:480, margin:'0 auto', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
        {screens[tab] ?? <Home />}
      </div>
      <BottomNav active={tab} setActive={setTab} />
    </div>
  )
}
