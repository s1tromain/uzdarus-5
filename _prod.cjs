const fs=require('fs'),path=require('path'),{JSDOM,VirtualConsole}=require('jsdom');
const PAGES=['paid-courses/a2-course.html','a2-demo.html','paid-courses/b2-course.html','b2-demo.html'];
console.log('=== RUNTIME BOOT ===');
PAGES.forEach(p=>{
 const SRC=fs.readFileSync(p,'utf8');
 const B=[...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 const pre=B.find(x=>/(let|var|const)\s+currentUser/.test(x)&&!x.includes('const courseData'));
 const main=B.find(x=>x.includes('const courseData'));
 const errs=[],warns=[],logs=[];
 const vc=new VirtualConsole();
 vc.on('jsdomError',e=>{if(!/navigation to another Document|Not implemented/.test(e.message))errs.push(e.message);});
 const dom=new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g,'<script></script>'),
  {url:'https://uzdarus.uz/'+(p.includes('paid')?'paid-courses/':'')+'x.html',
   runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=()=>{};
 w.speechSynthesis={speak(){},cancel(){},getVoices:()=>[]};
 w.console.error=(...a)=>errs.push(a.join(' '));
 w.console.warn=(...a)=>warns.push(a.join(' '));
 w.console.log=(...a)=>logs.push(a.join(' '));
 w.eval("window.currentUser={id:'d',uid:'d',role:'developer',name:'D',email:'d@x.uz'};window.currentUserId='d';window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>({completedTopics:[]});window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};window.saveQuizResultToFirebase=async()=>1;");
 // classic (non-module) local scripts only — ESM is loaded by the browser, not eval
 const tags=[...SRC.matchAll(/<script([^>]*)\bsrc="([^"]+)"([^>]*)>/g)];
 const mods=tags.filter(m=>!/type=["']module["']/.test(m[1]+m[3]))
   .map(m=>m[2]).filter(u=>!/^https?:/.test(u))
   .map(u=>path.resolve(path.dirname(p),u));
 mods.forEach(f=>{if(fs.existsSync(f)){try{w.eval(fs.readFileSync(f,'utf8'));}catch(e){errs.push('MODULE '+path.basename(f)+': '+e.message);}}});
 try{if(pre)w.eval(pre);w.eval(main);}catch(e){errs.push('BOOT: '+e.message);}
 const ids=[...w.document.querySelectorAll('style[id]')].map(s=>s.id);
 const dupIds=ids.filter((x,i)=>ids.indexOf(x)!==i);
 const unexpectedWarn=warns.filter(x=>!/deprecat/i.test(x));
 console.log(`  ${p}`);
 console.log(`     injected styles : [${ids.join(', ')||'—'}]  duplicates=${dupIds.length?'❌ '+dupIds:'✅ none'}`);
 console.log(`     errors=${errs.length?'❌ '+errs.length:'✅ 0'}  warnings=${unexpectedWarn.length?'⚠ '+unexpectedWarn.length:'✅ 0'}  console.logs=${logs.length}`);
 errs.slice(0,2).forEach(e=>console.log('       · ERR '+e.slice(0,100)));
 unexpectedWarn.slice(0,2).forEach(e=>console.log('       · WARN '+e.slice(0,100)));
});
