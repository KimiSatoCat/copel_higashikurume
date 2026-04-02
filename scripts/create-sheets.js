// scripts/create-sheets.js  (exceljs版 — 7セット対応・完全カラー)
import ExcelJS from 'exceljs'

const DOW_JA = ['日','月','火','水','木','金','土']
const START_YEAR = 2026, START_MONTH = 4, END_YEAR = 2035
const SLOT_TIMES = ['10:00〜11:00','11:15〜12:15','14:30〜15:30','15:45〜16:45','17:00〜18:00']

const HOLIDAYS = new Set([
  '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20',
  '2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06',
  '2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23',
  '2026-10-12','2026-11-03','2026-11-23',
  '2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21',
  '2027-04-29','2027-05-03','2027-05-04','2027-05-05',
  '2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11',
  '2027-11-03','2027-11-23',
  '2028-01-01','2028-01-10','2028-02-11','2028-02-23','2028-03-20',
  '2028-04-29','2028-05-03','2028-05-04','2028-05-05',
  '2028-07-17','2028-08-11','2028-09-18','2028-09-22','2028-10-09',
  '2028-11-03','2028-11-23',
  '2029-01-01','2029-01-08','2029-02-11','2029-02-23','2029-03-20',
  '2029-04-29','2029-05-03','2029-05-04','2029-05-05',
  '2030-01-01','2030-01-14','2030-02-11','2030-02-23','2030-03-20',
  '2030-04-29','2030-05-03','2030-05-04','2030-05-05',
  '2031-01-01','2031-01-13','2031-02-11','2031-02-23','2031-03-21',
  '2031-04-29','2031-05-03','2031-05-04','2031-05-05',
  '2032-01-01','2032-01-12','2032-02-11','2032-02-23','2032-03-20',
  '2032-04-29','2032-05-03','2032-05-04','2032-05-05',
  '2033-01-01','2033-01-10','2033-02-11','2033-02-23','2033-03-20',
  '2033-04-29','2033-05-03','2033-05-04','2033-05-05',
  '2034-01-01','2034-01-09','2034-02-11','2034-02-23','2034-03-20',
  '2034-04-29','2034-05-03','2034-05-04','2034-05-05',
  '2035-01-01','2035-01-08','2035-02-11','2035-02-23','2035-03-21',
  '2035-04-29','2035-05-03','2035-05-04','2035-05-05',
])

function dateStr(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
function isHoliday(y,m,d){ return HOLIDAYS.has(dateStr(y,m,d)) }

// ─── 列構造（固定） ─────────────────────────────────────────
// 列1〜5: 日付 / 曜日 / コマ / 時間帯 / タイプ
// 列6〜33: 担当職員①〜⑦ × 4列（職員名・子ども名・出欠・コメント）
//   ①: 6-9   ②: 10-13  ③: 14-17  ④: 18-21  ⑤: 22-25
//   ⑥: 26-29 ⑦: 30-33
// 列34: 集団メモ
// 列35: 備考
// 合計35列

const STAFF_SETS   = 7                // 担当者セット数
const FIXED_COLS   = 5                // 日付〜タイプ
const COLS_PER_SET = 4                // 職員名・子ども名・出欠・コメント
const MEMO_COL     = FIXED_COLS + STAFF_SETS * COLS_PER_SET + 1  // = 34
const BIKO_COL     = MEMO_COL + 1    // = 35
const TOTAL_COLS   = BIKO_COL        // 35

const HEADERS = [
  '日付','曜日','コマ','時間帯','タイプ',
  '担当職員①','子ども①名前','子ども①出欠','子ども①コメント',
  '担当職員②','子ども②名前','子ども②出欠','子ども②コメント',
  '担当職員③','子ども③名前','子ども③出欠','子ども③コメント',
  '担当職員④','子ども④名前','子ども④出欠','子ども④コメント',
  '担当職員⑤','子ども⑤名前','子ども⑤出欠','子ども⑤コメント',
  '担当職員⑥（保護者対応）','子ども⑥名前','子ども⑥出欠','子ども⑥コメント',
  '担当職員⑦（保護者対応）','子ども⑦名前','子ども⑦出欠','子ども⑦コメント',
  '集団メモ（全体所見）','備考',
]

// 列幅（文字数）: 35列分
const COL_W = [
  8, 5, 5, 14, 8,          // 固定5列
  12, 14, 9, 28,            // ①
  12, 14, 9, 28,            // ②
  12, 14, 9, 28,            // ③
  12, 14, 9, 28,            // ④
  12, 14, 9, 28,            // ⑤
  16, 14, 9, 28,            // ⑥（保護者対応：列幅を少し広く）
  16, 14, 9, 28,            // ⑦（保護者対応）
  32, 22,                   // 集団メモ・備考
]

// ─── 色定数（ARGB形式） ────────────────────────────────────
const TEAL_DK  = 'FF52BAA8'  // ヘッダー背景・ティール
const TEAL_LT  = 'FFE6F5F3'  // タイトル背景
const TEAL_BDR = 'FF3A9A88'  // ボーダー強調

// 行背景色（曜日・祝日別）
function rowBg(y,m,d){
  const dow = new Date(y,m-1,d).getDay()
  if (dow === 0 || isHoliday(y,m,d)) return 'FFFFECEA'  // 日・祝: 薄い赤
  if (dow === 6) return 'FFE3F2FD'                       // 土: 薄い青
  if (dow === 3) return 'FFFFFDE7'                       // 水: 薄い黄
  return 'FFFFFFFF'                                      // 平日: 白
}

// 担当職員列の背景（行色より少し濃いティール系）
function staffBg(bg){
  if (bg === 'FFFFFFFF') return 'FFE8F7F5'  // 白→薄いティール
  if (bg === 'FFE3F2FD') return 'FFD5EDF8'  // 土→濃い青系
  if (bg === 'FFFFFDE7') return 'FFFFF0C0'  // 水→濃い黄系
  if (bg === 'FFFFECEA') return 'FFFFD8D8'  // 日祝→濃い赤系
  return 'FFE8F7F5'
}

// 保護者対応列（⑥⑦）の背景（やや紫がかったティール）
function parentBg(bg){
  if (bg === 'FFFFFFFF') return 'FFECE8F7'  // 白→薄い紫
  if (bg === 'FFE3F2FD') return 'FFD8D5F0'  // 土→青紫
  if (bg === 'FFFFFDE7') return 'FFF5F0FF'  // 水→黄紫
  if (bg === 'FFFFECEA') return 'FFFFE8F0'  // 日祝→ピンク紫
  return 'FFECE8F7'
}

// 集団メモ列の背景（薄い黄系）
function memoBg(bg){
  if (bg === 'FFFFFFFF') return 'FFFFFEF0'
  if (bg === 'FFE3F2FD') return 'FFF0F5FC'
  if (bg === 'FFFFFDE7') return 'FFFFFAD0'
  if (bg === 'FFFFECEA') return 'FFFFF0E8'
  return 'FFFFFEF0'
}

// 曜日文字色
function dowColor(y,m,d){
  const dow = new Date(y,m-1,d).getDay()
  if (dow === 0 || isHoliday(y,m,d)) return 'FFCC5040'
  if (dow === 6) return 'FF3366AA'
  if (dow === 3) return 'FF7B6000'
  return 'FF2C2926'
}

// ─── セルスタイル適用ヘルパー ──────────────────────────────
function applyCell(cell, {
  value='', bg='FFFFFFFF', color='FF2C2926', sz=9,
  bold=false, center=false, wrap=false,
  bTop='thin', bTopColor='FFEDE4D9',
  bLeft='thin', bLeftColor='FFEDE4D9',
}={}){
  cell.value = value || null
  cell.font   = { name:'Arial', size:sz, bold, color:{argb:color} }
  cell.fill   = { type:'pattern', pattern:'solid', fgColor:{argb:bg} }
  cell.alignment = { horizontal:center?'center':'left', vertical:'middle', wrapText:wrap }
  cell.border = {
    top:    { style:bTop,    color:{argb:bTopColor}    },
    bottom: { style:'thin',  color:{argb:'FFEDE4D9'}   },
    left:   { style:bLeft,   color:{argb:bLeftColor}   },
    right:  { style:'thin',  color:{argb:'FFEDE4D9'}   },
  }
}

async function main(){
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CopelPlus'
  wb.created = new Date()
  let count = 0

  // ─── 凡例シート ─────────────────────────────────────────
  const legWs = wb.addWorksheet('凡例')
  legWs.columns = [{width:26},{width:55}]
  const legRows = [
    ['コペルプラス 東久留米教室　支援記録　凡例（2026-2035年）',''],
    ['',''],
    ['【タイプ】',''],
    ['個別', '職員1名と子ども1名のセッション'],
    ['集団', '職員1名と複数の子どもが参加（最大5名）'],
    ['',''],
    ['【出欠】',''],
    ['来所済み', '当日来所・セッション実施'],
    ['予定',     '来所予定'],
    ['欠席',     '欠席（備考に理由を記入）'],
    ['',''],
    ['【行の色】',''],
    ['白',       '月・火・木・金曜日（平日）'],
    ['薄い青',   '土曜日'],
    ['薄い赤',   '日曜日・祝日'],
    ['薄い黄',   '水曜日'],
    ['',''],
    ['【列の色】',''],
    ['薄いティール（緑系）', '担当職員①〜⑤の列'],
    ['薄い紫系',            '担当職員⑥⑦（保護者対応）の列'],
    ['薄い黄系',            '集団メモの列'],
    ['',''],
    ['【列の構造（1コマあたり）】',''],
    ['固定列（A〜E）', '日付 / 曜日 / コマ / 時間帯 / タイプ'],
    ['担当職員列（×7セット）','職員名 / 子ども名 / 出欠 / コメント'],
    ['  ①〜⑤', '療育担当（最大5名）'],
    ['  ⑥〜⑦', '保護者対応担当（最大2名）'],
    ['集団メモ（列34）', 'グループ全体の職員所見'],
    ['備考（列35）', 'その他メモ'],
    ['',''],
    ['【コマ時間】',''],
    ...SLOT_TIMES.map((t,i)=>[`コマ${i+1}`, t]),
  ]
  legRows.forEach((row,ri)=>{
    const r = legWs.getRow(ri+1)
    r.getCell(1).value = row[0]
    r.getCell(2).value = row[1]
    if(ri===0){
      r.getCell(1).font  = {name:'Arial',size:13,bold:true,color:{argb:'FF2C2926'}}
      r.getCell(1).fill  = {type:'pattern',pattern:'solid',fgColor:{argb:TEAL_LT}}
      r.getCell(2).fill  = {type:'pattern',pattern:'solid',fgColor:{argb:TEAL_LT}}
      r.height = 26
    } else if(row[0].startsWith('【')){
      r.getCell(1).font  = {name:'Arial',size:10,bold:true,color:{argb:'FF3A9A88'}}
      r.getCell(1).fill  = {type:'pattern',pattern:'solid',fgColor:{argb:TEAL_LT}}
      r.height = 18
    } else if(row[0] && row[1]){
      r.getCell(1).font  = {name:'Arial',size:9,bold:true}
      r.getCell(2).font  = {name:'Arial',size:9}
    } else {
      r.height = 6
    }
    r.commit()
  })

  // ─── 月別シート ─────────────────────────────────────────
  for(let year=START_YEAR; year<=END_YEAR; year++){
    const mStart = (year===START_YEAR) ? START_MONTH : 1
    for(let month=mStart; month<=12; month++){
      const sn = `${year}年${month}月`
      const ws = wb.addWorksheet(sn)
      ws.columns = COL_W.map((w,i) => ({ width:w, key:String.fromCharCode(65+i) }))

      // ── タイトル行（行1） ──
      const titleRow = ws.getRow(1)
      titleRow.height = 26
      for(let ci=1; ci<=TOTAL_COLS; ci++){
        const c = titleRow.getCell(ci)
        c.fill = {type:'pattern',pattern:'solid',fgColor:{argb:TEAL_LT}}
        c.border = {
          top:   {style:'medium',color:{argb:TEAL_BDR}},
          bottom:{style:'thin',  color:{argb:TEAL_DK}},
          left:  {style:'thin',  color:{argb:'FFDDDDDD'}},
          right: {style:'thin',  color:{argb:'FFDDDDDD'}},
        }
      }
      const tc = titleRow.getCell(1)
      tc.value = `コペルプラス 東久留米教室　支援記録　${year}年${month}月`
      tc.font  = {name:'Arial',size:12,bold:true,color:{argb:'FF2C2926'}}
      tc.alignment = {horizontal:'center',vertical:'middle'}
      ws.mergeCells(1, 1, 1, TOTAL_COLS)
      titleRow.commit()

      // ── ヘッダー行（行2） ──
      const hRow = ws.getRow(2)
      hRow.height = 34
      HEADERS.forEach((h, ci) => {
        const c = hRow.getCell(ci+1)
        const isParent = ci >= FIXED_COLS + 5*COLS_PER_SET && ci < FIXED_COLS + STAFF_SETS*COLS_PER_SET
        const isMemo   = ci === TOTAL_COLS - 2
        const isBiko   = ci === TOTAL_COLS - 1
        const isStaff  = (ci - FIXED_COLS) % COLS_PER_SET === 0 && ci >= FIXED_COLS && !isMemo && !isBiko
        c.value = h
        c.font  = {name:'Arial',size:9,bold:true,color:{argb:'FFFFFFFF'}}
        c.fill  = {
          type:'pattern', pattern:'solid',
          fgColor:{argb: isParent && isStaff ? 'FF9A94C8' :  // 保護者職員: 紫
                         isParent            ? 'FF7A76B0' :  // 保護者子ども: 濃い紫
                         isMemo              ? 'FFB0A830' :  // 集団メモ: 黄緑
                         isBiko              ? 'FF888888' :  // 備考: グレー
                         isStaff             ? 'FF3A9A88' :  // 担当職員: 濃いティール
                                               TEAL_DK}      // 子ども列: ティール
        }
        c.alignment = {horizontal:'center',vertical:'middle',wrapText:true}
        c.border = {
          top:    {style:'medium',color:{argb: isParent?'FF7060B0':TEAL_BDR}},
          bottom: {style:'medium',color:{argb: isParent?'FF7060B0':TEAL_BDR}},
          left:   {style: isStaff?'medium':'thin',
                   color:{argb: isParent&&isStaff?'FF7060B0':isStaff?TEAL_BDR:'FFCCCCCC'}},
          right:  {style:'thin',color:{argb:'FFCCCCCC'}},
        }
      })
      hRow.commit()

      // ── データ行（行3〜） ──
      const dim = new Date(year, month, 0).getDate()
      let rowIdx = 3

      for(let d=1; d<=dim; d++){
        const dow  = new Date(year,month-1,d).getDay()
        const bg   = rowBg(year,month,d)
        const dc   = dowColor(year,month,d)
        const isFirst = true  // slot=1のとき日付・曜日を表示

        for(let slot=1; slot<=5; slot++){
          const isS1 = slot === 1  // 日の最初のコマ
          const row  = ws.getRow(rowIdx)
          row.height = 18

          // 共通ボーダー（上側）
          const bTop      = isS1 ? 'medium' : 'thin'
          const bTopColor = isS1 ? TEAL_BDR : 'FFEDE4D9'

          // ── 列1: 日付 ──
          applyCell(row.getCell(1), {
            value: isS1 ? d : '',
            bg, color: dc, sz:11, bold:isS1, center:true,
            bTop, bTopColor,
          })

          // ── 列2: 曜日 ──
          applyCell(row.getCell(2), {
            value: isS1 ? DOW_JA[dow] : '',
            bg, color: dc, sz:10, bold:isS1, center:true,
            bTop, bTopColor,
          })

          // ── 列3: コマ番号 ──
          applyCell(row.getCell(3), {
            value: slot,
            bg, color:'FF52BAA8', sz:9, bold:true, center:true,
            bTop, bTopColor,
          })

          // ── 列4: 時間帯 ──
          applyCell(row.getCell(4), {
            value: SLOT_TIMES[slot-1],
            bg, color:'FF7A7068', sz:9, center:true,
            bTop, bTopColor,
          })

          // ── 列5: タイプ ──
          applyCell(row.getCell(5), {
            bg, color:'FF7A7068', sz:9, center:true,
            bTop, bTopColor,
          })

          // ── 担当職員①〜⑦ × 4列 ──
          for(let si=0; si<STAFF_SETS; si++){
            const baseCol   = FIXED_COLS + si * COLS_PER_SET + 1  // 6,10,14...
            const isParent  = si >= 5  // ⑥⑦は保護者対応

            // 職員列の背景と色
            const sBg   = isParent ? parentBg(bg) : staffBg(bg)
            const sCol  = isParent ? 'FF7060B0' : 'FF3A9A88'
            const sBdrL = isParent ? 'FF9080C8' : TEAL_DK
            const sBdrT = isParent ? 'FF9080C8' : TEAL_BDR

            // 担当職員セル（左に太線）
            applyCell(row.getCell(baseCol), {
              bg: sBg, color: sCol, sz:9,
              bTop, bTopColor: isS1 ? sBdrT : 'FFEDE4D9',
              bLeft:'medium', bLeftColor: sBdrL,
            })

            // 子ども名前・出欠・コメント
            for(let ci2=1; ci2<=3; ci2++){
              const cellBg = isParent ? parentBg(bg) : bg
              applyCell(row.getCell(baseCol + ci2), {
                bg: cellBg, color:'FF2C2926', sz:9,
                center: ci2 !== 3, wrap: ci2 === 3,
                bTop, bTopColor,
              })
            }
          }

          // ── 集団メモ列 ──
          applyCell(row.getCell(MEMO_COL), {
            bg: memoBg(bg), color:'FF5C5000', sz:9, wrap:true,
            bTop, bTopColor,
            bLeft:'medium', bLeftColor:'FFB8A800',
          })

          // ── 備考列 ──
          applyCell(row.getCell(BIKO_COL), {
            bg, color:'FF7A7068', sz:9, wrap:true,
            bTop, bTopColor,
          })

          row.commit()
          rowIdx++
        }
      }

      // 先頭2行・左5列を固定（スクロール時に見出しを維持）
      ws.views = [{ state:'frozen', ySplit:2, xSplit:5, activeCell:'F3' }]

      count++
      process.stdout.write(`\r  ${sn} 完了 (${count}シート)`)
    }
  }

  const outPath = 'copelplus_支援記録_2026-2035.xlsx'
  await wb.xlsx.writeFile(outPath)
  console.log(`\n\n✅ ${outPath}`)
  console.log(`   ${count}シート + 凡例  合計${count+1}シート`)
  console.log(`   列構造: 35列 (固定5 + 担当職員×7セット×4列 + 集団メモ + 備考)`)
  console.log(`   色分け:`)
  console.log(`     行: 土曜=薄い青 / 日祝=薄い赤 / 水曜=薄い黄 / 平日=白`)
  console.log(`     列: 担当①〜⑤=ティール / 担当⑥⑦（保護者）=薄い紫 / 集団メモ=薄い黄`)
}

main().catch(e => { console.error(e); process.exit(1) })
