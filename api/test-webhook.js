// 一時的なテスト用エンドポイント（確認後削除予定）
export default async function handler(req, res) {
  const WEBHOOK = process.env.IDEA_WEBHOOK_URL
  
  const results = { webhook_url_set: !!WEBHOOK, webhook_url_prefix: WEBHOOK?.substring(0, 50) }
  
  if (!WEBHOOK) {
    return res.status(200).json({ ...results, error: 'IDEA_WEBHOOK_URL not set' })
  }
  
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '🧪 テスト：Webhook動作確認' })
    })
    const text = await r.text()
    return res.status(200).json({ ...results, slack_status: r.status, slack_ok: r.ok, slack_response: text })
  } catch(e) {
    return res.status(200).json({ ...results, error: e.message })
  }
}
