import { useState, useEffect, useRef } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT } from '../theme'

// ─── ひだまり利用制限（localStorage + 0:00自動リセット） ──────────
const LS_KEY = 'hidamari_used_date'

function getTodayStr() {
  return new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
    .replace(/\//g, '-')
}

function checkUsedToday() {
  try { return localStorage.getItem(LS_KEY) === getTodayStr() } catch { return false }
}

function markUsedToday() {
  try { localStorage.setItem(LS_KEY, getTodayStr()) } catch {}
}

// 開発者用リセット（外部から呼べるように export）
export function resetHidamariLimit() {
  try { localStorage.removeItem(LS_KEY) } catch {}
}

async function callClaude({ system, messages, max_tokens = 1000 }) {
  const res = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens, system, messages }),
  })
  if (!res.ok) throw new Error(`Claude API error ${res.status}`)
  const data = await res.json()
  return data.content?.find(b => b.type === 'text')?.text || ''
}

const SYSTEM_PROMPT = `あなたは「こころのひだまり」というAIカウンセラーです。コペルプラス 東久留米教室で働く職員をやさしく温かく支える存在です。

以下の順番で、500〜600字を目安に返答してください：
①受容：相手の気持ちをそのまま受け止める
②共感：感情に名前をつける
③正常化：そう感じることはあたり前だと伝える
④小さな力を認める：ここに来て話してくれたこと自体をほめる

守ること：批判・評価・アドバイスをしない。解決策を押しつけない。ひらがな多め、やわらかい文体。`

const SUMMARY_PROMPT = `以下は職員とAIカウンセラーの会話です。責任者向けに要約してください。
・職員の名前を明記（「〇〇先生は〜」）
・具体的なエピソードを含める
・やさしい言葉のみ使用（批判・否定禁止）
・「どのような関わりが考えられるか」を3点提案
・400字以内
会話内容：`

export default function Hidamari() {
  const { user, profile } = useAuth()
  const today = new Date().toISOString().slice(0, 10)

  const [msgs,    setMsgs]    = useState([
    { role:'ai', text:'こんにちは 🌤️\n\nここは、あなただけの安心できる場所です。\n今日、こころにたまっていることを、なんでも話してくださいね。\n\nどんな気持ちも、ちゃんと受け止めます。' }
  ])
  const [input,    setInput]    = useState('')
  const [nameInput,setNameInput]= useState('')
  const [loading,  setLoading]  = useState(false)
  const [used,     setUsed]     = useState(() => checkUsedToday())
  const bottomRef = useRef()
  const midnightRef = useRef()

  // プロフィール名を初期値に
  useEffect(() => {
    if (profile?.hiraganaFirst) setNameInput(`${profile.hiraganaFirst}先生`)
  }, [profile])

  // 0:00自動リセット + 開発者タブからの即座リセット
  useEffect(() => {
    // ★ 開発者タブのリセットボタンで即座反映
    const onReset = () => setUsed(false)
    window.addEventListener('hidamari-reset', onReset)

    const scheduleReset = () => {
      const now  = new Date()
      const next = new Date()
      next.setHours(24, 0, 0, 0)  // 翌0:00
      const ms = next - now
      midnightRef.current = setTimeout(() => {
        setUsed(false)
        scheduleReset()
      }, ms)
    }
    scheduleReset()
    return () => {
      clearTimeout(midnightRef.current)
      window.removeEventListener('hidamari-reset', onReset)
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading || used) return
    setInput('')
    const newMsgs = [...msgs, { role:'user', text }]
    setMsgs(newMsgs)
    setLoading(true)

    try {
      const history = newMsgs.slice(1).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant', content: m.text,
      }))
      const reply = await callClaude({ system: SYSTEM_PROMPT, messages: history })
      const finalMsgs = [...newMsgs, { role:'ai', text: reply }]
      setMsgs(finalMsgs)

      // ★ localStorageで使用済みをマーク（Firestoreに依存しない）
      markUsedToday()
      setUsed(true)

      // Firestore保存（失敗しても止まらない）
      setDoc(
        doc(db, 'facilities', FACILITY_ID, 'hidamari', user.uid, 'logs', today),
        { used: true, date: today, uid: user.uid, createdAt: new Date().toISOString() }
      ).catch(() => {})

      // Slack通知（バックグラウンド）
      sendToSlack(finalMsgs, nameInput.trim() || '（名前未入力）').catch(() => {})

    } catch (err) {
      console.error('[Hidamari]', err)
      setMsgs(prev => [...prev, { role:'ai', text:'少し時間をおいて、またお話しください 🙏' }])
    }
    setLoading(false)
  }

  const sendToSlack = async (conversation, displayName) => {
    const convText = conversation.slice(1)
      .map(m => `${m.role === 'user' ? displayName : 'AI'}：${m.text}`)
      .join('\n\n')

    const summary = await callClaude({
      system: '',
      messages: [{ role:'user', content: `${SUMMARY_PROMPT}\n\n${convText}` }],
      max_tokens: 600,
    })

    setDoc(
      doc(db, 'facilities', FACILITY_ID, 'hidamari_summaries', `${user.uid}_${today}`),
      { summary, date: today, uid: user.uid, staffName: displayName, createdAt: new Date().toISOString() }
    ).catch(() => {})

    const { getAuth } = await import('firebase/auth')
    let firebaseToken = ''
    try { firebaseToken = await getAuth().currentUser?.getIdToken() || '' } catch (_) {}

    await fetch('/api/send-hidamari-summary', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': 'copelplus_internal_2026',
        'x-firebase-token':  firebaseToken,
      },
      body: JSON.stringify({ summary, date: today, staffName: displayName }),
    })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      <div style={{ padding:'14px', background:`linear-gradient(135deg,${C.amberLight},#FFF0D0)`, borderBottom:`1.5px solid ${C.amber}33`, flexShrink:0 }}>
        <div style={{ fontSize:18, fontWeight:800, color:C.text }}>☀️ こころのひだまり</div>
        <div style={{ fontSize:13, color:C.sub, marginTop:3 }}>ここだけの、あなたの安心できる場所</div>

        {/* ★ 名前入力欄（任意） */}
        {!used && (
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:12, color:'#B07800', marginBottom:5, display:'flex', alignItems:'center', gap:6 }}>
              お名前
              <span style={{ background:'#FFF3CD', color:'#B07800', borderRadius:99, padding:'1px 8px', fontSize:11, fontWeight:500 }}>任意</span>
            </div>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="例：たろう先生（責任者への通知に使われます）"
              autoComplete="off"
              style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:`1.5px solid ${C.amber}66`, background:'rgba(255,255,255,0.8)', fontSize:13, fontFamily:FONT, outline:'none', color:C.text, boxSizing:'border-box' }}
            />
          </div>
        )}

        {used && (
          <div style={{ marginTop:8, background:C.coralLight, borderRadius:10, padding:'6px 12px', fontSize:13, color:C.coral }}>
            今日はもう使いました。また明日どうぞ 🌙
          </div>
        )}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:m.role==='user'?'flex-end':'flex-start' }}>
            {m.role==='ai' && (
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:C.amber, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>☀️</div>
                <span style={{ fontSize:11, color:C.sub }}>ひだまり</span>
              </div>
            )}
            <div style={{
              maxWidth:'85%',
              background:   m.role==='user' ? C.primary : C.card,
              color:        m.role==='user' ? '#fff'    : C.text,
              borderRadius: m.role==='user' ? '18px 18px 6px 18px' : '6px 18px 18px 18px',
              padding:'12px 14px', fontSize:15, lineHeight:1.75,
              whiteSpace:'pre-wrap',
              border: m.role==='ai' ? `1.5px solid ${C.border}` : 'none',
            }}>{m.text}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:C.amber, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>☀️</div>
            <div style={{ background:C.card, border:`1.5px solid ${C.border}`, borderRadius:'6px 18px 18px 18px', padding:'14px 18px' }}>
              <div style={{ display:'flex', gap:4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:C.amber, animation:`hidaBounce .9s ${i*0.15}s infinite ease-in-out` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding:'10px 14px', background:C.card, borderTop:`1.5px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <textarea
            value={input} onChange={e => setInput(e.target.value)}
            disabled={used}
            placeholder={used ? '今日はもう使いました 🌙' : 'ここに気持ちを書いてください…'}
            rows={2} autoComplete="off"
            onKeyDown={e => { if (e.key==='Enter' && e.metaKey) send() }}
            style={{ flex:1, padding:'10px 12px', borderRadius:14, border:`2px solid ${input?C.primary:C.border}`, fontSize:15, fontFamily:FONT, resize:'none', outline:'none', lineHeight:1.5, color:C.text, background:used?C.bg:C.card }}
          />
          <button onClick={send} disabled={!input.trim()||loading||used}
            style={{ width:44, height:44, borderRadius:14, background:(!input.trim()||loading||used)?C.bg:C.primary, border:'none', cursor:(!input.trim()||loading||used)?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={(!input.trim()||loading||used)?C.muted:'#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:6, textAlign:'center' }}>
          ここに書いた内容は、あなただけが見ることができます
        </div>
      </div>
      <style>{`@keyframes hidaBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
    </div>
  )
}
