// scripts/create-sheets.js  (exceljs版 — 完全カラー対応)
import ExcelJS from 'exceljs'

const DOW_JA=['日','月','火','水','木','金','土']
const START_YEAR=2026, START_MONTH=4, END_YEAR=2035
const SLOT_TIMES=['10:00〜11:00','11:15〜12:15','14:30〜15:30','15:45〜16:45','17:00〜18:00']

// 祝日セット
const HOLIDAYS=new Set(['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03','2027-11-23','2028-01-01','2028-01-10','2028-02-11','2028-02-23','2028-03-20','2028-04-29','2028-05-03','2028-05-04','2028-05-05','2028-07-17','2028-08-11','2028-09-18','2028-09-22','2028-10-09','2028-11-03','2028-11-23','2029-01-01','2029-01-08','2029-02-11','2029-02-23','2029-03-20','2029-04-29','2029-05-03','2029-05-04','2029-05-05','2030-01-01','2030-01-14','2030-02-11','2030-02-23','2030-03-20','2030-04-29','2030-05-03','2030-05-04','2030-05-05','2031-01-01','2031-01-13','2031-02-11','2031-02-23','2031-03-21','2031-04-29','2031-05-03','2031-05-04','2031-05-05','2032-01-01','2032-01-12','2032-02-11','2032-02-23','2032-03-20','2032-04-29','2032-05-03','2032-05-04','2032-05-05','2033-01-01','2033-01-10','2033-02-11','2033-02-23','2033-03-20','2033-04-29','2033-05-03','2033-05-04','2033-05-05','2034-01-01','2034-01-09','2034-02-11','2034-02-23','2034-03-20','2034-04-29','2034-05-03','2034-05-04','2034-05-05','2035-01-01','2035-01-08','2035-02-11','2035-02-23','2035-03-21','2035-04-29','2035-05-03','2035-05-04','2035-05-05'])

function dateStr(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
function isHoliday(y,m,d){ return HOLIDAYS.has(dateStr(y,m,d)) }

// 行の背景色（argb形式）
function rowArgb(y,m,d){
  const dow=new Date(y,m-1,d).getDay()
  if(dow===0||isHoliday(y,m,d)) return 'FFFFECEA'  // 薄い赤
  if(dow===6) return 'FFE3F2FD'  // 薄い青
  if(dow===3) return 'FFFFFDE7'  // 薄い黄
  return 'FFFFFFFF'
}

// 曜日の文字色
function dowColor(y,m,d){
  const dow=new Date(y,m-1,d).getDay()
  if(dow===0||isHoliday(y,m,d)) return {argb:'FFCC5040'}
  if(dow===6) return {argb:'FF3366AA'}
  if(dow===3) return {argb:'FF7B6000'}
  return {argb:'FF2C2926'}
}

// 列定義：コマあたり 担当職員 + 子ども名前・出欠・コメント を5セット
// A:日付 B:曜日 C:コマ D:時間帯 E:タイプ
// F:職員① G:子ども①名前 H:子ども①出欠 I:子ども①コメント
// J:職員② K:子ども②名前 L:子ども②出欠 M:子ども②コメント
// ...×5 = 列F〜Y (20列) + Z:集団メモ + AA:備考
const HEADERS=[
  '日付','曜日','コマ','時間帯','タイプ',
  '担当職員①','子ども①名前','子ども①出欠','子ども①コメント',
  '担当職員②','子ども②名前','子ども②出欠','子ども②コメント',
  '担当職員③','子ども③名前','子ども③出欠','子ども③コメント',
  '担当職員④','子ども④名前','子ども④出欠','子ども④コメント',
  '担当職員⑤','子ども⑤名前','子ども⑤出欠','子ども⑤コメント',
  '集団メモ（全体所見）','備考'
]
// 列幅（文字数）
const COL_W=[8,5,5,14,8, 12,12,9,28, 12,12,9,28, 12,12,9,28, 12,12,9,28, 12,12,9,28, 30,20]

const TEAL    ={argb:'FF52BAA8'}
const TEAL_LT ={argb:'FFE6F5F3'}
const AMBER   ={argb:'FFFFB94A'}
const WHITE   ={argb:'FFFFFFFF'}
const GRAY    ={argb:'FFF5F5F5'}

function cellStyle(bg, bold=false, center=false, color={argb:'FF2C2926'}, sz=10, wrapText=false){
  return {
    font:{name:'Arial',size:sz,bold,color},
    fill:{type:'pattern',pattern:'solid',fgColor:{argb:bg.replace('#','FF')||'FFFFFFFF'}},
    alignment:{horizontal:center?'center':'left',vertical:'middle',wrapText},
    border:{
      top:{style:'thin',color:{argb:'FFEDE4D9'}},
      bottom:{style:'thin',color:{argb:'FFEDE4D9'}},
      left:{style:'thin',color:{argb:'FFEDE4D9'}},
      right:{style:'thin',color:{argb:'FFEDE4D9'}},
    }
  }
}

// ヘッダーセルスタイル
const H_STYLE={
  font:{name:'Arial',size:9,bold:true,color:{argb:'FFFFFFFF'}},
  fill:{type:'pattern',pattern:'solid',fgColor:TEAL},
  alignment:{horizontal:'center',vertical:'middle',wrapText:true},
  border:{top:{style:'medium',color:{argb:'FF3A9A88'}},bottom:{style:'medium',color:{argb:'FF3A9A88'}},left:{style:'thin',color:{argb:'FFCCCCCC'}},right:{style:'thin',color:{argb:'FFCCCCCC'}}}
}

// 担当職員列の背景（目立たせる）
function staffArgb(bg){ return bg }  // 少し濃い色はセル側で設定

async function main(){
  const wb=new ExcelJS.Workbook()
  wb.creator='CopelPlus'
  wb.created=new Date()
  let count=0

  // 凡例シート（最初）
  const legWs=wb.addWorksheet('凡例')
  legWs.columns=[{width:20},{width:50}]
  const legData=[
    ['コペルプラス 東久留米教室　支援記録　凡例',''],
    ['',''],
    ['【タイプの種類】',''],
    ['個別','職員1名が子ども1名を担当するセッション'],
    ['集団','1人の担当職員と複数の子どもが参加するセッション（最大5名）'],
    ['',''],
    ['【出欠の種類】',''],
    ['来所済み','当日来所・セッション実施'],
    ['予定','来所予定'],
    ['欠席','欠席（備考に理由を記入）'],
    ['',''],
    ['【行の色について】',''],
    ['薄い赤の行','日曜日・祝日（FFECEA）'],
    ['薄い青の行','土曜日（E3F2FD）'],
    ['薄い黄の行','水曜日（FFFDE7）'],
    ['白い行','月・火・木・金曜日'],
    ['',''],
    ['【列の構造（1コマあたり）】',''],
    ['担当職員①','その子どもを担当する職員の名前'],
    ['子ども①名前','担当する子どもの名前'],
    ['子ども①出欠','来所済み / 予定 / 欠席'],
    ['子ども①コメント','担当職員による個別コメント'],
    ['（②〜⑤も同様）',''],
    ['集団メモ','グループ全体への職員所見'],
    ['',''],
    ['【コマ時間】',''],
    ...SLOT_TIMES.map((t,i)=>[`コマ${i+1}`,t]),
  ]
  legData.forEach((row,ri)=>{
    const r=legWs.getRow(ri+1)
    r.getCell(1).value=row[0]
    r.getCell(2).value=row[1]
    if(ri===0){
      r.getCell(1).font={name:'Arial',size:13,bold:true}
      r.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:TEAL_LT}
      r.height=24
    } else if(row[1]===''&&row[0].startsWith('【')){
      r.getCell(1).font={name:'Arial',size:10,bold:true}
      r.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:TEAL_LT}
      r.height=18
    } else {
      r.getCell(1).font={name:'Arial',size:10}
      r.getCell(2).font={name:'Arial',size:10}
    }
    r.commit()
  })

  // 月別シート
  for(let year=START_YEAR;year<=END_YEAR;year++){
    const mStart=(year===START_YEAR)?START_MONTH:1
    for(let month=mStart;month<=12;month++){
      const sn=`${year}年${month}月`
      const ws=wb.addWorksheet(sn)
      ws.columns=COL_W.map((w,i)=>({header:'',width:w,key:String.fromCharCode(65+i)}))

      // タイトル行
      const titleRow=ws.getRow(1)
      titleRow.height=24
      const tc=titleRow.getCell(1)
      tc.value=`コペルプラス 東久留米教室　支援記録　${year}年${month}月`
      tc.font={name:'Arial',size:13,bold:true,color:{argb:'FF2C2926'}}
      tc.fill={type:'pattern',pattern:'solid',fgColor:TEAL_LT}
      tc.alignment={horizontal:'center',vertical:'middle'}
      ws.mergeCells(1,1,1,HEADERS.length)
      titleRow.commit()

      // ヘッダー行
      const hRow=ws.getRow(2)
      hRow.height=32
      HEADERS.forEach((h,ci)=>{
        const c=hRow.getCell(ci+1)
        c.value=h
        Object.assign(c,H_STYLE)
        c.font={...H_STYLE.font}
        c.fill={...H_STYLE.fill}
        c.alignment={...H_STYLE.alignment}
        c.border={...H_STYLE.border}
      })
      hRow.commit()

      // データ行（1日×5コマ = 5行/日）
      const dim=new Date(year,month,0).getDate()
      let rowIdx=3

      for(let d=1;d<=dim;d++){
        const dow=new Date(year,month-1,d).getDay()
        const bg=rowArgb(year,month,d)
        const bgHex=bg.slice(2)  // FFを除いた部分
        const dc=dowColor(year,month,d)
        const isTopDay=true  // 日付は各日の最初のコマのみ

        for(let slot=1;slot<=5;slot++){
          const isFirst=slot===1
          const row=ws.getRow(rowIdx)
          row.height=17

          // 日付セル（最初のコマのみ）
          const dateCell=row.getCell(1)
          dateCell.value=isFirst?d:null
          dateCell.font={name:'Arial',size:isFirst?12:10,bold:isFirst,color:dc}
          dateCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}}
          dateCell.alignment={horizontal:'center',vertical:'middle'}
          dateCell.border={
            top:{style:isFirst?'medium':'thin',color:{argb:isFirst?'FF52BAA8':'FFEDE4D9'}},
            bottom:{style:'thin',color:{argb:'FFEDE4D9'}},
            left:{style:'thin',color:{argb:'FFEDE4D9'}},
            right:{style:'thin',color:{argb:'FFEDE4D9'}},
          }

          // 曜日セル
          const dowCell=row.getCell(2)
          dowCell.value=isFirst?DOW_JA[dow]:null
          dowCell.font={name:'Arial',size:10,bold:isFirst,color:dc}
          dowCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}}
          dowCell.alignment={horizontal:'center',vertical:'middle'}
          dowCell.border=dateCell.border

          // コマ番号
          const slotCell=row.getCell(3)
          slotCell.value=slot
          slotCell.font={name:'Arial',size:10,color:{argb:'FF52BAA8'},bold:true}
          slotCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}}
          slotCell.alignment={horizontal:'center',vertical:'middle'}
          slotCell.border={...dateCell.border}

          // 時間帯
          const timeCell=row.getCell(4)
          timeCell.value=SLOT_TIMES[slot-1]
          timeCell.font={name:'Arial',size:9,color:{argb:'FF7A7068'}}
          timeCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}}
          timeCell.alignment={horizontal:'center',vertical:'middle'}
          timeCell.border={...dateCell.border}

          // タイプ（個別/集団）
          const typeCell=row.getCell(5)
          typeCell.value=''
          typeCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}}
          typeCell.border={...dateCell.border}

          // 担当職員①〜⑤ + 子どもデータ（5セット × 4列）
          for(let ci=0;ci<5;ci++){
            const baseCol=6+ci*4  // F=6, J=10, N=14, R=18, V=22

            // 担当職員列（薄いティール背景で目立たせる）
            const staffCell=row.getCell(baseCol)
            staffCell.value=''
            // 担当職員列は背景色を少し変えて目立たせる
            const staffBg=bg==='FFFFFFFF'?'FFF0FAF8':(bg==='FFE3F2FD'?'FFD0EBF8':(bg==='FFFFFDE7'?'FFFFF2C0':(bg==='FFFFECEA'?'FFFFD8D8':'FFF0FAF8')))
            staffCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:staffBg}}
            staffCell.font={name:'Arial',size:9,bold:false,color:{argb:'FF3A9A88'}}
            staffCell.alignment={horizontal:'left',vertical:'middle'}
            staffCell.border={
              top:{style:isFirst?'medium':'thin',color:{argb:isFirst?'FF52BAA8':'FFEDE4D9'}},
              bottom:{style:'thin',color:{argb:'FFEDE4D9'}},
              left:{style:'medium',color:{argb:'FF52BAA8'}},  // 職員列の左に太線
              right:{style:'thin',color:{argb:'FFEDE4D9'}},
            }

            // 子ども名前・出欠・コメント
            for(let ci2=1;ci2<=3;ci2++){
              const cc=row.getCell(baseCol+ci2)
              cc.value=''
              cc.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}}
              cc.font={name:'Arial',size:9}
              cc.alignment={horizontal:ci2===3?'left':'center',vertical:'middle',wrapText:ci2===3}
              cc.border={...dateCell.border}
            }
          }

          // 集団メモ
          const gmCell=row.getCell(26)
          gmCell.value=''
          gmCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg==='FFFFFFFF'?'FFFFFDE7':bg}}
          gmCell.font={name:'Arial',size:9}
          gmCell.alignment={horizontal:'left',vertical:'middle',wrapText:true}
          gmCell.border={...dateCell.border}

          // 備考
          const bikoCell=row.getCell(27)
          bikoCell.value=''
          bikoCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}}
          bikoCell.font={name:'Arial',size:9}
          bikoCell.border={...dateCell.border}

          row.commit()
          rowIdx++
        }
      }

      ws.getRow(1).freeze  // フリーズは後で
      ws.views=[{state:'frozen',ySplit:2,xSplit:5,activeCell:'F3'}]

      count++
      process.stdout.write(`\r  ${sn} 完了 (${count}シート)`)
    }
  }

  const outPath='copelplus_支援記録_2026-2035.xlsx'
  await wb.xlsx.writeFile(outPath)
  console.log(`\n\n✅ ${outPath}`)
  console.log(`   ${count}シート + 凡例  合計${count+1}シート`)
  console.log(`   列構造: 担当職員① + 子ども①（名前/出欠/コメント） × 5セット`)
  console.log(`   色分け: 土曜=青 / 日祝=赤 / 水曜=黄 / 担当職員列=薄いティール`)
}

main().catch(e=>{console.error(e);process.exit(1)})
