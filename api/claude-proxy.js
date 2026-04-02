// api/claude-proxy.js
// Vercel Serverless Function: Claude API のプロキシ
// APIキーをサーバーサイドに保持し、ブラウザからの直接呼び出しを防ぐ

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Anthropic API key not configured on server' })
  }

  try {
    const { model, max_tokens, system, messages } = req.body

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[claude-proxy] API error:', data)
      return res.status(response.status).json(data)
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('[claude-proxy] Server error:', err)
    return res.status(500).json({ error: err.message })
  }
}
