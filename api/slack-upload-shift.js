// api/slack-upload-shift.js
// シフト表HTMLをVercel KVに保存し、URLをSlackに共有する
// → URLを踏むと画像1の画面が開き、各自がPDFで保存できる

import { put } from '@vercel/blob'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-secret')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (req.headers['x-internal-secret'] !== 'copelplus_internal_2026') return res.status(401).json({ error: 'Unauthorized' })

  const WEBHOOK = process.env.SHIFT_WEBHOOK_URL
  const { html, year, month } = req.body
  if (!html || !WEBHOOK) return res.status(400).json({ error: 'html と SHIFT_WEBHOOK_URL が必要です' })

  try {
    // 1. HTMLをVercel Blobに保存して固定URLを取得
    const filename = `shift-${year}-${String(month).padStart(2,'0')}.html`
    const blob = await put(filename, html, {
      access: 'public',
      contentType: 'text/html; charset=utf-8',
      addRandomSuffix: false,
    })

    // 2. そのURLをSlack Webhookで共有
    const slackRes = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'シフト管理',
        icon_emoji: ':calendar:',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `📅 ${year}年${month}月 シフト表`, emoji: true }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `シフト表が更新されました。\n下のリンクを開いてブラウザの印刷機能でPDFに保存できます。`
            },
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: '📄 シフト表を開く', emoji: true },
              url: blob.url,
              action_id: 'open_shift'
            }
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `コペルプラス 東久留米教室　作成：${new Date().toLocaleString('ja-JP')}` }]
          }
        ]
      })
    })

    if (!slackRes.ok) {
      const t = await slackRes.text()
      return res.status(500).json({ error: `Slack送信失敗: ${t}` })
    }

    console.log('[shift] ✅ シフト表URL共有完了:', blob.url)
    return res.status(200).json({ success: true, url: blob.url })

  } catch (err) {
    console.error('[shift] エラー:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
