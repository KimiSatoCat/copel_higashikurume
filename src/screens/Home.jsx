import { useState, useEffect } from 'react'
import { collection, doc, onSnapshot, getDocs } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, DOW_JA } from '../theme'

export default function Home({ onNavigate }) {
  const { profile, user } = useAuth()
  const today   = new Date()
  const y = today.getFullYear(), m = today.getMonth()+1, d = today.getDate()
  const ym      = `${y}-${String(m).padStart(2,'0')}`
  const dateKey = `${ym}-${String(d).padStart(2,'0')}`
  const label   = `${y}年${m}月${d}日（${DOW_JA[today.getDay()]}）`

  const [staffList, setStaffList] = useState([])
  const [schedule,  setSchedule]  = useState({})
  const [sessions,  setSessions]  = useState([])
  const [upcoming,  setUpcoming]  = useState([])

  useEffect(() => {
    getDocs(collection(db,'facilities',FACILITY_ID,'staff')).then(s => {
      const list = s.docs.filter(d => d.data().active !== false).map(d => ({ id:d.id, ...d.data() }))
      setStaffList(list)

      const notices = []
      list.forEach(s => {
        if (!s.birthday) return
        const parts = s.birthday.split('-')
        if (parts.length < 3) return
        const [,bm,bd] = parts.map(Number)
        const bdDate = new Date(today.getFullYear(), bm-1, bd)
        const diff   = Math.ceil((bdDate - today) / 86400000)
        if (diff >= 0 && diff <= 7) {
          const name = s.hiraganaFirst ? `${s.hiraganaFirst}先生` : s.name
          notices.push({ name, diff })
        }
      })
      setUpcoming(notices)
    }).catch(err => console.warn('[Home] staff load:', err.message))

    const u1 = onSnapshot(
      doc(db,'facilities',FACILITY_ID,'schedules',ym),
      snap => setSchedule(snap.exists() ? snap.data() : {}),
      err  => console.warn('[Home] schedule:', err.message)
    )
    const u2 = onSnapshot(
      doc(db,'facilities',FACILITY_ID,'sessions',dateKey),
      snap => { if (snap.exists()) setSessions(snap.data().slots || []) },
      err  => console.warn('[Home] sessions:', err.message)
    )
    return () => { u1(); u2() }
  }, [ym, dateKey])

  const shifts   = schedule.shifts || {}
  const todayIn  = staffList.filter(s => ['in','late'].includes(shifts[s.id]?.[d])).length
  const todayExt = staffList.filter(s => shifts[s.id]?.[d] === 'ext').length

  const dispFirst = profile?.hiraganaFirst || ''
  const greeting  = dispFirst
    ? `${dispFirst}先生`
    : user?.displayName
      ? `${user.displayName.split(' ')[0]}さん`
      : ''

  // プロフィール未設定の案内
  const needsProfileSetup = !profile?.hiraganaFirst

  return (
    <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:13 }}>

      {/* 挨拶バナー */}
      <div style={{ background:`linear-gradient(135deg,${C.primary},${C.primaryDark})`, borderRadius:20, padding:'18px 20px', color:'#fff' }}>
        <div style={{ fontSize:14, opacity:.85 }}>{label}</div>
        <div style={{ fontSize:21, fontWeight:800, marginTop:2 }}>おはようございます 🌤️</div>
        {greeting && <div style={{ fontSize:16, opacity:.9, marginTop:4 }}>{greeting}</div>}
      </div>

      {/* プロフィール未設定のときだけ案内バナーを表示 */}
      {needsProfileSetup && (
        <div style={{ background:C.amberLight, borderRadius:16, padding:'13px 16px', border:`1.5px solid ${C.amber}55`, display:'flex', alignItems:'center', gap:12 }}
          onClick={() => onNavigate?.('settings')}
        >
          <div style={{ fontSize:24 }}>👤</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#B07800' }}>プロフィールを設定してください</div>
            <div style={{ fontSize:12, color:'#B07800', marginTop:2, opacity:.8 }}>ひらがなの名前を登録すると「〇〇先生」と表示されます</div>
          </div>
          <div style={{ fontSize:18, color:C.amber }}>›</div>
        </div>
      )}

      {/* 今日のサマリー */}
      <div style={{ background:C.card, borderRadius:20, padding:14, border:`1.5px solid ${C.border}` }}>
        <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:12 }}>📊 きょうのようす</div>
        <div style={{ display:'flex', gap:8 }}>
          {[
            { e:'👥', l:'出勤者',  v:todayIn,            u:'名',  bg:C.primaryLight, c:C.primaryDark },
            { e:'🧩', l:'コマ数',  v:sessions.length||0, u:'コマ', bg:C.amberLight,   c:'#B07800'     },
            { e:'🚗', l:'外勤',    v:todayExt,           u:'名',  bg:C.coralLight,   c:'#CC5040'     },
          ].map(item => (
            <div key={item.l} style={{ flex:1, borderRadius:16, padding:'12px 8px', background:item.bg, textAlign:'center' }}>
              <div style={{ fontSize:24, marginBottom:2 }}>{item.e}</div>
              <div style={{ fontSize:12, fontWeight:500, color:item.c, marginBottom:2 }}>{item.l}</div>
              <div style={{ fontSize:28, fontWeight:800, color:item.c, lineHeight:1 }}>{item.v}</div>
              <div style={{ fontSize:12, color:item.c, marginTop:1 }}>{item.u}</div>
            </div>
          ))}
        </div>

        {/* 職員が0人の場合の案内 */}
        {staffList.length === 0 && (
          <div style={{ marginTop:12, background:C.bg, borderRadius:10, padding:'9px 12px', fontSize:12, color:C.sub, textAlign:'center', cursor:'pointer' }}
            onClick={() => onNavigate?.('settings')}>
            ⚙️ 設定 → 職員管理から職員を追加すると出勤者数が表示されます
          </div>
        )}
      </div>

      {/* 今日のコマ */}
      {sessions.length > 0 && (
        <div style={{ background:C.card, borderRadius:20, padding:14, border:`1.5px solid ${C.border}` }}>
          <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:12 }}>🧩 きょうのコマ割り当て</div>
          {sessions.map((s, i) => {
            const cards = s.cards || (s.staffId ? [{
              staffName: s.staffName, type: s.type || '個別', children: s.children || []
            }] : [])
            // カードが空（担当なし）かどうか
            const hasAny = cards.some(c => c.staffName)
            return (
              <div key={i} style={{ padding:'10px 0', borderBottom:i<sessions.length-1?`1px solid ${C.divider}`:'none' }}>
                {/* コマ番号・時間 */}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <div style={{ width:24, height:24, borderRadius:6, background:C.primaryLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:C.primary, flexShrink:0 }}>{i+1}</div>
                  <div style={{ fontSize:12, color:C.sub, fontWeight:600 }}>{s.time}</div>
                </div>
                {/* 担当ごとの行 */}
                {hasAny ? cards.filter(c => c.staffName).map((card, ci) => {
                  const isGroup = card.type === '集団'
                  const kids = (card.children||[]).filter(ch => ch.childName)
                  return (
                    <div key={ci} style={{ display:'flex', alignItems:'flex-start', gap:6, paddingLeft:32, marginBottom:3 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text, flexShrink:0 }}>
                        {card.staffName}
                      </div>
                      <div style={{ fontSize:13, color:C.muted, flexShrink:0 }}>→</div>
                      <div style={{ fontSize:13, color:C.text }}>
                        {isGroup ? (
                          <span style={{ background:C.amberLight, color:'#B07800', borderRadius:99, padding:'1px 8px', fontSize:11, fontWeight:700 }}>集団</span>
                        ) : kids.length > 0 ? (
                          kids.map((ch, ki) => {
                            const sc = ch.status==='来所済み'?{bg:C.primaryLight,c:C.primaryDark}:ch.status==='欠席'?{bg:C.coralLight,c:'#CC5040'}:{bg:C.amberLight,c:'#B07800'}
                            return (
                              <span key={ki} style={{ marginRight:4 }}>
                                <span>{ch.childName}さん</span>
                                <span style={{ background:sc.bg, color:sc.c, borderRadius:99, padding:'1px 6px', fontSize:10, fontWeight:600, marginLeft:3 }}>{ch.status}</span>
                              </span>
                            )
                          })
                        ) : (
                          <span style={{ color:C.muted }}>（未設定）</span>
                        )}
                      </div>
                    </div>
                  )
                }) : (
                  <div style={{ paddingLeft:32, fontSize:13, color:C.muted }}>未設定</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 近日誕生日 */}
      {upcoming.length > 0 && (
        <div style={{ background:`linear-gradient(135deg,${C.purpleLight},#FAF0FF)`, borderRadius:20, padding:14, border:`1.5px solid ${C.purple}33` }}>
          <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:10 }}>🎂 もうすぐ誕生日</div>
          {upcoming.map((b, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:i<upcoming.length-1?`1px solid ${C.border}`:'none' }}>
              <span style={{ fontSize:26 }}>{b.diff===0?'🎉':'🎂'}</span>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{b.name}</div>
                <div style={{ fontSize:13, color:C.sub }}>{b.diff===0?'今日！':b.diff===1?'明日！':`あと${b.diff}日`}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
