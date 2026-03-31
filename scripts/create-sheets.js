import XLSX from 'xlsx'
import { writeFileSync } from 'fs'

const DOW_JA = ['日','月','火','水','木','金','土']
const START_YEAR = 2026; const START_MONTH = 4; const END_YEAR = 2035
const SLOT_TIMES = ['10:00〜11:00','11:15〜12:15','14:30〜15:30','15:45〜16:45','17:00〜18:00']
const CLR = { header:'FF52BAA8', title:'FFE6F5F3', sun:'FFFFECEA', sat:'FFE3F2FD', wed:'FFFFFDE7', white:'FFFFFFFF', border:'FFEDE4D9' }
const HOLIDAYS = new Set(['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03','2027-11-23','2028-01-01','2028-01-10','2028-02-11','2028-02-23','2028-03-20','2028-04-29','2028-05-03','2028-05-04','2028-05-05','2028-07-17','2028-08-11','2028-09-18','2028-09-22','2028-10-09','2028-11-03','2028-11-23','2029-01-01','2029-01-08','2029-02-11','2029-02-23','2029-03-20','2029-04-29','2029-05-03','2029-05-04','2029-05-05','2030-01-01','2030-01-14','2030-02-11','2030-02-23','2030-03-20','2030-04-29','2030-05-03','2030-05-04','2030-05-05','2031-01-01','2031-01-13','2031-02-11','2031-02-23','2031-03-21','2031-04-29','2031-05-03','2031-05-04','2031-05-05','2032-01-01','2032-01-12','2032-02-11','2032-02-23','2032-03-20','2032-04-29','2032-05-03','2032-05-04','2032-05-05','2033-01-01','2033-01-10','2033-02-11','2033-02-23','2033-03-20','2033-04-29','2033-05-03','2033-05-04','2033-05-05','2034-01-01','2034-01-09','2034-02-11','2034-02-23','2034-03-20','2034-04-29','2034-05-03','2034-05-04','2034-05-05','2035-01-01','2035-01-08','2035-02-11','2035-02-23','2035-03-21','2035-04-29','2035-05-03','2035-05-04','2035-05-05'])

function dateStr(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
function isHoliday(y,m,d){ return HOLIDAYS.has(dateStr(y,m,d)) }
function rowBg(y,m,d){ const dow=new Date(y,m-1,d).getDay(); if(dow===0||isHoliday(y,m,d)) return CLR.sun; if(dow===6) return CLR.sat; if(dow===3) return CLR.wed; return CLR.white }
function mkS(bg,bold=false,center=false,wrapText=false,sz=9,color='2C2926'){
  return { font:{name:'Arial',sz,bold,color:{rgb:color}}, fill:{patternType:'solid',fgColor:{rgb:bg}}, alignment:{horizontal:center?'center':'left',vertical:'center',wrapText}, border:{top:{style:'thin',color:{rgb:CLR.border}},bottom:{style:'thin',color:{rgb:CLR.border}},left:{style:'thin',color:{rgb:CLR.border}},right:{style:'thin',color:{rgb:CLR.border}}} }
}

const HEADERS=['日付','曜日','コマ','時間帯','タイプ','担当職員','子ども①名前','子ども①出欠','子ども①コメント','子ども②名前','子ども②出欠','子ども②コメント','子ども③名前','子ども③出欠','子ども③コメント','子ども④名前','子ども④出欠','子ども④コメント','子ども⑤名前','子ども⑤出欠','子ども⑤コメント','集団メモ（全員への所見）','備考']
const COL_WIDTHS=[8,5,5,14,8,12,12,9,24,12,9,24,12,9,24,12,9,24,12,9,24,28,20]

const wb = XLSX.utils.book_new()
let sheetCount=0

for(let year=START_YEAR;year<=END_YEAR;year++){
  const mStart=(year===START_YEAR)?START_MONTH:1
  for(let month=mStart;month<=12;month++){
    const sn=`${year}年${month}月`
    const dim=new Date(year,month,0).getDate()
    const ws={}
    let ri=0
    ws['!merges']=[]

    // タイトル
    ws[XLSX.utils.encode_cell({r:0,c:0})]={v:`コペルプラス 東久留米教室　支援記録　${year}年${month}月`,s:{font:{name:'Arial',sz:13,bold:true},fill:{patternType:'solid',fgColor:{rgb:CLR.title}},alignment:{horizontal:'center',vertical:'center'}}}
    ws['!merges'].push({s:{r:0,c:0},e:{r:0,c:HEADERS.length-1}})

    // ヘッダー
    HEADERS.forEach((h,ci)=>{ ws[XLSX.utils.encode_cell({r:1,c:ci})]={v:h,s:{font:{name:'Arial',sz:9,bold:true,color:{rgb:'FFFFFF'}},fill:{patternType:'solid',fgColor:{rgb:CLR.header}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:{top:{style:'thin',color:{rgb:'BBBBBB'}},bottom:{style:'medium',color:{rgb:'52BAA8'}},left:{style:'thin',color:{rgb:'BBBBBB'}},right:{style:'thin',color:{rgb:'BBBBBB'}}}}} })
    ri=2

    for(let d=1;d<=dim;d++){
      const dow=new Date(year,month-1,d).getDay()
      const bg=rowBg(year,month,d)
      const holiday=isHoliday(year,month,d)
      const dowColor=dow===0||holiday?'CC5040':dow===6?'3366AA':dow===3?'7B6000':'2C2926'

      for(let slot=1;slot<=5;slot++){
        const first=slot===1
        const topBorder=first?{style:'medium',color:{rgb:'52BAA8'}}:{style:'thin',color:{rgb:CLR.border}}
        const cs={font:{name:'Arial',sz:9},fill:{patternType:'solid',fgColor:{rgb:bg}},alignment:{horizontal:'left',vertical:'center',wrapText:true},border:{top:topBorder,bottom:{style:'thin',color:{rgb:CLR.border}},left:{style:'thin',color:{rgb:CLR.border}},right:{style:'thin',color:{rgb:CLR.border}}}}
        const ds={...cs,font:{name:'Arial',sz:first?11:9,bold:first,color:{rgb:dowColor}},alignment:{horizontal:'center',vertical:'center'}}
        
        const row=[first?d:'',first?DOW_JA[dow]:'',slot,SLOT_TIMES[slot-1],'','', ...Array(15).fill(''),'','']
        row.forEach((v,ci)=>{ ws[XLSX.utils.encode_cell({r:ri,c:ci})]={v,s:ci<=1?ds:cs} })
        ri++
      }
    }

    ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:ri-1,c:HEADERS.length-1}})
    ws['!cols']=COL_WIDTHS.map(w=>({wch:w}))
    ws['!rows']=[{hpt:24},{hpt:30},...Array(ri-2).fill({hpt:15})]
    XLSX.utils.book_append_sheet(wb,ws,sn)
    sheetCount++
    process.stdout.write(`\r  ${sn} 完了 (${sheetCount}シート)`)
  }
}

// 凡例シート（先頭に追加）
const lws={}
const ldata=[['コペルプラス 東久留米教室　支援記録　凡例'],[''],['【タイプ】',''],['個別','職員1名 + 子ども1名のセッション'],['集団','職員1名 + 子ども複数名のセッション（最大5名）'],[''],['【出欠】',''],['来所済み','当日来所・セッション実施'],['予定','来所予定'],['欠席','欠席（備考に理由を記入）'],[''],['【行の色】',''],['薄い赤の行','日曜日・祝日'],['薄い青の行','土曜日'],['薄い黄の行','水曜日（区別しやすくするため）'],['白い行','月・火・木・金曜日'],[''],['【コマ時間】',''],...SLOT_TIMES.map((t,i)=>[`コマ${i+1}`,t])]
ldata.forEach((row,ri)=>{ row.forEach((v,ci)=>{ const isT=ri===0; const isS=row.length===2&&row[1]===''&&String(row[0]).startsWith('【'); lws[XLSX.utils.encode_cell({r:ri,c:ci})]={v,s:{font:{name:'Arial',sz:isT?13:10,bold:isT||isS},fill:{patternType:'solid',fgColor:{rgb:isT||isS?CLR.title:CLR.white}},alignment:{vertical:'center'}}} }) })
lws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:ldata.length,c:2}})
lws['!cols']=[{wch:18},{wch:44}]
XLSX.utils.book_append_sheet(wb,lws,'凡例',true)

const out='copelplus_支援記録_2026-2035.xlsx'
XLSX.writeFile(wb,out,{bookType:'xlsx',type:'buffer',cellStyles:true})
console.log(`\n✅ ${out}  ${sheetCount}シート + 凡例  合計${sheetCount+1}シート`)
