/**
 * sheets-setup.gs
 * Google Apps Script でスプレッドシートの10年分シートを一括作成するスクリプト
 *
 * 使い方:
 * 1. Google スプレッドシートを新規作成する
 * 2. 拡張機能 → Apps Script を開く
 * 3. このコードを貼り付けて実行（createAllSheets 関数）
 * 4. 作成されたスプレッドシートのIDを .env の VITE_SPREADSHEET_ID に設定する
 */

const DOW_JA     = ['日','月','火','水','木','金','土']
const START_YEAR = 2026
const END_YEAR   = 2035
const TEAL       = '#52BAA8'
const TEAL_LIGHT = '#E6F5F3'
const HEADERS    = [
  '日','曜日','出勤者','出勤人数','外勤者','遅刻者','お休み','来所児童数','イベント',
  'コマ1担当','コマ1子ども','コマ1出欠','コマ1メモ',
  'コマ2担当','コマ2子ども','コマ2出欠','コマ2メモ',
  'コマ3担当','コマ3子ども','コマ3出欠','コマ3メモ',
  'コマ4担当','コマ4子ども','コマ4出欠','コマ4メモ',
  'コマ5担当','コマ5子ども','コマ5出欠','コマ5メモ',
  '備考'
]

function createAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()

  // 既存シートをすべて削除（Sheet1 のみ残す）
  const sheets = ss.getSheets()
  for (let i = sheets.length - 1; i >= 0; i--) {
    if (sheets[i].getName() !== 'Sheet1') ss.deleteSheet(sheets[i])
  }

  // 目次シートの作成
  const tocSheet = ss.getSheetByName('Sheet1')
  tocSheet.setName('目次')
  tocSheet.getRange('A1').setValue('コペルプラス 東久留米教室　勤務記録　2026〜2035年')
    .setFontWeight('bold').setFontSize(14).setBackground(TEAL_LIGHT)
  ss.setSpreadsheetTheme(ss.createTheme())

  let tocRow = 3
  tocSheet.getRange('A2').setValue('シート名').setFontWeight('bold').setBackground(TEAL).setFontColor('#FFFFFF')
  tocSheet.getRange('B2').setValue('作成日').setFontWeight('bold').setBackground(TEAL).setFontColor('#FFFFFF')

  // 各月シートを作成
  for (let year = START_YEAR; year <= END_YEAR; year++) {
    for (let month = 1; month <= 12; month++) {
      const sheetName   = `${year}年${month}月`
      const daysInMonth = new Date(year, month, 0).getDate()

      // シートを作成（末尾に追加）
      const ws = ss.insertSheet(sheetName)
      ws.setColumnWidth(1, 35)
      ws.setColumnWidth(2, 35)
      ws.setColumnWidth(3, 150)
      ws.setColumnWidth(4, 55)
      ws.setColumnWidth(5, 90)
      ws.setColumnWidth(6, 70)
      ws.setColumnWidth(7, 90)
      ws.setColumnWidth(8, 55)
      ws.setColumnWidth(9, 110)
      for (let ci = 10; ci <= 10 + 20; ci++) {
        ws.setColumnWidth(ci, ci % 4 === 2 ? 70 : ci % 4 === 3 ? 60 : ci % 4 === 0 ? 60 : 130)
      }
      ws.setColumnWidth(30, 140)

      // タイトル行
      ws.getRange(1, 1, 1, HEADERS.length).merge()
        .setValue(`コペルプラス 東久留米教室　勤務記録　${year}年${month}月`)
        .setFontWeight('bold').setFontSize(13).setBackground(TEAL_LIGHT)
        .setHorizontalAlignment('center').setVerticalAlignment('middle')
      ws.setRowHeight(1, 28)

      // ヘッダー行
      const hRange = ws.getRange(2, 1, 1, HEADERS.length)
      hRange.setValues([HEADERS])
        .setFontWeight('bold').setFontSize(10).setBackground(TEAL)
        .setFontColor('#FFFFFF').setHorizontalAlignment('center')
        .setVerticalAlignment('middle').setWrap(true)
      ws.setRowHeight(2, 34)

      // データ行
      const dataRows = []
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(year, month-1, d).getDay()
        dataRows.push([d, DOW_JA[dow], ...Array(HEADERS.length - 2).fill('')])
      }
      if (dataRows.length > 0) {
        const dr = ws.getRange(3, 1, dataRows.length, HEADERS.length)
        dr.setValues(dataRows).setFontSize(10).setVerticalAlignment('middle')

        // 罫線
        dr.setBorder(true, true, true, true, true, true, '#EDE4D9', SpreadsheetApp.BorderStyle.SOLID)

        // 曜日の色分け
        for (let d = 1; d <= daysInMonth; d++) {
          const dow = new Date(year, month-1, d).getDay()
          const row = d + 2
          const rowRange = ws.getRange(row, 1, 1, HEADERS.length)
          if (dow === 0) rowRange.setBackground('#FFECEA')
          else if (dow === 6) rowRange.setBackground('#FFF5E0')
          ws.setRowHeight(row, 20)
        }

        // 曜日の文字色
        for (let d = 1; d <= daysInMonth; d++) {
          const dow = new Date(year, month-1, d).getDay()
          const row = d + 2
          if (dow === 0) ws.getRange(row, 2).setFontColor('#CC5040')
          if (dow === 6) ws.getRange(row, 2).setFontColor('#5EA8D4')
        }
      }

      // 目次に追加
      tocSheet.getRange(tocRow, 1).setValue(sheetName)
      tocSheet.getRange(tocRow, 2).setValue(new Date(year, month-1, 1))
        .setNumberFormat('yyyy年mm月')
      tocRow++

      SpreadsheetApp.flush()
      Utilities.sleep(100) // レート制限対策
    }
  }

  // 目次シートに戻る
  ss.setActiveSheet(tocSheet)
  Logger.log('✅ 全シートの作成が完了しました（' + ((END_YEAR - START_YEAR + 1) * 12) + 'シート）')
  Logger.log('スプレッドシートID: ' + ss.getId())
}

/**
 * 指定された日付のデータをシートに書き込む（Firebase Functionsから呼び出せるようにする場合の参考）
 */
function writeDaily(year, month, day, rowData) {
  const ss        = SpreadsheetApp.getActiveSpreadsheet()
  const sheetName = `${year}年${month}月`
  const ws        = ss.getSheetByName(sheetName)
  if (!ws) { Logger.log(`シート ${sheetName} が見つかりません`); return }

  const rowNum = day + 2  // ヘッダー2行分
  ws.getRange(rowNum, 1, 1, rowData.length).setValues([rowData])
}
