const { onSchedule }      = require('firebase-functions/v2/scheduler')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { defineString }    = require('firebase-functions/params')
const admin               = require('firebase-admin')
const { google }          = require('googleapis')
const nodemailer          = require('nodemailer')

admin.initializeApp()
const db = admin.firestore()

const FACILITY_ID     = 'higashikurume'
const SPREADSHEET_ID  = defineString('SPREADSHEET_ID')
const GMAIL_USER      = defineString('GMAIL_USER')
const GMAIL_PASS      = defineString('GMAIL_PASS')

// ─────────────────────────────────────────────────────────
// 毎日17:00 JST（= 08:00 UTC）に日次レポートをスプレッドシートに保存
// ─────────────────────────────────────────────────────────
exports.dailyReport = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Asia/Tokyo', region: 'asia-northeast1' },
  async () => {
    const today   = new Date()
    const year    = today.getFullYear()
    const month   = today.getMonth() + 1
    const day     = today.getDate()
    const ym      = `${year}-${String(month).padStart(2,'0')}`
    const dateKey = `${ym}-${String(day).padStart(2,'0')}`
    const DOW_JA  = ['日','月','火','水','木','金','土']

    try {
      // Firestoreからデータ取得
      const [staffSnap, scheduleSnap, sessionSnap] = await Promise.all([
        db.collection('facilities').doc(FACILITY_ID).collection('staff').get(),
        db.collection('facilities').doc(FACILITY_ID).collection('schedules').doc(ym).get(),
        db.collection('facilities').doc(FACILITY_ID).collection('sessions').doc(dateKey).get(),
      ])

      const staff    = staffSnap.docs.map(d => ({ id:d.id, ...d.data() }))
      const schedule = scheduleSnap.exists ? scheduleSnap.data() : { shifts:{}, events:{} }
      const sessions = sessionSnap.exists ? (sessionSnap.data().slots || []) : []

      const shifts   = schedule.shifts || {}
      const events   = schedule.events || {}

      // 出勤者リスト
      const inStaff  = staff.filter(s => ['in','late'].includes(shifts[s.id]?.[day])).map(s => s.name).join('、')
      const extStaff = staff.filter(s => shifts[s.id]?.[day] === 'ext').map(s => s.name).join('、')
      const offStaff = staff.filter(s => shifts[s.id]?.[day] === 'off').map(s => s.name).join('、')
      const lateStaff = staff.filter(s => shifts[s.id]?.[day] === 'late').map(s => s.name).join('、')

      // コマ情報
      const slotData = sessions.map((s, i) => [
        `コマ${i+1}`,
        s.time || '',
        s.staffName || '',
        s.childName || '',
        s.status || '予定',
        (s.memos||[]).map(m => m.text).join(' / '),
      ])

      // スプレッドシートに書き込み
      const auth   = new google.auth.GoogleAuth({ scopes:['https://www.googleapis.com/auth/spreadsheets'] })
      const sheets = google.sheets({ version:'v4', auth })
      const sheetName = `${year}年${month}月`

      // 書き込む行番号（日付に対応する行）
      const rowNum = day + 3  // ヘッダー3行分

      const values = [
        [
          day,
          DOW_JA[today.getDay()],
          inStaff,
          staff.filter(s => ['in','late'].includes(shifts[s.id]?.[day])).length,
          extStaff,
          lateStaff,
          offStaff,
          sessions.filter(s => s.status==='来所済み').length,
          events[day] || '',
          ...slotData.flatMap(s => s),
        ]
      ]

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID.value(),
        range: `${sheetName}!A${rowNum}`,
        valueInputOption: 'RAW',
        requestBody: { values },
      })

      console.log(`[dailyReport] ${dateKey} の記録をスプレッドシートに保存しました`)
    } catch(err) {
      console.error('[dailyReport] エラー:', err)
    }
  }
)

// ─────────────────────────────────────────────────────────
// こころのひだまりの要約が作成されたとき→管理者にメール送信
// ─────────────────────────────────────────────────────────
exports.sendHidamariEmail = onDocumentCreated(
  {
    document: `facilities/${FACILITY_ID}/hidamari_summaries/{summaryId}`,
    region: 'asia-northeast1',
  },
  async (event) => {
    const data = event.data.data()
    if (!data?.summary) return

    try {
      // 責任者・副責任者のメールアドレスを取得
      const staffSnap = await db.collection('facilities').doc(FACILITY_ID).collection('staff').get()
      const admins    = staffSnap.docs
        .filter(d => ['admin','sub_admin','developer'].includes(d.data().role))
        .map(d => d.data().email)
        .filter(Boolean)

      if (admins.length === 0) {
        console.log('[sendHidamariEmail] 管理者のメールアドレスが見つかりません')
        return
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER.value(), pass: GMAIL_PASS.value() },
      })

      const mailBody = `
コペルプラス 東久留米教室 勤務管理アプリより

────────────────────────────────
「こころのひだまり」のご利用がありました
────────────────────────────────

日付：${data.date}

【AI からの要約（優しい言葉に変換済み）】
${data.summary}

────────────────────────────────
このメールは自動送信です。
ご本人の個人情報保護のため、原文は記録されておりません。
      `.trim()

      await transporter.sendMail({
        from:    `コペルプラス勤務管理 <${GMAIL_USER.value()}>`,
        to:      admins.join(', '),
        subject: `【こころのひだまり】${data.date} のご利用について`,
        text:    mailBody,
      })

      console.log(`[sendHidamariEmail] ${data.date} の要約を ${admins.join(', ')} に送信しました`)
    } catch(err) {
      console.error('[sendHidamariEmail] エラー:', err)
    }
  }
)

// ─────────────────────────────────────────────────────────
// 毎月1日 0:00 JST：翌月のシートが存在しなければ追加（スプレッドシート）
// ─────────────────────────────────────────────────────────
exports.createMonthlySheet = onSchedule(
  { schedule: '0 15 1 * *', timeZone: 'Asia/Tokyo', region: 'asia-northeast1' },
  async () => {
    const now   = new Date()
    const nextM = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const year  = nextM.getFullYear()
    const month = nextM.getMonth() + 1
    const title = `${year}年${month}月`
    const daysInMonth = new Date(year, month, 0).getDate()
    const DOW_JA = ['日','月','火','水','木','金','土']

    try {
      const auth   = new google.auth.GoogleAuth({ scopes:['https://www.googleapis.com/auth/spreadsheets'] })
      const sheets = google.sheets({ version:'v4', auth })
      const ssid   = SPREADSHEET_ID.value()

      // 既存シートの確認
      const meta = await sheets.spreadsheets.get({ spreadsheetId: ssid })
      const exists = meta.data.sheets.some(s => s.properties.title === title)
      if (exists) { console.log(`[createMonthlySheet] ${title} は既に存在します`); return }

      // シートを追加
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: ssid,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] },
      })

      // ヘッダー行を書き込む
      const headers = [
        ['日','曜日','出勤者','出勤人数','外勤者','遅刻者','お休み','来所児童数','イベント',
         'コマ1-担当','コマ1-子ども','コマ1-出欠',
         'コマ2-担当','コマ2-子ども','コマ2-出欠',
         'コマ3-担当','コマ3-子ども','コマ3-出欠',
         'コマ4-担当','コマ4-子ども','コマ4-出欠',
         'コマ5-担当','コマ5-子ども','コマ5-出欠',
        ],
      ]

      // 日付行を初期化
      const rows = Array.from({ length: daysInMonth }, (_, i) => {
        const d   = i + 1
        const dow = new Date(year, month-1, d).getDay()
        return [d, DOW_JA[dow], ...Array(22).fill('')]
      })

      await sheets.spreadsheets.values.update({
        spreadsheetId: ssid,
        range: `${title}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [...headers, ...rows] },
      })

      console.log(`[createMonthlySheet] ${title} を作成しました`)
    } catch(err) {
      console.error('[createMonthlySheet] エラー:', err)
    }
  }
)
