import { useState, useEffect } from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, getDocs
} from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT } from '../theme'

export default function HiyariMemo() {
  const { user, profile, can } = useAuth()
  const [posts,     setPosts]    = useState([])
  const [children,  setChildren] = useState([])
  const [posting,   setPosting]  = useState(false)
  const [showForm,  setShowForm] = useState(false)
  const [form, setForm] = useState({
    location: '', what: '', childId: '', childName: '', next: '', severity: 'low'
  })

  useEffect(() => {
    getDocs(collection(db,'facilities',FACILITY_ID,'children')).then(s => {
      setChildren(s.docs.map(d => ({ id:d.id, ...d.data() })))
    })

    const q = query(collection(db,'facilities',FACILITY_ID,'hazards'), orderBy('createdAt','desc'))
    const unsub = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  const submit = async () => {
    if (!form.what.trim() || posting) return
    setPosting(true)
    await addDoc(collection(db,'facilities',FACILITY_ID,'hazards'), {
      ...form,
      authorUid:  user.uid,
      authorName: profile?.name || '',
      authorHira: profile?.hiraganaName || '',
      createdAt:  serverTimestamp(),
    })
    setForm({ location:'', what:'', childId:'', childName:'', next:'', severity:'low' })
    setShowForm(false)
    setPosting(false)
  }

  const SEVERITY = {
    low:    { label:'気になった',   bg:'#E3F2FD', c:'#1565C0', emoji:'💭' },
    medium: { label:'ヒヤっとした', bg:C.amberLight, c:'#B07800', emoji:'⚠️' },
    high:   { label:'危なかった',   bg:C.coralLight,  c:'#CC5040', emoji:'🚨' },
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* ヘッダー */}
      <div style={{ padding:'14px 16px 10px', background:`linear-gradient(135deg,${C.amberLight},${C.bg})`, borderBottom:`1.5px solid ${C.amber}33`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:19, fontWeight:800, color:C.text }}>⚠️ ひやりメモ</div>
            <div style={{ fontSize:13, color:C.sub, marginTop:2 }}>気になったこと・ヒヤっとしたことを記録</div>
          </div>
          <button onClick={() => setShowForm(v => !v)}
            style={{ padding:'9px 16px', borderRadius:12, border:'none', background:showForm ? C.coralLight : C.amber, color: showForm ? C.coral : '#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
            {showForm ? '× 閉じる' : '＋ 記録する'}
          </button>
        </div>
        <div style={{ marginTop:8, fontSize:12, color:'#7A5000', background:C.amberLight, borderRadius:8, padding:'6px 10px', lineHeight:1.6 }}>
          放課後等デイサービスでは事故・ヒヤリハットの記録が法令上の義務です。小さなことでも記録しておきましょう。
        </div>
      </div>

      {/* 入力フォーム（展開時） */}
      {showForm && (
        <div style={{ background:C.card, borderBottom:`1.5px solid ${C.border}`, padding:'14px 16px', flexShrink:0 }}>
          {/* 深刻度 */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:13, color:C.sub, marginBottom:6 }}>どのくらい？</div>
            <div style={{ display:'flex', gap:8 }}>
              {Object.entries(SEVERITY).map(([k, v]) => (
                <button key={k} onClick={() => setForm(p => ({...p, severity:k}))}
                  style={{ flex:1, padding:'10px 6px', borderRadius:10, border:`2px solid ${form.severity===k?v.c:C.border}`, background:form.severity===k?v.bg:'transparent', fontSize:13, fontWeight:form.severity===k?700:400, color:form.severity===k?v.c:C.sub, cursor:'pointer', fontFamily:FONT }}>
                  {v.emoji} {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* 場所 */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:13, color:C.sub, marginBottom:4 }}>場所</div>
            <input value={form.location} onChange={e => setForm(p=>({...p,location:e.target.value}))}
              placeholder="例：玄関・ホール・セッション室"
              style={{ width:'100%', padding:'11px 13px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:FONT, outline:'none', color:C.text, boxSizing:'border-box' }}
            />
          </div>

          {/* 関係する子ども */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:13, color:C.sub, marginBottom:4 }}>関係する子ども（任意）</div>
            <select value={form.childId} onChange={e => { const c=children.find(x=>x.id===e.target.value); setForm(p=>({...p,childId:e.target.value,childName:c?.name||''})) }}
              style={{ width:'100%', padding:'11px 13px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:FONT, background:C.card, color:C.text, outline:'none' }}>
              <option value="">なし / 選ばない</option>
              {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* 何が起きたか */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:13, color:C.sub, marginBottom:4 }}>何が起きたか（または気になったか）*</div>
            <textarea value={form.what} onChange={e => setForm(p=>({...p,what:e.target.value}))}
              placeholder="具体的に書いてください"
              rows={3}
              style={{ width:'100%', padding:'11px 13px', borderRadius:10, border:`1.5px solid ${form.what?C.amber:C.border}`, fontSize:14, fontFamily:FONT, resize:'none', outline:'none', lineHeight:1.5, color:C.text, boxSizing:'border-box' }}
            />
          </div>

          {/* 今後どうするか */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:13, color:C.sub, marginBottom:4 }}>今後どうするか・気づいたこと（任意）</div>
            <input value={form.next} onChange={e => setForm(p=>({...p,next:e.target.value}))}
              placeholder="例：次回から注意する・責任者に相談する"
              style={{ width:'100%', padding:'11px 13px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:FONT, outline:'none', color:C.text, boxSizing:'border-box' }}
            />
          </div>

          <button onClick={submit} disabled={!form.what.trim()||posting}
            style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background:(!form.what.trim()||posting)?C.bg:C.amber, fontSize:15, fontWeight:700, color:(!form.what.trim()||posting)?C.muted:'#fff', cursor:(!form.what.trim()||posting)?'not-allowed':'pointer', fontFamily:FONT }}>
            {posting ? '保存中…' : '⚠️ 記録を保存する'}
          </button>
        </div>
      )}

      {/* 一覧 */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px' }}>
        {posts.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 20px', color:C.muted }}>
            <div style={{ fontSize:40, marginBottom:12 }}>✨</div>
            <div style={{ fontSize:15 }}>ひやりメモはありません</div>
            <div style={{ fontSize:13, marginTop:4 }}>気になったことは早めに記録しましょう</div>
          </div>
        )}

        {posts.map(post => {
          const sv = SEVERITY[post.severity] || SEVERITY.low
          const author = post.authorHira
            ? `${post.authorHira.split(' ')[0]}先生`
            : (post.authorName || '不明')
          return (
            <div key={post.id} style={{ background:C.card, borderRadius:18, padding:14, marginBottom:12, border:`1.5px solid ${sv.c}44` }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <div style={{ background:sv.bg, color:sv.c, borderRadius:99, padding:'5px 12px', fontSize:13, fontWeight:700 }}>
                  {sv.emoji} {sv.label}
                </div>
                {post.childName && (
                  <div style={{ background:C.amberLight, color:'#B07800', borderRadius:99, padding:'5px 10px', fontSize:12, fontWeight:600 }}>
                    👶 {post.childName}
                  </div>
                )}
                <div style={{ marginLeft:'auto', fontSize:11, color:C.muted }}>
                  {post.createdAt?.toDate?.()?.toLocaleDateString('ja-JP') || ''}
                </div>
              </div>

              {post.location && (
                <div style={{ fontSize:12, color:C.sub, marginBottom:6 }}>📍 {post.location}</div>
              )}

              <div style={{ fontSize:14, color:C.text, lineHeight:1.7, marginBottom:post.next?10:0, whiteSpace:'pre-wrap' }}>
                {post.what}
              </div>

              {post.next && (
                <div style={{ background:C.primaryLight, borderRadius:10, padding:'8px 12px', fontSize:13, color:C.primaryDark }}>
                  💡 {post.next}
                </div>
              )}

              <div style={{ marginTop:10, fontSize:11, color:C.muted }}>
                記録：{author}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
