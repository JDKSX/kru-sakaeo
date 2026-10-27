// node src/build.js — assemble the static site into the repo root (~/kru-sakaeo)
const fs=require('fs'),path=require('path');
const S=__dirname,out=process.env.OUT?path.resolve(process.env.OUT):path.join(S,'..'),SITE=process.env.SITE||'site-src';
for(const d of ['data','sheets'])fs.mkdirSync(path.join(out,d),{recursive:true});
for(const f of fs.readdirSync(path.join(S,SITE)).filter(f=>/\.(html|js|css)$/.test(f)&&!f.endsWith('.tpl.html')))fs.copyFileSync(path.join(S,SITE,f),path.join(out,f));
const SUBJ={ana:"A",eng:"A",gov:"A",com:"B",ped:"B",law:"B"};
const untag=t=>String(t).replace(/<b>(.*?)<\/b>/g,'“$1”').replace(/<br\s*\/?>/g,' ').replace(/<[^>]+>/g,'');
const strip=q=>{const o={id:q.id,s:q.s,p:q.p,q:q.q,c:q.c.map(untag),a:q.a,n:q.n.map(untag),tip:untag(q.tip)};if(q.ps)o.ps=q.ps;if(q.code)o.code=q.code;return o};
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(id,items)=>fs.writeFileSync(path.join(out,'data',id+'.json'),JSON.stringify(items.map(strip)));
const cols=[];
const APPROVED=fs.readFileSync(path.join(S,'sets/full/APPROVED'),'utf8').split(/\s+/).filter(Boolean);
const need={ana:100,eng:50,gov:50,com:100,ped:75,law:25};let seq=0;
for(let k=1;k<=30;k++){
  const nn=String(k).padStart(2,'0');if(!APPROVED.includes(nn))continue;
  let items=[],ok=true;
  for(const s in need){const f=path.join(S,'sets/full',`set${nn}-${s}.json`);if(!fs.existsSync(f)){ok=false;break}const d=read(f);if(d.length!==need[s]){ok=false;break}items=items.concat(d)}
  if(!ok){console.log('skip incomplete set',nn);continue}
  seq++;const id='full-'+nn;write(id,items);
  cols.push({id,kind:'full',no:seq,title:`ข้อสอบเต็มชุดที่ ${seq}`,count:items.length,desc:'ภาค ก: คิดวิเคราะห์ 100 · อังกฤษ 50 · ข้าราชการที่ดี 50 · ภาค ข: วิชาเอก 100 · การสอน 75 · กฎหมาย 25',parts:{A:{label:'ภาค ก (200 ข้อ)'},B:{label:'ภาค ข (200 ข้อ)'}}});
}
const L={A:"ภาค ก",B:"ภาค ข"};
const partsOf=items=>{const p={};for(const k of ['A','B']){const n=items.filter(q=>SUBJ[q.s]===k).length;if(n)p[k]={label:L[k]+` (${n} ข้อ)`}}return p};
const basic=read(path.join(S,'sets/basic.json'));write('basic',basic);
cols.push({id:'basic',kind:'topic',title:'ชุดพื้นฐาน (ทุกวิชา)',count:basic.length,desc:'ข้อสอบชุดแรก ครอบคลุมทุกวิชา เหมาะเริ่มต้น',parts:partsOf(basic)});
const names={1:"เลขฐาน ตรรกะ สถาปัตยกรรม ระบบปฏิบัติการ",2:"อัลกอริทึม โปรแกรม โครงสร้างข้อมูล",3:"เครือข่าย ความปลอดภัย ฐานข้อมูล",4:"หลักสูตร การสอน AI และข้อมูล"};
for(const k of [1,2,3,4]){const d=read(path.join(S,'sets/topic',`set${k}.json`));const id='topic-'+k;write(id,d);cols.push({id,kind:'topic',title:`วิชาเอกตามหัวข้อ ${k} · ${names[k]}`,count:d.length,desc:'ฝึกวิชาเอกคอมพิวเตอร์ทีละหัวข้อ',parts:{B:{label:`วิชาเอก (${d.length} ข้อ)`}}})}
const tpl=fs.readFileSync(path.join(S,fs.existsSync(path.join(S,SITE,'sheet.tpl.html'))?SITE:'site-src','sheet.tpl.html'),'utf8');const sheets=[];
for(const f of fs.readdirSync(path.join(S,'sheets')).filter(f=>/^[ab]\d-[a-z]+\.html$/.test(f)).sort()){
  const raw=fs.readFileSync(path.join(S,'sheets',f),'utf8');const t=(raw.match(/<!--\s*title:\s*(.*?)\s*-->/)||[,f])[1];
  const body=raw.replace(/<!--\s*title:.*?-->\s*/,'').replace(/<table/g,'<div class="wrapx"><table').replace(/<\/table>/g,'</table></div>');
  fs.writeFileSync(path.join(out,'sheets',f),tpl.replace(/\{\{TITLE\}\}/g,t).replace('{{BODY}}',()=>body));
  sheets.push({id:f.replace('.html',''),title:t,part:f[0]==='a'?'A':'B'});
}
fs.writeFileSync(path.join(out,'data','manifest.json'),JSON.stringify({built:new Date().toISOString(),collections:cols,sheets}));
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log('collections',cols.map(c=>c.id+':'+c.count).join(' '),'· sheets',sheets.length);
