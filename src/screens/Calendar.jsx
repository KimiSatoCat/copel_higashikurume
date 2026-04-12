import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc, getDoc, collection, getDocs } from 'firebase/firestore'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { db, FACILITY_ID, auth, googleProvider } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { C, FONT, SHIFT, DOW_JA } from '../theme'
import { cacheGet, cacheSet } from '../utils/cache'

const SHIFT_OPTS = ['in','late','ext','off']

const HOLIDAYS = new Set([
  '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20',
  '2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06',
  '2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23',
  '2026-10-12','2026-11-03','2026-11-23',
  '2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21',
  '2027-04-29','2027-05-03','2027-05-04','2027-05-05',
  '2027-07-19','2027-08-11','2027-09-20','2027-09-23',
  '2027-10-11','2027-11-03','2027-11-23',
  '2028-01-01','2028-01-10','2028-02-11','2028-02-23','2028-03-20',
  '2028-04-29','2028-05-03','2028-05-04','2028-05-05',
  '2028-07-17','2028-08-11','2028-09-18','2028-09-22',
  '2028-10-09','2028-11-03','2028-11-23',
  '2029-01-01','2029-01-08','2029-02-11','2029-02-23','2029-03-20',
  '2029-04-29','2029-05-03','2029-05-04','2029-05-05',
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

const GCAL_COLOR = { in:'2', late:'5', ext:'6' }

export default function Calendar() {
  const { can, getGoogleToken, user } = useAuth()
  const { staffList: cachedStaff } = useData()   // ★ App起動時にキャッシュ済み
  const today = new Date()

  const [year,      setYear]      = useState(today.getFullYear())
  const [month,     setMonth]     = useState(today.getMonth() + 1)
  const [staffList, setStaffList] = useState(() => cachedStaff.length ? cachedStaff : (cacheGet('staffList') || []))
  const [schedule,  setSchedule]  = useState(() => cacheGet(`schedule_${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`) || { shifts:{}, events:{} })
  // キャッシュがあればローディングなしで即表示、なければ取得を待つ
  const [loading,   setLoading]   = useState(() => {
    const initYm = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
    return !cacheGet(`schedule_${initYm}`)
  })
  const [editMode,  setEditMode]  = useState(false)
  const [modalDay,  setModalDay]  = useState(null)
  const [eventInput,setEventInput]= useState('')
  const [bdayMap,   setBdayMap]   = useState({})
  const [syncState, setSyncState] = useState({ status:'idle', message:'' })
  const [gcalConfirm, setGcalConfirm] = useState(false)
  const [gcalTargetId, setGcalTargetId] = useState('')
  const [slackConfirm, setSlackConfirm] = useState(false)
  const [slackState,   setSlackState]   = useState({ status:'idle', message:'' })
  const [slackLastSent, setSlackLastSent] = useState(null)
  const [flashCells,   setFlashCells]   = useState(new Set()) // タップ変更時のフラッシュ対象セル
  const [copyConfirm,  setCopyConfirm]  = useState(false)
  const [copyState,    setCopyState]    = useState({ status:'idle', message:'' })
  const [prevSchedData,setPrevSchedData]= useState(null) // 先月シフトのプレビュー用
  const unsubRef  = useRef(null)
  const pendingRef = useRef({})  // ★ ローカル変更を保護（onSnapshotに上書きさせない）

  const ym          = `${year}-${String(month).padStart(2,'0')}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const days        = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  useEffect(() => {
    if (unsubRef.current) unsubRef.current()
    const cached = cacheGet(`schedule_${ym}`)
    if (!cached) setLoading(true)
    else { setSchedule(cached); setLoading(false) }

    // DataContextにキャッシュがあればFirestoreアクセスしない
    if (cachedStaff.length) {
      setStaffList(cachedStaff)
      const map = {}
      cachedStaff.forEach(s => {
        if (!s.birthday) return
        const parts = s.birthday.split('-')
        if (parseInt(parts[1]) === month) {
          const name = s.hiraganaFirst || s.name?.split(' ')[0] || ''
          ;(map[parseInt(parts[2])] = map[parseInt(parts[2])] || []).push({ name, type:'staff' })
        }
      })
      setBdayMap(map)
    } else {
      getDocs(collection(db,'facilities',FACILITY_ID,'staff')).then(snap => {
        const list = snap.docs.filter(d => d.data().active).map(d => ({ id:d.id, ...d.data() }))
        setStaffList(list); cacheSet('staffList', list)
        const map = {}
        list.forEach(s => {
          if (!s.birthday) return
          const parts = s.birthday.split('-')
          if (parseInt(parts[1]) === month) {
            const name = s.hiraganaFirst || s.name?.split(' ')[0] || ''
            ;(map[parseInt(parts[2])] = map[parseInt(parts[2])] || []).push({ name, type:'staff' })
          }
        })
        setBdayMap(map)
      }).catch(() => {})
    }

    const ref = doc(db,'facilities',FACILITY_ID,'schedules',ym)
    unsubRef.current = onSnapshot(ref,
      snap => {
        const data = snap.exists() ? snap.data() : { shifts:{}, events:{} }
        cacheSet(`schedule_${ym}`, data)  // ★ キャッシュ保存
        setLoading(false)
        // ★ pendingRef の変更を保護してからstateを更新
        setSchedule(prev => {
          const merged = { ...data, shifts: { ...(data.shifts || {}) } }
          Object.entries(pendingRef.current).forEach(([staffId, days]) => {
            merged.shifts[staffId] = { ...(merged.shifts[staffId] || {}), ...days }
          })
          return merged
        })
      },
      err => console.warn('[Calendar] snapshot:', err.code || err.message)
    )
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [ym, month, year, cachedStaff])

  // 月切り替え時に最終Slack送信日時を更新
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`slackLastSent_${ym}`)
      setSlackLastSent(saved || null)
    } catch { setSlackLastSent(null) }
  }, [ym])

  const prevMonth = () => { if(month===1){setYear(y=>y-1);setMonth(12)}else setMonth(m=>m-1) }
  const nextMonth = () => { if(month===12){setYear(y=>y+1);setMonth(1)}else setMonth(m=>m+1) }
  const goToday   = () => { setYear(today.getFullYear()); setMonth(today.getMonth()+1) }

  const updateShift = (staffId, day, val) => {
    // ★ pendingRef に登録（onSnapshotによる上書きを防ぐ）
    if (!pendingRef.current[staffId]) pendingRef.current[staffId] = {}
    pendingRef.current[staffId][day] = val

    // UIを即時更新
    setSchedule(prev => {
      const shifts = { ...(prev.shifts || {}) }
      shifts[staffId] = { ...(shifts[staffId] || {}), [day]: val }
      return { ...prev, shifts }
    })

    // Firestoreにバックグラウンド保存
    setDoc(
      doc(db, 'facilities', FACILITY_ID, 'schedules', ym),
      { shifts: { [staffId]: { [day]: val } } },
      { merge: true }
    ).then(() => {
      // 保存完了後にpendingから削除
      if (pendingRef.current[staffId]) {
        delete pendingRef.current[staffId][day]
        if (Object.keys(pendingRef.current[staffId]).length === 0) {
          delete pendingRef.current[staffId]
        }
      }
    }).catch(err => console.warn('[Calendar] shift save:', err.code))
  }

  // ─── タップでシフトを順番に切り替える ───────────────────
  const cycleShift = (staffId, day) => {
    if (!can.editSchedule()) return
    const current = (schedule.shifts || {})[staffId]?.[day] || 'off'
    const idx  = SHIFT_OPTS.indexOf(current)
    const next = SHIFT_OPTS[(idx + 1) % SHIFT_OPTS.length]
    updateShift(staffId, day, next)

    // 変更セルを一時的にフラッシュ（600ms）
    const key = `${staffId}_${day}`
    setFlashCells(prev => new Set([...prev, key]))
    setTimeout(() => {
      setFlashCells(prev => { const n = new Set(prev); n.delete(key); return n })
    }, 600)
  }

  // ─── 先月シフトをプレビュー取得してモーダルを開く ────────
  const openCopyConfirm = async () => {
    const prevY  = month === 1 ? year - 1 : year
    const prevM  = month === 1 ? 12 : month - 1
    const prevYm = `${prevY}-${String(prevM).padStart(2,'0')}`

    setCopyState({ status:'loading', message:'' })

    // キャッシュ優先、なければFirestoreから1回取得
    let data = cacheGet(`schedule_${prevYm}`)
    if (!data) {
      try {
        const snap = await getDoc(doc(db, 'facilities', FACILITY_ID, 'schedules', prevYm))
        data = snap.exists() ? snap.data() : null
        if (data) cacheSet(`schedule_${prevYm}`, data)
      } catch {
        setCopyState({ status:'error', message:'先月のデータ取得に失敗しました' })
        setTimeout(() => setCopyState({ status:'idle', message:'' }), 4000)
        return
      }
    }

    setPrevSchedData(data)
    setCopyState({ status:'idle', message:'' })
    setCopyConfirm(true)
  }

  // ─── 先月シフトを今月に一括コピー ───────────────────────
  const executeCopy = async () => {
    setCopyConfirm(false)
    setCopyState({ status:'loading', message:'コピー中…' })

    const prevShifts = prevSchedData?.shifts || {}
    // 今月の日数を超える日はスキップ
    const newShifts = {}
    for (const [staffId, dayMap] of Object.entries(prevShifts)) {
      const filtered = {}
      for (const [day, type] of Object.entries(dayMap)) {
        if (parseInt(day) <= daysInMonth) filtered[day] = type
      }
      if (Object.keys(filtered).length > 0) newShifts[staffId] = filtered
    }

    const staffCount = Object.keys(newShifts).length
    const entryCount = Object.values(newShifts).reduce((s, m) => s + Object.keys(m).length, 0)

    try {
      // shifts フィールドのみ完全上書き（events は保持）
      await setDoc(
        doc(db, 'facilities', FACILITY_ID, 'schedules', ym),
        { shifts: newShifts },
        { merge: true }
      )
      setCopyState({ status:'success', message:`✅ ${staffCount}名・${entryCount}件のシフトをコピーしました` })
    } catch (err) {
      setCopyState({ status:'error', message:`❌ コピーに失敗しました: ${err.message}` })
    }
    setTimeout(() => setCopyState({ status:'idle', message:'' }), 5000)
  }

  const saveEvent = async () => {
    if (!modalDay) return
    await setDoc(
      doc(db,'facilities',FACILITY_ID,'schedules',ym),
      { events: { [modalDay]: eventInput.trim() || null } },
      { merge: true }
    )
    setModalDay(null)
    setEventInput('')
  }

  // ─── Google カレンダー保存 ───────────────────────────────
  const syncToGoogleCalendar = async (targetUid) => {
    setGcalConfirm(false)
    setSyncState({ status:'loading', message:'Googleカレンダーに保存中…' })
    try {
      const accessToken = await getGoogleToken()
      const uid         = targetUid || user?.uid
      const myShifts    = (schedule.shifts || {})[uid] || {}
      const entries     = Object.entries(myShifts).filter(([, t]) => t !== 'off')

      if (entries.length === 0) {
        setSyncState({ status:'success', message:'✅ カレンダーに保存しました（勤務登録なし）' })
        setTimeout(() => setSyncState({ status:'idle', message:'' }), 4000)
        return
      }

      let created = 0, failed = 0
      for (const [dayStr, type] of entries) {
        const d        = parseInt(dayStr)
        const label    = type==='in'?'出勤' : type==='ext'?'外勤' : type==='late'?'遅番' : '勤務'
        const event    = {
          summary:  `【コペルプラス】${label}`,
          description: `コペルプラス 東久留米教室 ${label}`,
          start: { date: toDateStr(year, month, d) },
          end:   { date: toDateStr(year, month, d) },
          ...(GCAL_COLOR[type] ? { colorId: GCAL_COLOR[type] } : {}),
        }
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify(event),
          }
        )
        if (res.ok) created++
        else {
          const err = await res.json().catch(() => ({}))
          console.warn('[GCal]', dayStr, err?.error?.message)
          if (res.status === 401) throw new Error('TOKEN_EXPIRED')
          failed++
        }
      }

      const msg = failed === 0
        ? `✅ ${year}年${month}月の勤務 ${created}件をGoogleカレンダーに保存しました`
        : `⚠️ ${created}件保存完了、${failed}件失敗（再度お試しください）`
      setSyncState({ status: failed===0 ? 'success' : 'error', message: msg })
    } catch (err) {
      console.error('[GCal]', err)
      const msg = err.message === 'TOKEN_EXPIRED'
        ? 'ログインの有効期限が切れました。一度ログアウトして再度お試しください'
        : `保存に失敗しました: ${err.message}`
      setSyncState({ status:'error', message: msg })
    }
    setTimeout(() => setSyncState({ status:'idle', message:'' }), 8000)
  }

  // ─── シフトHTML生成（PDF・Slack共通） ────────────────────
  const generateShiftHtml = () => {
    const sh = schedule.shifts || {}
    const ev = schedule.events || {}
    // 横向き: 職員を縦（行）、日付を横（列）
    const staffRows = staffList.map(s => {
      const name = s.hiraganaFirst ? `${s.hiraganaFirst}先生` : (s.name || '').split(' ')[1] || s.name || ''
      const cells = days.map(d => {
        const dow   = new Date(year, month-1, d).getDay()
        const isHol = isHoliday(year, month, d)
        const type  = sh[s.id]?.[d] || 'off'
        const cfg   = SHIFT[type]
        const bg    = rowBg(year, month, d)
        return `<td style="text-align:center;padding:3px 4px;background-color:${bg||cfg.bg};color:${cfg.color};font-weight:600;font-size:10px;">${cfg.short}</td>`
      }).join('')
      return `<tr>
        <td style="padding:4px 8px;font-weight:600;white-space:nowrap;background:#F5F5F0;border-right:2px solid #52BAA8;">${name}</td>
        ${cells}
      </tr>`
    }).join('')

    const headerCells = days.map(d => {
      const dow    = new Date(year, month-1, d).getDay()
      const isHol  = isHoliday(year, month, d)
      const isToday = d===today.getDate()&&month===today.getMonth()+1&&year===today.getFullYear()
      const c = dow===0||isHol ? '#CC5040' : dow===6 ? '#1565C0' : dow===3 ? '#7B6000' : '#fff'
      const bg = isToday ? '#FFA000' : '#52BAA8'
      return `<th style="text-align:center;padding:3px 2px;color:${c};background:${bg};font-size:10px;min-width:22px;">${d}<br/><span style="font-size:8px">${DOW_JA[dow]}</span></th>`
    }).join('')

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8"/>
<title>コペルプラス 東久留米 ${year}年${month}月 シフト表</title>
<style>
  body { font-family: 'M PLUS Rounded 1c', 'Meiryo', sans-serif; font-size: 11px; margin: 8px; }
  h2 { font-size: 14px; margin-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #DDD; }
  .legend { display: flex; gap: 12px; margin-bottom: 8px; font-size: 10px; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 3px; }
  .legend-dot { width: 8px; height: 8px; border-radius: 2px; }
  @media print {
    @page { size: A4 landscape; margin: 8mm; }
    body { margin: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<h2>コペルプラス 東久留米教室　${year}年${month}月　シフト表</h2>
<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#52BAA8"></div><span>出勤（○）</span></div>
  <div class="legend-item"><div class="legend-dot" style="background:#FFB94A"></div><span>遅番（遅）</span></div>
  <div class="legend-item"><div class="legend-dot" style="background:#FF8A75"></div><span>外勤（外）</span></div>
  <div class="legend-item"><div class="legend-dot" style="background:#C8C0B8"></div><span>お休み（休）</span></div>
  <div class="legend-item"><div class="legend-dot" style="background:#FFECEA"></div>日祝</div>
  <div class="legend-item"><div class="legend-dot" style="background:#E3F2FD"></div>土</div>
  <div class="legend-item"><div class="legend-dot" style="background:#FFFDE7"></div>水</div>
</div>
<button class="no-print" onclick="window.print()" style="margin-bottom:10px;padding:6px 16px;background:#52BAA8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;">🖨 印刷する / PDFで保存</button>
<table>
<thead>
<tr>
  <th style="padding:4px 8px;background:#52BAA8;color:#fff;white-space:nowrap;">職員名</th>
  ${headerCells}
</tr>
</thead>
<tbody>
${staffRows}
</tbody>
</table>
<p style="margin-top:10px;font-size:9px;color:#888;">作成日時：${new Date().toLocaleString('ja-JP')}</p>
</body>
</html>`
  }

  // ─── Slack用シフト表生成（週ごとブロック分割） ───────────
  const generateSlackBlocks = () => {
    const sh = schedule.shifts || {}
    const EMOJI = { in:'🟢', late:'🟡', ext:'🟠', off:'　' }
    const SHORT = { in:'出勤', late:'遅番', ext:'外勤', off:'ー' }
    const DOW   = ['日','月','火','水','木','金','土']

    // 週ごとに分割
    const weeks = []
    let week = []
    days.forEach(d => {
      week.push(d)
      const dow = new Date(year, month-1, d).getDay()
      if (dow === 6 || d === days[days.length-1]) {
        weeks.push([...week]); week = []
      }
    })

    const blocks = [
      { type:'header', text:{ type:'plain_text', text:`📅 ${year}年${month}月 シフト表`, emoji:true } },
      { type:'context', elements:[{ type:'mrkdwn', text:`コペルプラス 東久留米教室　作成：${new Date().toLocaleString('ja-JP')}` }] },
      { type:'divider' },
    ]

    weeks.forEach(weekDays => {
      // 日付ヘッダー行
      const headerText = '`職員名`　' + weekDays.map(d => {
        const dow = new Date(year, month-1, d).getDay()
        const isHol = isHoliday(year, month, d)
        const mark = dow===0||isHol ? '🔴' : dow===6 ? '🔵' : dow===3 ? '🟡' : ''
        return `\`${String(d).padStart(2)}/${DOW[dow]}\`${mark}`
      }).join(' ')

      blocks.push({ type:'section', text:{ type:'mrkdwn', text: headerText } })

      // 職員ごとの行
      staffList.forEach(s => {
        const name = s.hiraganaFirst ? `${s.hiraganaFirst}先生` : s.name || ''
        const hasShift = weekDays.some(d => (sh[s.id]?.[d] || 'off') !== 'off')
        if (!hasShift) return  // 全休の週はスキップ

        const cells = weekDays.map(d => {
          const type = sh[s.id]?.[d] || 'off'
          return EMOJI[type]
        }).join('　')

        const legend = weekDays
          .filter(d => (sh[s.id]?.[d] || 'off') !== 'off')
          .map(d => `${d}日:${SHORT[sh[s.id][d]]}`)
          .join(', ')

        blocks.push({
          type: 'section',
          text: { type:'mrkdwn', text:`*${name}*　${cells}\n　_${legend}_` }
        })
      })

      blocks.push({ type:'divider' })
    })

    // 凡例
    blocks.push({
      type: 'context',
      elements: [{ type:'mrkdwn', text:'🟢出勤　🟡遅番　🟠外勤　⚪お休み　🔴日祝　🔵土曜　🟡水曜' }]
    })

    return blocks
  }

  // ─── PDF ダウンロード ───────────────────────────────────
  const downloadPDF = () => {
    const html = generateShiftHtml()
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url, '_blank')
    if (!win) {
      // ポップアップブロックされた場合はダウンロード
      const a = document.createElement('a')
      a.href  = url
      a.download = `copelplus_${year}年${month}月_シフト表.html`
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  // ─── Slackにシフト表を共有 ───────────────────────────────
  const shareToSlack = async () => {
    setSlackConfirm(false)
    setSlackState({ status:'loading', message:'シフト表を生成中…' })
    try {
      const html = generateShiftHtml()
      setSlackState({ status:'loading', message:'Slackにアップロード中…' })
      const res = await fetch('/api/slack-upload-shift', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-internal-secret': 'copelplus_internal_2026',
        },
        body: JSON.stringify({ html, year, month }),
      })
      const result = await res.json()
      if (result.success) {
        // 送信日時をlocalStorageに保存
        const sentAt = new Date().toISOString()
        try { localStorage.setItem(`slackLastSent_${ym}`, sentAt) } catch {}
        setSlackLastSent(sentAt)
        setSlackState({ status:'success', message:`✅ ${year}年${month}月のシフト表をSlackに共有しました` })
      } else {
        const errMsg = result.error || '共有に失敗しました'
        const friendly = errMsg.includes('Webhook') || errMsg.includes('webhook')
          ? 'Slackへの接続に失敗しました。しばらく待ってから再度お試しください。'
          : errMsg.includes('blob') || errMsg.includes('Blob')
          ? 'ファイルのアップロードに失敗しました。ネットワーク接続をご確認ください。'
          : errMsg
        setSlackState({ status:'error', message: `❌ ${friendly}` })
      }
    } catch (err) {
      const friendly = !navigator.onLine
        ? 'オフラインです。ネットワーク接続を確認してから再試行してください。'
        : 'Slackへの共有に失敗しました。時間をおいて再度お試しください。'
      setSlackState({ status:'error', message: `❌ ${friendly}` })
      console.error('[Slack]', err.message)
    }
    setTimeout(() => setSlackState({ status:'idle', message:'' }), 8000)
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
              {editMode ? '✏️ 編集中' : '✏️ 編集'}
            </button>
          )}
        </div>
        {/* 編集中ヒント + 先月コピーボタン */}
        {editMode && can.editSchedule() && (
          <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap', marginBottom:2 }}>
            <div style={{ fontSize:10, color:C.primaryDark, background:C.primaryLight, borderRadius:6, padding:'3px 8px' }}>
              👆 タップで　出勤→遅番→外勤→休み　に切り替え
            </div>
            {copyState.status === 'idle' ? (
              <button onClick={openCopyConfirm}
                style={{ fontSize:10, color:C.sub, background:'transparent', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 8px', cursor:'pointer', fontFamily:FONT, whiteSpace:'nowrap' }}>
                📋 先月をコピー
              </button>
            ) : copyState.status === 'loading' ? (
              <span style={{ fontSize:10, color:C.sub }}>📋 取得中…</span>
            ) : (
              <span style={{ fontSize:10, color: copyState.status==='success' ? C.primaryDark : C.coral }}>
                {copyState.message}
              </span>
            )}
          </div>
        )}
        {/* 凡例 */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
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
      <div style={{ flex:1, overflowX:'auto', overflowY:'auto', padding:'5px 3px 4px', position:'relative' }}>
        {loading && (
          <div style={{ position:'absolute', inset:0, background:'rgba(255,248,242,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10, gap:10 }}>
            <div style={{ width:18, height:18, borderRadius:'50%', border:`3px solid ${C.primaryLight}`, borderTopColor:C.primary, animation:'spin .7s linear infinite' }}/>
            <span style={{ fontSize:13, color:C.sub, fontFamily:FONT }}>読み込み中…</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        <div style={{ minWidth: 54 + 38*daysInMonth }}>

          {/* イベント行 */}
          <div style={{ display:'flex', marginBottom:2 }}>
            <div style={{ width:52, flexShrink:0, fontSize:9, color:C.muted, display:'flex', alignItems:'center', paddingLeft:3 }}>イベント</div>
            {days.map(d => (
              <div key={d} style={{ width:36, flexShrink:0, marginRight:2, height:14 }}>
                {events[d] && (
                  <div style={{ background:C.amberLight, borderRadius:3, padding:'1px 2px', fontSize:8, color:'#7A5000', overflow:'hidden', whiteSpace:'nowrap', maxWidth:34, cursor:can.editSchedule()?'pointer':'default' }}
                    onClick={() => can.editSchedule() && (setModalDay(d), setEventInput(events[d]||''))}
                    title={events[d]}>
                    {events[d].slice(0,5)}
                  </div>
                )}
              </div>
            ))}
            {/* 集計カラムのスペーサー */}
            <div style={{ position:'sticky', right:0, flexShrink:0, width:50, background:C.bg, borderLeft:`1px solid ${C.border}` }}/>
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
            {/* 集計カラムのヘッダー */}
            <div style={{ position:'sticky', right:0, flexShrink:0, width:50, background:C.bg, borderLeft:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontSize:9, color:C.sub, fontWeight:700 }}>合計</span>
            </div>
          </div>

          {/* スタッフ行 */}
          {staffList.map(s => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', marginBottom:3 }}>
              <div style={{ width:52, flexShrink:0, display:'flex', alignItems:'center', gap:4, paddingRight:3 }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:(s.color||C.primary)+'33', border:`2px solid ${s.color||C.primary}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:s.color||C.primary, flexShrink:0 }}>
                  {(s.name||'?')[0]}
                </div>
                <span style={{ fontSize:9, fontWeight:500, color:C.text, overflow:'hidden', maxWidth:28, lineHeight:1.2 }}>
                  {s.hiraganaFirst || (s.name||'').split(' ')[1] || (s.name||'').slice(0,3)}
                </span>
              </div>
              {days.map(d => {
                const type       = shifts[s.id]?.[d] || 'off'
                const cfg        = SHIFT[type]
                const bg         = rowBg(year, month, d)
                const cellKey    = `${s.id}_${d}`
                const isFlashing = editMode && flashCells.has(cellKey)
                const canEdit    = editMode && can.editSchedule()
                return (
                  <div key={d} style={{ width:36, flexShrink:0, marginRight:2, background:bg||'transparent' }}>
                    <div
                      onClick={() => canEdit && cycleShift(s.id, d)}
                      style={{
                        height:26, borderRadius:5,
                        background: isFlashing ? cfg.dot : cfg.bg,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, fontWeight:600,
                        color: isFlashing ? '#fff' : cfg.color,
                        cursor: canEdit ? 'pointer' : 'default',
                        transform: isFlashing ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.12s ease, background 0.15s ease, color 0.15s ease',
                        userSelect: 'none',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {cfg.short}
                    </div>
                  </div>
                )
              })}
              {/* ── 月間集計バッジ（スクロールしても右端に固定） ── */}
              {(() => {
                const inC   = days.filter(d => shifts[s.id]?.[d] === 'in').length
                const lateC = days.filter(d => shifts[s.id]?.[d] === 'late').length
                const extC  = days.filter(d => shifts[s.id]?.[d] === 'ext').length
                const total = inC + lateC + extC
                const parts = [
                  inC   > 0 && `○${inC}`,
                  lateC > 0 && `遅${lateC}`,
                  extC  > 0 && `外${extC}`,
                ].filter(Boolean)
                return (
                  <div style={{
                    position:'sticky', right:0, flexShrink:0, width:50,
                    background:C.bg, borderLeft:`1px solid ${C.border}`,
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                    height:26, gap:0,
                  }}>
                    <span style={{ fontSize:11, fontWeight:800, lineHeight:1.1, color: total > 0 ? C.primaryDark : C.muted }}>
                      計{total}
                    </span>
                    {parts.length > 0 && (
                      <span style={{ fontSize:8, color:C.sub, lineHeight:1.1 }}>
                        {parts.join(' ')}
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      </div>

      {/* ─── 下部ボタン（カレンダー連携 ＋ PDF保存） ─── */}
      <div style={{ padding:'10px 12px', background:C.card, borderTop:`1px solid ${C.divider}`, flexShrink:0, display:'flex', flexDirection:'column', gap:8 }}>

        {/* Google カレンダー保存 */}
        {syncState.status === 'idle' ? (
          <button onClick={() => setGcalConfirm(true)}
            style={{ width:'100%', padding:'12px', borderRadius:13, border:`1.5px solid ${C.border}`, background:C.card, display:'flex', alignItems:'center', justifyContent:'center', gap:9, fontSize:13, fontWeight:700, color:C.text, cursor:'pointer', fontFamily:FONT }}>
            <GoogleIcon size={16}/> 自分の勤務をGoogleカレンダーに保存する
          </button>
        ) : syncState.status === 'loading' ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'12px', borderRadius:13, background:C.amberLight }}>
            <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${C.amberLight}`, borderTopColor:C.amber, animation:'spin .7s linear infinite' }}/>
            <span style={{ fontSize:13, fontWeight:600, color:'#7A5000' }}>{syncState.message}</span>
          </div>
        ) : (
          <div style={{ padding:'12px', borderRadius:13, background:syncState.status==='success'?C.primaryLight:C.coralLight, textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:700, color:syncState.status==='success'?C.primaryDark:C.coral }}>{syncState.message}</div>
          </div>
        )}

        {/* PDF ダウンロード */}
        <button onClick={downloadPDF}
          style={{ width:'100%', padding:'12px', borderRadius:13, border:`1.5px solid ${C.primary}44`, background:C.primaryLight, display:'flex', alignItems:'center', justifyContent:'center', gap:9, fontSize:13, fontWeight:700, color:C.primaryDark, cursor:'pointer', fontFamily:FONT }}>
          📄 PDFとして保存する（A4横・印刷用）
        </button>

        {/* Slack共有 */}
        {slackState.status === 'idle' ? (
          <div>
            <button onClick={() => setSlackConfirm(true)}
              style={{ width:'100%', padding:'12px', borderRadius:13, border:'1.5px solid #4A154B', background:'#F9F0FA', display:'flex', alignItems:'center', justifyContent:'center', gap:9, fontSize:13, fontWeight:700, color:'#4A154B', cursor:'pointer', fontFamily:FONT }}>
              💬 Slackにシフト表を共有する
            </button>
            {slackLastSent && (
              <div style={{ textAlign:'center', fontSize:10, color:C.muted, marginTop:4 }}>
                最終送信：{new Date(slackLastSent).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
              </div>
            )}
          </div>
        ) : slackState.status === 'loading' ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'12px', borderRadius:13, background:'#F9F0FA' }}>
            <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid #E9D0EA', borderTopColor:'#4A154B', animation:'spin .7s linear infinite' }}/>
            <span style={{ fontSize:13, fontWeight:600, color:'#4A154B' }}>{slackState.message}</span>
          </div>
        ) : (
          <div style={{ padding:'12px', borderRadius:13, background:slackState.status==='success'?C.primaryLight:C.coralLight, textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:700, color:slackState.status==='success'?C.primaryDark:C.coral }}>{slackState.message}</div>
          </div>
        )}

        <div style={{ fontSize:10, color:C.muted, textAlign:'center' }}>
          ※ Googleカレンダー：選択した職員の勤務のみ保存されます　　※ PDF：A4横向き　　※ Slack：テキスト形式で共有
        </div>
      </div>

      {/* ─── 先月シフトコピー確認モーダル ─── */}
      {copyConfirm && (() => {
        const prevY  = month === 1 ? year - 1 : year
        const prevM  = month === 1 ? 12 : month - 1
        const prevShifts = prevSchedData?.shifts || {}

        // コピー内容を集計
        let copyStaff = 0, copyEntries = 0, skippedEntries = 0
        const prevDaysInMonth = new Date(prevY, prevM, 0).getDate()
        for (const [, dayMap] of Object.entries(prevShifts)) {
          const valid   = Object.entries(dayMap).filter(([d]) => parseInt(d) <= daysInMonth && dayMap[d] !== 'off')
          const skipped = Object.entries(dayMap).filter(([d]) => parseInt(d) > daysInMonth)
          if (valid.length > 0) { copyStaff++; copyEntries += valid.length }
          skippedEntries += skipped.length
        }

        // 今月に既存シフトがあるか
        const hasExisting = Object.values(schedule.shifts || {}).some(m => Object.keys(m).length > 0)

        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:20 }}>
            <div style={{ background:C.card, borderRadius:20, padding:24, width:'100%', maxWidth:380 }}>
              <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>
                📋 先月のシフトをコピー
              </div>

              {/* コピー内容プレビュー */}
              <div style={{ background:C.primaryLight, borderRadius:14, padding:'14px 16px', marginBottom:12, border:`1.5px solid ${C.primary}44` }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.primaryDark, marginBottom:8 }}>
                  {prevY}年{prevM}月 → {year}年{month}月
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <span style={{ background:'#fff', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700, color:C.primaryDark, border:`1px solid ${C.primary}44` }}>
                    👤 {copyStaff}名のシフト
                  </span>
                  <span style={{ background:'#fff', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700, color:C.primaryDark, border:`1px solid ${C.primary}44` }}>
                    📆 {copyEntries}件をコピー
                  </span>
                  {skippedEntries > 0 && (
                    <span style={{ background:'#FFF8E1', borderRadius:8, padding:'4px 10px', fontSize:11, color:'#7A5000', border:'1px solid #FFD54F' }}>
                      ⚠ {prevDaysInMonth - daysInMonth}日分はスキップ
                    </span>
                  )}
                </div>
                {copyEntries === 0 && (
                  <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>
                    先月に登録されたシフトがありません
                  </div>
                )}
              </div>

              {/* 上書き警告 */}
              {hasExisting && (
                <div style={{ background:'#FFF0EC', borderRadius:10, padding:'10px 12px', marginBottom:12, border:'1.5px solid #FFCCBC', fontSize:12, color:C.coral }}>
                  ⚠️ <strong>今月のシフトはすべて上書きされます。</strong><br/>
                  <span style={{ color:C.sub }}>イベント（行事予定）は変更されません。</span>
                </div>
              )}

              <div style={{ display:'flex', gap:10 }}>
                <button
                  onClick={executeCopy}
                  disabled={copyEntries === 0}
                  style={{ flex:2, padding:'13px', borderRadius:12, border:'none', background: copyEntries===0 ? C.muted : C.primary, color:'#fff', fontSize:14, fontWeight:700, cursor: copyEntries===0 ? 'default' : 'pointer', fontFamily:FONT }}>
                  コピーする
                </button>
                <button onClick={() => setCopyConfirm(false)}
                  style={{ flex:1, padding:'13px', borderRadius:12, border:`1.5px solid ${C.border}`, background:'transparent', color:C.sub, fontSize:14, cursor:'pointer', fontFamily:FONT }}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ─── Slack共有確認モーダル ─── */}
      {slackConfirm && (() => {
        const sh = schedule.shifts || {}
        // シフト内訳を集計
        let countIn = 0, countLate = 0, countExt = 0, activeStaff = new Set()
        staffList.forEach(s => {
          days.forEach(d => {
            const t = sh[s.id]?.[d]
            if (t === 'in')   { countIn++;   activeStaff.add(s.id) }
            if (t === 'late') { countLate++; activeStaff.add(s.id) }
            if (t === 'ext')  { countExt++;  activeStaff.add(s.id) }
          })
        })
        const lastSentLabel = slackLastSent
          ? new Date(slackLastSent).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
          : null

        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:20 }}>
            <div style={{ background:C.card, borderRadius:20, padding:24, width:'100%', maxWidth:380 }}>
              <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>💬 Slackにシフト表を共有</div>

              {/* シフト表プレビューカード */}
              <div style={{ background:'#F3EEF9', borderRadius:14, padding:'14px 16px', marginBottom:14, border:'1.5px solid #D4B8E0' }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#4A154B', marginBottom:10 }}>
                  📅 {year}年{month}月 シフト表
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
                  <span style={{ background:'#fff', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700, color:'#4A154B', border:'1px solid #D4B8E0' }}>
                    👤 稼働 {activeStaff.size}名 / {staffList.length}名
                  </span>
                  <span style={{ background:'#fff', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700, color:'#4A154B', border:'1px solid #D4B8E0' }}>
                    📆 {daysInMonth}日間
                  </span>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {countIn   > 0 && <span style={{ background:'#E8F6F3', borderRadius:6, padding:'3px 8px', fontSize:11, color:'#2D8B75', fontWeight:600 }}>🟢 出勤 {countIn}件</span>}
                  {countLate > 0 && <span style={{ background:'#FFF8E8', borderRadius:6, padding:'3px 8px', fontSize:11, color:'#9A6700', fontWeight:600 }}>🟡 遅番 {countLate}件</span>}
                  {countExt  > 0 && <span style={{ background:'#FFF0EC', borderRadius:6, padding:'3px 8px', fontSize:11, color:'#C45030', fontWeight:600 }}>🟠 外勤 {countExt}件</span>}
                  {countIn + countLate + countExt === 0 && (
                    <span style={{ fontSize:11, color:C.muted }}>シフト未登録です</span>
                  )}
                </div>
              </div>

              {/* 最終送信履歴 */}
              {lastSentLabel ? (
                <div style={{ background:C.amberLight, borderRadius:10, padding:'8px 12px', marginBottom:14, fontSize:12, color:'#7A5000', display:'flex', alignItems:'center', gap:6 }}>
                  <span>⏱</span>
                  <span>前回送信：{lastSentLabel}　<span style={{ fontWeight:700 }}>再送信</span>になります</span>
                </div>
              ) : (
                <div style={{ fontSize:12, color:C.sub, marginBottom:14, paddingLeft:4 }}>
                  ※ シフトチャンネルに送信されます
                </div>
              )}

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={shareToSlack}
                  style={{ flex:2, padding:'13px', borderRadius:12, border:'none', background:'#4A154B', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
                  送信する
                </button>
                <button onClick={() => setSlackConfirm(false)}
                  style={{ flex:1, padding:'13px', borderRadius:12, border:`1.5px solid ${C.border}`, background:'transparent', color:C.sub, fontSize:14, cursor:'pointer', fontFamily:FONT }}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ─── Googleカレンダー保存：本人確認モーダル ─── */}
      {gcalConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:20 }}>
          <div style={{ background:C.card, borderRadius:20, padding:24, width:'100%', maxWidth:380 }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:6 }}>
              📅 どなたのシフトを保存しますか？
            </div>
            <div style={{ fontSize:13, color:C.sub, marginBottom:16, lineHeight:1.6 }}>
              職員を選択すると「○○先生はあなたで間違いないですか？」と確認します。
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:300, overflowY:'auto', marginBottom:16 }}>
              {staffList.map(s => {
                const name = s.hiraganaFirst ? `${s.hiraganaFirst}先生` : s.name
                const isMe = gcalTargetId === s.id
                return (
                  <button key={s.id} onClick={() => setGcalTargetId(s.id)}
                    style={{ padding:'11px 14px', borderRadius:12, border:`2px solid ${isMe ? C.primary : C.border}`, background:isMe ? C.primaryLight : 'transparent', fontSize:14, fontWeight:isMe ? 700 : 400, color:isMe ? C.primaryDark : C.text, cursor:'pointer', fontFamily:FONT, textAlign:'left' }}>
                    {isMe ? '✓ ' : ''}{name}
                  </button>
                )
              })}
            </div>

            {/* 選択後の本人確認 */}
            {gcalTargetId && (() => {
              const s = staffList.find(x => x.id === gcalTargetId)
              const name = s?.hiraganaFirst ? `${s.hiraganaFirst}先生` : s?.name || '職員'
              return (
                <div style={{ background:C.amberLight, borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#7A5000', marginBottom:10 }}>
                    「{name}」はあなたで間違いないですか？
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => syncToGoogleCalendar(gcalTargetId)}
                      style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:C.primary, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
                      はい、保存する
                    </button>
                    <button onClick={() => setGcalTargetId('')}
                      style={{ flex:1, padding:'10px', borderRadius:10, border:`1.5px solid ${C.border}`, background:'transparent', color:C.sub, fontSize:14, cursor:'pointer', fontFamily:FONT }}>
                      いいえ
                    </button>
                  </div>
                </div>
              )
            })()}

            <button onClick={() => { setGcalConfirm(false); setGcalTargetId('') }}
              style={{ width:'100%', padding:'10px', borderRadius:10, border:`1.5px solid ${C.border}`, background:'transparent', fontSize:13, color:C.sub, cursor:'pointer', fontFamily:FONT }}>
              キャンセル
            </button>
          </div>
        </div>
      )}
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
            <input
              autoComplete="off"
              value={eventInput}
              onChange={e => setEventInput(e.target.value)}
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
