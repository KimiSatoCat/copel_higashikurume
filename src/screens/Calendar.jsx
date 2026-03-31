import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, getDoc } from 'firebase/firestore'
import { collection, getDocs } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, SHIFT, DOW_JA } from '../theme'

const SHIFT_OPTS = ['in','late','ext','off']

export default function Calendar() {
  const { can, profile } = useAuth()
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1) // 1-indexed
  const [staffList, setStaffList] = useState([])
  const [schedule,  setSchedule]  = useState({ shifts:{}, events:{} })
  const [editMode,  setEditMode]  = useState(false)
  const [modalDay,  setModalDay]  = useState(null)
  const [eventInput, setEventInput] = useState('')
  const scrollRef = useRef()

  const ym     = `${year}-${String(month).padStart(2,'0')}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const days   = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // 誕生日マップ
  const [bdayMap, setBdayMap] = useState({}) // day → [{name,type}]

  useEffect(() => {
    // 職員リスト
    getDocs(collection(db, 'facilities', FACILITY_ID, 'staff')).then(snap => {
      const list = snap.docs.filter(d => d.data().active).map(d => ({ id:d.id, ...d.data() }))
      setStaffList(list)

      // 誕生日マップ構築
      const map = {}
      list.forEach(s => {
        if (!s.birthday) return
        const d = parseInt(s.birthday.split('-')[2] || s.birthday.split('-')[1])
        const m = parseInt(s.birthday.split('-')[1] || s.birthday.split('-')[0])
        if (m === month) {
          ;(map[d] = map[d] || []).push({ name:s.name.split(' ')[0], type:'staff' })
        }
      })
      // TODO: 児童の誕生日も同様に追加
      setBdayMap(map)
    })

    // スケジュールリアルタイム監視
    const ref = doc(db, 'facilities', FACILITY_ID, 'schedules', ym)
    const unsub = onSnapshot(ref, snap => {
      setSchedule(snap.exists() ? snap.data() : { shifts:{}, events:{} })
    })
    return () => unsub()
  }, [ym, month])

  const prevMonth = () => { if (month===1) { setYear(y=>y-1); setMonth(12) } else setMonth(m=>m-1) }
  const nextMonth = () => { if (month===12) { setYear(y=>y+1); setMonth(1) } else setMonth(m=>m+1) }

  // シフト更新（管理者のみ）
  const updateShift = async (staffId, day, val) => {
    if (!can.editSchedule()) return
    const ref  = doc(db, 'facilities', FACILITY_ID, 'schedules', ym)
    const snap = await getDoc(ref)
    const data = snap.exists() ? snap.data() : { shifts:{}, events:{} }
    if (!data.shifts[staffId]) data.shifts[staffId] = {}
    data.shifts[staffId][day] = val
    await setDoc(ref, data, { merge: true })
  }

  // イベント保存
  const saveEvent = async () => {
    if (!modalDay || !can.editSchedule()) return
    const ref = doc(db, 'facilities', FACILITY_ID, 'schedules', ym)
    await setDoc(ref, { events: { [modalDay]: eventInput.trim() } }, { merge:true })
    setModalDay(null)
    setEventInput('')
  }

  const events = schedule.events || {}
  const shifts  = schedule.shifts || {}

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* ヘッダー */}
      <div style={{ padding:'14px 14px 8px', background:C.card, borderBottom:`1.5px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <button onClick={prevMonth} style={{ border:`1.5px solid ${C.border}`, background:'transparent', borderRadius:10, padding:'6px 10px', fontSize:14, cursor:'pointer', fontFamily:FONT }}>◀</button>
          <div style={{ flex:1, textAlign:'center', fontSize:18, fontWeight:800, color:C.text }}>{year}年{month}月</div>
          <button onClick={nextMonth} style={{ border:`1.5px solid ${C.border}`, background:'transparent', borderRadius:10, padding:'6px 10px', fontSize:14, cursor:'pointer', fontFamily:FONT }}>▶</button>
          {can.editSchedule() && (
            <button onClick={() => setEditMode(m => !m)}
              style={{ border:`1.5px solid ${editMode?C.primary:C.border}`, background:editMode?C.primaryLight:'transparent', borderRadius:10, padding:'6px 12px', fontSize:13, fontWeight:editMode?700:400, color:editMode?C.primaryDark:C.sub, cursor:'pointer', fontFamily:FONT }}>
              {editMode ? '✏️ 編集中' : '編集'}
            </button>
          )}
        </div>

        {/* 凡例 */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {Object.entries(SHIFT).map(([k,v]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:10, height:10, borderRadius:3, background:v.dot }} />
              <span style={{ fontSize:11, color:C.sub }}>{v.label}</span>
            </div>
          ))}
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:11 }}>🎂</span>
            <span style={{ fontSize:11, color:C.sub }}>誕生日</span>
          </div>
        </div>
      </div>

      {/* カレンダー本体 */}
      <div ref={scrollRef} style={{ flex:1, overflowX:'auto', overflowY:'auto', padding:'8px 6px 16px' }}>
        <div style={{ minWidth: 60 + 42 * daysInMonth + 8 }}>

          {/* イベント行 */}
          <div style={{ display:'flex', marginBottom:2 }}>
            <div style={{ width:60, flexShrink:0, fontSize:10, color:C.muted, display:'flex', alignItems:'center', paddingLeft:4 }}>イベント</div>
            {days.map(d => (
              <div key={d} style={{ width:40, flexShrink:0, marginRight:2, height:20 }}>
                {events[d] && (
                  <div style={{ background:C.amberLight, borderRadius:5, padding:'1px 3px', fontSize:9, color:'#7A5000', overflow:'hidden', whiteSpace:'nowrap', maxWidth:38, cursor:'pointer' }}
                    onClick={() => { setModalDay(d); setEventInput(events[d]) }}
                    title={events[d]}>
                    {events[d].split(' ')[0]}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 日付ヘッダー */}
          <div style={{ display:'flex', marginBottom:4 }}>
            <div style={{ width:60, flexShrink:0 }} />
            {days.map(d => {
              const dow  = new Date(year, month-1, d).getDay()
              const isToday = year===today.getFullYear() && month===today.getMonth()+1 && d===today.getDate()
              const hasBday = !!bdayMap[d]
              return (
                <button key={d} onClick={() => can.editSchedule() && setModalDay(d)}
                  style={{ width:40, flexShrink:0, marginRight:2, display:'flex', flexDirection:'column', alignItems:'center', background:'transparent', border:'none', cursor:can.editSchedule()?'pointer':'default', padding:'2px 0', borderRadius:8 }}>
                  <span style={{ fontSize:10, color:dow===0?C.coral:dow===6?C.blue:C.sub, fontWeight:isToday?700:400 }}>
                    {DOW_JA[dow]}
                  </span>
                  <span style={{
                    width:28, height:28, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:14, fontWeight:isToday?800:500,
                    background:isToday?C.primary:'transparent',
                    color:isToday?'#fff':dow===0?C.coral:dow===6?C.blue:C.text
                  }}>{d}</span>
                  <span style={{ fontSize:11, lineHeight:1 }}>{hasBday ? '🎂' : ''}</span>
                </button>
              )
            })}
          </div>

          {/* スタッフ行 */}
          {staffList.map(s => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', marginBottom:3 }}>
              <div style={{ width:60, flexShrink:0, display:'flex', alignItems:'center', gap:5, paddingRight:4 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:(s.color||C.primary)+'33', border:`2px solid ${s.color||C.primary}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:s.color||C.primary, flexShrink:0 }}>
                  {(s.name||'?')[0]}
                </div>
                <span style={{ fontSize:10, fontWeight:500, color:C.text, lineHeight:1.2, overflow:'hidden', width:28 }}>
                  {(s.name||'').split(' ')[1]||(s.name||'')[0]}
                </span>
              </div>
              {days.map(d => {
                const type = shifts[s.id]?.[d] || 'off'
                const cfg  = SHIFT[type]
                return (
                  <div key={d} style={{ width:40, flexShrink:0, marginRight:2 }}>
                    {editMode ? (
                      <select value={type} onChange={e => updateShift(s.id, d, e.target.value)}
                        style={{ width:38, height:30, borderRadius:6, border:`1.5px solid ${cfg.dot}`, background:cfg.bg, color:cfg.color, fontSize:10, fontWeight:600, fontFamily:FONT, cursor:'pointer', textAlign:'center' }}>
                        {SHIFT_OPTS.map(o => <option key={o} value={o}>{SHIFT[o].short}</option>)}
                      </select>
                    ) : (
                      <div style={{ height:30, borderRadius:6, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:cfg.color }}>
                        {cfg.short}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* イベント追加モーダル */}
      {modalDay && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'flex-end', zIndex:200 }} onClick={() => setModalDay(null)}>
          <div style={{ background:C.card, borderRadius:'24px 24px 0 0', padding:'24px 20px 32px', width:'100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:10 }}>
              {month}月{modalDay}日のイベント {bdayMap[modalDay]&&`🎂 ${bdayMap[modalDay].map(b=>b.name).join('・')}`}
            </div>
            <input value={eventInput} onChange={e=>setEventInput(e.target.value)}
              placeholder="イベント名（例：研修・誕生日会・教材整理）"
              style={{ width:'100%', padding:'14px', borderRadius:12, border:`2px solid ${C.border}`, fontSize:16, fontFamily:FONT, outline:'none', boxSizing:'border-box', marginBottom:12 }}
            />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalDay(null)} style={{ flex:1, padding:'13px', borderRadius:12, border:`2px solid ${C.border}`, background:'transparent', fontSize:15, fontWeight:600, color:C.sub, cursor:'pointer', fontFamily:FONT }}>キャンセル</button>
              <button onClick={saveEvent} style={{ flex:2, padding:'13px', borderRadius:12, border:'none', background:C.primary, fontSize:15, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:FONT }}>保存する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
