const paper=document.querySelector('#paper'),nav=document.querySelector('nav'),rail=document.querySelector('#rail'),finder=document.querySelector('#find'),query=finder.querySelector('input');
let source='',composing=false,history=[{source:'',sel:{i:0,n:0}}],position=0,active=0,emptyLine=null,lastTyping=0;
const prefs=Object.assign({layout:'zh',zoom:1,scenes:false},window.PREFS||{});
function parsed(){const lines=parse(source);if(emptyLine&&lines[emptyLine.i]?.type==='blank')lines[emptyLine.i].type=emptyLine.type;return lines;}
const send=(action,extra)=>window.ipc?.postMessage(JSON.stringify(Object.assign({action,text:source},extra)));
const join=lines=>lines.map(l=>l.raw).join('\n');

function selection(){let s=getSelection();if(!s.rangeCount)return {i:active,n:0};let el=s.anchorNode?.nodeType===1?s.anchorNode:s.anchorNode?.parentElement;let line=el?.closest('.line');if(!line)return {i:active,n:0};let r=document.createRange();r.selectNodeContents(line);r.setEnd(s.anchorNode,s.anchorOffset);return {i:+line.dataset.i,n:r.toString().length};}
function point(line,n){const w=document.createTreeWalker(line,NodeFilter.SHOW_TEXT);let node;while(node=w.nextNode()){if(n<=node.length)return [node,n];n-=node.length;}return null;}
function caret(i,n=0,len=0){let line=paper.children[Math.max(0,Math.min(i,paper.children.length-1))];if(!line)return;const r=document.createRange(),a=point(line,n),b=len&&point(line,n+len);if(a){r.setStart(a[0],a[1]);if(b)r.setEnd(b[0],b[1]);else r.collapse(true);}else{r.selectNodeContents(line);r.collapse(false);}const s=getSelection();s.removeAllRanges();s.addRange(r);active=+line.dataset.i;}

// 行元素按内容复用：长稿每次按键只重建改过的行
function build(l,e){const d=document.createElement('div');d.className='line '+l.type;d.dataset.type=l.type;d.textContent=l.text;if(!l.text)d.append(document.createElement('br'));
 if(l.type==='character'){const m=l.text.match(/^(.*?)(\s*[（(].*[）)])$/);if(m){d.textContent=m[1];const span=document.createElement('span');span.className='extension';span.textContent=m[2];d.append(span);}}
 else if(l.type==='dialogue'&&e)d.dataset.extension=e;
 const walker=document.createTreeWalker(d,NodeFilter.SHOW_TEXT),texts=[];let node;while(node=walker.nextNode())texts.push(node);
 for(const node of texts){const parts=node.textContent.split(/((?<!\d)\d{1,2}(?!\d)|[!?！？]{2})/u);if(parts.length>1){const fragment=document.createDocumentFragment();parts.forEach((text,index)=>{if(index%2){const span=document.createElement('span');span.className='tcy';span.textContent=text;fragment.append(span);}else fragment.append(document.createTextNode(text));});node.replaceWith(fragment);}}
 return d;}
function render(sel){const lines=parsed(),pool=new Map(),els=[];
 for(const el of paper.children){if(!el._key||el.textContent!==el._text)continue;if(!pool.has(el._key))pool.set(el._key,[]);pool.get(el._key).push(el);}
 let ext='';const scenes=[];
 for(let i=0;i<lines.length;i++){const l=lines[i];let e='';
  if(l.type==='character'){const m=l.text.match(/^(.*?)(\s*[（(].*[）)])$/);ext=m?m[2]:'';}else if(l.type==='dialogue'&&ext){e=ext;ext='';}else if(l.type!=='parenthetical')ext='';
  const key=l.type+'\u0001'+l.text+'\u0001'+e;let d=pool.get(key)?.shift();
  if(!d){d=build(l,e);d._key=key;d._text=l.text;}d.dataset.i=i;els.push(d);if(l.type==='scene'||l.type==='section')scenes.push([i,l.text,l.level||0]);}
 const keep=new Set(els);for(const el of Array.from(paper.children))if(!keep.has(el))el.remove();
 let cur=paper.firstChild;for(const el of els){if(el===cur)cur=cur.nextSibling;else paper.insertBefore(el,cur);}
 outline(scenes);
 const sig=scenes.map(x=>x.join('\u0001')).join('\u0002');
 if(sig!==nav._sig){nav._sig=sig;nav._cur=null;nav.replaceChildren(...scenes.map(([i,text,level])=>{const b=document.createElement('button');b.dataset.i=i;if(level)b.className='sec l'+level;text=text.replace(/^\uFEFF/,'').trim();b.title=text;b.append(document.createElement('i'));const t=document.createElement('span');t.textContent=text;b.append(t);b.onclick=()=>{paper.focus();caret(+b.dataset.i);paper.children[+b.dataset.i]?.scrollIntoView({block:'center'});mark();};return b;}));}
 else scenes.forEach(([i],k)=>nav.children[k].dataset.i=i);
 if(sel)caret(sel.i,sel.n);mark();}
// 没写 # 序列时：场号回到 1 或 2（前一场至少 3、这段已有三场、下一场接着顺数）才算新的一段；插场、乱号不切
function outline(scenes){if(scenes.some(x=>x[2]))return;let prev=null,n=0;const at=[];
 const ns=[];scenes.forEach(([i,text],k)=>{const m=text.replace(/^\uFEFF/,'').trim().match(/^(\d{1,3})\s*[.．、]/);if(m)ns.push([k,+m[1]]);});
 ns.forEach(([k,v],j)=>{if(prev===null||(v<=2&&prev>=3&&k-at.at(-1)>=3&&ns[j+1]?.[1]===v+1))at.push(k);prev=v;});
 if(at.length<2)return;const cn=v=>v<=10?'一二三四五六七八九十'[v-1]:String(v);
 at.reverse().forEach((k,j)=>{const v=at.length-j;scenes.splice(k,0,[scenes[k][0],prefs.layout==='en'?'SEQUENCE '+v:'序列'+cn(v),2,1]);});}
function mark(){let s=selection();active=s.i;const bs=nav.children;let k=-1;for(let j=0;j<bs.length;j++)if(+bs[j].dataset.i<=active)k=j;
 if(k===nav._cur)return;nav._cur=k;for(let j=0;j<bs.length;j++){bs[j].classList.toggle('current',j===k);bs[j].classList.toggle('near',j!==k&&k>=0&&Math.abs(j-k)<=2);}center();}
// 左栏：平时只露当前剧本的刻度，打字时连刻度也退；鼠标到左边展开成「同夹剧本 → 本剧序列与场次」
function center(){if(rail.classList.contains('open'))return;const b=nav.children[Math.max(0,nav._cur)],col=rail.firstElementChild;if(b)col.scrollTop=b.offsetTop-col.clientHeight/2;}
let shelf={files:[],cur:null};
window.setShelf=data=>{shelf=data;const above=rail.querySelector('.above'),below=rail.querySelector('.below'),title=rail.querySelector('.title');
 const at=shelf.files.findIndex(f=>f.path===shelf.cur),item=f=>{const b=document.createElement('button');b.className='file';b.textContent=f.name;b.title=f.path;b.onclick=()=>{read();send('openfile',{path:f.path});};return b;};
 above.replaceChildren(...shelf.files.slice(0,Math.max(0,at)).map(item));below.replaceChildren(...shelf.files.slice(at+1).map(item));
 title.textContent=at>=0?shelf.files[at].name:(shelf.cur?shelf.cur.split('/').pop():'未命名');};
function peek(on){if(rail.classList.contains('open')===on)return;rail.classList.toggle('open',on);if(on){const b=nav.children[Math.max(0,nav._cur)],col=rail.firstElementChild;col.scrollTop=(b||rail.querySelector('.title')).offsetTop-col.clientHeight/2;}else center();}
let mx=-1,my=-1;
document.addEventListener('mousemove',e=>{if(Math.abs(e.clientX-mx)+Math.abs(e.clientY-my)<3)return;mx=e.clientX;my=e.clientY;document.body.classList.remove('typing');
 if(document.body.classList.contains('pinned'))return;if(e.clientX<28)peek(true);else if(e.clientX>rail.offsetWidth+24)peek(false);});
document.documentElement.addEventListener('mouseleave',()=>{if(!document.body.classList.contains('pinned'))peek(false);});
paper.addEventListener('keydown',e=>{if(!e.metaKey&&!e.ctrlKey){document.body.classList.add('typing');if(!document.body.classList.contains('pinned'))peek(false);}},true);

// 改过的行先写成原样；只有原样认不出该类型时才加 Fountain 强制符号
function settle(lines,want){for(const [i,{text}] of want)lines[i]={raw:text};
 for(let pass=0;pass<2;pass++){const p=parse(join(lines));for(const [i,{text,type,level}] of want)if(text&&p[i].type!==type&&type!=='blank')lines[i]={raw:forced(text,type,level)};}
 return lines;}
function endpoints(){
 const s=getSelection();if(!s.rangeCount||!paper.contains(s.anchorNode))return null;
 const r=s.getRangeAt(0);
 const at=(node,offset)=>{if(node===paper){const i=Math.min(offset,paper.children.length-1);return {i,n:offset>=paper.children.length?parsed()[i].text.length:0};}const el=node.nodeType===1?node:node.parentElement;const line=el.closest('.line');if(!line)return null;const prefix=document.createRange();prefix.selectNodeContents(line);prefix.setEnd(node,offset);return {i:+line.dataset.i,n:prefix.toString().length};};
 const a=at(r.startContainer,r.startOffset),b=at(r.endContainer,r.endOffset);return a&&b?{a,b}:null;}
function replaceSelection(text){
 const range=endpoints();if(!range)return false;
 const lines=parsed(),{a,b}=range,first=lines[a.i],last=lines[b.i];
 const chunks=text.replace(/\r\n?/g,'\n').split('\n');
 const before=first.text.slice(0,a.n),after=last.text.slice(b.n);
 const inserted=chunks.map((chunk,i)=>({raw:chunk+(i===chunks.length-1&&i>0?after:'')}));
 lines.splice(a.i,b.i-a.i+1,...inserted);emptyLine=null;
 settle(lines,new Map([[a.i,{text:before+chunks[0]+(chunks.length===1?after:''),type:first.type,level:first.level}]]));
 source=join(lines);const sel={i:a.i+chunks.length-1,n:chunks.length===1?before.length+text.length:chunks.at(-1).length};record(sel);render(sel);return true;}
function merge(i,sel){const ls=parsed(),text=ls[i].text+ls[i+1].text,type=ls[i].type,level=ls[i].level;ls.splice(i+1,1);emptyLine=null;source=join(settle(ls,new Map([[i,{text,type,level}]])));record(sel);render(sel);}
paper.addEventListener('beforeinput',e=>{
 if(composing||e.isComposing)return;
 const r=endpoints();if(!r)return;
 if(e.inputType==='insertText'&&r.a.i!==r.b.i){e.preventDefault();replaceSelection(e.data||'');}
 else if(e.inputType.startsWith('delete')&&(r.a.i!==r.b.i||r.a.n!==r.b.n)){e.preventDefault();replaceSelection('');}
 else if(e.inputType==='deleteContentBackward'&&r.a.n===0&&r.a.i>0){e.preventDefault();read();merge(r.a.i-1,{i:r.a.i-1,n:parsed()[r.a.i-1].text.length});}
 else if(e.inputType==='deleteContentForward'&&r.a.n===parsed()[r.a.i].text.length&&r.a.i<parsed().length-1){e.preventDefault();read();merge(r.a.i,r.a);}
 else if(e.inputType==='insertParagraph'||e.inputType==='insertLineBreak')e.preventDefault();
});
// 连续打字一秒内并成一步撤销；撤销回到当时的光标处
function record(sel,typing=false){if(history[position].source===source)return send('change');const now=Date.now();
 if(typing&&lastTyping&&now-lastTyping<1000&&position===history.length-1&&position>0)history[position]={source,sel};
 else{history=history.slice(0,position+1);history.push({source,sel});if(history.length>500)history.shift();position=history.length-1;}
 lastTyping=typing?now:0;send('change');}
function read(){let lines=parsed();source=Array.from(paper.children).map((d,i)=>{let t=d.textContent;if(t===lines[i]?.text)return lines[i].raw;const old=lines[i]?.raw||'';if(/^\s*[!@>.#]/.test(old))return forced(t,d.dataset.type||'action',lines[i]?.level);return t;}).join('\n');}
function commit(){let s=selection();read();record(s,true);render(s);}
paper.addEventListener('compositionstart',()=>composing=true);paper.addEventListener('compositionend',()=>{composing=false;commit();});paper.addEventListener('input',()=>{if(!composing)commit();});
paper.addEventListener('keydown',e=>{if(composing||e.isComposing)return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();window.command(e.shiftKey?'redo':'undo');return;}if(e.key!=='Enter')return;e.preventDefault();
 const range=endpoints();if(range&&(range.a.i!==range.b.i||range.a.n!==range.b.n))replaceSelection('');
 let sel=selection();read();let lines=parsed(),l=lines[sel.i];if(!l)return;
 if(l.type==='dialogue'&&!l.text){lines.splice(sel.i+1,0,{raw:''});sel={i:sel.i+1,n:0};emptyLine={i:sel.i,type:'action'};}
 else{const before=l.text.slice(0,sel.n),after=l.text.slice(sel.n),next=l.type==='character'||l.type==='parenthetical'?'dialogue':'action',added=next==='action'&&l.type==='dialogue'?2:1;
  lines.splice(sel.i+1,0,...Array.from({length:added},()=>({raw:''})));
  settle(lines,new Map([[sel.i,{text:before,type:l.type,level:l.level}],[sel.i+added,{text:after,type:next}]]));sel={i:sel.i+added,n:0};emptyLine={i:sel.i,type:next};}
 source=join(lines);record(sel);render(sel);paper.children[sel.i]?.scrollIntoView({block:'nearest'});});
paper.addEventListener('paste',e=>{e.preventDefault();replaceSelection(e.clipboardData.getData('text/plain'));});
paper.addEventListener('drop',e=>{if(e.dataTransfer?.files?.length)e.preventDefault();});
document.addEventListener('selectionchange',mark);

// 查找：在稿面文字里找，回车下一个，shift+回车上一个，esc 回稿
let hit=null;
function find(back=false){const q=query.value;if(!q)return;const texts=parsed().map(l=>l.text),n=texts.length;let here=hit;if(!here){const s=selection();here={i:s.i,n:s.n,len:0};}
 for(let k=0;k<=n;k++){const i=back?(here.i-k+n)%n:(here.i+k)%n,t=texts[i];let at;
  if(back)at=k===0?(here.n>0?t.lastIndexOf(q,here.n-1):-1):t.lastIndexOf(q);else at=t.indexOf(q,k===0?here.n+here.len:0);
  if(at>=0){hit={i,n:at,len:q.length};caret(i,at,q.length);paper.children[i].scrollIntoView({block:'center'});finder.classList.remove('miss');return;}}
 finder.classList.add('miss');}
query.addEventListener('input',()=>{hit=null;finder.classList.remove('miss');});
query.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();find(e.shiftKey);}else if(e.key==='Escape'){e.preventDefault();closeFind();}});
function closeFind(){finder.hidden=true;finder.classList.remove('miss');const h=hit;hit=null;paper.focus();if(h)caret(h.i,h.n,h.len);}
paper.addEventListener('mousedown',()=>hit=null);

function apply(){document.body.dataset.layout=prefs.layout;document.documentElement.lang={zh:'zh-Hans',en:'en',ja:'ja'}[prefs.layout];document.body.classList.toggle('pinned',!!prefs.scenes);rail.classList.toggle('open',!!prefs.scenes);document.querySelector('main').style.zoom=prefs.zoom;}
function setPref(k,v){prefs[k]=v;apply();if(k==='layout'){nav._sig=null;render(selection());}window.ipc?.postMessage(JSON.stringify({prefs}));}
window.loadText=text=>{emptyLine=null;hit=null;source=text.replace(/\r\n?/g,'\n');history=[{source,sel:{i:0,n:0}}];position=0;lastTyping=0;paper.replaceChildren();render({i:0,n:0});paper.focus();};
window.command=action=>{
 if(['zh','en','ja'].includes(action))return setPref('layout',action);
 if(action==='scenes')return setPref('scenes',!prefs.scenes);
 if(action==='zoomin'||action==='zoomout'||action==='zoom0')return setPref('zoom',action==='zoom0'?1:Math.round(Math.min(2,Math.max(.6,prefs.zoom+(action==='zoomin'?.1:-.1)))*10)/10);
 if(action==='find'){finder.hidden=false;query.focus();query.select();return;}
 if(action==='findnext'||action==='findprev'){if(!query.value){finder.hidden=false;query.focus();return;}return find(action==='findprev');}
 if(composing&&(action==='undo'||action==='redo'))return;
 if(action==='undo'||action==='redo'){emptyLine=null;lastTyping=0;const from=position;position=Math.max(0,Math.min(history.length-1,position+(action==='undo'?-1:1)));if(position===from)return;source=history[position].source;render(history[position].sel);send('change');return;}
 if(action==='cover')return addCover();
 if(action==='docx'){read();return send('docx',{bytes:Array.from(toDocx(parsed(),prefs.layout))});}
 read();if(action==='pdf'||action==='print')preparePrint();send(action);};
// 封面：稿首已有标题页就跳过去；没有就按排法插一份，光标停在编剧（作者）后
function addCover(){const lines=parsed();if(lines[0]?.type==='cover'){paper.focus();caret(0,lines[0].text.length);mainEl().scrollTop=0;return;}
 const d=new Date(),name=(shelf.cur?shelf.cur.split('/').pop().replace(/\.[^.]+$/,''):'')||(prefs.layout==='en'?'Untitled':'未命名');
 const tpl=prefs.layout==='en'?['Title: '+name,'Credit: Written by','Author: ','Draft date: '+d.toISOString().slice(0,10),'Contact: ']:['标题：'+name,'编剧：','日期：'+d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日','联系：'];
 const at=prefs.layout==='en'?2:1;source=tpl.join('\n')+'\n\n'+source.replace(/^﻿/,'');emptyLine=null;const sel={i:at,n:tpl[at].length};record(sel);render(sel);paper.focus();caret(sel.i,sel.n);mainEl().scrollTop=0;}
function mainEl(){return document.querySelector('main');}
apply();
window.loadText('');
function preparePrint(){
 document.querySelector('#print-pages')?.remove();document.querySelector('#print-cover')?.remove();
 const cv=coverOf(parsed());if(cv.title.length||cv.middle.length||cv.foot.length){const c=document.createElement('section');c.id='print-cover';
  for(const [k,list] of Object.entries(cv)){const b=document.createElement('div');b.className='cv-'+k;for(const t of list){const r=document.createElement('div');r.textContent=t;b.append(r);}c.append(b);}
  document.body.insertBefore(c,mainEl());}
 if(document.body.dataset.layout!=='ja')return;
 const width=612,main=document.querySelector('main'),zoom=main.style.zoom;main.style.zoom=1;const total=paper.scrollWidth;main.style.zoom=zoom;const pages=document.createElement('div');pages.id='print-pages';
 for(let i=0;i<Math.ceil(total/width);i++){
  const page=document.createElement('section'),copy=paper.cloneNode(true);page.className='print-page';copy.removeAttribute('id');copy.removeAttribute('contenteditable');copy.className='print-paper';
  copy.style.width=total+'px';copy.style.right=(-i*width)+'px';page.append(copy);pages.append(page);
 }
 document.body.append(pages);
}
window.addEventListener('afterprint',()=>{document.querySelector('#print-pages')?.remove();document.querySelector('#print-cover')?.remove();});
send('ready');
