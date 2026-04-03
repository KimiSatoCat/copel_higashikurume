export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-secret')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (req.headers['x-internal-secret'] !== 'copelplus_internal_2026') return res.status(401).json({ error: 'Unauthorized' })

  const BOT_TOKEN  = process.env.SLACK_BOT_TOKEN
  const CHANNEL_ID = process.env.SHIFT_CHANNEL_ID
  const WEBHOOK    = process.env.SHIFT_WEBHOOK_URL  // フォールバック

  const { html, year, month } = req.body
  if (!html) return res.status(400).json({ error: 'html is required' })

  // Bot Tokenがある場合はファイルアップロード
  if (BOT_TOKEN && CHANNEL_ID) {
    try {
      const content = html
      const bytes   = Buffer.byteLength(content, 'utf8')
      const filename = `シフト表_${year}年${month}月.html`

      const urlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${BOT_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ filename, length: String(bytes) })
      })
      const urlData = await urlRes.json()

      if (!urlData.ok) {
        console.error('[shift] getUploadURL error:', urlData.error)
        // Bot Tokenが使えない場合はWebhookにフォールバック
        if (WEBHOOK) { return await sendViaWebhook(WEBHOOK, year, month, res) }
        return res.status(500).json({ error: urlData.error })
      }

      await fetch(urlData.upload_url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: Buffer.from(content, 'utf8')
      })

      const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ id: urlData.file_id, title: `${year}年${month}月 シフト表（コペルプラス 東久留米教室）` }],
          channel_id: CHANNEL_ID,
          initial_comment: `📅 *${year}年${month}月 シフト表* を共有しました。ブラウザで開いて印刷するとA4横向きPDFに保存できます。`
        })
      })
      const completeData = await completeRes.json()
      if (!completeData.ok) {
        if (WEBHOOK) { return await sendViaWebhook(WEBHOOK, year, month, res) }
        return res.status(500).json({ error: completeData.error })
      }

      console.log('[shift] ✅ ファイルアップロード完了')
      return res.status(200).json({ success: true })

    } catch (e) {
      if (WEBHOOK) { return await sendViaWebhook(WEBHOOK, year, month, res) }
      return res.status(500).json({ error: e.message })
    }
  }

  // Bot Tokenなし → Webhookのみ
  if (WEBHOOK) { return await sendViaWebhook(WEBHOOK, year, month, res) }
  return res.status(500).json({ error: 'SLACK_BOT_TOKEN または SHIFT_WEBHOOK_URL が必要です' })
}

async function sendViaWebhook(webhook, year, month, res) {
  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'シフト管理',
        icon_emoji: ':calendar:',
        text: `📅 *${year}年${month}月 シフト表* をアプリから確認・PDFで保存してください。\n📎 シフト表のPDF保存：アプリ「みんなのスケジュール」→「PDFとして保存する」`
      })
    })
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }) }
    return res.status(200).json({ success: true, method: 'webhook' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
