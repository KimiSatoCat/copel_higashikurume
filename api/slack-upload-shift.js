// api/slack-upload-shift.js
// PDFとして保存するのと同じHTMLをSlack Files APIでアップロード

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-secret')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const secret = req.headers['x-internal-secret']
  if (secret !== 'copelplus_internal_2026') return res.status(401).json({ error: 'Unauthorized' })

  const BOT_TOKEN  = process.env.SLACK_BOT_TOKEN
  const CHANNEL_ID = process.env.SHIFT_CHANNEL_ID

  if (!BOT_TOKEN)  return res.status(500).json({ error: 'SLACK_BOT_TOKEN が未設定です。Vercelの環境変数に追加してください。' })
  if (!CHANNEL_ID) return res.status(500).json({ error: 'SHIFT_CHANNEL_ID が未設定です。Vercelの環境変数に追加してください。' })

  const { html, year, month } = req.body
  if (!html) return res.status(400).json({ error: 'html は必須です' })

  const filename = `シフト表_${year}年${month}月.html`
  const content  = html
  const bytes    = Buffer.byteLength(content, 'utf8')

  try {
    // ① アップロードURLを取得
    const urlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BOT_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ filename, length: String(bytes) }),
    })
    const urlData = await urlRes.json()
    if (!urlData.ok) {
      console.error('[slack-upload] getUploadURL error:', urlData.error)
      return res.status(500).json({ error: `Slack API エラー: ${urlData.error}` })
    }

    const { upload_url, file_id } = urlData

    // ② ファイルをアップロード
    const uploadRes = await fetch(upload_url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: Buffer.from(content, 'utf8'),
    })
    if (!uploadRes.ok) {
      return res.status(500).json({ error: `ファイルアップロード失敗: ${uploadRes.status}` })
    }

    // ③ アップロード完了・チャンネルに投稿
    const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files:          [{ id: file_id, title: `${year}年${month}月 シフト表（コペルプラス 東久留米教室）` }],
        channel_id:     CHANNEL_ID,
        initial_comment: `📅 *${year}年${month}月 シフト表* を共有しました。\nファイルを開いてブラウザの印刷機能でA4横向きPDFに保存できます。`,
      }),
    })
    const completeData = await completeRes.json()
    if (!completeData.ok) {
      console.error('[slack-upload] complete error:', completeData.error)
      return res.status(500).json({ error: `チャンネル投稿失敗: ${completeData.error}` })
    }

    console.log('[slack-upload] ✅ シフト表共有完了:', filename, '→ channel:', CHANNEL_ID)
    return res.status(200).json({ success: true, fileId: file_id })

  } catch (err) {
    console.error('[slack-upload] エラー:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
