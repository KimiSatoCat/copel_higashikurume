// api/slack-idea.js
// アイデアポストの投稿をSlackに匿名で共有

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-secret')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const secret = req.headers['x-internal-secret']
  if (secret !== 'copelplus_internal_2026') return res.status(401).json({ error: 'Unauthorized' })

  const WEBHOOK_URL = process.env.IDEA_WEBHOOK_URL
  if (!WEBHOOK_URL) {
    console.warn('[slack-idea] IDEA_WEBHOOK_URL が未設定です')
    return res.status(200).json({ success: false, reason: 'IDEA_WEBHOOK_URL not configured' })
  }

  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'text は必須です' })

  try {
    const slackRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'アイデアポスト',
        icon_emoji: ':mailbox:',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📬 *新しいアイデア・意見が届きました*\n\n${text}`
            }
          },
          {
            type: 'context',
            elements: [{
              type: 'mrkdwn',
              text: '投稿者は匿名です。コペルプラス 東久留米教室 アイデアポストより'
            }]
          }
        ]
      }),
    })

    if (!slackRes.ok) {
      const t = await slackRes.text()
      return res.status(500).json({ error: 'Slack送信失敗', detail: t })
    }

    console.log('[slack-idea] ✅ アイデア投稿をSlackに共有しました')
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[slack-idea] エラー:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
