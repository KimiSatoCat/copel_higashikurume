# コペルプラス 東久留米教室　勤務管理アプリ

## 必要なもの（事前準備）

- Node.js 18以上（https://nodejs.org）
- Firebase アカウント（無料で作成可）
- Google アカウント（施設用）
- Vercel アカウント（無料で作成可、デプロイ先）

---

## セットアップ手順

### 1. Firebase プロジェクトを作成する

1. https://console.firebase.google.com を開く
2. 「プロジェクトを作成」→ 名前を付ける（例：copelplus-higashikurume）
3. Google アナリティクスは任意
4. 作成完了後、以下を有効にする：
   - **Authentication** → ログイン方法 → Google をオン
   - **Firestore Database** → 本番モードで作成
     - リージョン：asia-northeast1（東京）を選択
   - **Functions**（日次レポートを使う場合）：Blazeプランへのアップグレードが必要

5. プロジェクトの設定 → ウェブアプリを追加 → 設定値（apiKey等）をコピーする

### 2. 環境変数を設定する

```bash
cp .env.example .env
```

`.env` を開いて Firebase の設定値を貼り付ける：

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

### 3. 開発サーバーを起動する

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開く

### 4. Firestore セキュリティルールを反映する

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # プロジェクトを選択
firebase deploy --only firestore:rules
```

### 5. スプレッドシートを作成する

#### 方法A：Excelファイルをそのまま使う

```bash
npm run create-sheets
```

`copelplus_勤務記録_2026-2035.xlsx` が作成されます。
Google ドライブにアップロードしてご利用ください。

#### 方法B：Google スプレッドシートとして直接作成する（日次自動更新に対応）

1. Google スプレッドシートを新規作成する
2. 拡張機能 → Apps Script を開く
3. `sheets-setup.gs` の内容をコピー＆ペースト
4. `createAllSheets` 関数を実行する（5〜10分かかります）
5. URLの `spreadsheets/d/XXXXXX/edit` の `XXXXXX` をコピー
6. `.env` の `VITE_SPREADSHEET_ID` に貼り付ける

### 6. Firebase Functions をデプロイする（日次自動保存を使う場合）

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Functions の環境変数を設定：

```bash
firebase functions:secrets:set SPREADSHEET_ID
firebase functions:secrets:set GMAIL_USER
firebase functions:secrets:set GMAIL_PASS
```

※ GMAIL_PASS はGoogleアカウントの「アプリパスワード」を使用してください

### 7. 最初の職員（責任者）を登録する

1. アプリにGoogleアカウントでログインする
2. Firestore コンソール → `facilities/higashikurume/staff/{あなたのUID}` を開く
3. `role` フィールドを `admin` に変更する
4. または、設定画面 → 開発者 → 開発者パスワードを入力して権限を設定する

### 8. Vercel にデプロイする

```bash
npm install -g vercel
vercel
```

指示に従って設定する。環境変数は Vercel のダッシュボードで設定する。

---

## Firebase Authorized Domains の設定

Googleログインを本番環境で使用するには：

1. Firebase コンソール → Authentication → Settings → 承認済みドメイン
2. Vercel でデプロイしたドメイン（例：copelplus.vercel.app）を追加する

---

## 開発者パスワード

```
testcopel_higashikurume_formaruhaut19980303
```

⚠️ このパスワードは関係者以外に共有しないでください

認証後5分で自動的に開発者モードが終了します

---

## ディレクトリ構成

```
copelplus/
├── src/
│   ├── App.jsx               # メインルーター
│   ├── firebase.js           # Firebase設定
│   ├── theme.js              # カラー・定数
│   ├── main.jsx              # エントリポイント
│   ├── contexts/
│   │   └── AuthContext.jsx   # 認証・権限管理
│   └── screens/
│       ├── Login.jsx         # Googleログイン
│       ├── Home.jsx          # ホーム（きょうのようす）
│       ├── Calendar.jsx      # みんなのスケジュール
│       ├── Sessions.jsx      # だれが・どのコマ・どの子ども
│       ├── Hidamari.jsx      # こころのひだまり
│       └── Settings.jsx      # 設定・権限管理
├── functions/
│   ├── index.js              # Firebase Functions（日次レポート・メール）
│   └── package.json
├── scripts/
│   └── create-sheets.js      # Excelテンプレート生成スクリプト
├── sheets-setup.gs           # Google Apps Script（スプレッドシート作成）
├── firestore.rules           # Firestoreセキュリティルール
├── package.json
├── vite.config.js
├── index.html
└── .env.example
```

---

## 権限の種類

| 権限名 | 内容 |
|--------|------|
| developer（開発者） | すべての操作・権限変更が可能 |
| admin（責任者） | 全機能操作・副責任者の任命 |
| sub_admin（副責任者） | 管理者に準ずる操作 |
| editor（編集者） | スケジュールの作成・編集のみ |
| staff（一般職員） | 自分に関係する機能のみ |

---

## 質問・不具合

開発者にご連絡ください。
