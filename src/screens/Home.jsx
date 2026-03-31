import { useState, useEffect } from 'react'
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, DOW_JA } from '../theme'

export default function Home() {
  const { profile } = useAuth()
  const [staffList, setStaffList]   = useState([])
  const [schedule,  setSchedule]    = useState({})
  const [sessions,  setSessions]    = useState([])
  const [upcoming,  setUpcoming]    = useState([])  // 近日誕生日

  const today = new Date()
  const ym    = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`
  const dd    = today.getDate()
  const dowLabel = DOW_JA[today.getDay()]
  const todayStr = `${today.getFullYear()}年${today.getMonth()+1}月${dd}日（${dowLabel}）`

  useEffect(() => {
    // 職員リスト
    const staffRef = collection(db, 'facilities', FACILITY_ID, 'staff')
    const unsub1 = onSnapshot(staffRef, snap => {
      setStaffList(snap.docs.filter(d => d.data().active).map(d => ({ id:d.id, ...d.data() })))
    })

    // 今月のスケジュール
    const schRef = doc(db, 'facilities', FACILITY_ID, 'schedules', ym)
    const unsub2 = onSnapshot(schRef, snap => {
      setSchedule(snap.exists() ? snap.data() : {})
    })

    // 今日のセッション
    const sessRef = doc(db, 'facilities', FACILITY_ID, 'sessions', `${ym}-${String(dd).padStart(2,'0')}`)
    const unsub3 = onSnapshot(sessRef, snap => {
      if (snap.exists()) setSessions(snap.data().slots || [])
    })

    return () => { unsub1(); unsub2(); unsub3() }
  }, [ym, dd])

  // 今日の出勤者を集計
  const shifts   = schedule.shifts || {}
  const todayIn  = staffList.filter(s => ['in','late'].includes(shifts[s.id]?.[dd])).length
  const todayExt = staffList.filter(s => shifts[s.id]?.[dd] === 'ext').length
  const arrived  = sessions.filter(s => s.status === '来所済み').length
  const unread   = 0  // TODO: Firestoreからつなぎメモの未読数

  // 近日誕生日（3日以内）
  const birthdayNotices = []
  staffList.forEach(s => {
    if (!s.birthday) return
    const [,m,d] = s.birthday.split('-').map(Number)
    const bdDate = new Date(today.getFullYear(), m-1, d)
    const diff = Math.ceil((bdDate - today) / 86400000)
    if (diff >= 0 && diff <= 7) birthdayNotices.push({ name:s.name, diff, type:'職員' })
  })

  return (
    <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:14 }}>

      {/* 挨拶バナー */}
      <div style={{ background:`linear-gradient(135deg,${C.primary},${C.primaryDark})`, borderRadius:20, padding:'18px 20px', color:'#fff' }}>
        <div style={{ fontSize:14, opacity:.85, marginBottom:2 }}>{todayStr}</div>
        <div style={{ fontSize:21, fontWeight:800 }}>おはようございます 🌤️</div>
        <div style={{ fontSize:15, opacity:.9, marginTop:4 }}>{profile?.name || ''}さん</div>
      </div>

      {/* 今日のサマリー */}
      <div style={{ background:C.card, borderRadius:20, padding:14, border:`1.5px solid ${C.border}` }}>
        <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:12 }}>📊 きょうのようす</div>
        <div style={{ display:'flex', gap:8 }}>
          {[
            { emoji:'👥', label:'出勤者',   value:todayIn,  unit:'名', bg:C.primaryLight, c:C.primaryDark },
            { emoji:'🧩', label:'コマ数',   value:sessions.length, unit:'コマ', bg:C.amberLight, c:'#B07800' },
            { emoji:'🚗', label:'外勤',     value:todayExt, unit:'名', bg:C.coralLight, c:'#CC5040' },
          ].map(s => (
            <div key={s.label} style={{ flex:1, borderRadius:16, padding:'12px 8px', background:s.bg, textAlign:'center' }}>
              <div style={{ fontSize:24, marginBottom:2 }}>{s.emoji}</div>
              <div style={{ fontSize:12, fontWeight:500, color:s.c, marginBottom:2 }}>{s.label}</div>
              <div style={{ fontSize:28, fontWeight:800, color:s.c, lineHeight:1 }}>{s.value}</div>
              <div style={{ fontSize:12, color:s.c, marginTop:1 }}>{s.unit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* コマ一覧 */}
      {sessions.length > 0 && (
        <div style={{ background:C.card, borderRadius:20, padding:14, border:`1.5px solid ${C.border}` }}>
          <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:12 }}>🧩 きょうのコマ割り当て</div>
          {sessions.map((s, i) => {
            const sc = s.status==='来所済み' ? {bg:C.primaryLight,c:C.primaryDark} : s.status==='欠席' ? {bg:C.coralLight,c:'#CC5040'} : {bg:C.amberLight,c:'#B07800'}
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:i<sessions.length-1?`1px solid ${C.divider}`:'none' }}>
                <div style={{ width:26, height:26, borderRadius:7, background:C.primaryLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:C.primary, flexShrink:0 }}>
                  {i+1}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:C.sub }}>{s.time}</div>
                  <div style={{ fontSize:14, fontWeight:600, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {s.staffName || '未設定'} → {s.childName || '未設定'}
                  </div>
                </div>
                <div style={{ background:sc.bg, color:sc.c, borderRadius:99, padding:'4px 10px', fontSize:12, fontWeight:600, flexShrink:0 }}>{s.status || '予定'}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* 近日誕生日 */}
      {birthdayNotices.length > 0 && (
        <div style={{ background:`linear-gradient(135deg,${C.purpleLight},#FAF0FF)`, borderRadius:20, padding:14, border:`1.5px solid ${C.purple}33` }}>
          <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:10 }}>🎂 もうすぐ誕生日</div>
          {birthdayNotices.map((b, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:i<birthdayNotices.length-1?`1px solid ${C.border}`:'' }}>
              <span style={{ fontSize:26 }}>{b.diff===0?'🎉':'🎂'}</span>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{b.name}さん</div>
                <div style={{ fontSize:13, color:C.sub }}>{b.diff===0?'今日！':b.diff===1?'明日！':`あと${b.diff}日`}</div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
