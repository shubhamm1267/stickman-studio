from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parents[1];src=root/'assets/sfx-sources';out=root/'assets/sfx';manifest=[x for x in json.loads((out/'manifest.json').read_text()) if x['name'] not in ['air-swish','impact','mutter-a','mutter-b','angry-babble','scolding']]
source={x['name']:x for x in json.loads((src/'sources.json').read_text())}
def clip(name,sourceName,filters,author,id):
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(src/(sourceName+'.mp3')),'-af',filters+',aresample=48000,afade=t=in:d=0.006,areverse,afade=t=in:d=0.03,areverse','-ac','1','-c:a','pcm_s16le',str(out/(name+'.wav'))],check=True)
 manifest.append({'name':name,'id':str(id)+'-edit','username':author,'page':source[sourceName]['page'],'license':'https://creativecommons.org/publicdomain/zero/1.0/','file':name+'.wav','modification':filters})
# Each clip has a defined literal use; silence trimmed once, rather than searching a random result every render.
clip('air-swish','whoosh','silenceremove=start_periods=1:start_threshold=-40dB,atrim=duration=0.26','velcronator',733905)
clip('impact','punch','silenceremove=start_periods=1:start_threshold=-38dB,atrim=duration=0.63','Paul368',322250)
clip('mutter-a','mumble','atrim=start=16.55:duration=1.75,asetpts=PTS-STARTPTS,asetrate=50000,aresample=48000,atempo=1.12','frosthardr',346638)
clip('mutter-b','mumble','atrim=start=35.1:duration=1.8,asetpts=PTS-STARTPTS,asetrate=56000,aresample=48000,atempo=1.2','frosthardr',346638)
clip('angry-babble','angry','atrim=start=0.04:duration=0.8,asetpts=PTS-STARTPTS,asetrate=44000,aresample=48000','Reitanna',343977)
# Genuine different gibberish phrases, with breath gaps and an emphatic angry ending. No repeated single grunt.
subprocess.run(['ffmpeg','-y','-v','error','-i',str(src/'mumble.mp3'),'-i',str(src/'angry.mp3'),'-filter_complex','[0:a]atrim=start=31.55:duration=1.72,asetpts=PTS-STARTPTS,atempo=1.4[a];[0:a]atrim=start=40.15:duration=1.58,asetpts=PTS-STARTPTS,atempo=1.35[b];[1:a]atrim=start=0.04:duration=0.78,asetpts=PTS-STARTPTS,atempo=1.15[c];[a][b][c]concat=n=3:v=0:a=1,aresample=48000,alimiter=limit=0.8:level=false[out]','-map','[out]','-ac','1','-c:a','pcm_s16le',str(out/'scolding.wav')],check=True)
manifest.append({'name':'scolding','id':'346638-343977-scold','username':'frosthardr + Reitanna (edited)','page':source['mumble']['page'],'license':'https://creativecommons.org/publicdomain/zero/1.0/','file':'scolding.wav','modification':'Different actual gibberish utterances concatenated, shortened and level limited; not TTS or repeated grunts.','additionalSources':[{'id':343977,'name':'strained gibberish','author':'Reitanna','page':source['angry']['page'],'license':'https://creativecommons.org/publicdomain/zero/1.0/'}]})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
