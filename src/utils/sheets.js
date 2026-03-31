// src/utils/sheets.js
// Google Sheets API への日次レポート保存
// getGoogleToken() を AuthContext から受け取って使う

const SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID
const SLOT_TIMES = ['10:00〜11:00','11:15〜12:15','14:30〜15:30','15:45〜16:45','17:00〜18:00']
const DOW_JA = ['日','月','火','水','木','金','土']

/**
 * 今日の支援記録をスプレッドシートに書き込む
 * @param {string} accessToken  Google OAuth2 access token
 * @param {Object} data  { year, month, day, slots }
 */
export async function writeDailyReport(accessToken, data) {
  if (!SPREADSHEET_ID) {
    console.warn('[Sheets] VITE_SPREADSHEET_ID が未設定です')
    return
  }

  const { year, month, day, slots } = data
  const sheetName = `${year}年${month}月`
  const dow       = new Date(year, month-1, day).getDay()
  // ヘッダー2行 + 各日5コマ行
  const startRow  = 3 + (day - 1) * 5

  // 1行 = 1コマ
  // 列構成: 日付,曜日,コマ,時間帯,タイプ, [職員①,子①名前,子①出欠,子①コメント] ×5, 集団メモ, 備考
  const rows = slots.map((s, si) => {
    const childCols = []
    for (let ci = 0; ci < 5; ci++) {
      const ch = (s.children || [])[ci] || {}
      childCols.push(
        s.staffName || '',          // 担当職員
        ch.childName || '',         // 子ども名前
        ch.status    || '',         // 出欠
        ch.comment   || '',         // コメント
      )
    }
    return [
      si === 0 ? day    : '',
      si === 0 ? DOW_JA[dow] : '',
      s.slot || si + 1,
      s.time  || SLOT_TIMES[si] || '',
      s.type  || '個別',
      ...childCols,
      s.groupMemo || '',
      '',
    ]
  })

  const range = `${encodeURIComponent(sheetName)}!A${startRow}`
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`

  const res = await fetch(url, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ values: rows }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Sheets API エラー ${res.status}: ${err?.error?.message || '不明'}`)
  }

  return res.json()
}

/**
 * 毎日17:00に自動保存するスケジューラー
 * App.jsx の useEffect から呼び出す
 * @param {Function} getGoogleToken  AuthContext の getGoogleToken
 * @param {Function} getDataFn       今日のセッションデータを返す非同期関数
 * @returns {Function} クリーンアップ関数
 */
export function scheduleDailyReport(getGoogleToken, getDataFn) {
  const scheduleNext = () => {
    const now    = new Date()
    const target = new Date(now)
    target.setHours(17, 0, 0, 0)

    // すでに17:00を過ぎていたら翌日
    if (now >= target) target.setDate(target.getDate() + 1)

    const ms = target.getTime() - now.getTime()
    console.log(`[DailyReport] 次の保存まで ${Math.round(ms / 60000)} 分`)

    return setTimeout(async () => {
      console.log('[DailyReport] 17:00 保存開始')
      try {
        const token = await getGoogleToken()
        const data  = await getDataFn()
        await writeDailyReport(token, data)
        console.log('[DailyReport] ✅ スプレッドシートに保存完了:', new Date().toLocaleString('ja-JP'))
      } catch (err) {
        console.error('[DailyReport] ❌ 保存エラー:', err.message)
      }
      // 翌日も再スケジュール
      scheduleNext()
    }, ms)
  }

  const timer = scheduleNext()
  return () => clearTimeout(timer)
}
