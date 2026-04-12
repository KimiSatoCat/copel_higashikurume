import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { C, FONT, DOW_JA } from '../theme'
import { cacheGet, cacheSet } from '../utils/cache'
import { useData } from '../contexts/DataContext'

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

const makeSlots = () => SLOT_TIMES.map((t, i) => ({
  slot:      i + 1,
  time:      t,
  staffId:   '',
  staffName: '',
  childId:   '',
  childName: '',
  status:    '予定',
  memo:      '',
}))

// 旧フォーマット（cards配列あり）→ 新フォーマット（flat）へ変換
const migrateSlot = (sv, i) => {
  if (!sv) return makeSlots()[i]
  // 旧フォーマット: cards 配列の先頭カード・先頭の子どもだけを使う
  if (sv.cards && Array.isArray(sv.cards)) {
    const card  = sv.cards[0] || {}
    const child = card.children?.[0] || {}
    return {
      slot:      sv.slot      || i + 1,
      time:      sv.time      || SLOT_TIMES[i] || '',
      staffId:   card.staffId   || '',
      staffName: card.staffName || '',
      childId:   child.childId  || '',
      childName: child.childName || '',
      status:    child.status   || '予定',
      memo:      child.comment  || card.groupMemo || '',
    }
  }
  // 新フォーマットはそのまま
  return {
    slot:      sv.slot      || i + 1,
    time:      sv.time      || SLOT_TIMES[i] || '',
    staffId:   sv.staffId   || '',
    staffName: sv.staffName || '',
    childId:   sv.childId   || '',
    childName: sv.childName || '',
    status:    sv.status    || '予定',
    memo:      sv.memo      || '',
  }
}

export default function Sessions() {
  const { staffList, children } = useData()

  const today   = new Date()
  const dateKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const label   = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${DOW_JA[today.getDay()]}）`

  const [slots, setSlots] = useState(() => {
    const cached = cacheGet(`sessions_${dateKey}`)
    // [] はキャッシュ済みだが空なので makeSlots() にフォールバック
    if (Array.isArray(cached) && cached.length > 0) {
      return cached.map((sv, i) => migrateSlot(sv, i))
    }
    return makeSlots()
  })

  const [loading, setLoading] = useState(() => {
    const cached = cacheGet(`sessions_${dateKey}`)
    return !(Array.isArray(cached) && cached.length > 0)
  })

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'facilities', FACILITY_ID, 'sessions', dateKey),
      snap => {
        setLoading(false)
        if (!snap.exists()) return
        const saved = snap.data().slots
        if (!Array.isArray(saved) || saved.length === 0) return
        const migrated = saved.map((sv, i) => migrateSlot(sv, i))
        cacheSet(`sessions_${dateKey}`, migrated)
        setSlots(migrated)
      },
      () => setLoading(false)
    )
    return () => unsub()
  }, [dateKey])

  const persist = (next) => {
    cacheSet(`sessions_${dateKey}`, next)
    setDoc(
      doc(db, 'facilities', FACILITY_ID, 'sessions', dateKey),
      { slots: next, date: dateKey },
      { merge: true }
    ).catch(err => console.error('[Sessions] save:', err.message))
  }

  const updateSlot = (si, changes) => {
    setSlots(prev => {
      const next = prev.map((s, i) => i !== si ? s : { ...s, ...changes })
      persist(next)
      return next
    })
  }

  const setStaff = (si, staffId) => {
    const staff = staffList.find(x => x.id === staffId)
    updateSlot(si, {
      staffId,
      staffName: staff
        ? (staff.hiraganaFirst ? `${staff.hiraganaFirst}先生` : staff.name)
        : '',
    })
  }

  const setChild = (si, childId) => {
    const child = children.find(x => x.id === childId)
    updateSlot(si, { childId, childName: child?.name || '' })
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ fontSize:19, fontWeight:800, color:C.text, marginBottom:3 }}>
        🧩 だれが・どのコマ・どの子ども
      </div>
      <div style={{ fontSize:13, color:C.sub, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:12, color:C.primary, background:C.primaryLight, borderRadius:9, padding:'7px 12px', marginBottom:16 }}>
        ✏️ 各コマの担当者と子どもを入力してください。入力内容は自動保存されます。
      </div>

      {loading && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'16px 0', color:C.sub }}>
          <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${C.primaryLight}`, borderTopColor:C.primary, animation:'spin .7s linear infinite', flexShrink:0 }}/>
          <span style={{ fontSize:14 }}>読み込み中…</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {slots.map((slot, si) => {
        const sc = STATUS_CFG[slot.status] || STATUS_CFG['予定']
        // 他のコマで選択済みの職員・子どもを除外
        const takenStaff    = slots.filter((_, i) => i !== si).map(s => s.staffId).filter(Boolean)
        const takenChildren = slots.filter((_, i) => i !== si).map(s => s.childId).filter(Boolean)

        return (
          <div key={si} style={{ background:C.card, borderRadius:20, padding:14, marginBottom:14, border:`1.5px solid ${C.border}` }}>

            {/* コマヘッダー */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <div style={{ width:34, height:34, borderRadius:10, background:C.primaryLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:C.primary, flexShrink:0 }}>
                {slot.slot}
              </div>
              <div>
                <div style={{ fontSize:12, color:C.sub }}>コマ{slot.slot}</div>
                <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{slot.time}</div>
              </div>
              {(slot.staffId || slot.childId) && (
                <div style={{ marginLeft:'auto', background:sc.bg, color:sc.c, border:`1px solid ${sc.border}`, borderRadius:99, padding:'3px 10px', fontSize:11, fontWeight:700 }}>
                  {slot.status}
                </div>
              )}
            </div>

            {/* 担当職員 */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>担当職員</div>
              <select
                value={slot.staffId}
                onChange={e => setStaff(si, e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:`1.5px solid ${slot.staffId ? C.primary : C.border}`, fontSize:13, fontFamily:FONT, background:C.bg, color:C.text, outline:'none' }}>
                <option value="">担当職員を選ぶ</option>
                {staffList
                  .filter(x => !takenStaff.includes(x.id) || x.id === slot.staffId)
                  .map(x => (
                    <option key={x.id} value={x.id}>
                      {x.hiraganaFirst ? `${x.hiraganaFirst}先生（${x.name}）` : x.name}
                    </option>
                  ))
                }
              </select>
            </div>

            {/* 担当する子ども */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>担当する子ども</div>
              <select
                value={slot.childId}
                onChange={e => setChild(si, e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:`1.5px solid ${slot.childId ? C.amber : C.border}`, fontSize:13, fontFamily:FONT, background:C.bg, color:C.text, outline:'none' }}>
                <option value="">子どもを選ぶ</option>
                {children
                  .filter(x => !takenChildren.includes(x.id) || x.id === slot.childId)
                  .map(x => <option key={x.id} value={x.id}>{x.name}</option>)
                }
              </select>
            </div>

            {/* 出欠ボタン */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>出欠</div>
              <div style={{ display:'flex', gap:6 }}>
                {['来所済み','予定','欠席'].map(st => {
                  const cfg = STATUS_CFG[st]
                  const on  = slot.status === st
                  return (
                    <button key={st} type="button"
                      onClick={() => updateSlot(si, { status: st })}
                      style={{ flex:1, padding:'8px 4px', borderRadius:9, border:`1.5px solid ${on?cfg.border:C.border}`, background:on?cfg.bg:'transparent', fontSize:12, fontWeight:on?700:400, color:on?cfg.c:C.sub, cursor:'pointer', fontFamily:FONT, transition:'all .15s' }}>
                      {st}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* メモ */}
            <div>
              <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>
                {slot.childName ? `${slot.childName}さんのメモ` : 'メモ'}
              </div>
              <textarea
                key={`${dateKey}-${si}-memo`}
                defaultValue={slot.memo || ''}
                onBlur={e => updateSlot(si, { memo: e.target.value })}
                placeholder="子どものようす・気づきなど"
                rows={2}
                style={{ width:'100%', padding:'8px 10px', borderRadius:9, border:`1.5px solid ${C.border}`, fontSize:12, fontFamily:FONT, resize:'vertical', outline:'none', lineHeight:1.5, color:C.text, background:C.bg, boxSizing:'border-box' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
