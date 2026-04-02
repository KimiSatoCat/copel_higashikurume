import { useState, useEffect, useRef } from 'react'
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc, getDoc } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT, ROLES } from '../theme'

const ROLE_LABELS = {
  developer: '開発者',
  admin:     '責任者',
  sub_admin: '副責任者',
  editor:    'スケジュール編集',
  staff:     '一般職員',
}
const ROLE_COLORS = {
  developer: { bg: C.coralLight,   c: '#CC5040' },
  admin:     { bg: C.purpleLight,  c: '#8060C0' },
  sub_admin: { bg: C.blueLight,    c: '#2070A0' },
  editor:    { bg: C.primaryLight, c: C.primaryDark },
  staff:     { bg: C.bg,           c: C.sub },
}

export default function Settings() {
  const {
    user, profile, role,
    devMode, enableDevMode, clearDevMode,
    verifyDevPassword, signOut, can, updateLocalProfile,
  } = useAuth()

  const [tab,       setTab]      = useState('none')
  const [staffList, setStaffList]= useState([])
  const [children,  setChildren] = useState([])
  const [pwInput,   setPwInput]  = useState('')
  const [pwError,   setPwError]  = useState('')

  // アカウント設定
  const [acctEdit,  setAcctEdit] = useState(false)
  const [acctForm,  setAcctForm] = useState({ hiraganaFirst:'', name:'', birthday:'' })
  const [acctSaving,setAcctSaving]=useState(false)
  const [acctMsg,   setAcctMsg]  = useState('')

  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID || ''

  useEffect(() => {
    if (profile) {
      setAcctForm({
        hiraganaFirst: profile.hiraganaFirst || '',
        name:          profile.name          || '',
        birthday:      profile.birthday      || '',
      })
    }
  }, [profile?.uid])

  // 職員・児童リストを取得（1回のみ、または手動更新）
  const loadStaff = () =>
    getDocs(collection(db, 'facilities', FACILITY_ID, 'staff'))
      .then(s => setStaffList(s.docs.map(d => ({ id:d.id, ...d.data() }))))

  const loadChildren = () =>
    getDocs(collection(db, 'facilities', FACILITY_ID, 'children'))
      .then(s => setChildren(s.docs.map(d => ({ id:d.id, ...d.data() }))))

  useEffect(() => {
    if (tab === 'staff'    && (can.editStaff()    || devMode)) loadStaff()
    if (tab === 'children' && (can.editChildren() || devMode)) loadChildren()
    if (tab === 'roles')   loadStaff()
  }, [tab, devMode])

  // ─── 開発者パスワード認証 ────────────────────────────────
  const verifyDev = async () => {
    const ok = await verifyDevPassword(pwInput)
    if (ok) {
      enableDevMode()
      setPwInput('')
      setPwError('')
      setTab('roles')
    } else {
      setPwError('パスワードが正しくありません')
    }
  }

  // ─── 自分のプロフィール保存 ──────────────────────────────
  const saveAccount = async () => {
    if (!user || acctSaving) return
    setAcctSaving(true)
    setAcctMsg('')
    try {
      const data = {
        hiraganaFirst: acctForm.hiraganaFirst.trim(),
        hiraganaName:  acctForm.hiraganaFirst.trim(),
        name:          acctForm.name.trim(),
        birthday:      acctForm.birthday,
      }
      // ★ UIを先に更新してから保存
      updateLocalProfile(data)
      setAcctEdit(false)
      setAcctMsg('✅ 保存しました')
      setTimeout(() => setAcctMsg(''), 3000)
      setDoc(doc(db,'facilities',FACILITY_ID,'staff',user.uid), data, { merge:true })
        .catch(err => console.error('[saveAccount]', err.message))
    } catch (err) {
      setAcctMsg(`❌ ${err.message}`)
    }
    setAcctSaving(false)
  }

  // ─── 職員保存（ローカル即時更新） ────────────────────────
  const saveStaff = async (s) => {
    // ★ UIを先に更新（Firestoreの応答を待たない）
    setStaffList(prev => prev.some(x=>x.id===s.id)
      ? prev.map(x => x.id===s.id ? s : x)
      : [...prev, s]
    )
    // バックグラウンドで保存（エラーはコンソールに記録するだけ）
    setDoc(doc(db,'facilities',FACILITY_ID,'staff',s.id), s, { merge:true })
      .catch(err => console.error('[saveStaff]', err.message))
    return true
  }

  // ─── 職員削除 ────────────────────────────────────────────
  const deleteStaff = async (id, name) => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    // ★ UIを先に更新
    setStaffList(prev => prev.filter(x => x.id !== id))
    deleteDoc(doc(db,'facilities',FACILITY_ID,'staff',id))
      .catch(err => console.error('[deleteStaff]', err.message))
  }

  // ─── 児童保存 ────────────────────────────────────────────
  const saveChild = async (c) => {
    const id = c.id || `child_${Date.now()}`
    const saved = { ...c, id, active:true }
    // ★ UIを先に更新
    setChildren(prev => prev.some(x=>x.id===id)
      ? prev.map(x => x.id===id ? saved : x)
      : [...prev, saved]
    )
    setDoc(doc(db,'facilities',FACILITY_ID,'children',id), saved, { merge:true })
      .catch(err => console.error('[saveChild]', err.message))
    return true
  }

  // ─── 権限変更（ローカル即時更新） ────────────────────────
  const updateRole = async (uid, newRole) => {
    setStaffList(prev => prev.map(s => s.id===uid ? {...s, role:newRole} : s))
    // 自分自身の権限を変更した場合 → AuthContextにも即時反映（ページリロード不要）
    if (uid === user?.uid) {
      updateLocalProfile({ role: newRole })
    }
    updateDoc(doc(db,'facilities',FACILITY_ID,'staff',uid), { role: newRole })
      .catch(err => {
        setStaffList(prev => prev.map(s => s.id===uid ? {...s, role: s.role} : s))
        alert(`権限の変更に失敗しました。\n${err.message}\n\nFirebaseコンソールで自分のroleを「admin」に変更してから試してください。`)
      })
  }

  // ─── テスト職員追加 ──────────────────────────────────────
  const resetHidamari = async () => {
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    try {
      await deleteDoc(doc(db, 'facilities', FACILITY_ID, 'hidamari', user.uid, 'logs', today))
      alert('✅ ひだまりの本日利用制限をリセットしました')
    } catch (err) {
      alert(`リセットできませんでした: ${err.message}`)
    }
  }

  const addTestStaff = async () => {
    const id  = 'test_staff_001'
    const ref = doc(db,'facilities',FACILITY_ID,'staff',id)
    const snap = await getDoc(ref)
    if (snap.exists()) { alert('「テスト 職員」はすでに存在します'); return }
    const data = {
      uid:'test_staff_001', name:'テスト 職員', hiraganaFirst:'てすと',
      hiraganaName:'てすと しょくいん', email:'test@example.com',
      role:'staff', active:true, color:'#9E9E9E',
      createdAt: new Date().toISOString(),
    }
    await setDoc(ref, data)
    setStaffList(prev => [...prev, { id, ...data }])
    alert('✅「テスト 職員」を追加しました')
  }

  // ─── 表示名 ──────────────────────────────────────────────
  const dispFirst = profile?.hiraganaFirst || ''
  const dispName  = dispFirst ? `${dispFirst}先生` : (profile?.name ? `${profile.name}先生` : '先生')
  const rc        = ROLE_COLORS[role] || ROLE_COLORS.staff

  const Tab = ({ id, label }) => (
    <button onClick={() => setTab(t => t===id?'none':id)}
      style={{ padding:'8px 12px', borderRadius:10, border:`1.5px solid ${tab===id?C.primary:C.border}`, background:tab===id?C.primaryLight:'transparent', fontSize:13, fontWeight:tab===id?700:400, color:tab===id?C.primaryDark:C.sub, cursor:'pointer', fontFamily:FONT, flexShrink:0 }}>
      {label}
    </button>
  )

  return (
    <div style={{ padding:'16px' }}>
      <div style={{ fontSize:19, fontWeight:800, color:C.text, marginBottom:14 }}>⚙️ 設定</div>

      {/* ── プロフィールカード ── */}
      <div style={{ background:`linear-gradient(135deg,${C.primaryLight},${C.bg})`, borderRadius:20, padding:'16px 18px', marginBottom:14, border:`1.5px solid ${C.primary}44` }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {user?.photoURL
            ? <img src={user.photoURL} alt="" style={{ width:54, height:54, borderRadius:'50%', objectFit:'cover', border:`2px solid ${C.primary}` }}/>
            : <div style={{ width:54, height:54, borderRadius:'50%', background:C.primaryLight, border:`2px solid ${C.primary}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:C.primaryDark, fontWeight:800 }}>
                {(profile?.name||'先')[0]}
              </div>
          }
          <div style={{ flex:1 }}>
            <div style={{ fontSize:24, fontWeight:800, color:C.text, lineHeight:1.2 }}>{dispName}</div>
            {profile?.name && <div style={{ fontSize:14, color:C.sub, marginTop:2 }}>{profile.name}</div>}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:5 }}>
              <span style={{ background:rc.bg, color:rc.c, borderRadius:99, padding:'2px 10px', fontSize:12, fontWeight:700 }}>
                {ROLE_LABELS[role]||'一般職員'}
              </span>
              <button onClick={() => setAcctEdit(v=>!v)}
                style={{ border:'none', background:'transparent', fontSize:12, color:C.primary, cursor:'pointer', fontFamily:FONT, fontWeight:600, padding:0 }}>
                {acctEdit ? '閉じる ×' : 'アカウント設定 ›'}
              </button>
            </div>
          </div>
        </div>

        {acctEdit && (
          <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${C.primary}33` }}>
            <div style={{ fontSize:12, color:C.sub, marginBottom:12, lineHeight:1.6 }}>
              ※「下の名前（ひらがな）」が「〇〇先生」として大きく表示されます。<br/>
              フルネームはカレンダーの勤務表に連動します。
            </div>
            {[
              { key:'hiraganaFirst', label:'下の名前（ひらがな）', ph:'たろう' },
              { key:'name',          label:'フルネーム（漢字）',   ph:'山田 太郎' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:10 }}>
                <div style={{ fontSize:12, color:C.sub, marginBottom:4 }}>{f.label}</div>
                <input autoComplete="off" value={acctForm[f.key]} onChange={e => setAcctForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                  style={{ width:'100%', padding:'11px 13px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:FONT, outline:'none', color:C.text, boxSizing:'border-box' }}
                />
              </div>
            ))}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, color:C.sub, marginBottom:4 }}>誕生日</div>
              <input type="date" autoComplete="off" value={acctForm.birthday} onChange={e => setAcctForm(p=>({...p,birthday:e.target.value}))}
                style={{ width:'100%', padding:'11px 13px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:FONT, outline:'none', color:C.text, boxSizing:'border-box' }}
              />
            </div>
            {acctMsg && (
              <div style={{ padding:'8px 12px', borderRadius:10, background:acctMsg.startsWith('✅')?C.primaryLight:C.coralLight, color:acctMsg.startsWith('✅')?C.primaryDark:C.coral, fontSize:13, marginBottom:10 }}>
                {acctMsg}
              </div>
            )}
            <div style={{ display:'flex', gap:9 }}>
              <button onClick={() => setAcctEdit(false)}
                style={{ flex:1, padding:'11px', borderRadius:10, border:`1.5px solid ${C.border}`, background:'transparent', fontSize:13, fontWeight:600, color:C.sub, cursor:'pointer', fontFamily:FONT }}>
                キャンセル
              </button>
              <button onClick={saveAccount} disabled={acctSaving}
                style={{ flex:2, padding:'11px', borderRadius:10, border:'none', background:acctSaving?C.bg:C.primary, fontSize:13, fontWeight:700, color:acctSaving?C.muted:'#fff', cursor:acctSaving?'wait':'pointer', fontFamily:FONT }}>
                {acctSaving ? '保存中…' : '保存する'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── タブ ── */}
      <div style={{ display:'flex', gap:7, overflowX:'auto', marginBottom:16, paddingBottom:2 }}>
        {(can.editStaff()||devMode)    && <Tab id="staff"    label="職員管理"/>}
        {(can.editChildren()||devMode) && <Tab id="children" label="児童管理"/>}
        {(devMode||can.assignAdmin())  && <Tab id="roles"    label="権限設定"/>}
        <Tab id="records" label="📊 これまでの記録"/>
        <Tab id="dev"     label="🔐 開発者"/>
      </div>

      {tab==='staff'    && <StaffTab    staffList={staffList} onSave={saveStaff} onDelete={deleteStaff} onAddTest={addTestStaff}/>}
      {tab==='children' && <ChildrenTab children={children}  onSave={saveChild}/>}
      {tab==='roles'    && <RolesTab    staffList={staffList} updateRole={updateRole} devMode={devMode} role={role}/>}
      {tab==='records'  && <RecordsTab  spreadsheetId={spreadsheetId}/>}
      {tab==='dev'      && <DevTab      devMode={devMode} pwInput={pwInput} setPwInput={setPwInput} pwError={pwError} verifyDev={verifyDev} clearDevMode={clearDevMode} addTestStaff={addTestStaff} onResetHidamari={resetHidamari}/>}

      <button onClick={signOut}
        style={{ width:'100%', padding:'13px', borderRadius:14, border:`1.5px solid ${C.coral}44`, background:C.coralLight, fontSize:14, fontWeight:700, color:C.coral, cursor:'pointer', fontFamily:FONT, marginTop:14 }}>
        ログアウト
      </button>
    </div>
  )
}

// ── 職員管理 ────────────────────────────────────────────────
function StaffTab({ staffList, onSave, onDelete, onAddTest }) {
  const [editing, setEditing] = useState(null)
  const startNew = () => setEditing({
    id: `staff_${Date.now()}`, name:'', hiraganaFirst:'',
    hiraganaName:'', email:'', birthday:'', color:'#52BAA8',
    active:true, role:'staff',
  })

  const handleSave = (s) => {
    onSave({ ...s, hiraganaName: s.hiraganaFirst })
    setEditing(null)  // 即座に閉じる
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>職員一覧</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onAddTest}
            style={{ padding:'7px 12px', borderRadius:10, border:'1.5px solid #9E9E9E', background:'#F5F5F5', color:'#555', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
            テスト追加
          </button>
          <button onClick={startNew}
            style={{ padding:'7px 13px', borderRadius:10, border:'none', background:C.primary, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
            ＋ 追加
          </button>
        </div>
      </div>

      {staffList.map(s => (
        <div key={s.id} style={{ background:C.card, borderRadius:13, padding:'11px 13px', marginBottom:8, border:`1.5px solid ${C.border}`, display:'flex', alignItems:'center', gap:11 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:(s.color||C.primary)+'33', border:`2px solid ${s.color||C.primary}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:s.color||C.primary, flexShrink:0 }}>
            {(s.name||'?')[0]}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{s.name}</div>
            {s.hiraganaFirst && <div style={{ fontSize:12, color:C.primary }}>{s.hiraganaFirst}先生</div>}
          </div>
          <button onClick={() => setEditing({...s})}
            style={{ padding:'5px 11px', borderRadius:8, border:`1.5px solid ${C.border}`, background:'transparent', fontSize:12, color:C.sub, cursor:'pointer', fontFamily:FONT }}>
            編集
          </button>
          <button onClick={() => onDelete(s.id, s.name)}
            style={{ padding:'5px 10px', borderRadius:8, border:`1.5px solid ${C.coral}44`, background:C.coralLight, fontSize:12, color:C.coral, cursor:'pointer', fontFamily:FONT }}>
            削除
          </button>
        </div>
      ))}

      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'flex-end', zIndex:300 }}>
          <div style={{ background:C.card, borderRadius:'22px 22px 0 0', padding:'22px 18px 30px', width:'100%', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:14 }}>職員情報の編集</div>
            {[
              { key:'hiraganaFirst', label:'下の名前（ひらがな）', ph:'はなこ' },
              { key:'name',          label:'フルネーム（漢字）',   ph:'田中 花子' },
              { key:'email',         label:'メールアドレス', type:'email', ph:'' },
              { key:'birthday',      label:'誕生日', type:'date', ph:'' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:11 }}>
                <div style={{ fontSize:13, color:C.sub, marginBottom:4 }}>{f.label}</div>
                <input type={f.type||'text'} autoComplete="off" value={editing[f.key]||''} placeholder={f.ph}
                  onChange={e => setEditing(p=>({...p,[f.key]:e.target.value}))}
                  style={{ width:'100%', padding:'11px 13px', borderRadius:11, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:FONT, outline:'none', color:C.text }}
                />
              </div>
            ))}
            <div style={{ display:'flex', gap:9 }}>
              <button onClick={() => setEditing(null)}
                style={{ flex:1, padding:'12px', borderRadius:11, border:`1.5px solid ${C.border}`, background:'transparent', fontSize:14, fontWeight:600, color:C.sub, cursor:'pointer', fontFamily:FONT }}>
                キャンセル
              </button>
              <button onClick={() => handleSave(editing)}
                style={{ flex:2, padding:'12px', borderRadius:11, border:'none', background:C.primary, fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:FONT }}>
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 児童管理 ────────────────────────────────────────────────
function ChildrenTab({ children, onSave }) {
  const [editing, setEditing] = useState(null)
  const startNew = () => setEditing({ name:'', birthday:'', emergency1_name:'', emergency1_tel:'', allergy:'', memo:'' })

  const handleSave = (c) => {
    onSave(c)
    setEditing(null)  // 即座に閉じる
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>児童一覧</div>
        <button onClick={startNew}
          style={{ padding:'7px 13px', borderRadius:10, border:'none', background:C.primary, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
          ＋ 追加
        </button>
      </div>
      {children.map(c => (
        <div key={c.id} style={{ background:C.card, borderRadius:13, padding:'11px 13px', marginBottom:8, border:`1.5px solid ${C.border}`, display:'flex', alignItems:'center', gap:11 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:C.amberLight, border:`2px solid ${C.amber}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#B07800', flexShrink:0 }}>
            {(c.name||'?')[0]}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{c.name}</div>
            {c.birthday && <div style={{ fontSize:11, color:C.sub }}>誕生日：{c.birthday}</div>}
          </div>
          <button onClick={() => setEditing({...c})}
            style={{ padding:'5px 11px', borderRadius:8, border:`1.5px solid ${C.border}`, background:'transparent', fontSize:12, color:C.sub, cursor:'pointer', fontFamily:FONT }}>
            編集
          </button>
        </div>
      ))}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'flex-end', zIndex:300 }}>
          <div style={{ background:C.card, borderRadius:'22px 22px 0 0', padding:'22px 18px 30px', width:'100%', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:14 }}>児童情報の編集</div>
            {[
              { key:'name',            label:'お名前', ph:'例：さくら' },
              { key:'birthday',        label:'誕生日', type:'date', ph:'' },
              { key:'emergency1_name', label:'緊急連絡先①（名前）', ph:'田中 一郎（父）' },
              { key:'emergency1_tel',  label:'緊急連絡先①（電話）', type:'tel', ph:'090-0000-0000' },
              { key:'allergy',         label:'アレルギー・注意事項', ph:'' },
              { key:'memo',            label:'その他メモ', ph:'' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:11 }}>
                <div style={{ fontSize:13, color:C.sub, marginBottom:4 }}>{f.label}</div>
                <input type={f.type||'text'} autoComplete="off" value={editing[f.key]||''} placeholder={f.ph}
                  onChange={e => setEditing(p=>({...p,[f.key]:e.target.value}))}
                  style={{ width:'100%', padding:'11px 13px', borderRadius:11, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:FONT, outline:'none', color:C.text }}
                />
              </div>
            ))}
            <div style={{ display:'flex', gap:9, marginTop:4 }}>
              <button onClick={() => setEditing(null)}
                style={{ flex:1, padding:'12px', borderRadius:11, border:`1.5px solid ${C.border}`, background:'transparent', fontSize:14, fontWeight:600, color:C.sub, cursor:'pointer', fontFamily:FONT }}>
                キャンセル
              </button>
              <button onClick={() => handleSave(editing)}
                style={{ flex:2, padding:'12px', borderRadius:11, border:'none', background:C.primary, fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:FONT }}>
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 権限設定 ────────────────────────────────────────────────
function RolesTab({ staffList, updateRole, devMode, role }) {
  const canSetDev  = devMode || role === 'developer'
  const roles      = canSetDev
    ? ['developer','admin','sub_admin','editor','staff']
    : ['admin','sub_admin','editor','staff']

  return (
    <div>
      <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:12 }}>権限の設定</div>
      {devMode && (
        <div style={{ background:C.coralLight, borderRadius:11, padding:'9px 13px', marginBottom:14, fontSize:13, color:'#CC5040' }}>
          ⚠️ 開発者モード中
        </div>
      )}
      {staffList.map(s => {
        const rc = ROLE_COLORS[s.role||'staff'] || ROLE_COLORS.staff
        return (
          <div key={s.id} style={{ background:C.card, borderRadius:13, padding:'12px 14px', marginBottom:8, border:`1.5px solid ${C.border}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ width:30, height:30, borderRadius:'50%', background:(s.color||C.primary)+'33', border:`2px solid ${s.color||C.primary}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:s.color||C.primary }}>
                {(s.name||'?')[0]}
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{s.name}</div>
                <span style={{ background:rc.bg, color:rc.c, borderRadius:99, padding:'2px 8px', fontSize:11, fontWeight:700 }}>
                  {ROLE_LABELS[s.role||'staff']||'一般職員'}
                </span>
              </div>
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {roles.map(r => {
                const rrc = ROLE_COLORS[r]||ROLE_COLORS.staff
                const on  = (s.role||'staff') === r
                return (
                  <button key={r} onClick={() => updateRole(s.id, r)}
                    style={{ padding:'6px 12px', borderRadius:8, border:`1.5px solid ${on?rrc.c:C.border}`, background:on?rrc.bg:'transparent', fontSize:12, fontWeight:on?700:400, color:on?rrc.c:C.sub, cursor:'pointer', fontFamily:FONT, transition:'all .1s' }}>
                    {ROLE_LABELS[r]}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── これまでの記録 ─────────────────────────────────────────
function RecordsTab({ spreadsheetId }) {
  const url = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null
  return (
    <div style={{ background:C.card, borderRadius:18, padding:16, border:`1.5px solid ${C.border}` }}>
      <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:8 }}>📊 これまでの記録</div>
      <div style={{ fontSize:13, color:C.sub, lineHeight:1.7, marginBottom:12 }}>
        毎日17:00に支援記録がGoogleスプレッドシートへ自動保存されます。
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ display:'block', padding:'13px', borderRadius:12, border:'none', background:C.primary, color:'#fff', fontSize:14, fontWeight:700, textAlign:'center', textDecoration:'none', fontFamily:FONT }}>
          📊 Googleスプレッドシートを開く
        </a>
      ) : (
        <div style={{ background:C.amberLight, borderRadius:10, padding:'10px 12px', fontSize:13, color:'#7A5000' }}>
          Vercelの環境変数 VITE_SPREADSHEET_ID を設定してください
        </div>
      )}
    </div>
  )
}

// ── 開発者 ─────────────────────────────────────────────────
function DevTab({ devMode, pwInput, setPwInput, pwError, verifyDev, clearDevMode, addTestStaff, onResetHidamari }) {
  return devMode ? (
    <div style={{ background:C.coralLight, borderRadius:18, padding:20, border:`1.5px solid ${C.coral}44` }}>
      <div style={{ fontSize:16, fontWeight:800, color:'#CC5040', marginBottom:12 }}>⚠️ 開発者モード 有効中</div>
      <button onClick={addTestStaff}
        style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid #9E9E9E', background:'#F5F5F5', fontSize:14, fontWeight:700, color:'#444', cursor:'pointer', fontFamily:FONT, marginBottom:10 }}>
        ＋「テスト 職員」をFirestoreに追加する
      </button>
      <button onClick={onResetHidamari}
        style={{ width:'100%', padding:'12px', borderRadius:12, border:`1.5px solid ${C.amber}`, background:C.amberLight, fontSize:14, fontWeight:700, color:'#B07800', cursor:'pointer', fontFamily:FONT, marginBottom:10 }}>
        ☀️ ひだまりの本日利用制限をリセット（テスト用）
      </button>
      <button onClick={clearDevMode}
        style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background:'#CC5040', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
        開発者モードを終了する
      </button>
    </div>
  ) : (
    <div style={{ background:C.card, borderRadius:18, padding:20, border:`1.5px solid ${C.border}` }}>
      <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>🔐 開発者専用</div>
      <div style={{ fontSize:13, color:C.sub, marginBottom:14, lineHeight:1.6 }}>
        パスワードを入力すると権限の付与・変更ができます。
      </div>
      {pwError && (
        <div style={{ background:C.coralLight, borderRadius:9, padding:'8px 12px', marginBottom:11, fontSize:13, color:C.coral }}>{pwError}</div>
      )}
      <form onSubmit={e => { e.preventDefault(); verifyDev() }} style={{ margin:0 }}>
      <input type="password" autoComplete="current-password" value={pwInput}
        onChange={e => setPwInput(e.target.value)}
        placeholder="開発者パスワード"
        style={{ width:'100%', padding:'13px', borderRadius:11, border:`1.5px solid ${C.border}`, fontSize:15, fontFamily:FONT, outline:'none', marginBottom:11, color:C.text }}
      />
      <button type="submit"
        style={{ width:'100%', padding:'13px', borderRadius:11, border:'none', background:C.primaryDark, color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
        認証する
      </button>
      </form>
    </div>
  )
}
