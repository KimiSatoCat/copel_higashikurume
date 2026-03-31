// Google Sheets API ユーティリティ
const SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID
const SLOT_TIMES = ['10:00〜11:00','11:15〜12:15','14:30〜15:30','15:45〜16:45','17:00〜18:00']
const DOW_JA = ['日','月','火','水','木','金','土']

export async function writeDailyReport(accessToken, data) {
  const { year, month, day, slots } = data
  const sheetName = `${year}年${month}月`
  const dow = new Date(year, month-1, day).getDay()
  const startRow = 3 + (day - 1) * 5

  const rows = slots.map((s, si) => {
    const children = (s.children || []).slice(0, 5)
    const childCols = []
    for (let ci = 0; ci < 5; ci++) {
      const ch = children[ci] || {}
      childCols.push(ch.childName || '', ch.status || '', ch.comment || '')
    }
    return [si===0?day:'', si===0?DOW_JA[dow]:'', s.slot||si+1, s.time||SLOT_TIMES[si]||'', s.type||'個別', s.staffName||'', ...childCols, s.groupMemo||'', '']
  })

  const range = `${encodeURIComponent(sheetName)}!A${startRow}`
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  })
  if (!res.ok) { const e = await res.json(); throw new Error(JSON.stringify(e)) }
  return res.json()
}

export function scheduleDailyReport(user, getDataFn) {
  const now = new Date()
  const target = new Date(now)
  target.setHours(17, 0, 0, 0)
  if (now >= target) target.setDate(target.getDate() + 1)
  const ms = target.getTime() - now.getTime()

  const timer = setTimeout(async () => {
    try {
      const token = await user.getIdToken(true)
      const data = await getDataFn()
      await writeDailyReport(token, data)
      console.log('[17:00] スプレッドシート保存完了')
    } catch(e) { console.error('[17:00] 保存エラー:', e) }
    scheduleDailyReport(user, getDataFn)
  }, ms)

  return () => clearTimeout(timer)
}
