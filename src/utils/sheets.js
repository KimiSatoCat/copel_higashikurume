// src/utils/sheets.js
const SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID
  || '15lK-R_v_82lMuwfnYF0PJY4O7w9mU7k0V6k-xFEmqw4'
const SLOT_TIMES = ['10:00〜11:00','11:15〜12:15','14:30〜15:30','15:45〜16:45','17:00〜18:00']
const DOW_JA     = ['日','月','火','水','木','金','土']
const MAX_STAFF_SETS = 7

export async function writeDailyReport(accessToken, data) {
  if (!SPREADSHEET_ID) return
  const { year, month, day, slots } = data
  const sheetName = `${year}年${month}月`
  const dow       = new Date(year, month-1, day).getDay()
  const startRow  = 3 + (day - 1) * 5

  const rows = slots.map((slot, si) => {
    const staffCols = []
    if (slot.cards?.length) {
      for (const card of slot.cards) {
        for (const ch of (card.children || [{}])) {
          if (staffCols.length >= MAX_STAFF_SETS * 4) break
          staffCols.push(card.staffName||'', ch.childName||'', ch.status||'', ch.comment||'')
        }
      }
    } else {
      for (const ch of (slot.children || [{}])) {
        if (staffCols.length >= MAX_STAFF_SETS * 4) break
        staffCols.push(slot.staffName||'', ch.childName||'', ch.status||'', ch.comment||'')
      }
    }
    while (staffCols.length < MAX_STAFF_SETS * 4) staffCols.push('')
    return [
      si===0?day:'', si===0?DOW_JA[dow]:'',
      slot.slot||si+1, slot.time||SLOT_TIMES[si]||'',
      slot.cards?.[0]?.type||slot.type||'',
      ...staffCols,
      slot.cards?.[0]?.groupMemo||slot.groupMemo||'', '',
    ]
  })

  const range = `${encodeURIComponent(sheetName)}!A${startRow}`
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
    { method:'PUT', headers:{ 'Authorization':`Bearer ${accessToken}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ values: rows }) }
  )
  if (!res.ok) {
    const err = await res.json().catch(()=>({}))
    throw new Error(`Sheets API ${res.status}: ${err?.error?.message||'不明'}`)
  }
  console.log(`[Sheets] ✅ ${sheetName} ${day}日 保存完了`)
}

// ★ シンプルな再スケジュール（重複なし）
function reschedule(h, m, getGoogleToken, getDataFn) {
  const now  = new Date()
  const next = new Date()
  next.setHours(h, m, 0, 0)
  if (now >= next) next.setDate(next.getDate() + 1)
  const ms = next - now
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
