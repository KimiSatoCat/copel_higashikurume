// api/send-hidamari-summary.js
// Vercel Serverless Function: こころのひだまりの要約を責任者メールに送信

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-secret')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  // 簡易認証（ハードコード — 同一オリジンからのリクエスト前提）
  const secret = req.headers['x-internal-secret']
  if (secret !== 'copelplus_internal_2026') {
    console.error('[hidamari] unauthorized secret:', secret)
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { summary, date, adminEmails } = req.body
  if (!summary || !adminEmails?.length) {
    return res.status(400).json({ error: 'summary と adminEmails は必須です' })
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    // APIキー未設定でも200を返し、ログだけ残す（アプリを止めない）
    console.warn('[hidamari] RESEND_API_KEY が未設定です。メール送信をスキップします。')
    console.log('[hidamari] 送信予定メール:', { date, adminEmails, summaryLength: summary.length })
    return res.status(200).json({ success: false, reason: 'RESEND_API_KEY not configured' })
  }

  // メール本文
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#FFF8F2;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:36px;margin-bottom:8px">☀️</div>
      <div style="font-size:20px;font-weight:700;color:#2C2926">こころのひだまり</div>
      <div style="font-size:13px;color:#7A7068;margin-top:4px">コペルプラス 東久留米教室</div>
    </div>
    <div style="background:#E6F5F3;border-radius:12px;padding:16px;margin-bottom:20px;border-left:4px solid #52BAA8">
      <div style="font-size:13px;color:#3A9A88;font-weight:600;margin-bottom:4px">責任者の方へ</div>
      <div style="font-size:13px;color:#2C2926;line-height:1.7">
        本日（${date}）、職員がこころのひだまりを利用しました。<br/>
        以下はAIが生成した要約です。
      </div>
    </div>
    <div style="background:#FFF8F2;border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:#2C2926;margin-bottom:12px">📋 AIによる要約・対応提案</div>
      <div style="font-size:14px;color:#2C2926;line-height:1.8;white-space:pre-wrap">${summary}</div>
    </div>
    <div style="background:#FFECEA;border-radius:10px;padding:14px;margin-bottom:20px">
      <div style="font-size:12px;color:#CC5040;line-height:1.7">
        ⚠️ この要約はAIが自動生成したものです。対応は責任者のご判断にお任せします。
        職員のプライバシーに十分ご配慮ください。
      </div>
    </div>
    <div style="text-align:center;font-size:12px;color:#B0A89E;border-top:1px solid #EDE4D9;padding-top:16px">
      コペルプラス 東久留米教室 勤務管理アプリ
    </div>
  </div>
</body>
</html>`

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'onboarding@resend.dev',   // テスト用ドメイン（認証不要）
        to:      adminEmails,
        subject: `【こころのひだまり】${date} 利用通知（コペルプラス 東久留米）`,
        html,
      }),
    })

    const emailData = await emailRes.json()

    if (!emailRes.ok) {
      console.error('[hidamari] Resend error:', emailData)
      return res.status(500).json({ error: 'メール送信に失敗しました', detail: emailData })
    }

    console.log('[hidamari] ✅ メール送信成功:', emailData.id)
    return res.status(200).json({ success: true, id: emailData.id })

  } catch (err) {
    console.error('[hidamari] 送信エラー:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
