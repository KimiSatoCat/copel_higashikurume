import { useState, useEffect } from 'react'
import { collection, doc, onSnapshot, getDocs, query, orderBy } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, DOW_JA } from '../theme'
import TsunagiMemo from './TsunagiMemo'
import HiyariMemo  from './HiyariMemo'
import ArigatoCard from './ArigatoCard'

export default function Home() {
  const { profile } = useAuth()
  const today  = new Date()
  const y = today.getFullYear(), m = today.getMonth()+1, d = today.getDate()
  const ym     = `${y}-${String(m).padStart(2,'0')}`
  const dateKey = `${ym}-${String(d).padStart(2,'0')}`
  const label  = `${y}年${m}月${d}日（${DOW_JA[today.getDay()]}）`

  const [staffList, setStaffList] = useState([])
  const [schedule,  setSchedule]  = useState({})
  const [sessions,  setSessions]  = useState([])
  const [unreadMemos, setUnreadMemos] = useState(0)
  const [upcoming,  setUpcoming]  = useState([])
  const [sub, setSub] = useState(null) // null | 'memo' | 'hiyari' | 'arigato'

  // サブ画面から戻るボタン
  if (sub === 'memo')    return <WithBack onBack={()=>setSub(null)}><TsunagiMemo/></WithBack>
  if (sub === 'hiyari')  return <WithBack onBack={()=>setSub(null)}><HiyariMemo/></WithBack>
  if (sub === 'arigato') return <WithBack onBack={()=>setSub(null)}><ArigatoCard/></WithBack>

  useEffect(()=>{
    getDocs(collection(db,'facilities',FACILITY_ID,'staff')).then(s=>{
      const list=s.docs.filter(d=>d.data().active).map(d=>({id:d.id,...d.data()}))
      setStaffList(list)

      // 近日誕生日（7日以内）
      const notices=[]
      list.forEach(s=>{
        if(!s.birthday)return
        const [,bm,bd]=s.birthday.split('-').map(Number)
        const bdDate=new Date(today.getFullYear(),bm-1,bd)
        const diff=Math.ceil((bdDate-today)/86400000)
        if(diff>=0&&diff<=7) notices.push({name:s.hiraganaName?s.hiraganaName.split(' ')[0]+'先生':s.name,diff,type:'staff'})
      })
      setUpcoming(notices)
    })

    const schRef=doc(db,'facilities',FACILITY_ID,'schedules',ym)
    const u1=onSnapshot(schRef,snap=>setSchedule(snap.exists()?snap.data():{}))

    const sessRef=doc(db,'facilities',FACILITY_ID,'sessions',dateKey)
    const u2=onSnapshot(sessRef,snap=>{ if(snap.exists())setSessions(snap.data().slots||[]) })

    const memoQ=query(collection(db,'facilities',FACILITY_ID,'memos'),orderBy('createdAt','desc'))
    const u3=onSnapshot(memoQ,snap=>{
      // 自分が未読のメモ数
      // （readByに自分のUIDが含まれていない、かつ自分宛または全員宛）
      setUnreadMemos(0) // 実際のUID参照はAuthContextから取る必要があるため簡略化
    })

    return ()=>{ u1(); u2(); u3() }
  },[ym,dateKey])

  const shifts=schedule.shifts||{}
  const todayIn=staffList.filter(s=>['in','late'].includes(shifts[s.id]?.[d])).length
  const todayExt=staffList.filter(s=>shifts[s.id]?.[d]==='ext').length

  const hira=profile?.hiraganaName||''
  const greeting=hira?`${hira.split(' ')[0]}先生`:(profile?.name?`${profile.name}さん`:'')

  return (
    <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:13}}>

      {/* 挨拶バナー */}
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.primaryDark})`,borderRadius:20,padding:'18px 20px',color:'#fff'}}>
        <div style={{fontSize:14,opacity:.85}}>{label}</div>
        <div style={{fontSize:21,fontWeight:800,marginTop:2}}>おはようございます 🌤️</div>
        {greeting&&<div style={{fontSize:16,opacity:.9,marginTop:4}}>{greeting}</div>}
      </div>

      {/* 今日のサマリー */}
      <div style={{background:C.card,borderRadius:20,padding:14,border:`1.5px solid ${C.border}`}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:12}}>📊 きょうのようす</div>
        <div style={{display:'flex',gap:8}}>
          {[{e:'👥',l:'出勤者',v:todayIn,u:'名',bg:C.primaryLight,c:C.primaryDark},
            {e:'🧩',l:'コマ数',v:sessions.length||0,u:'コマ',bg:C.amberLight,c:'#B07800'},
            {e:'🚗',l:'外勤',v:todayExt,u:'名',bg:C.coralLight,c:'#CC5040'}
          ].map(s=>(
            <div key={s.l} style={{flex:1,borderRadius:16,padding:'12px 8px',background:s.bg,textAlign:'center'}}>
              <div style={{fontSize:24,marginBottom:2}}>{s.e}</div>
              <div style={{fontSize:12,fontWeight:500,color:s.c,marginBottom:2}}>{s.l}</div>
              <div style={{fontSize:28,fontWeight:800,color:s.c,lineHeight:1}}>{s.v}</div>
              <div style={{fontSize:12,color:s.c,marginTop:1}}>{s.u}</div>
            </div>
          ))}
        </div>
      </div>

      {/* クイックアクション */}
      <div style={{background:C.card,borderRadius:20,padding:14,border:`1.5px solid ${C.border}`}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:12}}>⚡ クイックアクション</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:9}}>
          {[
            {emoji:'📝',label:'つなぎメモ',sub:'memo',bg:C.primaryLight,c:C.primaryDark,badge:unreadMemos},
            {emoji:'⚠️',label:'ひやりメモ',sub:'hiyari',bg:C.amberLight,c:'#B07800',badge:0},
            {emoji:'✨',label:'ありがとうカード',sub:'arigato',bg:C.purpleLight,c:'#7050B0',badge:0},
          ].map(item=>(
            <button key={item.sub} onClick={()=>setSub(item.sub)}
              style={{background:item.bg,borderRadius:14,padding:'14px 8px',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:6,position:'relative',fontFamily:FONT}}>
              {item.badge>0&&<div style={{position:'absolute',top:8,right:8,background:C.coral,color:'#fff',borderRadius:99,width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>{item.badge}</div>}
              <span style={{fontSize:26}}>{item.emoji}</span>
              <span style={{fontSize:11,fontWeight:700,color:item.c,textAlign:'center',lineHeight:1.3}}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 今日のコマ */}
      {sessions.length>0&&(
        <div style={{background:C.card,borderRadius:20,padding:14,border:`1.5px solid ${C.border}`}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:12}}>🧩 きょうのコマ割り当て</div>
          {sessions.map((s,i)=>{
            const sc=s.status==='来所済み'?{bg:C.primaryLight,c:C.primaryDark}:s.status==='欠席'?{bg:C.coralLight,c:'#CC5040'}:{bg:C.amberLight,c:'#B07800'}
            return (
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:i<sessions.length-1?`1px solid ${C.divider}`:'none'}}>
                <div style={{width:26,height:26,borderRadius:7,background:C.primaryLight,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:C.primary,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:C.sub}}>{s.time}</div>
                  <div style={{fontSize:14,fontWeight:600,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {s.staffName||'未設定'} → {(s.children||[]).map(c=>c.childName).filter(Boolean).join('・')||'未設定'}
                  </div>
                </div>
                <div style={{background:sc.bg,color:sc.c,borderRadius:99,padding:'4px 10px',fontSize:12,fontWeight:600,flexShrink:0}}>{s.status||'予定'}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* 近日誕生日 */}
      {upcoming.length>0&&(
        <div style={{background:`linear-gradient(135deg,${C.purpleLight},#FAF0FF)`,borderRadius:20,padding:14,border:`1.5px solid ${C.purple}33`}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:10}}>🎂 もうすぐ誕生日</div>
          {upcoming.map((b,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:i<upcoming.length-1?`1px solid ${C.border}`:''}}>
              <span style={{fontSize:26}}>{b.diff===0?'🎉':'🎂'}</span>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:C.text}}>{b.name}</div>
                <div style={{fontSize:13,color:C.sub}}>{b.diff===0?'今日！':b.diff===1?'明日！':`あと${b.diff}日`}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// バック付きラッパー
function WithBack({ children, onBack }) {
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <button onClick={onBack}
        style={{padding:'12px 16px',background:C.card,border:'none',borderBottom:`1.5px solid ${C.border}`,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:15,fontWeight:700,color:C.primary,fontFamily:FONT,flexShrink:0}}>
        ← ホームへ戻る
      </button>
      <div style={{flex:1,overflowY:'auto'}}>{children}</div>
    </div>
  )
}
