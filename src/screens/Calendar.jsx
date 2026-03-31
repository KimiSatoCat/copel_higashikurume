import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc, getDoc, collection, getDocs } from 'firebase/firestore'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { db, FACILITY_ID, auth, provider } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, SHIFT, DOW_JA } from '../theme'

const SHIFT_OPTS = ['in','late','ext','off']
const HOLIDAYS = new Set(['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03','2027-11-23','2028-01-01','2028-01-10','2028-02-11','2028-02-23','2028-03-20','2028-04-29','2028-05-03','2028-05-04','2028-05-05','2028-07-17','2028-08-11','2028-09-18','2028-09-22','2028-10-09','2028-11-03','2028-11-23','2029-01-01','2029-01-08','2029-02-11','2029-02-23','2029-03-20','2029-04-29','2029-05-03','2029-05-04','2029-05-05','2030-01-01','2030-01-14','2030-02-11','2030-02-23','2030-03-20','2030-04-29','2030-05-03','2030-05-04','2030-05-05','2031-01-01','2031-01-13','2031-02-11','2031-02-23','2031-03-21','2031-04-29','2031-05-03','2031-05-04','2031-05-05','2032-01-01','2032-01-12','2032-02-11','2032-02-23','2032-03-20','2032-04-29','2032-05-03','2032-05-04','2032-05-05','2033-01-01','2033-01-10','2033-02-11','2033-02-23','2033-03-20','2033-04-29','2033-05-03','2033-05-04','2033-05-05','2034-01-01','2034-01-09','2034-02-11','2034-02-23','2034-03-20','2034-04-29','2034-05-03','2034-05-04','2034-05-05','2035-01-01','2035-01-08','2035-02-11','2035-02-23','2035-03-21','2035-04-29','2035-05-03','2035-05-04','2035-05-05'])

function dateStr(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
function isHoliday(y,m,d){ return HOLIDAYS.has(dateStr(y,m,d)) }
function rowBg(y,m,d){ const dow=new Date(y,m-1,d).getDay(); if(dow===0||isHoliday(y,m,d)) return '#FFECEA'; if(dow===6) return '#E3F2FD'; if(dow===3) return '#FFFDE7'; return null }

export default function Calendar() {
  const { can } = useAuth()
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()+1)
  const [staffList, setStaffList] = useState([])
  const [schedule,  setSchedule]  = useState({shifts:{},events:{}})
  const [editMode,  setEditMode]  = useState(false)
  const [modalDay,  setModalDay]  = useState(null)
  const [eventInput,setEventInput]= useState('')
  const [syncStatus,setSyncStatus]= useState('')
  const [bdayMap,   setBdayMap]   = useState({})
  const unsubRef = useRef(null)

  const ym = `${year}-${String(month).padStart(2,'0')}`
  const dim = new Date(year,month,0).getDate()
  const days = Array.from({length:dim},(_,i)=>i+1)

  useEffect(()=>{
    if(unsubRef.current) unsubRef.current()
    getDocs(collection(db,'facilities',FACILITY_ID,'staff')).then(snap=>{
      const list=snap.docs.filter(d=>d.data().active).map(d=>({id:d.id,...d.data()}))
      setStaffList(list)
      const map={}
      list.forEach(s=>{
        if(!s.birthday) return
        const parts=s.birthday.split('-')
        const bm=parseInt(parts[1]),bd=parseInt(parts[2])
        if(bm===month)(map[bd]=map[bd]||[]).push({name:(s.hiraganaName||s.name||'').split(' ')[0],type:'staff'})
      })
      setBdayMap(map)
    })
    const ref=doc(db,'facilities',FACILITY_ID,'schedules',ym)
    unsubRef.current=onSnapshot(ref,snap=>{ setSchedule(snap.exists()?snap.data():{shifts:{},events:{}}) })
    return ()=>{ if(unsubRef.current) unsubRef.current() }
  },[ym,month,year])

  const prevMonth=()=>{ if(month===1){setYear(y=>y-1);setMonth(12)}else setMonth(m=>m-1) }
  const nextMonth=()=>{ if(month===12){setYear(y=>y+1);setMonth(1)}else setMonth(m=>m+1) }
  const goToday=()=>{ setYear(today.getFullYear()); setMonth(today.getMonth()+1) }

  const updateShift=async(staffId,day,val)=>{
    if(!can.editSchedule()) return
    const ref=doc(db,'facilities',FACILITY_ID,'schedules',ym)
    const snap=await getDoc(ref)
    const data=snap.exists()?snap.data():{shifts:{},events:{}}
    if(!data.shifts) data.shifts={}
    if(!data.shifts[staffId]) data.shifts[staffId]={}
    data.shifts[staffId][day]=val
    await setDoc(ref,data,{merge:true})
  }

  const saveEvent=async()=>{
    if(!modalDay) return
    await setDoc(doc(db,'facilities',FACILITY_ID,'schedules',ym),{events:{[modalDay]:eventInput.trim()}},{merge:true})
    setModalDay(null); setEventInput('')
  }

  const syncToGoogle=async()=>{
    setSyncStatus('連携中…')
    try{
      const result=await signInWithPopup(auth,provider)
      const cred=GoogleAuthProvider.credentialFromResult(result)
      const token=cred.accessToken
      const myShifts=schedule.shifts?.[auth.currentUser?.uid]||{}
      let created=0
      for(const [dayStr,type] of Object.entries(myShifts)){
        if(type==='off') continue
        const d=parseInt(dayStr)
        const label=type==='in'?'出勤':type==='ext'?'外勤':type==='late'?'遅刻':'勤務'
        const ev={summary:`【コペルプラス】${label}`,description:`コペルプラス 東久留米教室 ${label}`,start:{date:dateStr(year,month,d)},end:{date:dateStr(year,month,d)},colorId:type==='ext'?'6':type==='late'?'5':'2'}
        const res=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(ev)})
        if(res.ok) created++
      }
      setSyncStatus(`✅ ${created}件をGoogleカレンダーに追加しました`)
    }catch(e){ setSyncStatus(`❌ ${e.message}`) }
    setTimeout(()=>setSyncStatus(''),5000)
  }

  const events=schedule.events||{}, shifts=schedule.shifts||{}

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'12px 12px 8px',background:C.card,borderBottom:`1.5px solid ${C.border}`,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:7}}>
          <button onClick={prevMonth} style={{border:`1.5px solid ${C.border}`,background:'transparent',borderRadius:8,padding:'4px 9px',fontSize:14,cursor:'pointer',fontFamily:FONT}}>◀</button>
          <div style={{flex:1,textAlign:'center',fontSize:17,fontWeight:800,color:C.text}}>{year}年{month}月</div>
          <button onClick={nextMonth} style={{border:`1.5px solid ${C.border}`,background:'transparent',borderRadius:8,padding:'4px 9px',fontSize:14,cursor:'pointer',fontFamily:FONT}}>▶</button>
          <button onClick={goToday} style={{border:`1.5px solid ${C.primary}`,background:C.primaryLight,borderRadius:8,padding:'4px 9px',fontSize:11,cursor:'pointer',fontFamily:FONT,color:C.primaryDark,fontWeight:600}}>今月</button>
          {can.editSchedule()&&<button onClick={()=>setEditMode(m=>!m)} style={{border:`1.5px solid ${editMode?C.primary:C.border}`,background:editMode?C.primaryLight:'transparent',borderRadius:8,padding:'4px 9px',fontSize:11,fontWeight:editMode?700:400,color:editMode?C.primaryDark:C.sub,cursor:'pointer',fontFamily:FONT}}>{editMode?'✏️ 編集中':'編集'}</button>}
        </div>
        <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
          {Object.entries(SHIFT).map(([k,v])=><div key={k} style={{display:'flex',alignItems:'center',gap:3}}><div style={{width:9,height:9,borderRadius:2,background:v.dot}}/><span style={{fontSize:10,color:C.sub}}>{v.label}</span></div>)}
          <div style={{display:'flex',alignItems:'center',gap:3}}><span style={{fontSize:10}}>🎂</span><span style={{fontSize:10,color:C.sub}}>誕生日</span></div>
        </div>
        <div style={{display:'flex',gap:5,marginTop:4,flexWrap:'wrap'}}>
          {[['土曜','#E3F2FD','#1565C0'],['日祝','#FFECEA','#CC3333'],['水曜','#FFFDE7','#7B6000']].map(([l,bg,c])=><span key={l} style={{background:bg,color:c,borderRadius:4,padding:'1px 6px',fontSize:9,fontWeight:600}}>{l}</span>)}
        </div>
      </div>

      <div style={{flex:1,overflowX:'auto',overflowY:'auto',padding:'5px 3px 6px'}}>
        <div style={{minWidth:56+38*dim}}>
          {/* イベント行 */}
          <div style={{display:'flex',marginBottom:2}}>
            <div style={{width:54,flexShrink:0,fontSize:9,color:C.muted,display:'flex',alignItems:'center',paddingLeft:3}}>イベント</div>
            {days.map(d=><div key={d} style={{width:36,flexShrink:0,marginRight:2,height:14}}>{events[d]&&<div style={{background:C.amberLight,borderRadius:3,padding:'1px 2px',fontSize:8,color:'#7A5000',overflow:'hidden',whiteSpace:'nowrap',maxWidth:34,cursor:'pointer'}} onClick={()=>can.editSchedule()&&(setModalDay(d),setEventInput(events[d]))} title={events[d]}>{events[d].slice(0,5)}</div>}</div>)}
          </div>

          {/* 日付ヘッダー */}
          <div style={{display:'flex',marginBottom:3}}>
            <div style={{width:54,flexShrink:0}}/>
            {days.map(d=>{
              const dow=new Date(year,month-1,d).getDay()
              const isT=year===today.getFullYear()&&month===today.getMonth()+1&&d===today.getDate()
              const isH=isHoliday(year,month,d)
              const bg=rowBg(year,month,d)
              const hasBday=!!bdayMap[d]
              const dc=dow===0||isH?C.coral:dow===6?C.blue:dow===3?'#7B6000':C.text
              return (
                <button key={d} onClick={()=>can.editSchedule()&&(setModalDay(d),setEventInput(events[d]||''))} style={{width:36,flexShrink:0,marginRight:2,display:'flex',flexDirection:'column',alignItems:'center',background:bg||'transparent',border:'none',cursor:can.editSchedule()?'pointer':'default',padding:'1px 0',borderRadius:6}}>
                  <span style={{fontSize:9,color:dc,fontWeight:isT?700:400}}>{DOW_JA[dow]}</span>
                  <span style={{width:24,height:24,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:isT?800:500,background:isT?C.primary:'transparent',color:isT?'#fff':dc}}>{d}</span>
                  <span style={{fontSize:10,lineHeight:1}}>{hasBday?'🎂':''}</span>
                </button>
              )
            })}
          </div>

          {/* スタッフ行 */}
          {staffList.map(s=>(
            <div key={s.id} style={{display:'flex',alignItems:'center',marginBottom:3}}>
              <div style={{width:54,flexShrink:0,display:'flex',alignItems:'center',gap:4,paddingRight:4}}>
                <div style={{width:20,height:20,borderRadius:'50%',background:(s.color||C.primary)+'33',border:`2px solid ${s.color||C.primary}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:s.color||C.primary,flexShrink:0}}>{(s.name||'?')[0]}</div>
                <span style={{fontSize:9,fontWeight:500,color:C.text,overflow:'hidden',maxWidth:28,lineHeight:1.2}}>{(s.hiraganaName||s.name||'').split(' ')[1]||(s.name||'').slice(0,3)}</span>
              </div>
              {days.map(d=>{
                const type=shifts[s.id]?.[d]||'off', cfg=SHIFT[type], bg=rowBg(year,month,d)
                return (
                  <div key={d} style={{width:36,flexShrink:0,marginRight:2,background:bg||'transparent'}}>
                    {editMode?(
                      <select value={type} onChange={e=>updateShift(s.id,d,e.target.value)} style={{width:34,height:26,borderRadius:5,border:`1.5px solid ${cfg.dot}`,background:cfg.bg,color:cfg.color,fontSize:9,fontWeight:600,fontFamily:FONT,cursor:'pointer',textAlign:'center'}}>
                        {SHIFT_OPTS.map(o=><option key={o} value={o}>{SHIFT[o].short}</option>)}
                      </select>
                    ):(
                      <div style={{height:26,borderRadius:5,background:cfg.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:600,color:cfg.color}}>{cfg.short}</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Google カレンダー連携ボタン */}
      <div style={{padding:'10px 12px',background:C.card,borderTop:`1px solid ${C.divider}`,flexShrink:0}}>
        {syncStatus?(
          <div style={{padding:'10px 14px',borderRadius:11,background:syncStatus.startsWith('✅')?C.primaryLight:syncStatus.startsWith('❌')?C.coralLight:C.amberLight,color:syncStatus.startsWith('✅')?C.primaryDark:syncStatus.startsWith('❌')?C.coral:'#7A5000',fontSize:13,fontWeight:600,textAlign:'center'}}>{syncStatus}</div>
        ):(
          <button onClick={syncToGoogle} style={{width:'100%',padding:'11px',borderRadius:12,border:`1.5px solid ${C.border}`,background:C.card,display:'flex',alignItems:'center',justifyContent:'center',gap:9,fontSize:13,fontWeight:700,color:C.text,cursor:'pointer',fontFamily:FONT}}>
            <svg width={16} height={16} viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            自分の勤務を Googleカレンダーに連携する
          </button>
        )}
        <div style={{fontSize:10,color:C.muted,textAlign:'center',marginTop:4}}>自分の出勤予定のみが追加されます</div>
      </div>

      {modalDay&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'flex-end',zIndex:200}} onClick={()=>setModalDay(null)}>
          <div style={{background:C.card,borderRadius:'22px 22px 0 0',padding:'22px 18px 30px',width:'100%'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>{month}月{modalDay}日のイベント{bdayMap[modalDay]&&` 🎂 ${bdayMap[modalDay].map(b=>b.name).join('・')}`}</div>
            {bdayMap[modalDay]&&<div style={{background:C.purpleLight,borderRadius:10,padding:'8px 12px',marginBottom:12,fontSize:13,color:C.purple}}>🎂 {bdayMap[modalDay].map(b=>`${b.name}${b.type==='child'?'ちゃん':'先生'}`).join('・')} の誕生日です</div>}
            <input value={eventInput} onChange={e=>setEventInput(e.target.value)} placeholder="イベント名（例：研修・誕生日会・教材整理）" style={{width:'100%',padding:'13px',borderRadius:11,border:`1.5px solid ${C.border}`,fontSize:15,fontFamily:FONT,outline:'none',marginBottom:12,boxSizing:'border-box',color:C.text}}/>
            <div style={{display:'flex',gap:9}}>
              <button onClick={()=>setModalDay(null)} style={{flex:1,padding:'12px',borderRadius:11,border:`1.5px solid ${C.border}`,background:'transparent',fontSize:14,fontWeight:600,color:C.sub,cursor:'pointer',fontFamily:FONT}}>キャンセル</button>
              <button onClick={saveEvent} style={{flex:2,padding:'12px',borderRadius:11,border:'none',background:C.primary,fontSize:14,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:FONT}}>保存する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
