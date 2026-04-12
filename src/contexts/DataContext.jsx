// DataContext: staffList / children / schedule / sessions を App 起動時に一括取得
// → 各画面は Firestore に触れずキャッシュ済みデータを即時参照できる
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { collection, doc, onSnapshot, getDocs } from 'firebase/firestore'
import { db, FACILITY_ID } from '../firebase'
import { cacheGet, cacheSet, cacheClear } from '../utils/cache'

const Ctx = createContext(null)

export function DataProvider({ user, children }) {
  const today   = new Date()
  const y  = today.getFullYear()
  const m  = today.getMonth() + 1
  const d  = today.getDate()
  const ym      = `${y}-${String(m).padStart(2,'0')}`
  const dateKey = `${ym}-${String(d).padStart(2,'0')}`

  // ── キャッシュから即時初期値 ─────────────────────────────────
  const [staffList, setStaffList] = useState(() => cacheGet('staffList') || [])
  const [children2, setChildren2] = useState(() => cacheGet('children')  || [])
  const [schedule,  setSchedule]  = useState(() => cacheGet(`schedule_${ym}`)       || { shifts:{}, events:{} })
  const [sessions,  setSessions]  = useState(() => cacheGet(`sessions_${dateKey}`)   || [])

  // ── ローディング：キャッシュがない項目のみtrue ───────────────
  const [loadingStaff,    setLoadingStaff]    = useState(!cacheGet('staffList'))
  const [loadingChildren, setLoadingChildren] = useState(!cacheGet('children'))
  const [loadingSchedule, setLoadingSchedule] = useState(!cacheGet(`schedule_${ym}`))
  const [loadingSessions, setLoadingSessions] = useState(!cacheGet(`sessions_${dateKey}`))

  const loading = loadingStaff || loadingSchedule || loadingSessions

  // ── 職員リストを再取得してキャッシュ更新（Settings側から呼び出す） ──
  const refreshStaff = useCallback(async () => {
    cacheClear('staffList')
    try {
      const s = await getDocs(collection(db,'facilities',FACILITY_ID,'staff'))
      const list = s.docs.filter(d=>d.data().active!==false).map(d=>({id:d.id,...d.data()}))
      setStaffList(list)
      cacheSet('staffList', list)
    } catch (_) {}
  }, [])

  // ── 児童リストを再取得してキャッシュ更新 ────────────────────
  const refreshChildren = useCallback(async () => {
    cacheClear('children')
    try {
      const s = await getDocs(collection(db,'facilities',FACILITY_ID,'children'))
      const list = s.docs.map(d=>({id:d.id,...d.data()}))
      setChildren2(list)
      cacheSet('children', list)
    } catch (_) {}
  }, [])

  useEffect(() => {
    if (!user) return

    // 職員リスト
    getDocs(collection(db,'facilities',FACILITY_ID,'staff'))
      .then(s => {
        const list = s.docs.filter(d=>d.data().active!==false).map(d=>({id:d.id,...d.data()}))
        setStaffList(list); cacheSet('staffList', list); setLoadingStaff(false)
      }).catch(() => setLoadingStaff(false))

    // 児童リスト
    getDocs(collection(db,'facilities',FACILITY_ID,'children'))
      .then(s => {
        const list = s.docs.map(d=>({id:d.id,...d.data()}))
        setChildren2(list); cacheSet('children', list); setLoadingChildren(false)
      }).catch(() => setLoadingChildren(false))

    // 今月シフト（リアルタイム）
    const u1 = onSnapshot(
      doc(db,'facilities',FACILITY_ID,'schedules',ym),
      snap => {
        const data = snap.exists() ? snap.data() : { shifts:{}, events:{} }
        setSchedule(data); cacheSet(`schedule_${ym}`, data); setLoadingSchedule(false)
      },
      () => setLoadingSchedule(false)
    )

    // 今日セッション（リアルタイム）
    const u2 = onSnapshot(
      doc(db,'facilities',FACILITY_ID,'sessions',dateKey),
      snap => {
        const slots = snap.exists() ? (snap.data().slots || []) : []
        setSessions(slots); cacheSet(`sessions_${dateKey}`, slots); setLoadingSessions(false)
      },
      () => setLoadingSessions(false)
    )

    return () => { u1(); u2() }
  }, [user, ym, dateKey])

  return (
    <Ctx.Provider value={{ staffList, children: children2, schedule, sessions, loading, ym, dateKey, today:{ y,m,d }, refreshStaff, refreshChildren }}>
      {children}
    </Ctx.Provider>
  )
}

export const useData = () => useContext(Ctx)
