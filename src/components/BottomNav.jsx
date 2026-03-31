import { C, FONT } from '../theme'

const TABS = [
  { id:'home',     emoji:'🏠', label:'ホーム' },
  { id:'calendar', emoji:'📅', label:'カレンダー' },
  { id:'sessions', emoji:'🧩', label:'コマ割り当て' },
  { id:'hidamari', emoji:'☀️', label:'ひだまり' },
  { id:'settings', emoji:'⚙️', label:'設定' },
]

export default function BottomNav({ active, setActive }) {
  return (
    <nav style={{ display:'flex', background:C.card, borderTop:`1.5px solid ${C.border}`, flexShrink:0, paddingBottom:'env(safe-area-inset-bottom)' }}>
      {TABS.map(t => {
        const on = active === t.id
        return (
          <button key={t.id} onClick={() => setActive(t.id)}
            style={{ flex:1, padding:'9px 2px 7px', border:'none', background:'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:2, fontFamily:FONT }}>
            <span style={{ fontSize:21, lineHeight:1 }}>{t.emoji}</span>
            <span style={{ fontSize:10, fontWeight:on?700:400, color:on?C.primary:C.muted, lineHeight:1 }}>{t.label}</span>
            {on && <div style={{ width:18, height:3, borderRadius:99, background:C.primary, marginTop:1 }} />}
          </button>
        )
      })}
    </nav>
  )
}
