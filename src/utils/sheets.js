// src/utils/sheets.js
// Google Sheets API への日次レポート保存

// スプレッドシートID（env var → フォールバック）
const SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID
  || '15lK-R_v_82lMuwfnYF0PJY4O7w9mU7k0V6k-xFEmqw4'

const SLOT_TIMES = ['10:00〜11:00','11:15〜12:15','14:30〜15:30','15:45〜16:45','17:00〜18:00']
const DOW_JA     = ['日','月','火','水','木','金','土']

// 担当者セット数（スプレッドシートの列構造）
const MAX_STAFF_SETS = 7

/**
 * 今日の支援記録をスプレッドシートに書き込む
 *
 * Firestoreのslotsデータ構造:
 *   slots: [{ slot, time, cards: [{ staffName, type, children:[{childName,status,comment}], groupMemo }] }]
 *
 * スプレッドシートの列構造（1行=1コマ）:
 *   A: 日付 / B: 曜日 / C: コマ / D: 時間帯 / E: タイプ
 *   F-I: 担当①(職員名・子ども名・出欠・コメント)
 *   J-M: 担当② ... × 7セット
 *   AH(34): 集団メモ / AI(35): 備考
 */
export async function writeDailyReport(accessToken, data) {
  if (!SPREADSHEET_ID) {
    console.warn('[Sheets] スプレッドシートIDが未設定です')
    return
  }

  const { year, month, day, slots } = data
  const sheetName = `${year}年${month}月`
  const dow       = new Date(year, month-1, day).getDay()
  // 行番号: タイトル行(1) + ヘッダー行(2) + 前の日分(各5行)
  const startRow  = 3 + (day - 1) * 5

  const rows = slots.map((slot, slotIdx) => {
    // 担当者セット列を展開
    // cards の各カードの children を順番に並べる
    // card1の子①②... → card2の子①②... の順
    const staffCols = []

    if (slot.cards && slot.cards.length > 0) {
      // 新形式（cardsあり）
      for (const card of slot.cards) {
        const children = card.children || [{}]
        for (const ch of children) {
          if (staffCols.length >= MAX_STAFF_SETS) break
          staffCols.push(
            card.staffName || '',
            ch.childName   || '',
            ch.status      || '',
            ch.comment     || '',
          )
        }
        if (staffCols.length >= MAX_STAFF_SETS * 4) break
      }
    } else if (slot.staffName !== undefined) {
      // 旧形式（staffName直接）
      const children = slot.children || [{}]
      for (const ch of children) {
        if (staffCols.length >= MAX_STAFF_SETS * 4) break
        staffCols.push(
          slot.staffName || '',
          ch.childName   || '',
          ch.status      || '',
          ch.comment     || '',
        )
      }
    }

    // 7セット分に満たない場合は空で埋める
    while (staffCols.length < MAX_STAFF_SETS * 4) staffCols.push('')

    // 集団メモ（最初のカードのgroupMemoを使用）
    const groupMemo = slot.cards?.[0]?.groupMemo || slot.groupMemo || ''

    // タイプ（最初のカード）
    const type = slot.cards?.[0]?.type || slot.type || ''

    return [
      slotIdx === 0 ? day         : '',     // A: 日付（最初のコマのみ）
      slotIdx === 0 ? DOW_JA[dow] : '',     // B: 曜日
      slot.slot || slotIdx + 1,             // C: コマ番号
      slot.time || SLOT_TIMES[slotIdx] || '',// D: 時間帯
      type,                                 // E: タイプ
      ...staffCols,                         // F〜AI: 担当×7セット
      groupMemo,                            // AJ: 集団メモ
      '',                                   // AK: 備考
    ]
  })

  // シート名をエンコードしてAPIリクエスト
  const encodedSheet = encodeURIComponent(sheetName)
  const range = `${encodedSheet}!A${startRow}`
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
    const msg = err?.error?.message || '不明なエラー'
    throw new Error(`Sheets API エラー ${res.status}: ${msg}`)
  }

  const result = await res.json()
  console.log(`[Sheets] ✅ ${sheetName} ${day}日 保存完了 (${rows.length}行)`)
  return result
}

/**
 * 毎日17:00に自動保存するスケジューラー
 */
export function scheduleDailyReport(getGoogleToken, getDataFn) {
  const scheduleNext = () => {
    const now    = new Date()
    const target = new Date(now)
    target.setHours(17, 0, 0, 0)
    if (now >= target) target.setDate(target.getDate() + 1)

    const ms = target.getTime() - now.getTime()
    console.log(`[DailyReport] 次の保存まで ${Math.round(ms / 60000)} 分`)

    return setTimeout(async () => {
      console.log('[DailyReport] 17:00 保存開始')
      try {
        const token = await getGoogleToken()
        const data  = await getDataFn()
        await writeDailyReport(token, data)
        console.log('[DailyReport] ✅ 完了:', new Date().toLocaleString('ja-JP'))
      } catch (err) {
        console.error('[DailyReport] ❌ 保存エラー:', err.message)
      }
      scheduleNext()
    }, ms)
  }

  const timer = scheduleNext()
  return () => clearTimeout(timer)
}
