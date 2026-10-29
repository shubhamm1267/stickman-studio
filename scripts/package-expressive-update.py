#!/usr/bin/env python3
"""Package sources/reports/videos and verify original environment byte equality."""
import argparse, hashlib, json, re, zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--original',required=True,type=Path);p.add_argument('--output',required=True,type=Path);args=p.parse_args()
root=Path(__file__).resolve().parents[1]
with zipfile.ZipFile(args.original) as original:
    original_env=original.read('StickLaughStudio/.env')
assert (root/'.env').read_bytes()==original_env,'Environment differs from supplied original'
skip={'node_modules','data','__pycache__','.angular','.git','.cache','library-transfer'}
def selected(f):
    rel=f.relative_to(root)
    if any(x in skip for x in rel.parts):return False
    if len(rel.parts)>1 and rel.parts[:2]==('web','dist'):return False
    if rel.parts[0]=='public':return False
    if f.suffix in {'.zip','.pyc','.tmp'}:return False
    if rel.parts[0]=='deliverables' and f.name=='audio.wav' and rel.parts[1]!='live-sound':return False
    return f.is_file()
files=sorted(f for f in root.rglob('*') if selected(f) and f.name!='CHECKPOINT_FILES.json')
secrets=[]
for line in original_env.decode().splitlines():
    if '=' not in line or line.lstrip().startswith('#'):continue
    key,value=line.split('=',1);value=value.strip().strip('\"\'')
    if re.search('KEY|TOKEN|SECRET|PASSWORD',key,re.I) and len(value)>8:secrets.append(value.encode())
leaks=[str(f.relative_to(root)) for f in files if f.name!='.env' and any(s in f.read_bytes() for s in secrets)]
assert not leaks,'Credential copies found outside .env: '+', '.join(leaks)
package=json.loads((root/'package.json').read_text());lock=json.loads((root/'package-lock.json').read_text())
for field in ('dependencies','devDependencies'):
    assert package.get(field,{})==lock['packages'][''].get(field,{}),'Dependency lock mismatch: '+field
validation={'originalEnvByteEqual':True,'credentialCopiesOutsideEnv':0,'dependencyLockRootMatches':True,'zipCRCCheckedOnReopen':True,'filesIncludeSourcesPlansVideosCreditsAndReports':True}
validation_file=root/'deliverables/verification/package-checks.json';validation_file.write_text(json.dumps(validation,indent=2))
files=sorted(f for f in root.rglob('*') if selected(f) and f.name!='CHECKPOINT_FILES.json')
manifest={'StickLaughStudio/'+str(f.relative_to(root)):{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in files}
(root/'CHECKPOINT_FILES.json').write_text(json.dumps(manifest,indent=2));files.append(root/'CHECKPOINT_FILES.json')
args.output.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(args.output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for f in files:z.write(f,'StickLaughStudio/'+str(f.relative_to(root)))
with zipfile.ZipFile(args.output) as z:
    assert z.testzip() is None,'ZIP CRC failure'
    assert z.read('StickLaughStudio/.env')==original_env
    for name,item in manifest.items():assert hashlib.sha256(z.read(name)).hexdigest()==item['sha256'],name
print(json.dumps({'file':str(args.output),'bytes':args.output.stat().st_size,'files':len(files),'verified':True}))
