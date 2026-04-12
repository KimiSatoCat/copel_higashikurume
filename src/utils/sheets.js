// src/utils/sheets.js
// スプレッドシート構造: sheets-setup.gs の HEADERS に準拠
// 1日 = 1行 (rowNum = day + 2)
// HEADERS: 日,曜日,出勤者,出勤人数,外勤者,遅刻者,お休み,来所児童数,イベント,
//          コマ1担当,コマ1子ども,コマ1出欠,コマ1メモ, ... コマ5メモ, 備考

const SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID
  || '15lK-R_v_82lMuwfnYF0PJY4O7w9mU7k0V6k-xFEmqw4'
const DOW_JA = ['日','月','火','水','木','金','土']

export async function writeDailyReport(accessToken, data) {
  if (!SPREADSHEET_ID) return
  const { year, month, day, slots = [], schedule = {} } = data
  const sheetName = `${year}年${month}月`
  const dow       = new Date(year, month-1, day).getDay()
  const rowNum    = day + 2   // 1行/日。行1=タイトル、行2=ヘッダー

  // ── シフト集計（schedule.shifts + schedule.staffNames） ────────
  const shifts     = schedule.shifts     || {}
  const staffNames = schedule.staffNames || {}
  const dayStr     = String(day).padStart(2, '0')

  const inNames   = Object.entries(shifts)
    .filter(([, days]) => days[dayStr] === 'in')
    .map(([id]) => staffNames[id] || id).join('、')
  const lateNames = Object.entries(shifts)
    .filter(([, days]) => days[dayStr] === 'late')
    .map(([id]) => staffNames[id] || id).join('、')
  const extNames  = Object.entries(shifts)
    .filter(([, days]) => days[dayStr] === 'ext')
    .map(([id]) => staffNames[id] || id).join('、')
  const inCount   = Object.values(shifts)
    .filter(days => days[dayStr] === 'in' || days[dayStr] === 'late').length

  // 来所済み児童数
  const childCount = slots.filter(s => s.status === '来所済み').length

  // ── コマ列（4列×5コマ） ──────────────────────────────────────
  const slotCols = []
  for (let i = 0; i < 5; i++) {
    const s = slots[i] || {}
    slotCols.push(s.staffName || '', s.childName || '', s.status || '', s.memo || '')
  }

  const row = [
    day, DOW_JA[dow],
    inNames, inCount, extNames, lateNames, '', childCount, '',
    ...slotCols,
    '',
  ]

  const range = `${encodeURIComponent(sheetName)}!A${rowNum}`
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] })
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Sheets API ${res.status}: ${err?.error?.message || '不明'}`)
  }
  console.log(`[Sheets] ✅ ${sheetName} ${day}日 保存完了`)
}

function reschedule(h, m, getGoogleToken, getDataFn) {
  const now  = new Date()
  const next = new Date()
  next.setHours(h, m, 0, 0)
  if (now >= next) next.setDate(next.getDate() + 1)
  const ms    = next - now
  const label = `${h}:${String(m).padStart(2,'0')}`
  console.log(`[DailyReport] ${label} まで ${Math.round(ms/60000)} 分`)
  return setTimeout(async () => {
    try {
      const token = await getGoogleToken()
      const data  = await getDataFn()
      await writeDailyReport(token, data)
      console.log(`[DailyReport] ✅ ${label} 保存完了`)
    } catch (err) {
      console.error(`[DailyReport] ❌ ${label}:`, err.message)
    }
    reschedule(h, m, getGoogleToken, getDataFn)
  }, ms)
}

export function scheduleDailyReport(getGoogleToken, getDataFn) {
  const t1 = reschedule(17,  0, getGoogleToken, getDataFn)
  const t2 = reschedule(19, 10, getGoogleToken, getDataFn)
  return () => { clearTimeout(t1); clearTimeout(t2) }
}
