const TYPES = ['action','character','dialogue','parenthetical','transition','scene','section','cover'];
// 封面：稿首的 Fountain 标题页「Title: …」或「标题：…」，到第一个空行止
const COVER_KEY = /^(title|credit|author|authors|source|draft date|date|contact|copyright|notes|标题|片名|剧名|编剧|作者|原著|日期|联系|联系方式|版权|备注)\s*[:：]/i;
// 序列：Fountain 的 # ## ，或单独成行的「第一序列」「第二幕」「序列 3」「SEQUENCE 2」「ACT ONE」
// 中文场次：「1. 外景.屋顶.日」「12、内景 客厅 夜」「1.白天」「外景.屋顶.日」，须单独成行
const CN_SCENE = /^(\d{1,3}\s*[.．、]\s*)?(内景|外景|内外景|内\/外景?)[.．、\s]|^\d{1,3}\s*[.．、]\s*(日|夜|白天|夜晚|深夜|傍晚|黄昏|清晨|早晨|凌晨|上午|中午|下午)([.．、\s]|$)/;
const NATURAL_SECTION = /^(第[0-9０-９一二三四五六七八九十百零〇两]+(序列|幕|部|章)|序列\s*[0-9０-９一二三四五六七八九十]+|(SEQUENCE|ACT)\s+[\w-]+)([\s：:·—-].*)?$/i;
function parse(source) {
  const raw = source.replace(/\r\n?/g,'\n').split('\n'); let prev = 'action', last = '', lastText = '', gap = 0;
  // 中文稿的人名不写 @：两到四字、单独成行、前一行空、后面（至多隔一空行）跟着一段话。
  // 本稿若有人名紧跟台词的写法，则只认至少紧跟过一次的；只出现一次的须紧跟台词。
  const NAME=/^[\u4e00-\u9fa5·]{2,4}$/, NOT_NAME=/[了着过的地得吗呢吧啊么嘛]|^(沉默|停顿|黑场|黑屏|静默|安静|寂静|片刻|良久|半晌|许久|稍顷|字幕|闪回|回忆|空镜|画外|无声|音乐|转场|叠化|淡入|淡出|切至|全剧终|剧终|继续|突然|然后)$/;
  const heading=t=>/^[#.!@>]/.test(t)||CN_SCENE.test(t)||NATURAL_SECTION.test(t)||/^(INT|EXT|EST|I\/E)[. \/]/i.test(t);
  const cand=new Map(); raw.forEach((l,i)=>{const s=l.trim();if(!NAME.test(s)||NOT_NAME.test(s)||rawAt(0,i-1))return;
    const n1=rawAt(0,i+1),next=n1||rawAt(0,i+2);if(!next||heading(next))return;const e=cand.get(s)||{n:0,tight:0};e.n++;if(n1)e.tight++;cand.set(s,e);});
  const tightStyle=[...cand.values()].some(e=>e.n>=2&&e.tight>0);
  const isName=s=>{const e=cand.get(s);return !!e&&(e.n>=2?(!tightStyle||e.tight>0):e.tight>0);};
  let coverEnd=0; if(COVER_KEY.test((raw[0]||'').replace(/^\uFEFF/,'').trim()))while(coverEnd<raw.length&&raw[coverEnd].trim())coverEnd++;
  return raw.map((raw,i) => {
    let text=raw, type='action', level=0; const s=raw.trim();
    if (i<coverEnd) type='cover';
    else if (!s) type='blank';
    else if (/^#{1,6}(?!#)/.test(s)) {type='section';level=s.match(/^#+/)[0].length;text=s.replace(/^#+\s*/,'');}
    else if (s.length<=30 && !rawAt(raw,i-1) && NATURAL_SECTION.test(s)) {type='section';level=/幕|部|^ACT/i.test(s)?1:2;}
    else if (/^!/.test(s)) {type='action';text=raw.replace('!','');}
    else if (/^\.(?!\.)/.test(s)) {type='scene';text=s.slice(1);}
    else if (/^@/.test(s)) {type='character';text=s.slice(1);}
    else if (/^>/.test(s)) {type='transition';text=s.slice(1).trim();}
    else if (/^(INT\.?\/EXT|INT|EXT|EST|I\/E)[. ]/i.test(s)) type='scene';
    else if (s.length<=40 && !rawAt(raw,i-1) && CN_SCENE.test(s)) type='scene';
    else if (/^[（(].*[）)]$/.test(s) && ['character','dialogue','parenthetical'].includes(prev)) type='parenthetical';
    else if (['character','dialogue','parenthetical'].includes(prev)) type='dialogue';
    else if (isName(s) && !rawAt(raw,i-1)) type='character';
    else if (gap===1 && ['character','parenthetical'].includes(last) && /[\u4e00-\u9fa5]/.test(lastText)) type=/^[（(].*[）)]$/.test(s)?'parenthetical':'dialogue';
    else if (/(TO:|FADE OUT\.|CUT TO BLACK\.)$/.test(s)) type='transition';
    else if (/[A-Z]/.test(s) && s===s.toUpperCase() && (i===0 || !rawAt(raw,i-1)) && rawAt(raw,i+1)) type='character';
    if(type==='blank')gap++;else{gap=0;last=type;lastText=s;}prev=type;return level?{raw,text,type,level}:{raw,text,type};
  });
  function rawAt(_,i){return (raw[i]||'').trim();}
}
function forced(text,type,level=2) {
  if(type==='section')return '#'.repeat(level)+' '+text;
  if(type==='scene')return '.'+text;
  if(type==='character')return '@'+text;
  if(type==='transition')return '> '+text;
  if(type==='parenthetical')return '('+text.replace(/^[（(]|[）)]$/g,'')+')';
  if(type==='action')return text ? '!'+text : '';
  return text;
}
// 封面各项：{title,credit,author,source,date,contact,copyright,notes}，值为行数组；中文键在正文里连键名一起显示
function coverOf(lines){const out={};let cur=null;
 for(const l of lines){if(l.type!=='cover')break;const s=l.raw.replace(/^﻿/,'').trim(),m=s.match(COVER_KEY);
  if(m){const k=m[1].toLowerCase(),norm={标题:'title',片名:'title',剧名:'title',编剧:'credit',作者:'author',authors:'author',原著:'source',日期:'date','draft date':'date',联系:'contact',联系方式:'contact',版权:'copyright',备注:'notes'}[k]||k;
   cur={norm,cn:/[^\x00-\x7f]/.test(m[1]),key:m[1],v:[]};(out[norm]=out[norm]||[]).push(cur);const v=s.slice(m[0].length).trim();if(v)cur.v.push(v);}
  else if(cur)cur.v.push(s);}
 const pick=k=>(out[k]||[]).flatMap(e=>e.cn&&k!=='title'&&k!=='date'?(e.v.length?[e.key+'　'+e.v.join(' ')]:[]):e.v);
 return {title:pick('title'),middle:[...pick('credit'),...pick('author'),...pick('source')],foot:[...pick('date'),...pick('contact'),...pick('copyright')]};}

// Word：按当前排法把稿子写成 .docx（不压缩的 zip），返回字节
function toDocx(lines,layout){
 const L={zh:{font:'Songti SC',ea:'Kaiti SC',sz:27,line:456,left:1134,right:1134,em:270,lang:'zh-CN'},en:{font:'Courier',ea:'Songti SC',sz:24,line:240,left:2160,right:1106,em:144,lang:'en-US'},ja:{font:'Hiragino Mincho ProN',ea:'Hiragino Mincho ProN',sz:27,line:480,left:1134,right:1134,em:270,lang:'ja-JP'}}[layout]||null;
 if(!L)throw Error('layout');const ch=L.em,ind=Math.round(3.4*270);
 const esc=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
 const run=(t,r='')=>'<w:r>'+(r?'<w:rPr>'+r+'</w:rPr>':'')+'<w:t xml:space="preserve">'+esc(t)+'</w:t></w:r>';
 const p=(runs,o={})=>{let pp='';if(o.keep)pp+='<w:keepNext/>';if(o.before)pp+='<w:spacing w:before="'+o.before+'"/>';if(o.ind)pp+='<w:ind'+Object.entries(o.ind).map(([k,v])=>' w:'+k+'="'+v+'"').join('')+'/>';if(o.align)pp+='<w:jc w:val="'+o.align+'"/>';return '<w:p>'+(pp?'<w:pPr>'+pp+'</w:pPr>':'')+runs+'</w:p>';};
 const out=[],cv=coverOf(lines);
 if(cv.title.length||cv.middle.length||cv.foot.length){
  cv.title.forEach((t,k)=>out.push(p(run(t,'<w:b/><w:sz w:val="'+L.sz*2+'"/><w:szCs w:val="'+L.sz*2+'"/>'),{align:'center',before:k?0:4200})));
  cv.middle.forEach((t,k)=>out.push(p(run(t),{align:'center',before:k?0:720})));
  cv.foot.forEach((t,k)=>out.push(p(run(t,'<w:sz w:val="'+Math.round(L.sz*.85)+'"/>'),{before:k?0:6000})));
  out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');}
 const body=lines.filter(l=>l.type!=='cover');
 for(let i=0;i<body.length;i++){const l=body[i],t=(l.text||'').replace(/^﻿/,''),next=body[i+1];
  if(l.type==='blank'){out.push('<w:p><w:pPr><w:spacing w:line="'+(layout==='en'?240:L.em)+'" w:lineRule="exact"/></w:pPr></w:p>');continue;}
  if(l.type==='scene'){out.push(p(run(t,'<w:b/>'),{keep:1}));continue;}
  if(l.type==='section'){out.push(p(run(t,'<w:color w:val="80523B"/><w:spacing w:val="40"/><w:sz w:val="'+Math.round(L.sz*.82)+'"/>'),{keep:1,before:Math.round(L.em*1.2)}));continue;}
  if(l.type==='transition'){out.push(p(run(t),{align:'right'}));continue;}
  if(l.type==='character'){
   if(layout==='zh'&&next&&(next.type==='dialogue'||next.type==='parenthetical')){out.push(p(run(t)+'<w:r><w:tab/></w:r>'+run(next.text),{ind:{left:ind,hanging:ind}}));i++;continue;}
   out.push(p(run(t),{keep:1,ind:layout==='en'?{left:22*ch}:undefined}));continue;}
  if(l.type==='dialogue'||l.type==='parenthetical'){const o=layout==='zh'?{left:ind}:layout==='ja'?{left:L.em,hanging:L.em}:l.type==='dialogue'?{left:10*ch,right:15*ch}:{left:16*ch,right:19*ch};out.push(p(run(t),{ind:o}));continue;}
  out.push(p(run(t),layout==='ja'?{ind:{left:3*L.em}}:{}));}
 const W='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',X='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
 const files=[
  ['[Content_Types].xml',X+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
  ['_rels/.rels',X+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
  ['word/_rels/document.xml.rels',X+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
  ['word/styles.xml',X+'<w:styles '+W+'><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="'+L.font+'" w:hAnsi="'+L.font+'" w:eastAsia="'+L.ea+'" w:cs="'+L.font+'"/><w:sz w:val="'+L.sz+'"/><w:szCs w:val="'+L.sz+'"/><w:lang w:val="'+L.lang+'" w:eastAsia="'+(layout==='en'?'zh-CN':L.lang)+'"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="'+L.line+'" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>'],
  ['word/document.xml',X+'<w:document '+W+'><w:body>'+out.join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1247" w:right="'+L.right+'" w:bottom="1247" w:left="'+L.left+'" w:header="567" w:footer="567" w:gutter="0"/>'+(layout==='ja'?'<w:textDirection w:val="tbRl"/>':'')+'</w:sectPr></w:body></w:document>']];
 return zipStore(files);}
function zipStore(files){const enc=new TextEncoder(),parts=[],central=[];let off=0;
 const T=zipStore.t||(zipStore.t=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;}));
 const crc=d=>{let c=0xFFFFFFFF;for(const b of d)c=T[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
 for(const [name,data] of files){const n=enc.encode(name),d=enc.encode(data),c=crc(d),h=new DataView(new ArrayBuffer(30)),e=new DataView(new ArrayBuffer(46));
  [[0,0x04034b50,4],[4,20,2],[6,0x0800,2],[12,0x21,2],[14,c,4],[18,d.length,4],[22,d.length,4],[26,n.length,2]].forEach(([o,v,z])=>z===4?h.setUint32(o,v,true):h.setUint16(o,v,true));
  [[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x0800,2],[14,0x21,2],[16,c,4],[20,d.length,4],[24,d.length,4],[28,n.length,2],[42,off,4]].forEach(([o,v,z])=>z===4?e.setUint32(o,v,true):e.setUint16(o,v,true));
  parts.push(new Uint8Array(h.buffer),n,d);central.push(new Uint8Array(e.buffer),n);off+=30+n.length+d.length;}
 const size=central.reduce((a,b)=>a+b.length,0),end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,size,true);end.setUint32(16,off,true);
 const all=[...parts,...central,new Uint8Array(end.buffer)],buf=new Uint8Array(all.reduce((a,b)=>a+b.length,0));let at=0;for(const a of all){buf.set(a,at);at+=a.length;}return buf;}
if(typeof module!=='undefined') module.exports={parse,forced,TYPES,coverOf,toDocx};
