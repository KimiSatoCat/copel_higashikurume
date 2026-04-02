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
  const [statusText, setStatusText] = useState('')
  const timerRef    = useRef(null)
  const intervalRef = useRef(null)
  const fireAtRef   = useRef(null)   // ★ タイマー発火時刻を ref で管理

  const doSync = useCallback(async (manual = false) => {
    if (!isActiveHour() && !manual) return
    setSyncing(true)
    try { await syncFn() } catch (err) { console.warn('[sync]', err.code || err.message) }
    setLastSync(new Date())
    setSyncing(false)
  }, [syncFn])

  const updateStatus = useCallback(() => {
    if (!isActiveHour()) {
      setStatusText('夜間停止中（8:00再開）')
      return
    }
    if (!fireAtRef.current) { setStatusText('同期待機中'); return }
    const m = Math.max(1, Math.ceil((fireAtRef.current - Date.now()) / 60000))
    setStatusText(`次の自動更新まで ${m} 分`)
  }, [])

  useEffect(() => {
    const schedule = () => {
      clearTimeout(timerRef.current)
      clearInterval(intervalRef.current)

      if (!isActiveHour()) {
        setStatusText('夜間停止中（8:00再開）')
        const now = new Date()
        const next = new Date(now)
        if (now.getHours() >= ACTIVE_END) next.setDate(next.getDate() + 1)
        next.setHours(ACTIVE_START, 0, 0, 0)
        timerRef.current = setTimeout(schedule, next - now)
        return
      }

      fireAtRef.current = Date.now() + SYNC_INTERVAL_MS
      timerRef.current  = setTimeout(() => { doSync(); schedule() }, SYNC_INTERVAL_MS)

      updateStatus()
      intervalRef.current = setInterval(updateStatus, 60000) // 毎分だけ更新
    }

    schedule()
    return () => {
      clearTimeout(timerRef.current)
      clearInterval(intervalRef.current)
    }
  }, [doSync, updateStatus])

  const manualSync = useCallback(() => doSync(true), [doSync])

  return { syncing, lastSync, isActive: isActiveHour(), manualSync, statusText }
}
