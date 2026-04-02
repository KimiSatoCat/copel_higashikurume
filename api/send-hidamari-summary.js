// api/send-hidamari-summary.js
// サーバーサイドで admin メールを Firestore REST API から取得して送信
// クライアントは summary だけを送ればよい

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

  const { summary, date } = req.body
  if (!summary) return res.status(400).json({ error: 'summary は必須です' })

  const RESEND_API_KEY    = process.env.RESEND_API_KEY
  const FIREBASE_API_KEY  = process.env.VITE_FIREBASE_API_KEY
  const PROJECT_ID        = process.env.VITE_FIREBASE_PROJECT_ID || 'copelplus-higashikurume'
  const FACILITY_ID       = 'higashikurume'

  if (!RESEND_API_KEY)   return res.status(500).json({ error: 'RESEND_API_KEY が未設定です' })
  if (!FIREBASE_API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY が未設定です' })

  // ─── ① Firebase に匿名ログインして ID トークンを取得 ───────────
  let idToken
  try {
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ returnSecureToken:true }) }
    )
    const authData = await authRes.json()
    if (!authRes.ok) throw new Error(authData.error?.message || 'anonymous auth failed')
    idToken = authData.idToken
  } catch (err) {
    console.error('[hidamari] Firebase auth error:', err.message)
    return res.status(500).json({ error: `Firebase 認証エラー: ${err.message}` })
  }

  // ─── ② Firestore REST API で施設設定（通知先メール）を取得 ────
  let adminEmails = []
  try {
    // まず施設設定の手動登録メールを確認
    const configRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/facilities/${FACILITY_ID}/config/hidamari`,
      { headers:{ Authorization:`Bearer ${idToken}` } }
    )
    if (configRes.ok) {
      const configData = await configRes.json()
      const arr = configData.fields?.adminEmails?.arrayValue?.values || []
      adminEmails = arr.map(v => v.stringValue).filter(Boolean)
    }
  } catch (err) {
    console.warn('[hidamari] config fetch error:', err.message)
  }

  // ─── ③ 手動登録がなければ staff の role から取得 ──────────────
  if (!adminEmails.length) {
    try {
      const staffRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/facilities/${FACILITY_ID}/staff`,
        { headers:{ Authorization:`Bearer ${idToken}` } }
      )
      if (staffRes.ok) {
        const staffData = await staffRes.json()
        const docs = staffData.documents || []
        const ADMIN_ROLES = ['admin','sub_admin','developer']
        adminEmails = docs
          .filter(d => ADMIN_ROLES.includes(d.fields?.role?.stringValue))
          .map(d => d.fields?.email?.stringValue)
          .filter(Boolean)
      }
    } catch (err) {
      console.warn('[hidamari] staff fetch error:', err.message)
    }
  }

  if (!adminEmails.length) {
    console.warn('[hidamari] 送信先メールアドレスが見つかりません')
    return res.status(200).json({ success:false, reason:'no admin emails found' })
  }

  console.log('[hidamari] 送信先:', adminEmails)

  // ─── ④ メール送信 ─────────────────────────────────────────────
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
        ⚠️ この要約はAIが自動生成したものです。対応は責任者のご判断にお任せします。<br/>
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
      method:'POST',
      headers:{ 'Authorization':`Bearer ${RESEND_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        from:    'onboarding@resend.dev',
        to:      adminEmails,
        subject: `【こころのひだまり】${date} 利用通知（コペルプラス 東久留米）`,
        html,
      }),
    })
    const emailData = await emailRes.json()
    if (!emailRes.ok) {
      console.error('[hidamari] Resend error:', emailData)
      return res.status(500).json({ error:'メール送信失敗', detail:emailData })
    }
    console.log('[hidamari] ✅ メール送信完了:', emailData.id, '→', adminEmails)
    return res.status(200).json({ success:true, id:emailData.id, sentTo:adminEmails })
  } catch (err) {
    console.error('[hidamari] 送信エラー:', err.message)
    return res.status(500).json({ error:err.message })
  }
}
