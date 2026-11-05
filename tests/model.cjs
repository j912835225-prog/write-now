const assert=require('node:assert/strict');
const {parse,forced,coverOf,toDocx}=require('../ui/model.js');
const zlib=require('node:zlib');
const fs=require('node:fs');
for(const file of ['中文','English']) {
 const text=fs.readFileSync(`${__dirname}/../samples/${file}.fountain`,'utf8');
 const lines=parse(text);
 assert.equal(lines.filter(x=>x.type==='scene').length,2);
 assert.equal(lines.filter(x=>x.type==='character').length,3);
 assert.equal(lines.filter(x=>x.type==='dialogue').length,3);
 assert.equal(lines.filter(x=>x.type==='parenthetical').length,1);
 assert.equal(lines.filter(x=>x.type==='transition').length,1);
 assert.equal(lines.map(x=>x.raw).join('\n'),text);
}
assert.equal(parse('!UPPERCASE\ntext')[0].type,'action');
assert.equal(parse('...a pause')[0].type,'action');
assert.equal(parse('@小满\n(轻声)\n回来。')[2].type,'dialogue');
assert.equal(forced('小满','character'),'@小满');
assert.deepEqual(parse('## 追逐\n\n# 第一幕').filter(x=>x.type==='section').map(x=>[x.text,x.level]),[['追逐',2],['第一幕',1]]);
assert.deepEqual(parse('第一序列：出走\n\n第二幕\n\nSEQUENCE 3\n\nACT ONE').map(x=>x.level||0),[2,0,1,0,2,0,1]);
assert.equal(parse('@林\n第一序列')[1].type,'dialogue');
assert.equal(parse('他说第一序列')[0].type,'action');
assert.equal(forced('追逐','section',2),'## 追逐');
assert.deepEqual(parse('林夕\n你好\n\n林夕\n\n（笑）\n\n再见。\n\n他走了。').map(x=>x.type),['character','dialogue','blank','character','blank','parenthetical','blank','dialogue','blank','action']);
assert.deepEqual(parse('1. 外景.屋顶.日\n\n2.白天\n\n3、内景 客厅 夜\n\n他说1.白天').map(x=>x.type),['scene','blank','scene','blank','scene','blank','action']);
// 人名误判：本稿有紧跟台词的写法时，反复出现但后面总隔空行的短行不算人名；虚词、舞台词不算
assert.deepEqual(parse('林夕\n你好\n\n沉默\n\n他走开。\n\n林夕\n再见\n\n天亮了\n\n雨停。\n\n远处\n\n灯灭。\n\n远处\n\n灯亮。').filter(x=>x.type==='character').map(x=>x.text),['林夕','林夕']);
// 通篇人名后都空一行的写法：出现两次以上照旧认
assert.deepEqual(parse('林夕\n\n你好\n\n阿川\n\n嗯\n\n林夕\n\n走吧\n\n阿川\n\n好').filter(x=>x.type==='character').length,4);
// 只说一次话的人：紧跟台词或括号才认
assert.deepEqual(parse('林夕\n你好\n\n林夕\n走\n\n老周\n(压低)\n别回头\n\n门外\n\n风大。').map(x=>x.type).slice(6),['character','parenthetical','dialogue','blank','action','blank','action']);
// 自动序列：只有场号回到 1、2 且这段已有三场才切；插场乱号不切
const ed=fs.readFileSync(`${__dirname}/../ui/editor.js`,'utf8');const prefs={layout:'cn'};
const outline=eval('('+ed.slice(ed.indexOf('function outline('),ed.indexOf('\nfunction mark('))+')');
const secs=nums=>{const sc=nums.map((v,k)=>[k,v+'. 外景.屋顶.日']);outline(sc);return sc.filter(x=>x[2]).map(x=>x[1]);};
assert.deepEqual(secs([1,2,3,4,1,2,3]),['序列一','序列二']);
assert.deepEqual(secs([1,2,3,5,4,6,7]),[]);
assert.deepEqual(secs([1,2,3,1,4,5]),[]);
assert.deepEqual(secs([1,2,1,2,3]),[]);
// 封面：稿首键值块到第一个空行；中文键显示键名，英文键只显示值；不在稿首不算
{const t='标题：屋顶\n编剧：林夕\n日期：2026年11月5日\n联系：a@b.c\n\n1. 外景.屋顶.日\n\n林夕\n你好';const L=parse(t);
 assert.deepEqual(L.slice(0,5).map(x=>x.type),['cover','cover','cover','cover','blank']);assert.equal(L.map(x=>x.raw).join('\n'),t);
 assert.deepEqual(coverOf(L),{title:['屋顶'],middle:['编剧　林夕'],foot:['2026年11月5日','联系　a@b.c']});
 assert.deepEqual(coverOf(parse('Title: THE LAST TRAIN\n    Part One\nCredit: Written by\nAuthor: Lin\nDraft date: 2026-11-05\n\nINT. ROOM - DAY')),{title:['THE LAST TRAIN','Part One'],middle:['Written by','Lin'],foot:['2026-11-05']});
 assert.equal(parse('他走了。\n标题：屋顶')[1].type,'action');
 // Word：三种排法都出合法 zip（逐项 CRC 对），封面在前、分页、台词缩进
 for(const m of ['zh','en','ja']){const b=Buffer.from(toDocx(L,m));assert.equal(b.readUInt32LE(0),0x04034b50);
  const names=[];let o=0;while(b.readUInt32LE(o)===0x04034b50){const size=b.readUInt32LE(18+o),n=b.readUInt16LE(26+o),name=b.toString('utf8',o+30,o+30+n),data=b.subarray(o+30+n,o+30+n+size);assert.equal(zlib.crc32(data),b.readUInt32LE(o+14),name);names.push([name,data.toString('utf8')]);o+=30+n+size;}
  assert.deepEqual(names.map(x=>x[0]),['[Content_Types].xml','_rels/.rels','word/_rels/document.xml.rels','word/styles.xml','word/document.xml']);
  const doc=names[4][1];assert.ok(doc.indexOf('屋顶')<doc.indexOf('w:type="page"')&&doc.indexOf('w:type="page"')<doc.indexOf('外景'));assert.ok(!doc.includes('标题：'));
  assert.equal(doc.includes('tbRl'),m==='ja');if(m==='zh')assert.ok(doc.includes('林夕</w:t></w:r><w:r><w:tab/></w:r>'));}
 assert.ok(!Buffer.from(toDocx(parse('INT. A - DAY\n\nx'),'en')).toString('latin1').includes('w:type="page"'));}
console.log('通过：封面识别与 Word 导出（三排法、CRC、分页）；人名误判与单次发言、自动序列防误切；中文场次、无 @ 人名、隔空行台词；两份样稿六类识别、逐行无损、强制动作、省略号、中文对白上下文、序列识别。');
