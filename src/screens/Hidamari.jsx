import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT } from '../theme'

const SYSTEM_PROMPT = `あなたは「こころのひだまり」というAIカウンセラーです。コペルプラス 東久留米教室で働く職員をやさしく温かく支える存在です。

以下の順番で、500〜600字を目安に返答してください：
①受容：相手の気持ちをそのまま、ありのまま受け止める
②共感：「それはつらかったですね」など、感情に名前をつける
③正常化：そう感じることはあたり前だと伝え、自分を責めなくていいと伝える
④小さな力を認める：今日ここに来て気持ちを吐き出せたこと自体をちゃんとほめる

守ること：
・批判・評価・アドバイスは一切しない
・解決策を押しつけない
・「でも」「しかし」で否定しない
・ひらがなを多めに使い、やさしくやわらかい文体で
・相手が「ここに来てよかった」と感じられる終わり方にする`

const SUMMARY_PROMPT = `以下は職員とAIカウンセラーの会話内容です。
責任者向けに、以下の形式で要約してください：

・職員の名前を明記する（例：「〇〇先生は〜」）
・具体的なエピソードも含めて記載する
・ただし、すべての表現は誰も傷つかないやさしい言葉で書く
  （批判・否定・決めつけをせず、「〜のようにお感じのようです」「〜という場面があったようです」などの柔らかい表現を使う）
・最後に「どのような関わりが考えられるか」を3点提案する
・全体で400字以内

会話内容：`

export default function Hidamari() {
  const { user, profile } = useAuth()
  const today    = new Date().toISOString().slice(0,10)
  const [msgs,   setMsgs]   = useState([
    { role:'ai', text:'こんにちは 🌤️\n\nここは、あなただけの安心できる場所です。\n今日、こころにたまっていることを、なんでも話してくださいね。\n\nどんな気持ちも、ちゃんと受け止めます。' }
  ])
  const [input,  setInput]  = useState('')
  const [loading,setLoading] = useState(false)
  const [used,   setUsed]   = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const bottomRef = useRef()

  useEffect(() => {
    if (!user) return
    const ref = doc(db, 'facilities', FACILITY_ID, 'hidamari', user.uid, 'logs', today)
    getDoc(ref).then(snap => { if (snap.exists()) setUsed(true) })
  }, [user, today])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading || used) return
    setInput('')
    const newMsgs = [...msgs, { role:'user', text }]
    setMsgs(newMsgs)
    setLoading(true)

    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
      const history = newMsgs.slice(1).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }))

      // ① Claudeが共感・寄り添いの返答を生成
      const res  = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:1000, system:SYSTEM_PROMPT, messages:history })
      })
      const data  = await res.json()
      const reply = data.content?.find(b=>b.type==='text')?.text || 'うまく受け取れませんでした。もう一度お話しください。'

      const finalMsgs = [...newMsgs, { role:'ai', text:reply }]
      setMsgs(finalMsgs)
      setUsed(true)

      // ② 利用記録をFirestoreに保存（原文は保存しない・フラグのみ）
      await setDoc(doc(db, 'facilities', FACILITY_ID, 'hidamari', user.uid, 'logs', today), {
        used: true, date: today, uid: user.uid,
        createdAt: new Date().toISOString(),
      })

      // ③ AI要約を生成して責任者メールに送信
      await generateAndSendSummary(finalMsgs)

    } catch(err) {
      console.error('[Hidamari]', err)
      setMsgs(prev => [...prev, { role:'ai', text:'少し時間をおいて、またお話しください 🙏' }])
    }
    setLoading(false)
  }

  const generateAndSendSummary = async (conversation) => {
    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

      // 会話テキスト（AIの最初のあいさつは除く）
      const staffDisplayName = profile?.hiraganaFirst
        ? `${profile.hiraganaFirst}先生`
        : profile?.name || '不明な職員'
      const convText = conversation
        .slice(1)
        .map(m => `${m.role === 'user' ? staffDisplayName : 'AI'}：${m.text}`)
        .join('\n\n')

      // ④ 要約を生成（個人特定されないよう配慮）
      const sumRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens:600,
          messages: [{ role:'user', content:`${SUMMARY_PROMPT}\n\n${convText}` }]
        })
      })
      const sumData = await sumRes.json()
      const summary = sumData.content?.find(b=>b.type==='text')?.text || ''

      // ⑤ 要約をFirestoreに保存（管理者のみ閲覧可）
      await setDoc(doc(db, 'facilities', FACILITY_ID, 'hidamari_summaries', `${user.uid}_${today}`), {
        summary,
        date: today,
        uid:  user.uid,
        staffName: profile?.hiraganaFirst
          ? `${profile.hiraganaFirst}先生`
          : profile?.name || '不明',
        createdAt: new Date().toISOString(),
        emailSent: false,
      })

      // ⑥ 責任者・副責任者のメールアドレスを取得
      const staffSnap = await getDocs(collection(db, 'facilities', FACILITY_ID, 'staff'))
      const adminEmails = staffSnap.docs
        .filter(d => ['admin','sub_admin','developer'].includes(d.data().role))
        .map(d => d.data().email)
        .filter(Boolean)

      if (!adminEmails.length) {
        console.warn('[Hidamari] 責任者メールが見つかりません')
        return
      }

      // ⑦ Vercel Serverless Function経由でメール送信
      const secret = import.meta.env.VITE_INTERNAL_SECRET || 'copelplus_internal_2026'
      const mailRes = await fetch('/api/send-hidamari-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': secret,
        },
        body: JSON.stringify({
          summary,
          date: today,
          adminEmails,
        }),
      })

      if (mailRes.ok) {
        setEmailSent(true)
        // メール送信済みを記録
        await setDoc(doc(db, 'facilities', FACILITY_ID, 'hidamari_summaries', `${user.uid}_${today}`),
          { emailSent: true }, { merge: true })
        console.log('[Hidamari] ✅ 責任者へメール送信完了')
      } else {
        console.error('[Hidamari] メール送信失敗:', await mailRes.text())
      }

    } catch(err) {
      console.error('[Hidamari] 要約・メール送信エラー:', err)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      <div style={{ padding:'14px', background:`linear-gradient(135deg,${C.amberLight},#FFF0D0)`, borderBottom:`1.5px solid ${C.amber}33`, flexShrink:0 }}>
        <div style={{ fontSize:18, fontWeight:800, color:C.text }}>☀️ こころのひだまり</div>
        <div style={{ fontSize:13, color:C.sub, marginTop:3 }}>ここだけの、あなたの安心できる場所</div>
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
              background: m.role==='user' ? C.primary : C.card,
              color:       m.role==='user' ? '#fff'    : C.text,
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
                  <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:C.amber, animation:`bounce${i} .9s ${i*0.15}s infinite` }} />
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
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={used}
            placeholder={used ? '今日はもう使いました 🌙' : 'ここに気持ちを書いてください…'}
            rows={2}
            onKeyDown={e => { if(e.key==='Enter' && e.metaKey) send() }}
            autoComplete="off"
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

      <style>{`
        @keyframes bounce0{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        @keyframes bounce1{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        @keyframes bounce2{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
      `}</style>
    </div>
  )
}
