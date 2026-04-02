import { useState, useEffect, useCallback, useRef } from 'react'

const SYNC_INTERVAL_MS = 60 * 60 * 1000  // 60分
const ACTIVE_START = 8
const ACTIVE_END   = 20

function isActiveHour() {
  const h = new Date().getHours()
  return h >= ACTIVE_START && h < ACTIVE_END
}

export function useSync(syncFn) {
  const [lastSync,  setLastSync]  = useState(null)
  const [syncing,   setSyncing]   = useState(false)
  // ★ 分単位のテキストのみ管理（毎秒更新をやめる）
  const [statusText, setStatusText] = useState('')
  const timerRef = useRef(null)
  const countRef = useRef(null)

  const doSync = useCallback(async (manual = false) => {
    if (!isActiveHour() && !manual) return
    setSyncing(true)
    try {
      await syncFn()
      setLastSync(new Date())
    } catch (err) {
      console.warn('[sync]', err.code || err.message)
    }
    setSyncing(false)
  }, [syncFn])

  const updateStatus = useCallback(() => {
    if (!isActiveHour()) {
      setStatusText('夜間停止中（8:00再開）')
      return
    }
    const timerStart = timerRef.current?._scheduledAt
    if (!timerStart) { setStatusText('同期待機中'); return }
    const remaining = Math.max(0, timerStart - Date.now())
    const m = Math.ceil(remaining / 60000)
    setStatusText(`次の自動更新まで ${m} 分`)
  }, [])

  useEffect(() => {
    const schedule = () => {
      clearTimeout(timerRef.current)
      clearInterval(countRef.current)

      if (!isActiveHour()) {
        setStatusText('夜間停止中（8:00再開）')
        const now  = new Date()
        const next = new Date(now)
        if (now.getHours() >= ACTIVE_END) next.setDate(next.getDate() + 1)
        next.setHours(ACTIVE_START, 0, 0, 0)
        const t = setTimeout(() => schedule(), next - now)
        t._scheduledAt = next.getTime()
        timerRef.current = t
        return
      }

      const fireAt = Date.now() + SYNC_INTERVAL_MS
      const t = setTimeout(() => { doSync(); schedule() }, SYNC_INTERVAL_MS)
      t._scheduledAt = fireAt
      timerRef.current = t

      // ★ 毎分だけ表示を更新（毎秒ではなく）
      updateStatus()
      countRef.current = setInterval(updateStatus, 60000)
    }

    schedule()
    return () => { clearTimeout(timerRef.current); clearInterval(countRef.current) }
  }, [doSync, updateStatus])

  const manualSync = useCallback(() => doSync(true), [doSync])

  return { syncing, lastSync, isActive: isActiveHour(), manualSync, statusText }
}
