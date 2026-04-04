import { useState, useEffect } from 'react'
import {
  collection, doc, addDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp, query, orderBy, deleteDoc
} from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT } from '../theme'

export default function IdeaPost() {
  const { user, profile, can, role } = useAuth()
  const [posts,    setPosts]    = useState([])
  const [input,    setInput]    = useState('')
  const [posting,  setPosting]  = useState(false)
  const [openComments, setOpenComments] = useState({})
  const [commentInputs, setCommentInputs] = useState({})

  useEffect(() => {
    // 古い順（新しいメッセージが下に表示される）
    const q = query(collection(db,'facilities',FACILITY_ID,'ideas'), orderBy('createdAt','asc'))
    const unsub = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  const submit = async () => {
    const text = input.trim()
    if (!text || posting) return
    setPosting(true)
    setInput('')

    // Slackへの通知とFirestore保存を並行実行（互いに依存しない）
    const slackPromise = fetch('/api/slack-idea', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'copelplus_internal_2026' },
      body: JSON.stringify({ text }),
    }).then(r => r.json()).then(d => console.log('[IdeaPost] Slack:', d)).catch(e => console.warn('[IdeaPost] Slack error:', e.message))

    const firestorePromise = addDoc(collection(db,'facilities',FACILITY_ID,'ideas'), {
      text,
      createdAt:    serverTimestamp(),
      likes:        [],
      funnys:       [],
      comments:     [],
    }).catch(e => console.error('[IdeaPost] Firestore error:', e.message))

    await Promise.allSettled([slackPromise, firestorePromise])
    setPosting(false)
  }

  const toggleReaction = async (postId, field) => {
    const post = posts.find(p => p.id === postId)
    if (!post) return
    const arr   = post[field] || []
    const ref   = doc(db,'facilities',FACILITY_ID,'ideas',postId)
    const has   = arr.includes(user.uid)
    await updateDoc(ref, { [field]: has ? arrayRemove(user.uid) : arrayUnion(user.uid) })
  }

  const addComment = async (postId) => {
    const text = (commentInputs[postId]||'').trim()
    if (!text) return
    const ref = doc(db,'facilities',FACILITY_ID,'ideas',postId)
    const comment = {
      uid:       user.uid,
      name:      profile?.name || user?.displayName || '職員',
      hiragana:  profile?.hiraganaName || '',
      text,
      createdAt: new Date().toISOString(),
    }
    await updateDoc(ref, { comments: arrayUnion(comment) })
    setCommentInputs(p => ({...p, [postId]:''}))
  }

  const toggleComments = (postId) => {
    setOpenComments(p => ({...p, [postId]: !p[postId]}))
  }

  const deletePost = async (postId) => {
    await deleteDoc(doc(db,'facilities',FACILITY_ID,'ideas',postId))
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* ヘッダー */}
      <div style={{ padding:'14px 16px 10px', background:`linear-gradient(135deg,${C.amberLight},${C.bg})`, borderBottom:`1.5px solid ${C.amber}33`, flexShrink:0 }}>
        <div style={{ fontSize:19, fontWeight:800, color:C.text }}>📬 アイデアポスト</div>
        <div style={{ fontSize:13, color:C.sub, marginTop:3 }}>匿名で意見・アイデア・感想を投稿できます</div>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <div style={{ background:C.primaryLight, borderRadius:8, padding:'4px 10px', fontSize:12, color:C.primaryDark }}>👍 いいね</div>
          <div style={{ background:C.amberLight, borderRadius:8, padding:'4px 10px', fontSize:12, color:'#7A5000' }}>🤣 うけるね</div>
          <div style={{ background:C.bg, borderRadius:8, padding:'4px 10px', fontSize:12, color:C.sub }}>💬 コメント</div>
        </div>
      </div>

      {/* 投稿一覧 */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px' }}>
        {posts.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 20px', color:C.muted }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📬</div>
            <div style={{ fontSize:15 }}>まだ投稿がありません</div>
            <div style={{ fontSize:13, marginTop:4 }}>下の入力欄から最初の投稿をどうぞ！</div>
          </div>
        )}

        {posts.map(post => {
          const myLike   = (post.likes   || []).includes(user.uid)
          const myFunny  = (post.funnys  || []).includes(user.uid)
          const likeCount  = (post.likes  || []).length
          const funnyCount = (post.funnys || []).length
          const comments   = post.comments || []
          const isOpen     = openComments[post.id]

          return (
            <div key={post.id} style={{ background:C.card, borderRadius:18, padding:14, marginBottom:12, border:`1.5px solid ${C.border}` }}>
              {/* 投稿本文 */}
              <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:12 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:C.primaryLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                  📬
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>
                    {post.createdAt?.toDate?.()?.toLocaleDateString('ja-JP') || ''}
                  </div>
                  <div style={{ fontSize:15, color:C.text, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{post.text}</div>
                </div>
              </div>

              {/* リアクションボタン */}
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button onClick={() => toggleReaction(post.id,'likes')}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:99, border:`1.5px solid ${myLike?C.primary:C.border}`, background:myLike?C.primaryLight:'transparent', cursor:'pointer', fontFamily:FONT }}>
                  <span style={{ fontSize:16 }}>👍</span>
                  <span style={{ fontSize:13, fontWeight:700, color:myLike?C.primaryDark:C.sub }}>{likeCount}</span>
                </button>

                <button onClick={() => toggleReaction(post.id,'funnys')}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:99, border:`1.5px solid ${myFunny?C.amber:C.border}`, background:myFunny?C.amberLight:'transparent', cursor:'pointer', fontFamily:FONT }}>
                  <span style={{ fontSize:16 }}>🤣</span>
                  <span style={{ fontSize:13, fontWeight:700, color:myFunny?'#B07800':C.sub }}>{funnyCount}</span>
                </button>

                <button onClick={() => toggleComments(post.id)}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:99, border:`1.5px solid ${isOpen?C.primary:C.border}`, background:isOpen?C.primaryLight:'transparent', cursor:'pointer', fontFamily:FONT, marginLeft:'auto' }}>
                  <span style={{ fontSize:14 }}>💬</span>
                  <span style={{ fontSize:13, fontWeight:700, color:isOpen?C.primaryDark:C.sub }}>{comments.length}</span>
                </button>

                {/* 削除ボタン（開発者・責任者のみ） */}
                {['developer','admin','sub_admin'].includes(role) && (
                  <button onClick={() => deletePost(post.id)}
                    style={{ width:30, height:30, borderRadius:'50%', border:`1.5px solid ${C.coral}44`, background:C.coralLight, color:C.coral, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    🗑
                  </button>
                )}
              </div>

              {/* コメントセクション */}
              {isOpen && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.divider}` }}>
                  {comments.map((c, ci) => {
                    const displayName = c.hiragana ? `${c.hiragana.split(' ')[0]}先生` : (c.name || '職員')
                    return (
                      <div key={ci} style={{ display:'flex', gap:8, marginBottom:10 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', background:C.primaryLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:C.primaryDark, flexShrink:0 }}>
                          {(c.name||'職')[0]}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11, color:C.sub, marginBottom:2 }}>{displayName}  ·  {c.createdAt?.slice(0,10)||''}</div>
                          <div style={{ fontSize:14, color:C.text, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{c.text}</div>
                        </div>
                      </div>
                    )
                  })}

                  {/* コメント入力 */}
                  <div style={{ display:'flex', gap:7, marginTop:6 }}>
                    <input
                      value={commentInputs[post.id]||''}
                      onChange={e => setCommentInputs(p=>({...p,[post.id]:e.target.value}))}
                      onKeyDown={e => e.key==='Enter' && addComment(post.id)}
                      placeholder="コメントを書く…"
                      style={{ flex:1, padding:'9px 12px', borderRadius:99, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:FONT, outline:'none', color:C.text }}
                    />
                    <button onClick={() => addComment(post.id)}
                      style={{ padding:'9px 14px', borderRadius:99, border:'none', background:C.primary, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT, flexShrink:0 }}>
                      送信
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 投稿入力エリア */}
      <div style={{ padding:'10px 14px', background:C.card, borderTop:`1.5px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="アイデア・意見・感想を書いてください（匿名で投稿されます）"
            rows={2}
            onKeyDown={e => { if(e.key==='Enter' && e.metaKey) submit() }}
            style={{ flex:1, padding:'10px 12px', borderRadius:14, border:`2px solid ${input?C.amber:C.border}`, fontSize:14, fontFamily:FONT, resize:'none', outline:'none', lineHeight:1.5, color:C.text }}
          />
          <button onClick={submit} disabled={!input.trim()||posting}
            style={{ width:44, height:44, borderRadius:14, border:'none', background:(!input.trim()||posting)?C.bg:C.amber, cursor:(!input.trim()||posting)?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={(!input.trim()||posting)?C.muted:'#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:5, textAlign:'center' }}>投稿者名は表示されません（匿名）</div>
      </div>
    </div>
  )
}
