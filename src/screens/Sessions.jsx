import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc, collection, getDocs } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, DOW_JA } from '../theme'

const STATUS_CFG = {
  '来所済み': { bg:C.primaryLight, c:C.primaryDark, border:C.primary },
  '予定':     { bg:C.amberLight,   c:'#B07800',     border:C.amber },
  '欠席':     { bg:C.coralLight,   c:'#CC5040',     border:C.coral },
}
const SLOT_TIMES = ['10:00〜11:00','11:15〜12:15','14:30〜15:30','15:45〜16:45','17:00〜18:00']
const EMPTY_CHILD = { childId:'', childName:'', status:'予定', comment:'' }

const makeSlots = () => SLOT_TIMES.map((t,i)=>({
  slot:i+1, time:t, type:'個別', staffId:'', staffName:'',
  children:[{ ...EMPTY_CHILD }], groupMemo:'', memos:[],
}))

export default function Sessions() {
  const { profile, can } = useAuth()
  const today   = new Date()
  const dateKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const label   = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${DOW_JA[today.getDay()]}）`

  const [slots,     setSlots]     = useState(makeSlots())
  const [staffList, setStaffList] = useState([])
  const [children,  setChildren]  = useState([])
  const [memoInput, setMemoInput] = useState({})

  useEffect(()=>{
    getDocs(collection(db,'facilities',FACILITY_ID,'staff')).then(s=>setStaffList(s.docs.filter(d=>d.data().active).map(d=>({id:d.id,...d.data()}))))
    getDocs(collection(db,'facilities',FACILITY_ID,'children')).then(s=>setChildren(s.docs.map(d=>({id:d.id,...d.data()}))))
    const ref=doc(db,'facilities',FACILITY_ID,'sessions',dateKey)
    const unsub=onSnapshot(ref,snap=>{
      if(snap.exists()&&snap.data().slots) setSlots(prev=>prev.map((s,i)=>({...s,...snap.data().slots[i]})))
    })
    return ()=>unsub()
  },[dateKey])

  const save=async(updated)=>{
    await setDoc(doc(db,'facilities',FACILITY_ID,'sessions',dateKey),{slots:updated,date:dateKey},{merge:true})
  }

  const updateSlot=(i,field,value)=>{
    setSlots(prev=>{ const n=prev.map((s,idx)=>idx===i?{...s,[field]:value}:s); if(field!=='memos')save(n); return n })
  }

  const updateChild=(slotIdx,childIdx,field,value)=>{
    setSlots(prev=>{
      const n=prev.map((s,si)=>{
        if(si!==slotIdx) return s
        const nc=[...s.children]
        if(field==='childId'){ const c=children.find(x=>x.id===value); nc[childIdx]={...nc[childIdx],childId:value,childName:c?.name||''} }
        else nc[childIdx]={...nc[childIdx],[field]:value}
        return {...s,children:nc}
      })
      save(n); return n
    })
  }

  const addChild=(slotIdx)=>{
    setSlots(prev=>{
      const n=prev.map((s,si)=>si===slotIdx&&s.children.length<5?{...s,children:[...s.children,{...EMPTY_CHILD}]}:s)
      save(n); return n
    })
  }

  const removeChild=(slotIdx,childIdx)=>{
    setSlots(prev=>{
      const n=prev.map((s,si)=>si===slotIdx&&s.children.length>1?{...s,children:s.children.filter((_,ci)=>ci!==childIdx)}:s)
      save(n); return n
    })
  }

  const addMemo=(i)=>{
    const text=(memoInput[i]||'').trim(); if(!text)return
    const memo={text,author:profile?.name||'不明',createdAt:new Date().toISOString()}
    setSlots(prev=>{ const n=prev.map((s,idx)=>idx===i?{...s,memos:[...(s.memos||[]),memo]}:s); save(n); return n })
    setMemoInput(prev=>({...prev,[i]:''}))
  }

  return (
    <div style={{padding:'16px'}}>
      <div style={{fontSize:19,fontWeight:800,color:C.text,marginBottom:4}}>🧩 だれが・どのコマ・どの子ども</div>
      <div style={{fontSize:13,color:C.sub,marginBottom:16}}>{label}</div>

      {slots.map((s,i)=>{
        const isMySlot=s.staffId===profile?.uid||can.editSchedule()
        return (
          <div key={i} style={{background:C.card,borderRadius:20,padding:14,marginBottom:12,border:`1.5px solid ${C.border}`}}>

            {/* コマヘッダー */}
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <div style={{width:34,height:34,borderRadius:10,background:C.primaryLight,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,color:C.primary}}>{s.slot}</div>
              <div>
                <div style={{fontSize:12,color:C.sub}}>コマ{s.slot}</div>
                <div style={{fontSize:14,fontWeight:600,color:C.text}}>{s.time}</div>
              </div>
              {/* タイプ切り替え */}
              <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                {['個別','集団'].map(t=>(
                  <button key={t} onClick={()=>can.editSchedule()&&updateSlot(i,'type',t)}
                    style={{padding:'5px 12px',borderRadius:99,border:`1.5px solid ${s.type===t?t==='集団'?C.amber:C.primary:C.border}`,background:s.type===t?t==='集団'?C.amberLight:C.primaryLight:'transparent',fontSize:12,fontWeight:s.type===t?700:400,color:s.type===t?t==='集団'?'#B07800':C.primaryDark:C.sub,cursor:'pointer',fontFamily:FONT}}>
                    {t==='集団'?'🏫 集団':'👤 個別'}
                  </button>
                ))}
              </div>
            </div>

            {/* 担当職員 */}
            <div style={{background:C.bg,borderRadius:12,padding:'10px',marginBottom:10}}>
              <div style={{fontSize:12,color:C.sub,marginBottom:5}}>👩‍🏫 担当職員</div>
              {can.editSchedule()?(
                <select value={s.staffId} onChange={e=>{const st=staffList.find(x=>x.id===e.target.value);updateSlot(i,'staffId',e.target.value);updateSlot(i,'staffName',st?.name||'')}}
                  style={{width:'100%',padding:'8px',borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:14,fontFamily:FONT,background:C.card,color:C.text,outline:'none'}}>
                  <option value="">選んでください</option>
                  {staffList.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              ):(
                <div style={{fontSize:14,fontWeight:600,color:C.text}}>{s.staffName||'未設定'}</div>
              )}
            </div>

            {/* 集団の場合：説明バナー */}
            {s.type==='集団'&&(
              <div style={{background:'#FFF8E1',borderRadius:10,padding:'8px 12px',marginBottom:10,border:`1px solid ${C.amber}44`,fontSize:13,color:'#7A5000'}}>
                🏫 集団セッション — 複数の子どもが同じコマに参加します（最大5名）
              </div>
            )}

            {/* 子ども一覧 */}
            {s.children.map((ch,ci)=>{
              const sc=STATUS_CFG[ch.status]||STATUS_CFG['予定']
              return (
                <div key={ci} style={{background:C.bg,borderRadius:12,padding:'10px',marginBottom:8,border:`1px solid ${C.border}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                    <div style={{width:22,height:22,borderRadius:'50%',background:C.amberLight,border:`1.5px solid ${C.amber}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#B07800',flexShrink:0}}>{ci+1}</div>
                    <div style={{flex:1}}>
                      {can.editSchedule()?(
                        <select value={ch.childId} onChange={e=>updateChild(i,ci,'childId',e.target.value)}
                          style={{width:'100%',padding:'7px 8px',borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:FONT,background:C.card,color:C.text,outline:'none'}}>
                          <option value="">子どもを選ぶ</option>
                          {children.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      ):(
                        <div style={{fontSize:14,fontWeight:600,color:C.text}}>{ch.childName||'未設定'}</div>
                      )}
                    </div>
                    {/* 出欠 */}
                    <div style={{background:sc.bg,color:sc.c,borderRadius:99,padding:'4px 10px',fontSize:12,fontWeight:600,flexShrink:0}}>{ch.status}</div>
                    {/* 削除ボタン（集団 + 2人以上の場合） */}
                    {s.type==='集団'&&s.children.length>1&&can.editSchedule()&&(
                      <button onClick={()=>removeChild(i,ci)} style={{width:22,height:22,borderRadius:'50%',border:`1.5px solid ${C.coral}`,background:C.coralLight,color:C.coral,fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                    )}
                  </div>

                  {/* 出欠ボタン */}
                  {isMySlot&&(
                    <div style={{display:'flex',gap:5,marginBottom:8}}>
                      {['来所済み','予定','欠席'].map(st=>{
                        const cfg=STATUS_CFG[st]; const on=ch.status===st
                        return <button key={st} onClick={()=>updateChild(i,ci,'status',st)} style={{flex:1,padding:'7px 4px',borderRadius:8,border:`1.5px solid ${on?cfg.border:C.border}`,background:on?cfg.bg:'transparent',fontSize:12,fontWeight:on?700:400,color:on?cfg.c:C.sub,cursor:'pointer',fontFamily:FONT}}>{st}</button>
                      })}
                    </div>
                  )}

                  {/* 職員コメント */}
                  <textarea
                    value={ch.comment||''}
                    onChange={e=>updateChild(i,ci,'comment',e.target.value)}
                    placeholder={`${ch.childName||'この子ども'}への職員コメント（例：今日は積極的に参加できました）`}
                    rows={2}
                    style={{width:'100%',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:FONT,resize:'vertical',outline:'none',lineHeight:1.5,color:C.text,background:C.card,boxSizing:'border-box'}}
                  />
                </div>
              )
            })}

            {/* 集団：子ども追加ボタン */}
            {s.type==='集団'&&s.children.length<5&&can.editSchedule()&&(
              <button onClick={()=>addChild(i)}
                style={{width:'100%',padding:'9px',borderRadius:10,border:`1.5px dashed ${C.amber}`,background:'transparent',fontSize:13,fontWeight:600,color:'#B07800',cursor:'pointer',fontFamily:FONT,marginBottom:8}}>
                ＋ 子どもを追加（{s.children.length}/5名）
              </button>
            )}

            {/* 集団メモ */}
            {s.type==='集団'&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:12,color:C.sub,marginBottom:5}}>📋 集団全体への所見</div>
                <textarea
                  value={s.groupMemo||''}
                  onChange={e=>updateSlot(i,'groupMemo',e.target.value)}
                  placeholder="グループ全体の様子・気づきを記入してください"
                  rows={2}
                  style={{width:'100%',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${C.amber}44`,fontSize:13,fontFamily:FONT,resize:'vertical',outline:'none',lineHeight:1.5,color:C.text,background:C.amberLight,boxSizing:'border-box'}}
                />
              </div>
            )}

            {/* メモ（全職員記入可） */}
            <div style={{borderTop:`1px solid ${C.divider}`,paddingTop:10}}>
              <div style={{fontSize:12,color:C.sub,marginBottom:6}}>📝 申し送りメモ（全職員が記入できます）</div>
              {(s.memos||[]).map((m,mi)=>(
                <div key={mi} style={{background:C.bg,borderRadius:8,padding:'7px 10px',marginBottom:5}}>
                  <div style={{fontSize:10,color:C.muted,marginBottom:1}}>{m.author} · {m.createdAt?.slice(0,10)}</div>
                  <div style={{fontSize:13,color:C.text,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{m.text}</div>
                </div>
              ))}
              <div style={{display:'flex',gap:7}}>
                <input value={memoInput[i]||''} onChange={e=>setMemoInput(p=>({...p,[i]:e.target.value}))} placeholder="メモを書く…" onKeyDown={e=>e.key==='Enter'&&addMemo(i)} style={{flex:1,padding:'8px 12px',borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:FONT,outline:'none',color:C.text}}/>
                <button onClick={()=>addMemo(i)} style={{padding:'8px 14px',borderRadius:10,border:'none',background:C.primary,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:FONT}}>追加</button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
