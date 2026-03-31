import { C, FONT } from '../theme'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { id:'home',     emoji:'🏠', label:'ホーム' },
  { id:'calendar', emoji:'📅', label:'みんなのスケジュール' },
  { id:'sessions', emoji:'🧩', label:'だれが・どのコマ・どの子ども' },
  { id:'ideas',    emoji:'📬', label:'アイデアポスト' },
  { id:'hidamari', emoji:'☀️', label:'こころのひだまり' },
  { id:'settings', emoji:'⚙️', label:'設定' },
]

export default function SideNav({ active, setActive }) {
  const { profile, role } = useAuth()
  const hira   = profile?.hiraganaName || ''
  const kanji  = profile?.name || ''
  const dispName = hira ? `${hira.split(' ')[0]}先生` : (kanji ? `${kanji}先生` : '先生')

  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      background: C.card,
      borderRight: `1.5px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* ロゴ */}
      <div style={{ padding:'20px 16px 14px', borderBottom:`1.5px solid ${C.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:C.primary, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🌿</div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:C.text, lineHeight:1.2 }}>コペルプラス</div>
            <div style={{ fontSize:11, color:C.sub }}>東久留米教室</div>
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav style={{ flex:1, padding:'10px 10px', overflowY:'auto' }}>
        {NAV_ITEMS.map(item => {
          const on = active === item.id
          return (
            <button key={item.id} onClick={() => setActive(item.id)}
              style={{
                width: '100%', padding:'10px 12px', borderRadius:11,
                border: 'none', marginBottom:4,
                background: on ? C.primaryLight : 'transparent',
                display:'flex', alignItems:'center', gap:10,
                cursor:'pointer', fontFamily:FONT, textAlign:'left',
              }}>
              <span style={{ fontSize:19, flexShrink:0 }}>{item.emoji}</span>
              <span style={{ fontSize:13, fontWeight:on?700:400, color:on?C.primaryDark:C.sub, lineHeight:1.3 }}>
                {item.label}
              </span>
              {on && <div style={{ width:4, height:4, borderRadius:'50%', background:C.primary, marginLeft:'auto', flexShrink:0 }}/>}
            </button>
          )
        })}
      </nav>

      {/* プロフィール */}
      <div style={{ padding:'12px 14px', borderTop:`1.5px solid ${C.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {profile?.photoURL
            ? <img src={profile.photoURL} alt="" style={{ width:32, height:32, borderRadius:'50%' }}/>
            : <div style={{ width:32, height:32, borderRadius:'50%', background:C.primaryLight, border:`2px solid ${C.primary}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:C.primaryDark }}>{(kanji||'先')[0]}</div>
          }
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dispName}</div>
            <div style={{ fontSize:10, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.email || ''}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
