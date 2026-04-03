// api/send-hidamari-summary.js
// Slack Incoming Webhook でこころのひだまりの要約を通知

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-secret')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const secret = req.headers['x-internal-secret']
  if (secret !== 'copelplus_internal_2026') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { summary, date, staffName } = req.body
  if (!summary) return res.status(400).json({ error: 'summary は必須です' })

  const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
  if (!SLACK_WEBHOOK_URL) {
    console.warn('[hidamari] SLACK_WEBHOOK_URL が未設定です')
    return res.status(200).json({ success: false, reason: 'SLACK_WEBHOOK_URL not configured' })
  }

  // Slack Block Kit でリッチなメッセージを送信
  const payload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '☀️ こころのひだまり — 利用通知', emoji: true }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*日付*\n${date}` },
          { type: 'mrkdwn', text: `*職員*\n${staffName || '（名前未入力）'}` }
        ]
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*📋 AIによる要約・対応提案*\n${summary}` }
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: '⚠️ この要約はAIが自動生成したものです。対応は責任者のご判断にお任せします。' }
        ]
      }
    ]
  }

  try {
    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!slackRes.ok) {
      const text = await slackRes.text()
      console.error('[hidamari] Slack error:', text)
      return res.status(500).json({ error: 'Slack送信失敗', detail: text })
    }

    console.log('[hidamari] ✅ Slack通知送信完了 →', date, staffName)
    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('[hidamari] 送信エラー:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
