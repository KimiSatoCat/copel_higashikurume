export default async function handler(req, res) {
  // 環境変数のURLをテスト + クエリパラメータで指定されたURLもテスト
  const IDEA = process.env.IDEA_WEBHOOK_URL
  const ALT  = process.env.IDEA_WEBHOOK_URL_ALT  // 追加で設定する

  const test = async (label, url) => {
    if (!url) return { label, error: 'URL not set' }
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🧪 ${label} テスト（サーバー送信）` })
      })
      return { label, status: r.status, ok: r.ok, body: await r.text() }
    } catch(e) {
      return { label, error: e.message }
    }
  }

  const results = await Promise.all([
    test('IDEA_WEBHOOK_URL', IDEA),
    test('IDEA_WEBHOOK_URL_ALT', ALT),
  ])

  return res.status(200).json({ results })
}
