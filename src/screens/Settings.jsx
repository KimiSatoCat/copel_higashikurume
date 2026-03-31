import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, ROLES, DEV_TIMEOUT_MS } from '../theme'

const ROLE_LABELS = { developer:'開発者', admin:'責任者', sub_admin:'副責任者', editor:'スケジュール編集', staff:'一般職員' }
const ROLE_COLORS = { developer:{bg:C.coralLight,c:'#CC5040'}, admin:{bg:C.purpleLight,c:'#8060C0'}, sub_admin:{bg:C.blueLight,c:'#2070A0'}, editor:{bg:C.primaryLight,c:C.primaryDark}, staff:{bg:C.bg,c:C.sub} }

export default function Settings() {
  const { user, profile, role, devMode, devSecsLeft, enableDevMode, clearDevMode, verifyDevPassword, signOut, can } = useAuth()
  const [tab, setTab] = useState('profile')
  const [staffList, setStaffList] = useState([])
  const [children,  setChildren]  = useState([])
  const [pwInput,   setPwInput]   = useState('')
  const [pwError,   setPwError]   = useState('')
  const [editingStaff, setEditingStaff] = useState(null)
  const [editingChild, setEditingChild] = useState(null)
  const [saving,    setSaving]    = useState(false)
  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID || ''

  const refreshStaff = () => getDocs(collection(db,'facilities',FACILITY_ID,'staff')).then(s=>setStaffList(s.docs.map(d=>({id:d.id,...d.data()}))))
  const refreshChildren = () => getDocs(collection(db,'facilities',FACILITY_ID,'children')).then(s=>setChildren(s.docs.map(d=>({id:d.id,...d.data()}))))

  useEffect(()=>{ if(can.editStaff()||devMode){ refreshStaff(); refreshChildren() } },[devMode])

  const verifyDev = async()=>{
    const ok = await verifyDevPassword(pwInput)
    if(ok){ enableDevMode(); setPwInput(''); setPwError(''); setTab('roles'); refreshStaff() }
    else setPwError('パスワードが正しくありません')
  }

  const saveStaff = async(s)=>{ setSaving(true); await setDoc(doc(db,'facilities',FACILITY_ID,'staff',s.id),s,{merge:true}); refreshStaff(); setEditingStaff(null); setSaving(false) }
  const saveChild = async(c)=>{ setSaving(true); await setDoc(doc(db,'facilities',FACILITY_ID,'children',c.id||`c_${Date.now()}`),{...c,active:true},{merge:true}); refreshChildren(); setEditingChild(null); setSaving(false) }
  const updateRole = async(uid,nr)=>{ await updateDoc(doc(db,'facilities',FACILITY_ID,'staff',uid),{role:nr}); setStaffList(prev=>prev.map(s=>s.id===uid?{...s,role:nr}:s)) }

  const Tab=({id,label})=>(
    <button onClick={()=>setTab(id)} style={{padding:'8px 12px',borderRadius:10,border:`1.5px solid ${tab===id?C.primary:C.border}`,background:tab===id?C.primaryLight:'transparent',fontSize:13,fontWeight:tab===id?700:400,color:tab===id?C.primaryDark:C.sub,cursor:'pointer',fontFamily:FONT,flexShrink:0}}>
      {label}
    </button>
  )

  return (
    <div style={{padding:'16px'}}>
      <div style={{fontSize:19,fontWeight:800,color:C.text,marginBottom:16}}>⚙️ 設定</div>
      <div style={{display:'flex',gap:7,overflowX:'auto',marginBottom:20,paddingBottom:2}}>
        <Tab id="profile" label="プロフィール"/>
        {can.editStaff()&&<Tab id="staff" label="職員管理"/>}
        {can.editChildren()&&<Tab id="children" label="児童管理"/>}
        {(devMode||can.assignAdmin())&&<Tab id="roles" label="権限設定"/>}
        <Tab id="records" label="これまでの記録"/>
        <Tab id="dev" label="開発者"/>
      </div>

      {tab==='profile'&&<ProfileTab user={user} profile={profile} role={role} ROLE_LABELS={ROLE_LABELS} ROLE_COLORS={ROLE_COLORS} signOut={signOut}/>}
      {tab==='staff'&&can.editStaff()&&<StaffTab staffList={staffList} editingStaff={editingStaff} setEditingStaff={setEditingStaff} saveStaff={saveStaff} saving={saving}/>}
      {tab==='children'&&can.editChildren()&&<ChildrenTab children={children} editingChild={editingChild} setEditingChild={setEditingChild} saveChild={saveChild} saving={saving}/>}
      {tab==='roles'&&(devMode||can.assignAdmin())&&<RolesTab staffList={staffList} updateRole={updateRole} devMode={devMode} role={role} ROLES={ROLES} ROLE_LABELS={ROLE_LABELS} ROLE_COLORS={ROLE_COLORS}/>}
      {tab==='records'&&<RecordsTab spreadsheetId={spreadsheetId}/>}
      {tab==='dev'&&<DevTab devMode={devMode} devSecsLeft={devSecsLeft} pwInput={pwInput} setPwInput={setPwInput} pwError={pwError} verifyDev={verifyDev} clearDevMode={clearDevMode}/>}
    </div>
  )
}

function ProfileTab({user,profile,role,ROLE_LABELS,ROLE_COLORS,signOut}){
  const rc=ROLE_COLORS[role]||ROLE_COLORS.staff
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:C.card,borderRadius:20,padding:18,border:`1.5px solid ${C.border}`}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14}}>
          {user?.photoURL?<img src={user.photoURL} alt="" style={{width:56,height:56,borderRadius:'50%',objectFit:'cover'}}/>
          :<div style={{width:56,height:56,borderRadius:'50%',background:C.primaryLight,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:C.primaryDark,fontWeight:800}}>{(profile?.name||'?')[0]}</div>}
          <div>
            <div style={{fontSize:18,fontWeight:800,color:C.text}}>{profile?.name||user?.displayName||'名前未設定'}</div>
            <div style={{fontSize:13,color:C.sub,marginTop:2}}>{user?.email}</div>
            <span style={{background:rc.bg,color:rc.c,borderRadius:99,padding:'3px 10px',fontSize:12,fontWeight:700,display:'inline-block',marginTop:6}}>{ROLE_LABELS[role]||'一般職員'}</span>
          </div>
        </div>
      </div>
      <button onClick={signOut} style={{width:'100%',padding:'14px',borderRadius:14,border:`2px solid ${C.coral}44`,background:C.coralLight,fontSize:15,fontWeight:700,color:C.coral,cursor:'pointer',fontFamily:FONT}}>ログアウト</button>
    </div>
  )
}

function RecordsTab({spreadsheetId}){
  const url = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:C.card,borderRadius:20,padding:18,border:`1.5px solid ${C.border}`}}>
        <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>📊 これまでの記録</div>
        <div style={{fontSize:14,color:C.sub,lineHeight:1.7,marginBottom:16}}>
          毎日17:00に，その日の支援記録がGoogleスプレッドシートに自動的に保存されます。
          2026年4月〜2035年12月の10年分のシートがあります。
        </div>
        <div style={{background:C.bg,borderRadius:12,padding:'12px 14px',marginBottom:14,fontSize:13,color:C.sub,lineHeight:1.7}}>
          <div style={{fontWeight:700,color:C.text,marginBottom:4}}>スプレッドシートの構造</div>
          <div>・1シート＝1か月分の記録</div>
          <div>・1行＝1コマ（最大5名の子どもコメント付き）</div>
          <div>・個別セッション・集団セッションに対応</div>
          <div>・土曜：青 ／ 日祝：赤 ／ 水曜：黄で色分け</div>
        </div>
        {url?(
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{display:'block',width:'100%',padding:'14px',borderRadius:14,border:'none',background:C.primary,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:FONT,textAlign:'center',textDecoration:'none'}}>
            📊 Googleスプレッドシートを開く
          </a>
        ):(
          <div style={{background:C.amberLight,borderRadius:12,padding:'12px 14px',fontSize:13,color:'#7A5000'}}>
            設定が必要です：<br/>
            .env の <code>VITE_SPREADSHEET_ID</code> にスプレッドシートのIDを設定してください。
          </div>
        )}
      </div>
      <div style={{background:C.card,borderRadius:20,padding:16,border:`1.5px solid ${C.border}`}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>⏰ 自動保存のスケジュール</div>
        <div style={{background:C.primaryLight,borderRadius:12,padding:'12px 14px',fontSize:14,color:C.primaryDark}}>
          毎日 <strong>17:00</strong> に自動的に保存されます<br/>
          <span style={{fontSize:12,opacity:.8}}>（アプリを開いていない場合は保存されません。その場合は設定→スプレッドシートから手動で確認できます）</span>
        </div>
      </div>
    </div>
  )
}

function StaffTab({staffList,editingStaff,setEditingStaff,saveStaff,saving}){
  const blank={name:'',email:'',birthday:'',color:C.primary,active:true,role:ROLES?.STAFF||'staff'}
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text}}>職員一覧</div>
        <button onClick={()=>setEditingStaff({...blank,id:'new_'+Date.now()})} style={{padding:'8px 14px',borderRadius:10,border:'none',background:C.primary,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:FONT}}>＋ 追加</button>
      </div>
      {staffList.map(s=>(
        <div key={s.id} style={{background:C.card,borderRadius:14,padding:'12px 14px',marginBottom:8,border:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:36,height:36,borderRadius:'50%',background:(s.color||C.primary)+'33',border:`2px solid ${s.color||C.primary}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,color:s.color||C.primary,flexShrink:0}}>{(s.name||'?')[0]}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,color:C.text}}>{s.name}</div>
            <div style={{fontSize:12,color:C.sub}}>{s.email}</div>
          </div>
          <button onClick={()=>setEditingStaff(s)} style={{padding:'6px 12px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'transparent',fontSize:12,color:C.sub,cursor:'pointer',fontFamily:FONT}}>編集</button>
        </div>
      ))}
      {editingStaff&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'flex-end',zIndex:300}}>
          <div style={{background:C.card,borderRadius:'24px 24px 0 0',padding:'24px 20px 32px',width:'100%',maxHeight:'80vh',overflowY:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:16}}>職員情報の編集</div>
            {[{key:'name',label:'名前（本名）',type:'text',ph:'例：田中 はなこ'},{key:'email',label:'メールアドレス',type:'email',ph:''},{key:'birthday',label:'誕生日',type:'date',ph:''}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:13,color:C.sub,marginBottom:4}}>{f.label}</div>
                <input type={f.type} value={editingStaff[f.key]||''} placeholder={f.ph} onChange={e=>setEditingStaff(p=>({...p,[f.key]:e.target.value}))} style={{width:'100%',padding:'12px 14px',borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:15,fontFamily:FONT,outline:'none',color:C.text}}/>
              </div>
            ))}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:13,color:C.sub,marginBottom:4}}>在籍状態</div>
              <div style={{display:'flex',gap:8}}>
                {[true,false].map(v=>(
                  <button key={String(v)} onClick={()=>setEditingStaff(p=>({...p,active:v}))} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${editingStaff.active===v?C.primary:C.border}`,background:editingStaff.active===v?C.primaryLight:'transparent',fontSize:13,fontWeight:600,color:editingStaff.active===v?C.primaryDark:C.sub,cursor:'pointer',fontFamily:FONT}}>
                    {v?'在籍中':'退職済み'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setEditingStaff(null)} style={{flex:1,padding:'13px',borderRadius:12,border:`2px solid ${C.border}`,background:'transparent',fontSize:15,fontWeight:600,color:C.sub,cursor:'pointer',fontFamily:FONT}}>キャンセル</button>
              <button onClick={()=>saveStaff(editingStaff)} disabled={saving} style={{flex:2,padding:'13px',borderRadius:12,border:'none',background:C.primary,fontSize:15,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:FONT}}>{saving?'保存中…':'保存する'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChildrenTab({children,editingChild,setEditingChild,saveChild,saving}){
  const blank={name:'',birthday:'',emergency1_name:'',emergency1_tel:'',emergency2_name:'',emergency2_tel:'',allergy:'',doctor:'',memo:'',active:true}
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text}}>児童一覧</div>
        <button onClick={()=>setEditingChild(blank)} style={{padding:'8px 14px',borderRadius:10,border:'none',background:C.primary,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:FONT}}>＋ 追加</button>
      </div>
      {children.map(c=>(
        <div key={c.id} style={{background:C.card,borderRadius:14,padding:'12px 14px',marginBottom:8,border:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:36,height:36,borderRadius:'50%',background:C.amberLight,border:`2px solid ${C.amber}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,color:'#B07800',flexShrink:0}}>{(c.name||'?')[0]}</div>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:C.text}}>{c.name}</div>{c.birthday&&<div style={{fontSize:12,color:C.sub}}>誕生日：{c.birthday}</div>}</div>
          <button onClick={()=>setEditingChild(c)} style={{padding:'6px 12px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'transparent',fontSize:12,color:C.sub,cursor:'pointer',fontFamily:FONT}}>編集</button>
        </div>
      ))}
      {editingChild&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'flex-end',zIndex:300}}>
          <div style={{background:C.card,borderRadius:'24px 24px 0 0',padding:'24px 20px 32px',width:'100%',maxHeight:'85vh',overflowY:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:16}}>児童情報の編集</div>
            {[{key:'name',label:'お名前',type:'text',ph:'例：さくら'},{key:'birthday',label:'誕生日',type:'date',ph:''},{key:'emergency1_name',label:'緊急連絡先①（名前）',type:'text',ph:'例：田中 一郎（父）'},{key:'emergency1_tel',label:'緊急連絡先①（電話）',type:'tel',ph:'090-0000-0000'},{key:'emergency2_name',label:'緊急連絡先②（名前）',type:'text',ph:''},{key:'emergency2_tel',label:'緊急連絡先②（電話）',type:'tel',ph:''},{key:'allergy',label:'アレルギー・注意事項',type:'text',ph:''},{key:'doctor',label:'かかりつけ医',type:'text',ph:''},{key:'memo',label:'その他メモ',type:'text',ph:''}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:13,color:C.sub,marginBottom:4}}>{f.label}</div>
                <input type={f.type} value={editingChild[f.key]||''} placeholder={f.ph} onChange={e=>setEditingChild(p=>({...p,[f.key]:e.target.value}))} style={{width:'100%',padding:'12px 14px',borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:15,fontFamily:FONT,outline:'none',color:C.text}}/>
              </div>
            ))}
            <div style={{display:'flex',gap:10,marginTop:4}}>
              <button onClick={()=>setEditingChild(null)} style={{flex:1,padding:'13px',borderRadius:12,border:`2px solid ${C.border}`,background:'transparent',fontSize:15,fontWeight:600,color:C.sub,cursor:'pointer',fontFamily:FONT}}>キャンセル</button>
              <button onClick={()=>saveChild(editingChild)} disabled={saving} style={{flex:2,padding:'13px',borderRadius:12,border:'none',background:C.primary,fontSize:15,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:FONT}}>{saving?'保存中…':'保存する'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RolesTab({staffList,updateRole,devMode,role,ROLES,ROLE_LABELS,ROLE_COLORS}){
  return (
    <div>
      <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>権限の設定</div>
      {devMode&&<div style={{background:C.coralLight,borderRadius:12,padding:'10px 14px',marginBottom:14,fontSize:13,color:'#CC5040'}}>⚠️ 開発者モード中（残り時間で自動終了）</div>}
      {staffList.map(s=>{
        const rc=ROLE_COLORS[s.role]||ROLE_COLORS.staff
        const opts=devMode?Object.keys(ROLE_LABELS):[ROLES.STAFF,ROLES.EDITOR,ROLES.SUB_ADMIN,ROLES.ADMIN]
        return (
          <div key={s.id} style={{background:C.card,borderRadius:14,padding:'12px 14px',marginBottom:8,border:`1.5px solid ${C.border}`}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div style={{width:32,height:32,borderRadius:'50%',background:(s.color||C.primary)+'33',border:`2px solid ${s.color||C.primary}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:s.color||C.primary}}>{(s.name||'?')[0]}</div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:C.text}}>{s.name}</div>
                <span style={{background:rc.bg,color:rc.c,borderRadius:99,padding:'2px 8px',fontSize:11,fontWeight:700}}>{ROLE_LABELS[s.role]||'一般職員'}</span>
              </div>
            </div>
            <select value={s.role||ROLES.STAFF} onChange={e=>updateRole(s.id,e.target.value)} style={{width:'100%',padding:'10px 12px',borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:14,fontFamily:FONT,background:C.bg,color:C.text,outline:'none'}}>
              {opts.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        )
      })}
    </div>
  )
}

function DevTab({devMode,devSecsLeft,pwInput,setPwInput,pwError,verifyDev,clearDevMode}){
  const m=Math.floor(devSecsLeft/60), s=devSecsLeft%60
  return devMode?(
    <div style={{background:C.coralLight,borderRadius:20,padding:20,border:`1.5px solid ${C.coral}44`}}>
      <div style={{fontSize:16,fontWeight:800,color:'#CC5040',marginBottom:8}}>⚠️ 開発者モード 有効中</div>
      <div style={{fontSize:32,fontWeight:800,color:'#CC5040',textAlign:'center',marginBottom:12}}>{m}:{String(s).padStart(2,'0')}</div>
      <div style={{fontSize:14,color:'#CC5040',marginBottom:16}}>残り時間で自動的に終了します</div>
      <button onClick={clearDevMode} style={{width:'100%',padding:'13px',borderRadius:12,border:'none',background:'#CC5040',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:FONT}}>今すぐ終了する</button>
    </div>
  ):(
    <div style={{background:C.card,borderRadius:20,padding:20,border:`1.5px solid ${C.border}`}}>
      <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>🔐 開発者専用</div>
      <div style={{fontSize:13,color:C.sub,marginBottom:16,lineHeight:1.6}}>パスワードを入力すると，権限の付与・変更ができます。認証後は5分で自動的に終了します。</div>
      {pwError&&<div style={{background:C.coralLight,borderRadius:10,padding:'8px 12px',marginBottom:12,fontSize:13,color:C.coral}}>{pwError}</div>}
      <input type="password" value={pwInput} onChange={e=>setPwInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&verifyDev()} placeholder="開発者パスワード" style={{width:'100%',padding:'14px',borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:15,fontFamily:FONT,outline:'none',marginBottom:12,color:C.text}}/>
      <button onClick={verifyDev} style={{width:'100%',padding:'13px',borderRadius:12,border:'none',background:C.primaryDark,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:FONT}}>認証する</button>
    </div>
  )
}
