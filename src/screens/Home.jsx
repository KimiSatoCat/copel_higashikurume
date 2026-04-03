import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { C, FONT, DOW_JA } from '../theme'

export default function Home({ onNavigate }) {
  const { profile, user } = useAuth()
  const { staffList, schedule, sessions, loading } = useData()

  const today   = new Date()
  const y = today.getFullYear(), m = today.getMonth()+1, d = today.getDate()
  const label   = `${y}年${m}月${d}日（${DOW_JA[today.getDay()]}）`

  const [upcoming, setUpcoming] = useState([])

  // 誕生日通知だけHereで計算（軽い処理）
  useEffect(() => {
    if (!staffList.length) return
    const notices = []
    staffList.forEach(s => {
      if (!s.birthday) return
      const parts = s.birthday.split('-')
      const bm = parseInt(parts[1]), bd = parseInt(parts[2])
      const thisYear  = new Date(y, bm-1, bd)
      const diff = Math.round((thisYear - today) / 86400000)
      if (diff >= 0 && diff <= 7) {
        const name = s.hiraganaFirst ? `${s.hiraganaFirst}先生` : s.name
        notices.push({ name, diff, date: `${bm}/${bd}` })
      }
    })
    setUpcoming(notices.sort((a,b) => a.diff - b.diff))
  }, [staffList, y, m, d])

  const shifts   = schedule.shifts || {}
  const todayIn  = staffList.filter(s => ['in','late'].includes(shifts[s.id]?.[d])).length
  const todayExt = staffList.filter(s => shifts[s.id]?.[d] === 'ext').length

  const dispFirst = profile?.hiraganaFirst || ''
  const greeting  = dispFirst
    ? `${dispFirst}先生`
    : user?.displayName
      ? `${user.displayName.split(' ')[0]}さん`
      : ''

  const hour = today.getHours()
  const timeGreet = hour < 10 ? 'おはようございます 🌤️' : hour < 17 ? 'こんにちは 🌞' : 'おつかれさまです 🌙'

  return (
    <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
      <div>
        <div style={{ fontSize:13, color:C.sub }}>{label}</div>
        <div style={{ fontSize:17, fontWeight:800, color:C.text, marginTop:2 }}>{timeGreet}</div>
        {greeting && <div style={{ fontSize:15, fontWeight:700, color:C.primary, marginTop:2 }}>{greeting}</div>}
      </div>

      {!profile?.hiraganaFirst && (
        <div onClick={() => onNavigate?.('settings')}
          style={{ background:`linear-gradient(135deg,${C.primaryLight},#E8F8F5)`, borderRadius:16, padding:'12px 14px', border:`1.5px solid ${C.primary}44`, cursor:'pointer' }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.primaryDark, marginBottom:3 }}>👤 プロフィールを設定してください</div>
          <div style={{ fontSize:12, color:C.sub }}>ひらがなの名前を登録すると「〇〇先生」と表示されます›</div>
        </div>
      )}

      {/* 今日のようす */}
      <div style={{ background:C.card, borderRadius:20, padding:14, border:`1.5px solid ${C.border}` }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:10 }}>📊 きょうのようす</div>
        <div style={{ display:'flex', gap:8 }}>
          {[
            { e:'👥', l:'出勤者',  v:todayIn,         u:'名', bg:C.primaryLight,  c:C.primaryDark },
            { e:'🧩', l:'コマ数',  v:sessions.length||0, u:'コマ', bg:C.amberLight, c:'#B07800' },
            { e:'🚗', l:'外勤',    v:todayExt,        u:'名', bg:C.coralLight,    c:'#CC5040'  },
          ].map(({ e, l, v, u, bg, c }) => (
            <div key={l} style={{ flex:1, background:bg, borderRadius:14, padding:'10px 8px', textAlign:'center' }}>
              <div style={{ fontSize:20 }}>{e}</div>
              <div style={{ fontSize:11, color:c, marginTop:2 }}>{l}</div>
              <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}<span style={{ fontSize:11 }}>{u}</span></div>
            </div>
          ))}
        </div>
        {!staffList.length && (
          <div style={{ fontSize:12, color:C.muted, marginTop:8, textAlign:'center' }}>
            ⚙️ 設定 → 職員管理から職員を追加すると出勤者数が表示されます
          </div>
        )}
      </div>

      {/* コマ割り当て */}
      <div style={{ background:C.card, borderRadius:20, padding:14, border:`1.5px solid ${C.border}` }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:10 }}>🧩 きょうのコマ割り当て</div>

        {loading ? (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0' }}>
            <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${C.primaryLight}`, borderTopColor:C.primary, animation:'spin .7s linear infinite', flexShrink:0 }}/>
            <span style={{ fontSize:13, color:C.sub }}>読み込み中…</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ fontSize:13, color:C.muted }}>本日のコマ割り当てはまだ入力されていません</div>
        ) : (
          sessions.map((s, i) => {
            const cards = s.cards || (s.staffId ? [{ staffName:s.staffName, type:s.type||'個別', children:s.children||[] }] : [])
            const hasAny = cards.some(c => c.staffName)
            return (
              <div key={i} style={{ padding:'10px 0', borderBottom:i<sessions.length-1?`1px solid ${C.divider}`:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <div style={{ width:22, height:22, borderRadius:6, background:C.primaryLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:C.primary, flexShrink:0 }}>{i+1}</div>
                  <div style={{ fontSize:12, color:C.sub, fontWeight:600 }}>{s.time}</div>
                </div>
                {hasAny ? cards.filter(c=>c.staffName).map((card, ci) => {
                  const isGroup = card.type === '集団'
                  const kids = (card.children||[]).filter(ch=>ch.childName)
                  return (
                    <div key={ci} style={{ display:'flex', alignItems:'flex-start', gap:5, paddingLeft:30, marginBottom:3, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, fontWeight:600, color:C.text, flexShrink:0 }}>{card.staffName}</span>
                      <span style={{ fontSize:13, color:C.muted, flexShrink:0 }}>→</span>
                      {isGroup ? (
                        <span style={{ background:C.amberLight, color:'#B07800', borderRadius:99, padding:'1px 8px', fontSize:11, fontWeight:700 }}>集団</span>
                      ) : kids.length > 0 ? kids.map((ch, ki) => {
                        const sc = ch.status==='来所済み'?{bg:C.primaryLight,c:C.primaryDark}:ch.status==='欠席'?{bg:C.coralLight,c:'#CC5040'}:{bg:C.amberLight,c:'#B07800'}
                        return (
                          <span key={ki} style={{ display:'flex', alignItems:'center', gap:3 }}>
                            <span style={{ fontSize:13, color:C.text }}>{ch.childName}さん</span>
                            <span style={{ background:sc.bg, color:sc.c, borderRadius:99, padding:'1px 6px', fontSize:10, fontWeight:600 }}>{ch.status}</span>
                          </span>
                        )
                      }) : <span style={{ fontSize:13, color:C.muted }}>（未設定）</span>}
                    </div>
                  )
                }) : (
                  <div style={{ paddingLeft:30, fontSize:13, color:C.muted }}>未設定</div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 近日誕生日 */}
      {upcoming.length > 0 && (
        <div style={{ background:`linear-gradient(135deg,${C.purpleLight},#FAF0FF)`, borderRadius:20, padding:14, border:`1.5px solid ${C.purple}33` }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:10 }}>🎂 もうすぐ誕生日</div>
          {upcoming.map((b, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:i<upcoming.length-1?`1px solid ${C.border}`:'none' }}>
              <span style={{ fontSize:26 }}>{b.diff===0?'🎉':'🎂'}</span>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{b.name}</div>
                <div style={{ fontSize:12, color:C.sub }}>{b.diff===0?'🎉 今日が誕生日です！':`あと ${b.diff} 日（${b.date}）`}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
