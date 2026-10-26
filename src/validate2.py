import json,sys,re
from collections import Counter
P={"ปฏิเสธ","สลับรายละเอียด","ผสมข้อ","สถานการณ์","นำไปใช้","คำเด็ดขาด","คำนวณ"}
f,subj,cnt=sys.argv[1],sys.argv[2],int(sys.argv[3])
d=json.load(open(f,encoding='utf-8'));err=0;ids=set();stems=Counter()
def bad(k,m):
    global err;err+=1;print('ERR',k,m)
if len(d)!=cnt:bad('-','count %d != %d'%(len(d),cnt))
for q in d:
    k=q.get('id')
    if k in ids:bad(k,'dup id')
    ids.add(k)
    if not re.fullmatch(r'm\d\d-%s-\d{3}'%subj,str(k)):bad(k,'id format')
    for f2 in ['id','s','p','q','c','a','n','tip']:
        if f2 not in q:bad(k,'missing '+f2)
    if q.get('s')!=subj:bad(k,'s')
    if q.get('p') not in P:bad(k,'pattern')
    if len(q.get('c',[]))!=4 or len(q.get('n',[]))!=4:bad(k,'4 choices/notes')
    elif len(set(q['c']))!=4:bad(k,'dup choices')
    a=q.get('a')
    if a not in (0,1,2,3):bad(k,'a')
    elif len(q.get('n',[]))==4:
        if not q['n'][a].startswith('✓'):bad(k,'correct note needs ✓')
        if sum(t.startswith('✓') for t in q['n'])!=1:bad(k,'exactly one ✓')
    if re.search(r'<(?!/?b>|br>)',q.get('q','')):bad(k,'html tag not allowed in q')
    for t in q.get('c',[])+q.get('n',[])+[q.get('tip',''),q.get('ps',''),q.get('code','')]:
        if '<b>' in t or '<br' in t:bad(k,'no html in c/n/tip/ps/code (use quotes): '+t[:40])
    for t in q.get('c',[])+q.get('n',[])+[q.get('tip','')]:
        if re.search(r'(ข้อ|ตัวเลือก)\s*[กขคง](\s|$|\.)',t) or 'ถูกทุกข้อ' in t or 'ไม่มีข้อใดถูก' in t:bad(k,'bad ref: '+t[:50])
    stems[re.sub(r'\s+','',q.get('q',''))+q.get('code','')+q.get('ps','')]+=1
for s,c in stems.items():
    if c>1:bad('-','duplicate stem: '+s[:60])
L=n2=0
for q in d:
    if q.get('p') in ('ผสมข้อ','คำนวณ') or len(q.get('c',[]))!=4:continue
    n2+=1;ls=[len(c) for c in q['c']];m=max(ls)
    if ls[q['a']]==m and ls.count(m)==1:L+=1
if n2>=35 and L/n2<0.10:bad('-','correct answer is the unique longest choice in only %d/%d items (%d%%) — must be 10-35%%'%(L,n2,100*L/n2))
if n2 and L/n2>0.35:bad('-','correct answer is the unique longest choice in %d/%d items (%d%%) — must be 10-35%%: shorten the correct choice or lengthen a distractor without changing meaning'%(L,n2,100*L/n2))
print(f,len(d),'items · errors',err,'· patterns',dict(Counter(q.get('p') for q in d)),'· answer pos',dict(Counter(q.get('a') for q in d)))
