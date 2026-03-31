import { useState, useEffect } from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, getDocs, where
} from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT } from '../theme'

const CARD_COLORS = [
  { bg:'#E6F5F3', border:C.primary, text:C.primaryDark, emoji:'🌿' },
  { bg:'#FFF5E0', border:C.amber,   text:'#B07800',     emoji:'☀️' },
  { bg:'#F0ECFA', border:C.purple,  text:'#7050B0',     emoji:'🌸' },
  { bg:'#FFECEA', border:C.coral,   text:'#CC5040',     emoji:'🌺' },
  { bg:'#E8F6ED', border:'#6BC48A', text:'#2E7D32',     emoji:'🍀' },
]

export default function ArigatoCard() {
  const { user, profile } = useAuth()
  const [cards,      setCards]      = useState([])
  const [staffList,  setStaffList]  = useState([])
  const [toUid,      setToUid]      = useState('')
  const [message,    setMessage]    = useState('')
  const [colorIdx,   setColorIdx]   = useState(0)
  const [sending,    setSending]    = useState(false)
  const [showForm,   setShowForm]   = useState(false)
  const [tab,        setTab]        = useState('received') // received | sent | all

  useEffect(() => {
    getDocs(collection(db,'facilities',FACILITY_ID,'staff')).then(s => {
      setStaffList(s.docs.filter(d => d.data().active && d.id !== user?.uid).map(d => ({ id:d.id, ...d.data() })))
    })

    const q = query(collection(db,'facilities',FACILITY_ID,'thanks'), orderBy('createdAt','desc'))
    const unsub = onSnapshot(q, snap => {
      setCards(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    })
    return () => unsub()
  }, [user?.uid])

  const send = async () => {
    if (!toUid || !message.trim() || sending) return
    setSending(true)
    const toStaff = staffList.find(s => s.id === toUid)
    await addDoc(collection(db,'facilities',FACILITY_ID,'thanks'), {
      fromUid:   user.uid,
      fromName:  profile?.name || '',
      fromHira:  profile?.hiraganaName || '',
      toUid,
      toName:    toStaff?.name || '',
      toHira:    toStaff?.hiraganaName || '',
      message:   message.trim(),
      colorIdx,
      createdAt: serverTimestamp(),
    })
    setMessage('')
    setToUid('')
    setShowForm(false)
    setSending(false)
  }

  const received = cards.filter(c => c.toUid === user?.uid)
  const sent     = cards.filter(c => c.fromUid === user?.uid)
  const all      = cards

  const displayed = tab === 'received' ? received : tab === 'sent' ? sent : all

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* ヘッダー */}
      <div style={{ padding:'14px 16px 10px', background:`linear-gradient(135deg,${C.purpleLight},${C.bg})`, borderBottom:`1.5px solid ${C.purple}33`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:19, fontWeight:800, color:C.text }}>✨ ありがとうカード</div>
            <div style={{ fontSize:13, color:C.sub, marginTop:2 }}>職員同士で感謝を伝え合いましょう</div>
          </div>
          <button onClick={() => setShowForm(v=>!v)}
            style={{ padding:'9px 16px', borderRadius:12, border:'none', background:showForm ? C.primaryLight : C.purple, color: showForm ? C.primary : '#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
            {showForm ? '× 閉じる' : '✨ 送る'}
          </button>
        </div>

        {/* タブ */}
        <div style={{ display:'flex', gap:7, marginTop:10 }}>
          {[['received',`もらった (${received.length})`],['sent',`送った (${sent.length})`],['all','全員分']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex:1, padding:'7px 4px', borderRadius:9, border:`1.5px solid ${tab===id?C.purple:C.border}`, background:tab===id?C.purpleLight:'transparent', fontSize:12, fontWeight:tab===id?700:400, color:tab===id?'#7050B0':C.sub, cursor:'pointer', fontFamily:FONT }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 送信フォーム（展開時） */}
      {showForm && (
        <div style={{ background:C.card, borderBottom:`1.5px solid ${C.border}`, padding:'14px 16px', flexShrink:0 }}>

          {/* カードの色を選ぶ */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:13, color:C.sub, marginBottom:6 }}>カードのデザイン</div>
            <div style={{ display:'flex', gap:8 }}>
              {CARD_COLORS.map((cc, i) => (
                <button key={i} onClick={() => setColorIdx(i)}
                  style={{ flex:1, padding:'10px 6px', borderRadius:10, border:`2px solid ${colorIdx===i?cc.border:C.border}`, background:cc.bg, fontSize:18, cursor:'pointer' }}>
                  {cc.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* 送り先 */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:13, color:C.sub, marginBottom:4 }}>誰に送りますか？</div>
            <select value={toUid} onChange={e => setToUid(e.target.value)}
              style={{ width:'100%', padding:'11px 13px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:FONT, background:C.card, color:C.text, outline:'none' }}>
              <option value="">選んでください</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.hiraganaName ? `${s.hiraganaName.split(' ')[0]}先生` : s.name}
                </option>
              ))}
            </select>
          </div>

          {/* メッセージ */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:13, color:C.sub, marginBottom:4 }}>メッセージ</div>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="感謝の気持ちや、いいなと思ったことを書いてください"
              rows={3}
              style={{ width:'100%', padding:'11px 13px', borderRadius:10, border:`2px solid ${message?C.purple:C.border}`, fontSize:14, fontFamily:FONT, resize:'none', outline:'none', lineHeight:1.6, color:C.text, boxSizing:'border-box' }}
            />
          </div>

          <button onClick={send} disabled={!toUid || !message.trim() || sending}
            style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background:(!toUid||!message.trim()||sending)?C.bg:C.purple, fontSize:15, fontWeight:700, color:(!toUid||!message.trim()||sending)?C.muted:'#fff', cursor:(!toUid||!message.trim()||sending)?'not-allowed':'pointer', fontFamily:FONT }}>
            {sending ? '送信中…' : '✨ ありがとうを送る'}
          </button>
        </div>
      )}

      {/* カード一覧 */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px' }}>
        {displayed.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 20px', color:C.muted }}>
            <div style={{ fontSize:40, marginBottom:12 }}>✨</div>
            <div style={{ fontSize:15 }}>
              {tab === 'received' ? 'まだもらっていません' : 'まだ送っていません'}
            </div>
            <div style={{ fontSize:13, marginTop:4 }}>感謝の気持ちを伝えてみましょう！</div>
          </div>
        )}

        {displayed.map(card => {
          const cc      = CARD_COLORS[card.colorIdx] || CARD_COLORS[0]
          const isToMe  = card.toUid === user?.uid
          const fromDisp = card.fromHira
            ? `${card.fromHira.split(' ')[0]}先生`
            : (card.fromName || '不明')
          const toDisp = card.toHira
            ? `${card.toHira.split(' ')[0]}先生`
            : (card.toName || '不明')

          return (
            <div key={card.id} style={{
              background: cc.bg,
              borderRadius: 20,
              padding: '18px 18px',
              marginBottom: 14,
              border: `2px solid ${cc.border}44`,
              position: 'relative',
            }}>
              {isToMe && (
                <div style={{ position:'absolute', top:12, right:12, background:cc.border, color:'#fff', borderRadius:99, padding:'3px 10px', fontSize:11, fontWeight:700 }}>
                  ✨ あなたへ
                </div>
              )}

              {/* 絵文字 */}
              <div style={{ fontSize:32, marginBottom:10 }}>{cc.emoji}</div>

              {/* 宛先・差出人 */}
              <div style={{ fontSize:13, color:cc.text, marginBottom:8, fontWeight:600 }}>
                {fromDisp} → {toDisp}
              </div>

              {/* メッセージ */}
              <div style={{ fontSize:15, color:cc.text, lineHeight:1.8, whiteSpace:'pre-wrap', fontWeight:500 }}>
                {card.message}
              </div>

              {/* 日付 */}
              <div style={{ marginTop:12, fontSize:11, color:cc.text, opacity:.7 }}>
                {card.createdAt?.toDate?.()?.toLocaleDateString('ja-JP') || ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
