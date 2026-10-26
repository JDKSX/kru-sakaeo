import json,glob,re,os
os.chdir(os.path.dirname(os.path.abspath(__file__))+'/sets/full')
for s in ['ana','eng','gov','com','ped','law']:
    lines=[]
    for f in sorted(glob.glob('set*-%s.json'%s)):
        for q in json.load(open(f,encoding='utf-8')):
            t=re.sub(r'<[^>]+>',' ',q['q']);t=re.sub(r'\s+',' ',t).strip()
            lines.append(q['id']+': '+t[:160]+(' | code: '+q['code'].replace('\n',' ⏎ ')[:120] if q.get('code') else ''))
    if s=='com':
        for f in sorted(glob.glob('../topic/set*.json'))+['../basic.json']:
            for q in json.load(open(f,encoding='utf-8')):
                if q['s']=='com':lines.append(q['id']+': '+re.sub(r'<[^>]+>',' ',q['q'])[:160])
    open('stems_%s.txt'%s,'w',encoding='utf-8').write('\n'.join(lines))
    print(s,len(lines))
