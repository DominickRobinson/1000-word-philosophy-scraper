#!/usr/bin/env python3
"""Build a static Pages site and refresh the allowed site's robots snapshot."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,shutil,urllib.request,zipfile
ROOT=Path(__file__).resolve().parents[1]
def build(policy_file=None):
    output=ROOT/'dist'/'web'
    output.mkdir(parents=True,exist_ok=True)
    for file in (ROOT/'web').iterdir():
        if file.is_file():shutil.copy2(file,output/file.name)
    if policy_file:
        policy=json.loads(Path(policy_file).read_text())
    else:
        url='https://1000wordphilosophy.com/robots.txt'
        request=urllib.request.Request(url,headers={'User-Agent':'1000WordPhilosophyScraper/1.1 (Pages build policy check)'})
        with urllib.request.urlopen(request,timeout=40) as response:
            if response.status!=200:raise RuntimeError('Cannot verify source robots.txt')
            content=response.read(100000).decode('utf-8')
        policy={'source':url,'checkedAt':datetime.now(timezone.utc).isoformat(),'text':content}
    (output/'site-policy.json').write_text(json.dumps(policy,indent=2)+'\n')
    (output/'.nojekyll').write_text('')
    with zipfile.ZipFile(ROOT/'dist'/'1000-Word-Philosophy-Web.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(output.iterdir()):archive.write(file,file.name)
    print('Static web build:',output)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--policy-file');args=parser.parse_args();build(args.policy_file)
