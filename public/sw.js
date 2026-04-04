// このファイルは古いService Workerを強制削除するためのものです
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => {
  self.registration.unregister().then(() => {
    console.log('[SW] 旧Service Workerを削除しました')
  })
})
