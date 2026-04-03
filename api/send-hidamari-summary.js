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

  // ★ 変数宣言を先頭に（使用より前に必ず宣言）
  const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL  // こころのひだまり用
  const SHIFT_WEBHOOK_URL = process.env.SHIFT_WEBHOOK_URL  // シフト共有用
  const RESEND_API_KEY    = process.env.RESEND_API_KEY
  const PROJECT_ID        = process.env.VITE_FIREBASE_PROJECT_ID || 'copelplus-higashikurume'
  const FACILITY_ID_ENV   = 'higashikurume'

  const { summary, date, staffName, shiftText, isShift } = req.body
  if (!summary && !shiftText) return res.status(400).json({ error: 'summary または shiftText は必須です' })

  // ─── シフト表共有モード ─────────────────────────────────
  if (isShift && shiftText) {
    if (!SHIFT_WEBHOOK_URL) {
      return res.status(500).json({ error: 'SHIFT_WEBHOOK_URL が未設定です' })
    }
    try {
      const slackRes = await fetch(SHIFT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'シフト管理',
          icon_emoji: ':calendar:',
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `📅 ${date} シフト表`, emoji: true }
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: shiftText }
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: 'コペルプラス 東久留米教室 勤務管理アプリより自動送信' }]
            }
          ]
        }),
      })
      if (!slackRes.ok) {
        const t = await slackRes.text()
        return res.status(500).json({ error: 'Slack送信失敗', detail: t })
      }
      return res.status(200).json({ success: true })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (!summary) return res.status(400).json({ error: 'summary は必須です' })

  if (!SLACK_WEBHOOK_URL) {
    console.warn('[hidamari] SLACK_WEBHOOK_URL が未設定です')
    return res.status(200).json({ success: false, reason: 'SLACK_WEBHOOK_URL not configured' })
  }

  // Slack Block Kit でリッチなメッセージを送信
  const payload = {
    username: 'こころのひだまり',
    icon_emoji: ':sunny:',
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
