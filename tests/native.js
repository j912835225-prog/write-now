window.addEventListener('load',async()=>{
 const results=[];
 const check=(name,ok)=>{results.push({name,ok});if(!ok)throw Error(name);};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 try {
  loadText('!abc\n!def');
  const range=document.createRange();range.setStart(paper.children[0].firstChild,1);range.setEnd(paper.children[1].firstChild,2);getSelection().removeAllRanges();getSelection().addRange(range);
  replaceSelection('X\nY');check('cross-line replacement',parse(source).map(x=>x.text).join('\n')==='aX\nYf');
  command('undo');check('undo',source==='!abc\n!def');command('redo');check('redo',parse(source)[1].text==='Yf');
  const all=document.createRange();all.selectNodeContents(paper);getSelection().removeAllRanges();getSelection().addRange(all);replaceSelection('新稿');check('select all replacement',parse(source).map(x=>x.text).join('\n')==='新稿');
  loadText('@林');caret(0,1);paper.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  check('enter after character',paper.children.length===2&&selection().i===1);
  paper.children[1].textContent='你好';commit();check('dialogue recognition',parse(source)[1].type==='dialogue');
  paper.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));check('enter after dialogue',parse(source).at(-1).type!=='dialogue');
  loadText(SAMPLES.chinese);command('scenes');check('show scenes',document.body.classList.contains('pinned'));nav.children[1].click();check('scene jump',selection().i===+nav.children[1].dataset.i);command('scenes');check('hide scenes',!document.body.classList.contains('pinned'));
  for(const [name,text] of Object.entries(SAMPLES))for(const mode of ['zh','en','ja']){
   loadText(text);command(mode);await sleep(500);
   const original=source;read();check(name+'-'+mode+' roundtrip',source===original);
   check(name+'-'+mode+' scenes',nav.children.length===parse(text).filter(l=>l.type==='scene'||l.type==='section').length);
   const rect=paper.getBoundingClientRect();results.push({name:name+'-'+mode+' geometry',width:rect.width,height:rect.height,scrollWidth:paper.scrollWidth,scrollHeight:paper.scrollHeight});
   preparePrint();window.ipc.postMessage(JSON.stringify({verify:name+'-'+mode}));await sleep(1800);
  }
 }catch(e){results.push({error:String(e)});}
 window.ipc.postMessage(JSON.stringify({verify:'done',results}));
});
