import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc, collection, getDocs } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, DOW_JA } from '../theme'

const STATUS_CFG = {
  '来所済み': { bg: C.primaryLight, c: C.primaryDark, border: C.primary },
  '予定':     { bg: C.amberLight,   c: '#B07800',     border: C.amber   },
  '欠席':     { bg: C.coralLight,   c: '#CC5040',     border: C.coral   },
}

const SLOT_TIMES = [
  '10:00〜11:00',
  '11:15〜12:15',
  '14:30〜15:30',
  '15:45〜16:45',
  '17:00〜18:00',
]

// 1つのコマに入る「担当カード」のデフォルト
const emptyCard = () => ({
  id:       Date.now() + Math.random(),
  staffId:  '',
  staffName:'',
  type:     '個別',
  children: [{ childId:'', childName:'', status:'予定', comment:'' }],
  groupMemo:'',
  memos:    [],
})

const makeSlots = () => SLOT_TIMES.map((t, i) => ({
  slot:  i + 1,
  time:  t,
  cards: [emptyCard()],   // ← カード配列（複数可）
}))

export default function Sessions() {
  const { profile } = useAuth()
  const today   = new Date()
  const dateKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const label   = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${DOW_JA[today.getDay()]}）`

  const [slots,     setSlots]     = useState(makeSlots())
  const [staffList, setStaffList] = useState([])
  const [children,  setChildren]  = useState([])
  const [memoInput, setMemoInput] = useState({})  // key: `${slotIdx}-${cardIdx}`

  // ─── 初期ロード ─────────────────────────────────────────
  useEffect(() => {
    getDocs(collection(db,'facilities',FACILITY_ID,'staff'))
      .then(s => setStaffList(s.docs.filter(d=>d.data().active!==false).map(d=>({id:d.id,...d.data()}))))
      .catch(()=>{})

    getDocs(collection(db,'facilities',FACILITY_ID,'children'))
      .then(s => setChildren(s.docs.map(d=>({id:d.id,...d.data()}))))
      .catch(()=>{})

    const unsub = onSnapshot(
      doc(db,'facilities',FACILITY_ID,'sessions',dateKey),
      snap => {
        if (!snap.exists()) return
        const saved = snap.data().slots
        if (!saved) return
        // 保存データをマージ（旧形式との互換性あり）
        setSlots(prev => prev.map((s, i) => {
          const sv = saved[i]
          if (!sv) return s
          // 旧形式（cardsなし）→ 変換
          if (!sv.cards && sv.staffId !== undefined) {
            return {
              ...s,
              cards: [{
                id: Date.now() + i,
                staffId:   sv.staffId   || '',
                staffName: sv.staffName || '',
                type:      sv.type      || '個別',
                children:  sv.children  || [{ childId:'', childName:'', status:'予定', comment:'' }],
                groupMemo: sv.groupMemo || '',
                memos:     sv.memos     || [],
              }]
            }
          }
          return { ...s, ...sv }
        }))
      },
      () => {}
    )
    return () => unsub()
  }, [dateKey])

  // ─── 保存（Firestoreへ非同期） ───────────────────────────
  const save = (updated) => {
    setDoc(
      doc(db,'facilities',FACILITY_ID,'sessions',dateKey),
      { slots: updated, date: dateKey },
      { merge: true }
    ).catch(err => console.error('[Sessions] save:', err.message))
  }

  // ─── スロット更新ヘルパー ────────────────────────────────
  const updateSlot = (si, fn) => {
    setSlots(prev => {
      const next = prev.map((s, i) => i === si ? fn(s) : s)
      save(next)
      return next
    })
  }

  // ─── カード追加 ─────────────────────────────────────────
  const addCard = (si) => {
    updateSlot(si, s => ({ ...s, cards: [...s.cards, emptyCard()] }))
  }

  // ─── カード削除 ─────────────────────────────────────────
  const removeCard = (si, ci) => {
    updateSlot(si, s => ({
      ...s,
      cards: s.cards.length > 1 ? s.cards.filter((_,i) => i !== ci) : s.cards
    }))
  }

  // ─── カード内フィールド更新 ─────────────────────────────
  const updateCard = (si, ci, field, value) => {
    updateSlot(si, s => {
      const cards = s.cards.map((c, i) => {
        if (i !== ci) return c
        if (field === 'staffId') {
          const staff = staffList.find(x => x.id === value)
          return { ...c, staffId: value, staffName: staff?.hiraganaFirst ? `${staff.hiraganaFirst}先生` : staff?.name || '' }
        }
        return { ...c, [field]: value }
      })
      return { ...s, cards }
    })
  }

  // ─── 子ども更新 ─────────────────────────────────────────
  const updateChild = (si, ci, chi, field, value) => {
    updateSlot(si, s => {
      const cards = s.cards.map((c, i) => {
        if (i !== ci) return c
        const kids = c.children.map((ch, j) => {
          if (j !== chi) return ch
          if (field === 'childId') {
            const child = children.find(x => x.id === value)
            return { ...ch, childId: value, childName: child?.name || '' }
          }
          return { ...ch, [field]: value }
        })
        return { ...c, children: kids }
      })
      return { ...s, cards }
    })
  }

  // ─── 子ども追加・削除 ────────────────────────────────────
  const addChild = (si, ci) => {
    updateSlot(si, s => ({
      ...s,
      cards: s.cards.map((c, i) => i !== ci || c.children.length >= 5 ? c : {
        ...c, children: [...c.children, { childId:'', childName:'', status:'予定', comment:'' }]
      })
    }))
  }

  const removeChild = (si, ci, chi) => {
    updateSlot(si, s => ({
      ...s,
      cards: s.cards.map((c, i) => i !== ci || c.children.length <= 1 ? c : {
        ...c, children: c.children.filter((_,j) => j !== chi)
      })
    }))
  }

  // ─── メモ追加 ────────────────────────────────────────────
  const addMemo = (si, ci) => {
    const key  = `${si}-${ci}`
    const text = (memoInput[key] || '').trim()
    if (!text) return
    const memo = { text, author: profile?.name || '不明', at: new Date().toLocaleString('ja-JP') }
    updateSlot(si, s => ({
      ...s,
      cards: s.cards.map((c, i) => i !== ci ? c : { ...c, memos: [...(c.memos||[]), memo] })
    }))
    setMemoInput(p => ({ ...p, [key]: '' }))
  }

  // ─── コメント保存（blur時） ──────────────────────────────
  const saveChildComment = (si, ci, chi, value) => {
    updateSlot(si, s => ({
      ...s,
      cards: s.cards.map((c, i) => i !== ci ? c : {
        ...c, children: c.children.map((ch, j) => j !== chi ? ch : { ...ch, comment: value })
      })
    }))
  }

  return (
    <div style={{ padding:'16px' }}>
      <div style={{ fontSize:19, fontWeight:800, color:C.text, marginBottom:3 }}>
        🧩 だれが・どのコマ・どの子ども
      </div>
      <div style={{ fontSize:13, color:C.sub, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:12, color:C.primary, background:C.primaryLight, borderRadius:9, padding:'7px 12px', marginBottom:16 }}>
        ✏️ 全員が前日に入力できます。同じコマに複数の担当者を追加できます。
      </div>

      {slots.map((slot, si) => (
        <div key={si} style={{ background:C.card, borderRadius:20, padding:14, marginBottom:14, border:`1.5px solid ${C.border}` }}>

          {/* コマヘッダー */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <div style={{ width:34, height:34, borderRadius:10, background:C.primaryLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:C.primary }}>
              {slot.slot}
            </div>
            <div>
              <div style={{ fontSize:12, color:C.sub }}>コマ{slot.slot}</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{slot.time}</div>
            </div>
            {/* カード追加ボタン */}
            <button
              type="button"
              onClick={() => addCard(si)}
              style={{ marginLeft:'auto', padding:'6px 13px', borderRadius:10, border:`1.5px dashed ${C.primary}`, background:C.primaryLight, fontSize:12, fontWeight:700, color:C.primaryDark, cursor:'pointer', fontFamily:FONT }}>
              ＋ 担当者を追加
            </button>
          </div>

          {/* カード一覧 */}
          {slot.cards.map((card, ci) => (
            <div key={card.id || ci} style={{ background:C.bg, borderRadius:14, padding:12, marginBottom:10, border:`1.5px solid ${C.border}` }}>

              {/* カードヘッダー（担当者 + 削除） */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <div style={{ width:22, height:22, borderRadius:6, background:C.primary, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {ci + 1}
                </div>

                {/* 担当職員選択 */}
                <select
                  value={card.staffId}
                  onChange={e => updateCard(si, ci, 'staffId', e.target.value)}
                  style={{ flex:1, padding:'7px 9px', borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:FONT, background:C.card, color:C.text, outline:'none' }}>
                  <option value="">担当職員を選ぶ</option>
                  {staffList.map(x => (
                    <option key={x.id} value={x.id}>
                      {x.hiraganaFirst ? `${x.hiraganaFirst}先生（${x.name}）` : x.name}
                    </option>
                  ))}
                </select>

                {/* タイプ切り替え */}
                {['個別','集団'].map(t => (
                  <button key={t} type="button"
                    onClick={() => updateCard(si, ci, 'type', t)}
                    style={{ padding:'5px 10px', borderRadius:99, border:`1.5px solid ${card.type===t?(t==='集団'?C.amber:C.primary):C.border}`, background:card.type===t?(t==='集団'?C.amberLight:C.primaryLight):'transparent', fontSize:11, fontWeight:card.type===t?700:400, color:card.type===t?(t==='集団'?'#B07800':C.primaryDark):C.sub, cursor:'pointer', fontFamily:FONT, flexShrink:0 }}>
                    {t}
                  </button>
                ))}

                {/* カード削除ボタン（2枚以上のとき表示） */}
                {slot.cards.length > 1 && (
                  <button type="button"
                    onClick={() => removeCard(si, ci)}
                    style={{ width:24, height:24, borderRadius:'50%', border:`1.5px solid ${C.coral}`, background:C.coralLight, color:C.coral, fontSize:14, fontWeight:700, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    ×
                  </button>
                )}
              </div>

              {/* 子どもカード一覧 */}
              {card.children.map((ch, chi) => {
                const sc = STATUS_CFG[ch.status] || STATUS_CFG['予定']
                return (
                  <div key={chi} style={{ background:C.card, borderRadius:10, padding:10, marginBottom:7, border:`1px solid ${C.border}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:7 }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:C.amberLight, border:`1.5px solid ${C.amber}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#B07800', flexShrink:0 }}>
                        {chi + 1}
                      </div>

                      {/* 子ども選択 */}
                      <select value={ch.childId}
                        onChange={e => updateChild(si, ci, chi, 'childId', e.target.value)}
                        style={{ flex:1, padding:'6px 8px', borderRadius:7, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:FONT, background:C.card, color:C.text, outline:'none' }}>
                        <option value="">子どもを選ぶ</option>
                        {children.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>

                      {/* 出欠 */}
                      <div style={{ background:sc.bg, color:sc.c, borderRadius:99, padding:'3px 9px', fontSize:11, fontWeight:600, flexShrink:0 }}>
                        {ch.status}
                      </div>

                      {/* 子ども削除 */}
                      {card.children.length > 1 && (
                        <button type="button"
                          onClick={() => removeChild(si, ci, chi)}
                          style={{ width:20, height:20, borderRadius:'50%', border:`1px solid ${C.muted}`, background:'transparent', color:C.muted, fontSize:12, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          ×
                        </button>
                      )}
                    </div>

                    {/* 出欠ボタン */}
                    <div style={{ display:'flex', gap:5, marginBottom:7 }}>
                      {['来所済み','予定','欠席'].map(st => {
                        const cfg = STATUS_CFG[st]; const on = ch.status === st
                        return (
                          <button key={st} type="button"
                            onClick={() => updateChild(si, ci, chi, 'status', st)}
                            style={{ flex:1, padding:'6px 3px', borderRadius:7, border:`1.5px solid ${on?cfg.border:C.border}`, background:on?cfg.bg:'transparent', fontSize:11, fontWeight:on?700:400, color:on?cfg.c:C.sub, cursor:'pointer', fontFamily:FONT }}>
                            {st}
                          </button>
                        )
                      })}
                    </div>

                    {/* 職員コメント */}
                    <textarea autoComplete="off"
                      defaultValue={ch.comment || ''}
                      onBlur={e => saveChildComment(si, ci, chi, e.target.value)}
                      placeholder={`${ch.childName||'この子ども'}への職員コメント`}
                      rows={2}
                      style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:`1.5px solid ${C.border}`, fontSize:12, fontFamily:FONT, resize:'vertical', outline:'none', lineHeight:1.5, color:C.text, background:C.bg, boxSizing:'border-box' }}
                    />
                  </div>
                )
              })}

              {/* 子ども追加ボタン（集団のみ） */}
              {card.type === '集団' && card.children.length < 5 && (
                <button type="button"
                  onClick={() => addChild(si, ci)}
                  style={{ width:'100%', padding:'7px', borderRadius:8, border:`1.5px dashed ${C.amber}`, background:'transparent', fontSize:12, fontWeight:600, color:'#B07800', cursor:'pointer', fontFamily:FONT, marginBottom:7 }}>
                  ＋ 子どもを追加（{card.children.length}/5名）
                </button>
              )}

              {/* 集団メモ */}
              {card.type === '集団' && (
                <div style={{ marginBottom:9 }}>
                  <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>📋 集団全体の所見</div>
                  <textarea autoComplete="off"
                    defaultValue={card.groupMemo || ''}
                    onBlur={e => updateCard(si, ci, 'groupMemo', e.target.value)}
                    rows={2}
                    style={{ width:'100%', padding:'7px 9px', borderRadius:8, border:`1.5px solid ${C.amber}44`, fontSize:12, fontFamily:FONT, resize:'vertical', outline:'none', lineHeight:1.5, color:C.text, background:C.amberLight, boxSizing:'border-box' }}
                    placeholder="グループ全体の様子・気づき"
                  />
                </div>
              )}

              {/* 申し送りメモ */}
              <div style={{ borderTop:`1px solid ${C.divider}`, paddingTop:9 }}>
                <div style={{ fontSize:11, color:C.sub, marginBottom:5 }}>📝 申し送りメモ</div>
                {(card.memos || []).map((m, mi) => (
                  <div key={mi} style={{ background:C.bg, borderRadius:7, padding:'6px 9px', marginBottom:4 }}>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:1 }}>{m.author} · {m.at}</div>
                    <div style={{ fontSize:12, color:C.text, whiteSpace:'pre-wrap' }}>{m.text}</div>
                  </div>
                ))}
                <div style={{ display:'flex', gap:6 }}>
                  <input autoComplete="off"
                    value={memoInput[`${si}-${ci}`] || ''}
                    onChange={e => setMemoInput(p => ({ ...p, [`${si}-${ci}`]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addMemo(si, ci)}
                    placeholder="メモを書く…"
                    style={{ flex:1, padding:'7px 10px', borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:12, fontFamily:FONT, outline:'none', color:C.text }}
                  />
                  <button type="button"
                    onClick={() => addMemo(si, ci)}
                    style={{ padding:'7px 12px', borderRadius:8, border:'none', background:C.primary, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
                    追加
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
