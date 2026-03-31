import { useState, useEffect } from 'react'
import {
  collection, addDoc, onSnapshot, updateDoc, doc,
  serverTimestamp, query, orderBy, arrayUnion, where, getDocs
} from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT } from '../theme'

export default function TsunagiMemo() {
  const { user, profile } = useAuth()
  const [posts,     setPosts]     = useState([])
  const [staffList, setStaffList] = useState([])
  const [input,     setInput]     = useState('')
  const [target,    setTarget]    = useState('all')   // 'all' | uid
  const [posting,   setPosting]   = useState(false)
  const [tab,       setTab]       = useState('inbox') // inbox | sent

  useEffect(() => {
    getDocs(collection(db,'facilities',FACILITY_ID,'staff')).then(s => {
      setStaffList(s.docs.filter(d => d.data().active && d.id !== user?.uid).map(d => ({ id:d.id, ...d.data() })))
    })

    const q = query(
      collection(db,'facilities',FACILITY_ID,'memos'),
      orderBy('createdAt','desc')
    )
    const unsub = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    })
    return () => unsub()
  }, [user?.uid])

  // 自分宛 or 全体のメモ（受信箱）
  const inbox = posts.filter(p =>
    p.target === 'all' || p.targetUid === user?.uid
  )
  // 自分が送ったメモ（送信箱）
  const sent = posts.filter(p => p.authorUid === user?.uid)

  const displayed = tab === 'inbox' ? inbox : sent

  const submit = async () => {
    const text = input.trim()
    if (!text || posting) return
    setPosting(true)

    const targetStaff = staffList.find(s => s.id === target)
    await addDoc(collection(db,'facilities',FACILITY_ID,'memos'), {
      text,
      authorUid:    user.uid,
      authorName:   profile?.name || '',
      authorHira:   profile?.hiraganaName || '',
      target:       target === 'all' ? 'all' : 'individual',
      targetUid:    target === 'all' ? null : target,
      targetName:   target === 'all' ? '全員' : (targetStaff?.name || ''),
      createdAt:    serverTimestamp(),
      readBy:       [user.uid],  // 送信者は既読
    })
    setInput('')
    setPosting(false)
  }

  const markRead = async (postId) => {
    if (!user?.uid) return
    const ref = doc(db,'facilities',FACILITY_ID,'memos',postId)
    await updateDoc(ref, { readBy: arrayUnion(user.uid) })
  }

  const isUnread = (post) =>
    !(post.readBy || []).includes(user?.uid)

  const unreadCount = inbox.filter(isUnread).length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* ヘッダー */}
      <div style={{ padding:'14px 16px 10px', background:`linear-gradient(135deg,${C.primaryLight},${C.bg})`, borderBottom:`1.5px solid ${C.primary}33`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:19, fontWeight:800, color:C.text }}>📝 つなぎメモ</div>
            <div style={{ fontSize:13, color:C.sub, marginTop:2 }}>職員間の申し送り・メモ</div>
          </div>
          {unreadCount > 0 && (
            <div style={{ background:C.coral, color:'#fff', borderRadius:99, padding:'5px 12px', fontSize:13, fontWeight:700 }}>
              未読 {unreadCount}件
            </div>
          )}
        </div>

        {/* タブ */}
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          {[['inbox','受信箱 📥'],['sent','送信済み 📤']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex:1, padding:'8px', borderRadius:10, border:`1.5px solid ${tab===id?C.primary:C.border}`, background:tab===id?C.primaryLight:'transparent', fontSize:13, fontWeight:tab===id?700:400, color:tab===id?C.primaryDark:C.sub, cursor:'pointer', fontFamily:FONT }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* メモ一覧 */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px' }}>
        {displayed.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 20px', color:C.muted }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📝</div>
            <div style={{ fontSize:15 }}>{tab==='inbox' ? 'メモはありません' : 'まだ送信したメモがありません'}</div>
          </div>
        )}

        {displayed.map(post => {
          const unread   = isUnread(post)
          const readCount = (post.readBy || []).length - 1  // 送信者除く
          const isMine   = post.authorUid === user?.uid
          const displayAuthor = post.authorHira
            ? `${post.authorHira.split(' ')[0]}先生`
            : (post.authorName || '不明')

          return (
            <div key={post.id}
              onClick={() => unread && markRead(post.id)}
              style={{ background:C.card, borderRadius:18, padding:14, marginBottom:10, border:`1.5px solid ${unread && !isMine ? C.primary : C.border}`, cursor:unread && !isMine ? 'pointer' : 'default', position:'relative' }}>

              {/* 未読バッジ */}
              {unread && !isMine && (
                <div style={{ position:'absolute', top:12, right:12, background:C.primary, color:'#fff', borderRadius:99, padding:'2px 8px', fontSize:11, fontWeight:700 }}>
                  NEW
                </div>
              )}

              {/* ヘッダー */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:C.primaryLight, border:`2px solid ${C.primary}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:C.primaryDark, flexShrink:0 }}>
                  {(post.authorName||'?')[0]}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{displayAuthor}</div>
                  <div style={{ fontSize:11, color:C.muted }}>
                    {post.createdAt?.toDate?.()?.toLocaleString('ja-JP') || ''}
                  </div>
                </div>
                {/* 宛先 */}
                <div style={{ background: post.target==='all' ? C.primaryLight : C.amberLight, color: post.target==='all' ? C.primaryDark : '#B07800', borderRadius:99, padding:'4px 10px', fontSize:12, fontWeight:600 }}>
                  {post.target==='all' ? '📢 全員へ' : `→ ${post.targetName}さん`}
                </div>
              </div>

              {/* 本文 */}
              <div style={{ fontSize:15, color:C.text, lineHeight:1.75, whiteSpace:'pre-wrap', marginBottom:10 }}>
                {post.text}
              </div>

              {/* 既読状況 */}
              <div style={{ fontSize:11, color:C.muted, display:'flex', alignItems:'center', gap:6 }}>
                <span>✓</span>
                <span>
                  {readCount > 0
                    ? `${readCount}人が読みました`
                    : unread && !isMine ? 'タップして既読にする' : 'まだ読まれていません'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 投稿エリア */}
      <div style={{ padding:'12px 16px', background:C.card, borderTop:`1.5px solid ${C.border}`, flexShrink:0 }}>
        {/* 宛先選択 */}
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:12, color:C.sub, marginBottom:5 }}>宛先を選んでください</div>
          <select value={target} onChange={e => setTarget(e.target.value)}
            style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:FONT, background:C.card, color:C.text, outline:'none' }}>
            <option value="all">📢 全員へ</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>
                → {s.hiraganaName ? `${s.hiraganaName.split(' ')[0]}先生` : s.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key==='Enter' && e.metaKey && submit()}
            placeholder="つなぎたいことを書いてください…"
            rows={2}
            style={{ flex:1, padding:'10px 12px', borderRadius:12, border:`2px solid ${input ? C.primary : C.border}`, fontSize:14, fontFamily:FONT, resize:'none', outline:'none', lineHeight:1.5, color:C.text }}
          />
          <button onClick={submit} disabled={!input.trim()||posting}
            style={{ width:46, height:46, borderRadius:13, border:'none', background:(!input.trim()||posting) ? C.bg : C.primary, cursor:(!input.trim()||posting) ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={(!input.trim()||posting)?C.muted:'#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
