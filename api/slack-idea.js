export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-secret')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (req.headers['x-internal-secret'] !== 'copelplus_internal_2026') return res.status(401).json({ error: 'Unauthorized' })

  const WEBHOOK = process.env.IDEA_WEBHOOK_URL
  if (!WEBHOOK) return res.status(200).json({ success: false, reason: 'IDEA_WEBHOOK_URL not configured' })

  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'text is required' })

  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'アイデアポスト',
        icon_emoji: ':mailbox:',
        text: `📬 *新しいアイデア・意見が届きました*\n\n${text}\n\n_投稿者は匿名です_`
      })
    })
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }) }
    return res.status(200).json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
