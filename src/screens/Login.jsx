import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { C, FONT } from '../theme'

export default function Login() {
  const { signIn } = useAuth()
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      await signIn()
    } catch (err) {
      setError('ログインできませんでした。もう一度お試しください。')
      console.error(err)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight:'100vh',
      background:`linear-gradient(150deg,${C.primaryLight} 0%,${C.bg} 45%,${C.coralLight} 100%)`,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'40px 20px', fontFamily:FONT
    }}>

      {/* ロゴ */}
      <div style={{ textAlign:'center', marginBottom:44 }}>
        <div style={{
          width:88, height:88, borderRadius:'50%', background:C.primary,
          display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 16px', fontSize:44,
          boxShadow:`0 8px 28px ${C.primary}55`
        }}>🌿</div>
        <div style={{ fontSize:26, fontWeight:800, color:C.text, lineHeight:1.2 }}>コペルプラス</div>
        <div style={{ fontSize:20, fontWeight:700, color:C.primary, marginTop:4 }}>東久留米教室</div>
        <div style={{ fontSize:15, color:C.sub, marginTop:6 }}>勤務管理アプリ</div>
      </div>

      {/* ログインカード */}
      <div style={{
        background:C.card, borderRadius:24, padding:'32px 24px',
        width:'100%', maxWidth:360, boxShadow:'0 8px 40px rgba(0,0,0,0.10)'
      }}>
        <div style={{ fontSize:16, color:C.sub, textAlign:'center', marginBottom:24, lineHeight:1.7 }}>
          ふだん使っている<br/>Googleアカウントでログインできます
        </div>

        {error && (
          <div style={{ background:C.coralLight, borderRadius:12, padding:'10px 14px', marginBottom:16, fontSize:14, color:C.coral, textAlign:'center' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width:'100%', padding:'16px', borderRadius:14,
            border:`2px solid ${C.border}`,
            background:loading ? C.bg : C.card,
            cursor:loading ? 'wait' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:12,
            fontSize:17, fontWeight:700, color:C.text, fontFamily:FONT,
            transition:'all .15s',
          }}
        >
          {loading ? (
            <span style={{ color:C.primary }}>ログイン中…</span>
          ) : (
            <>
              {/* Google ロゴ */}
              <svg width={22} height={22} viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Googleでログイン</span>
            </>
          )}
        </button>

        <div style={{ fontSize:13, color:C.muted, textAlign:'center', marginTop:20, lineHeight:1.6 }}>
          はじめてログインする方は<br/>責任者または開発者が権限を設定します
        </div>
      </div>

      <div style={{ fontSize:13, color:C.muted, marginTop:28, textAlign:'center' }}>
        コペルプラス 東久留米教室の職員専用アプリです
      </div>
    </div>
  )
}
