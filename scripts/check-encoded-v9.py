"""Verify native encoded media and extract real-video review sheets; no artistic score."""
import subprocess,json,math,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from scipy.signal import correlate
root=Path(__file__).resolve().parents[1];out=root/'qa/v9/encoded';out.mkdir(parents=True,exist_ok=True);reports=[]
def run(args):return subprocess.check_output(args)
for name in (sys.argv[1:] or ['superhero-v9','cool-cap-v9']):
 file=root/'deliverables'/name/'video.mp4';info=json.loads(run(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(file)]));v=next(x for x in info['streams'] if x['codec_type']=='video');a=next(x for x in info['streams'] if x['codec_type']=='audio');plan=json.loads((file.parent/'plan.json').read_text());fps=plan['renderFps'];seconds=sum(s['duration'] for s in plan['scenes']);assert v['r_frame_rate']==f'{fps}/1';assert int(v['nb_frames'])==round(seconds*fps);assert(v['width'],v['height'])==(1080,1920)
 subprocess.run(['ffmpeg','-v','error','-i',str(file),'-f','null','-'],check=True)
 # Measure the native 48k AAC decode, not a downsample filter's ringing/overshoot.
 audio=np.frombuffer(run(['ffmpeg','-v','error','-i',str(file),'-map','0:a:0','-f','f32le','-']),dtype='<f4');peak=float(np.max(np.abs(audio)));clipped=int(np.sum(np.abs(audio)>=.999));assert clipped==0;assert peak>.01
 # Every native frame is decoded to a small luma image to check finite nonblank pictures and count.
 raw=run(['ffmpeg','-v','error','-i',str(file),'-vf','scale=54:96','-pix_fmt','gray','-f','rawvideo','-']);frames=np.frombuffer(raw,dtype=np.uint8).reshape(-1,96,54);assert len(frames)==int(v['nb_frames']);assert np.min(np.std(frames.astype(float),axis=(1,2)))>2
 d=out/name;d.mkdir(exist_ok=True);times=list(np.arange(.1,seconds,1));sheet=Image.new('RGB',(8*135,260*math.ceil(len(times)/8)),'white');draw=ImageDraw.Draw(sheet)
 for i,t in enumerate(times):
  dest=d/f'{i}.jpg';subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',str(file),'-frames:v','1','-vf','scale=135:-1','-y',str(dest)],check=True);sheet.paste(Image.open(dest),((i%8)*135,(i//8)*260));draw.text(((i%8)*135,(i//8)*260+242),f'{t:.1f}s',fill='black')
 sheet.save(out/f'{name}-sheet.jpg');row={'name':name,'fps':fps,'frames':int(v['nb_frames']),'width':v['width'],'height':v['height'],'durationSeconds':float(info['format']['duration']),'fullVideoAudioDecode':'passed','allNativeFramesNonblank':True,'audioSampleRate':int(a['sample_rate']),'nativeAACPeakDbFS':round(20*math.log10(peak),2),'clippedSamples':clipped}
 if name=='superhero-v9':
  signal=np.frombuffer(run(['ffmpeg','-v','error','-i',str(file),'-ac','1','-ar','8000','-f','f32le','-']),dtype='<f4');template=np.frombuffer(run(['ffmpeg','-v','error','-i',str(root/'assets/sfx/impact.wav'),'-af','atrim=duration=0.22,afade=t=in:d=0.008','-ac','1','-ar','8000','-f','f32le','-']),dtype='<f4');matches=[]
  for t in [10.273,11.323]:
   start=int((t-.1)*8000);chunk=signal[start:int((t+.34)*8000)];corr=correlate(chunk,template,mode='valid');lag=int(np.argmax(corr));actual=(start+lag)/8000;co=float(corr[lag]/(np.linalg.norm(chunk[lag:lag+len(template)])*np.linalg.norm(template)));assert abs(actual-t)<1/fps;assert co>.8;matches.append({'expected':t,'matched':round(actual,5),'correlation':round(co,4)})
  row['punchContactMatches']=matches
 reports.append(row)
dest=root/'docs/encoded-qa-v9.json';prior=json.loads(dest.read_text()) if dest.exists() else [];dest.write_text(json.dumps([r for r in prior if r['name'] not in [x['name'] for x in reports]]+reports,indent=2));print(json.dumps(reports,indent=2))
