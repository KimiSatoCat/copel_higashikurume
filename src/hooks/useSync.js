import { useState, useEffect, useCallback, useRef } from 'react'

const SYNC_INTERVAL_MS = 60 * 60 * 1000
const ACTIVE_START = 8
const ACTIVE_END   = 20

function isActiveHour() {
  const h = new Date().getHours()
  return h >= ACTIVE_START && h < ACTIVE_END
}

export function useSync(syncFn) {
  const [lastSync,   setLastSync]   = useState(null)
  const [syncing,    setSyncing]    = useState(false)
  const [nextSyncIn, setNextSyncIn] = useState(0)
  const timerRef  = useRef(null)
  const countRef  = useRef(null)

  const doSync = useCallback(async (manual = false) => {
    if (!isActiveHour() && !manual) return
    setSyncing(true)
    try {
      await syncFn()
      setLastSync(new Date())
    } catch (err) {
      console.warn('[sync]', err.message)
    }
    setSyncing(false)
  }, [syncFn])

  useEffect(() => {
    const schedule = () => {
      clearTimeout(timerRef.current)
      clearInterval(countRef.current)

      if (!isActiveHour()) {
        const now  = new Date()
        const next = new Date(now)
        if (now.getHours() >= ACTIVE_END) next.setDate(next.getDate() + 1)
        next.setHours(ACTIVE_START, 0, 0, 0)
        setNextSyncIn(Math.floor((next - now) / 1000))
        timerRef.current = setTimeout(schedule, next - now)
        return
      }

      setNextSyncIn(Math.floor(SYNC_INTERVAL_MS / 1000))
      countRef.current = setInterval(() => {
        setNextSyncIn(prev => {
          if (prev <= 1) { doSync(); return Math.floor(SYNC_INTERVAL_MS / 1000) }
          return prev - 1
        })
      }, 1000)
      timerRef.current = setTimeout(() => { doSync(); schedule() }, SYNC_INTERVAL_MS)
    }

    schedule()
    return () => { clearTimeout(timerRef.current); clearInterval(countRef.current) }
  }, [doSync])

  const manualSync = () => doSync(true)

  const formatNext = () => {
    if (!isActiveHour()) return '夜間停止中（8:00再開）'
    const m = Math.floor(nextSyncIn / 60)
    const s = nextSyncIn % 60
    return `次の自動更新まで ${m}分${String(s).padStart(2,'0')}秒`
  }

  return { syncing, lastSync, isActive: isActiveHour(), manualSync, formatNext }
}
