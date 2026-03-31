import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, SHIFT, DOW_JA } from '../theme'

const SHIFT_OPTS = ['in', 'late', 'ext', 'off']

// 祝日セット（2026〜2035）
const HOLIDAYS = new Set([
  '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20',
  '2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06',
  '2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23',
  '2026-10-12','2026-11-03','2026-11-23',
  '2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21',
  '2027-04-29','2027-05-03','2027-05-04','2027-05-05',
  '2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11',
  '2027-11-03','2027-11-23',
  '2028-01-01','2028-01-10','2028-02-11','2028-02-23','2028-03-20',
  '2028-04-29','2028-05-03','2028-05-04','2028-05-05',
  '2028-07-17','2028-08-11','2028-09-18','2028-09-22','2028-10-09',
  '2028-11-03','2028-11-23',
  '2029-01-01','2029-01-08','2029-02-11','2029-02-23','2029-03-20',
  '2029-04-29','2029-05-03','2029-05-04','2029-05-05',
  '2030-01-01','2030-01-14','2030-02-11','2030-02-23','2030-03-20',
  '2030-04-29','2030-05-03','2030-05-04','2030-05-05',
])

function toDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function isHoliday(y, m, d) { return HOLIDAYS.has(toDateStr(y, m, d)) }
function rowBg(y, m, d) {
  const dow = new Date(y, m-1, d).getDay()
  if (dow === 0 || isHoliday(y, m, d)) return '#FFECEA'
  if (dow === 6) return '#E3F2FD'
  if (dow === 3) return '#FFFDE7'
  return null
}

// Google Calendar の色ID（自分のシフト種別に合わせる）
const GCAL_COLOR = { in: '2', late: '5', ext: '6', off: null }
// 色ID: 2=sage(緑), 5=banana(黄), 6=tangerine(橙)

export default function Calendar() {
  const { can, getGoogleToken, user } = useAuth()
  const today = new Date()

  const [year,     setYear]     = useState(today.getFullYear())
  const [month,    setMonth]    = useState(today.getMonth() + 1)
  const [staffList,setStaffList]= useState([])
  const [schedule, setSchedule] = useState({ shifts:{}, events:{} })
  const [editMode, setEditMode] = useState(false)
  const [modalDay, setModalDay] = useState(null)
  const [eventInput,setEventInput] = useState('')
  const [bdayMap,  setBdayMap]  = useState({})

  // カレンダー同期の状態
  const [syncState, setSyncState] = useState({
    status: 'idle',   // idle | loading | success | error
    message: '',
    details: '',
  })
  const unsubRef = useRef(null)

  const ym          = `${year}-${String(month).padStart(2,'0')}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const days        = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // 月が変わるたびにデータを再取得
  useEffect(() => {
    if (unsubRef.current) unsubRef.current()

    getDocs(collection(db,'facilities',FACILITY_ID,'staff')).then(snap => {
      const list = snap.docs.filter(d => d.data().active).map(d => ({ id:d.id, ...d.data() }))
      setStaffList(list)

      // 職員の誕生日マップを構築（この月のみ）
      const map = {}
      list.forEach(s => {
        if (!s.birthday) return
        const parts  = s.birthday.split('-')
        const bMonth = parseInt(parts[1])
        const bDay   = parseInt(parts[2])
        if (bMonth === month) {
          const displayName = s.hiraganaName
            ? s.hiraganaName.split(' ')[0]
            : (s.name || '').split(' ')[0]
          ;(map[bDay] = map[bDay] || []).push({ name: displayName, type: 'staff' })
        }
      })
      setBdayMap(map)
    })

    const ref = doc(db, 'facilities', FACILITY_ID, 'schedules', ym)
    unsubRef.current = onSnapshot(ref, snap => {
      setSchedule(snap.exists() ? snap.data() : { shifts:{}, events:{} })
    })

    return () => { if (unsubRef.current) unsubRef.current() }
  }, [ym, month, year])

  const prevMonth = () => { if(month===1){setYear(y=>y-1);setMonth(12)}else setMonth(m=>m-1) }
  const nextMonth = () => { if(month===12){setYear(y=>y+1);setMonth(1)}else setMonth(m=>m+1) }
  const goToday   = () => { setYear(today.getFullYear()); setMonth(today.getMonth()+1) }

  // シフト更新（権限者のみ）
  const updateShift = async (staffId, day, val) => {
    if (!can.editSchedule()) return
    const ref  = doc(db, 'facilities', FACILITY_ID, 'schedules', ym)
    const snap = await getDoc(ref)
    const data = snap.exists() ? snap.data() : { shifts:{}, events:{} }
    if (!data.shifts) data.shifts = {}
    if (!data.shifts[staffId]) data.shifts[staffId] = {}
    data.shifts[staffId][day] = val
    await setDoc(ref, data, { merge: true })
  }

  // イベント保存
  const saveEvent = async () => {
    if (!modalDay) return
    const val = eventInput.trim()
    await setDoc(
      doc(db, 'facilities', FACILITY_ID, 'schedules', ym),
      { events: { [modalDay]: val || null } },
      { merge: true }
    )
    setModalDay(null)
    setEventInput('')
  }

  // ─── Google カレンダー連携（メイン処理） ──────────────────────
  const syncToGoogleCalendar = async () => {
    setSyncState({ status:'loading', message:'Googleカレンダーに連携中…', details:'' })

    try {
      // ① アクセストークンを取得（キャッシュ済みなら再取得しない）
      const accessToken = await getGoogleToken()

      // ② 自分のシフトを取得
      const myUid    = user?.uid
      const myShifts = (schedule.shifts || {})[myUid] || {}

      if (Object.keys(myShifts).length === 0) {
        setSyncState({ status:'error', message:'このシフト表にあなたの勤務が登録されていません', details:'' })
        setTimeout(() => setSyncState({ status:'idle', message:'', details:'' }), 4000)
        return
      }

      // ③ 追加するイベントを作成
      const entries = Object.entries(myShifts).filter(([, t]) => t !== 'off')
      let created = 0, failed = 0

      const staffName = schedule.shifts?.[myUid]
        ? (staffList.find(s => s.id === myUid)?.name || 'スタッフ')
        : 'スタッフ'

      for (const [dayStr, type] of entries) {
        const d        = parseInt(dayStr)
        const dateISO  = toDateStr(year, month, d)
        const label    = type==='in'?'出勤' : type==='ext'?'外勤' : type==='late'?'遅刻' : '勤務'
        const colorId  = GCAL_COLOR[type]

        const event = {
          summary:     `【コペルプラス】${label}`,
          description: `コペルプラス 東久留米教室 ${label}\n担当: ${staffName}`,
          start:       { date: dateISO },
          end:         { date: dateISO },
          ...(colorId ? { colorId } : {}),
        }

        try {
          const res = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
              method:  'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type':  'application/json',
              },
              body: JSON.stringify(event),
            }
          )

          if (res.ok) {
            created++
          } else {
            const errData = await res.json()
            console.warn('[CalendarSync] イベント追加失敗:', dateISO, errData)
            // 401 = トークン期限切れ → 上位で再試行させる
            if (res.status === 401) throw new Error('TOKEN_EXPIRED')
            failed++
          }
        } catch (innerErr) {
          if (innerErr.message === 'TOKEN_EXPIRED') throw innerErr
          failed++
        }
      }

      const msg = failed === 0
        ? `✅ ${created}件をGoogleカレンダーに追加しました！`
        : `⚠️ ${created}件追加，${failed}件失敗しました`

      setSyncState({ status: failed === 0 ? 'success' : 'error', message: msg, details: '' })
    } catch (err) {
      console.error('[CalendarSync] エラー:', err)
      setSyncState({
        status:  'error',
        message: 'Googleカレンダーへの連携に失敗しました',
        details: err.message || '',
      })
    }

    // 5秒後にリセット
    setTimeout(() => setSyncState({ status:'idle', message:'', details:'' }), 5000)
  }

  const events = schedule.events || {}
  const shifts  = schedule.shifts || {}

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* ─── ヘッダー ─── */}
      <div style={{ padding:'12px 12px 8px', background:C.card, borderBottom:`1.5px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:7 }}>
          <button onClick={prevMonth} style={{ border:`1.5px solid ${C.border}`, background:'transparent', borderRadius:8, padding:'5px 10px', fontSize:14, cursor:'pointer', fontFamily:FONT }}>◀</button>
          <div style={{ flex:1, textAlign:'center', fontSize:17, fontWeight:800, color:C.text }}>{year}年{month}月</div>
          <button onClick={nextMonth} style={{ border:`1.5px solid ${C.border}`, background:'transparent', borderRadius:8, padding:'5px 10px', fontSize:14, cursor:'pointer', fontFamily:FONT }}>▶</button>
          <button onClick={goToday}   style={{ border:`1.5px solid ${C.primary}`, background:C.primaryLight, borderRadius:8, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:FONT, color:C.primaryDark, fontWeight:700 }}>今月</button>
          {can.editSchedule() && (
            <button onClick={() => setEditMode(m=>!m)}
              style={{ border:`1.5px solid ${editMode?C.primary:C.border}`, background:editMode?C.primaryLight:'transparent', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:editMode?700:400, color:editMode?C.primaryDark:C.sub, cursor:'pointer', fontFamily:FONT }}>
              {editMode ? '✏️ 編集中' : '編集'}
            </button>
          )}
        </div>
        {/* 凡例 */}
        <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
          {Object.entries(SHIFT).map(([k,v]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:3 }}>
              <div style={{ width:9, height:9, borderRadius:2, background:v.dot }}/>
              <span style={{ fontSize:10, color:C.sub }}>{v.label}</span>
            </div>
          ))}
          <span style={{ fontSize:10 }}>🎂</span>
          <span style={{ fontSize:10, color:C.sub }}>誕生日</span>
        </div>
        <div style={{ display:'flex', gap:5, marginTop:4, flexWrap:'wrap' }}>
          {[['土曜','#E3F2FD','#1565C0'],['日祝','#FFECEA','#CC3333'],['水曜','#FFFDE7','#7B6000']].map(([l,bg,c]) => (
            <span key={l} style={{ background:bg, color:c, borderRadius:4, padding:'1px 6px', fontSize:9, fontWeight:600 }}>{l}</span>
          ))}
        </div>
      </div>

      {/* ─── カレンダー本体 ─── */}
      <div style={{ flex:1, overflowX:'auto', overflowY:'auto', padding:'5px 3px 4px' }}>
        <div style={{ minWidth: 54 + 38*daysInMonth }}>

          {/* イベント行 */}
          <div style={{ display:'flex', marginBottom:2 }}>
            <div style={{ width:52, flexShrink:0, fontSize:9, color:C.muted, display:'flex', alignItems:'center', paddingLeft:3 }}>イベント</div>
            {days.map(d => (
              <div key={d} style={{ width:36, flexShrink:0, marginRight:2, height:14 }}>
                {events[d] && (
                  <div
                    style={{ background:C.amberLight, borderRadius:3, padding:'1px 2px', fontSize:8, color:'#7A5000', overflow:'hidden', whiteSpace:'nowrap', maxWidth:34, cursor:can.editSchedule()?'pointer':'default' }}
                    onClick={() => can.editSchedule() && (setModalDay(d), setEventInput(events[d]||''))}
                    title={events[d]}>
                    {events[d].slice(0,5)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 日付ヘッダー行 */}
          <div style={{ display:'flex', marginBottom:3 }}>
            <div style={{ width:52, flexShrink:0 }}/>
            {days.map(d => {
              const dow   = new Date(year, month-1, d).getDay()
              const isT   = year===today.getFullYear() && month===today.getMonth()+1 && d===today.getDate()
              const isHol = isHoliday(year, month, d)
              const bg    = rowBg(year, month, d)
              const dc    = dow===0||isHol ? C.coral : dow===6 ? C.blue : dow===3 ? '#7B6000' : C.text
              return (
                <button key={d}
                  onClick={() => can.editSchedule() && (setModalDay(d), setEventInput(events[d]||''))}
                  style={{ width:36, flexShrink:0, marginRight:2, display:'flex', flexDirection:'column', alignItems:'center', background:bg||'transparent', border:'none', cursor:can.editSchedule()?'pointer':'default', padding:'1px 0', borderRadius:6 }}>
                  <span style={{ fontSize:9, color:dc, fontWeight:isT?700:400 }}>{DOW_JA[dow]}</span>
                  <span style={{ width:24, height:24, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:isT?800:500, background:isT?C.primary:'transparent', color:isT?'#fff':dc }}>
                    {d}
                  </span>
                  <span style={{ fontSize:10, lineHeight:1 }}>{bdayMap[d] ? '🎂' : ''}</span>
                </button>
              )
            })}
          </div>

          {/* スタッフ行 */}
          {staffList.map(s => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', marginBottom:3 }}>
              <div style={{ width:52, flexShrink:0, display:'flex', alignItems:'center', gap:4, paddingRight:3 }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:(s.color||C.primary)+'33', border:`2px solid ${s.color||C.primary}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:s.color||C.primary, flexShrink:0 }}>
                  {(s.name||'?')[0]}
                </div>
                <span style={{ fontSize:9, fontWeight:500, color:C.text, overflow:'hidden', maxWidth:28, lineHeight:1.2 }}>
                  {(s.hiraganaName||s.name||'').split(' ')[1] || (s.name||'').slice(0,3)}
                </span>
              </div>
              {days.map(d => {
                const type = shifts[s.id]?.[d] || 'off'
                const cfg  = SHIFT[type]
                const bg   = rowBg(year, month, d)
                return (
                  <div key={d} style={{ width:36, flexShrink:0, marginRight:2, background:bg||'transparent' }}>
                    {editMode ? (
                      <select value={type} onChange={e => updateShift(s.id, d, e.target.value)}
                        style={{ width:34, height:26, borderRadius:5, border:`1.5px solid ${cfg.dot}`, background:cfg.bg, color:cfg.color, fontSize:9, fontWeight:600, fontFamily:FONT, cursor:'pointer', textAlign:'center' }}>
                        {SHIFT_OPTS.map(o => <option key={o} value={o}>{SHIFT[o].short}</option>)}
                      </select>
                    ) : (
                      <div style={{ height:26, borderRadius:5, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, color:cfg.color }}>
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

      {/* ─── Google カレンダー連携ボタン ─── */}
      <div style={{ padding:'10px 12px', background:C.card, borderTop:`1px solid ${C.divider}`, flexShrink:0 }}>
        {syncState.status === 'idle' && (
          <button onClick={syncToGoogleCalendar}
            style={{ width:'100%', padding:'12px', borderRadius:13, border:`1.5px solid ${C.border}`, background:C.card, display:'flex', alignItems:'center', justifyContent:'center', gap:9, fontSize:13, fontWeight:700, color:C.text, cursor:'pointer', fontFamily:FONT }}>
            <GoogleIcon size={16}/>
            自分の勤務を Googleカレンダーに連携する
          </button>
        )}

        {syncState.status === 'loading' && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'12px', borderRadius:13, background:C.amberLight }}>
            <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${C.amberLight}`, borderTopColor:C.amber, animation:'spin .7s linear infinite' }}/>
            <span style={{ fontSize:13, fontWeight:600, color:'#7A5000' }}>{syncState.message}</span>
          </div>
        )}

        {syncState.status === 'success' && (
          <div style={{ padding:'12px', borderRadius:13, background:C.primaryLight, textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.primaryDark }}>{syncState.message}</div>
          </div>
        )}

        {syncState.status === 'error' && (
          <div style={{ padding:'12px', borderRadius:13, background:C.coralLight }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.coral }}>{syncState.message}</div>
            {syncState.details && <div style={{ fontSize:11, color:C.coral, marginTop:4, opacity:.8 }}>{syncState.details}</div>}
          </div>
        )}

        <div style={{ fontSize:10, color:C.muted, textAlign:'center', marginTop:5 }}>
          ※ 自分の出勤予定のみが追加されます（他の職員のシフトは追加されません）
        </div>
      </div>

      {/* ─── イベント追加モーダル ─── */}
      {modalDay && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'flex-end', zIndex:200 }} onClick={() => setModalDay(null)}>
          <div style={{ background:C.card, borderRadius:'22px 22px 0 0', padding:'22px 18px 30px', width:'100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:8 }}>
              {month}月{modalDay}日のイベント
              {bdayMap[modalDay] && <span style={{ fontSize:13, color:C.purple, marginLeft:8 }}>🎂 {bdayMap[modalDay].map(b=>b.name).join('・')}</span>}
            </div>
            {bdayMap[modalDay] && (
              <div style={{ background:C.purpleLight, borderRadius:10, padding:'8px 12px', marginBottom:12, fontSize:13, color:C.purple }}>
                🎂 {bdayMap[modalDay].map(b=>`${b.name}${b.type==='child'?'ちゃん':'先生'}`).join('・')} の誕生日です
              </div>
            )}
            <input value={eventInput} onChange={e=>setEventInput(e.target.value)}
              placeholder="イベント名（例：研修・誕生日会・教材整理）"
              onKeyDown={e => e.key==='Enter' && saveEvent()}
              style={{ width:'100%', padding:'13px', borderRadius:11, border:`1.5px solid ${C.border}`, fontSize:15, fontFamily:FONT, outline:'none', marginBottom:12, boxSizing:'border-box', color:C.text }}
            />
            <div style={{ display:'flex', gap:9 }}>
              <button onClick={() => setModalDay(null)} style={{ flex:1, padding:'12px', borderRadius:11, border:`1.5px solid ${C.border}`, background:'transparent', fontSize:14, fontWeight:600, color:C.sub, cursor:'pointer', fontFamily:FONT }}>キャンセル</button>
              <button onClick={saveEvent} style={{ flex:2, padding:'12px', borderRadius:11, border:'none', background:C.primary, fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:FONT }}>保存する</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
