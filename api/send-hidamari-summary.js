// api/send-hidamari-summary.js
// Vercel Serverless Function: こころのひだまりの要約を責任者メールに送信

export default async function handler(req, res) {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', 'https://copel-higashikurume.vercel.app')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // 内部リクエストのみ受け付ける（簡易認証）
  const secret = req.headers['x-internal-secret']
  if (secret !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { summary, staffName, date, adminEmails } = req.body

  if (!summary || !adminEmails?.length) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Resend API key not configured' })
  }

  // メール本文
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#FFF8F2;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:36px;margin-bottom:8px">☀️</div>
      <div style="font-size:20px;font-weight:700;color:#2C2926">こころのひだまり</div>
      <div style="font-size:13px;color:#7A7068;margin-top:4px">コペルプラス 東久留米教室</div>
    </div>

    <div style="background:#E6F5F3;border-radius:12px;padding:16px;margin-bottom:20px;border-left:4px solid #52BAA8">
      <div style="font-size:13px;color:#3A9A88;font-weight:600;margin-bottom:4px">責任者の方へ</div>
      <div style="font-size:13px;color:#2C2926;line-height:1.7">
        本日（${date}）、職員がこころのひだまりを利用しました。
        以下はAIが生成した要約です。個人が特定されないよう配慮されています。
      </div>
    </div>

    <div style="background:#FFF8F2;border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:#2C2926;margin-bottom:12px">📋 AIによる要約・対応提案</div>
      <div style="font-size:14px;color:#2C2926;line-height:1.8;white-space:pre-wrap">${summary}</div>
    </div>

    <div style="background:#FFECEA;border-radius:10px;padding:14px;margin-bottom:20px">
      <div style="font-size:12px;color:#CC5040;line-height:1.7">
        ⚠️ この要約はAIが自動生成したものです。必要に応じて本人に声をかけるかどうか、
        責任者の方のご判断にお任せします。職員のプライバシーに十分ご配慮ください。
      </div>
    </div>

    <div style="text-align:center;font-size:12px;color:#B0A89E;border-top:1px solid #EDE4D9;padding-top:16px">
      コペルプラス 東久留米教室 勤務管理アプリ
    </div>
  </div>
</body>
</html>`

  // Resend APIでメール送信
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'こころのひだまり <hidamari@copelplus.resend.dev>',
      to:      adminEmails,
      subject: `【こころのひだまり】${date} 利用通知（コペルプラス 東久留米）`,
      html,
    }),
  })

  const emailData = await emailRes.json()

  if (!emailRes.ok) {
    console.error('[send-hidamari-summary] Resend error:', emailData)
    return res.status(500).json({ error: 'Failed to send email', detail: emailData })
  }

  return res.status(200).json({ success: true, id: emailData.id })
}
