export const C = {
  bg: '#FFF8F2', card: '#FFFFFF',
  primary: '#52BAA8', primaryLight: '#E6F5F3', primaryDark: '#3A9A88',
  coral: '#FF8A75', coralLight: '#FFECEA',
  amber: '#FFB94A', amberLight: '#FFF5E0',
  purple: '#A394D4', purpleLight: '#F0ECFA',
  green: '#6BC48A', greenLight: '#E8F6ED',
  blue: '#5EA8D4', blueLight: '#E6F3FB',
  red: '#EF5350', redLight: '#FFEBEE',
  text: '#2C2926', sub: '#7A7068', muted: '#B0A89E',
  border: '#EDE4D9', divider: '#F5EDE5',
}

export const SHIFT = {
  in:   { label: '出勤',  short: '○', bg: '#E6F5F3', color: '#3A9A88', dot: '#52BAA8' },
  late: { label: '遅番',  short: '遅', bg: '#FFF5E0', color: '#B07800', dot: '#FFB94A' },
  ext:  { label: '外勤',  short: '外', bg: '#FFECEA', color: '#CC5040', dot: '#FF8A75' },
  off:  { label: 'お休み',short: '－', bg: '#F5F1EC', color: '#9A908A', dot: '#C8C0B8' },
}

export const FONT = "'M PLUS Rounded 1c', sans-serif"

// 開発者パスワードのSHA-256ハッシュ
export const DEV_PASSWORD_HASH = 'b6ac93f8bec0b6541e26ed934489229741113c5049e9cadebd34053d2b59a429'

// 開発者モードのタイムアウト（ミリ秒）
export const DEV_TIMEOUT_MS = 5 * 60 * 1000

export const ROLES = {
  DEVELOPER: 'developer',
  ADMIN: 'admin',         // 責任者
  SUB_ADMIN: 'sub_admin', // 副責任者
  EDITOR: 'editor',       // スケジュール編集権限
  STAFF: 'staff',         // 一般職員
}

export const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']
