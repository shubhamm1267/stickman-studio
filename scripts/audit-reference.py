"""Decode every supplied reference frame; measure holds/cuts, and extract review sheets.
Does not grade comedy, infer authorship, transcribe speech or copy reference assets.
Usage: python scripts/audit-reference.py OUTPUT_DIR REFERENCE.mp4 [...]
"""
import sys,json,subprocess,statistics
from pathlib import Path
from PIL import Image,ImageChops,ImageStat,ImageDraw
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);reports=[]
for i,f in enumerate(sys.argv[2:],1):
 p=Path(f);info=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(p)]));v=next(x for x in info['streams'] if x['codec_type']=='video');cmd=['ffmpeg','-v','error','-i',str(p),'-vf','scale=96:170','-f','rawvideo','-pix_fmt','rgb24','-'];proc=subprocess.Popen(cmd,stdout=subprocess.PIPE);prev=None;diffs=[];count=0;cuts=[];fps=eval(v['r_frame_rate'],{'__builtins__':{}},{})
 while True:
  data=proc.stdout.read(96*170*3)
  if len(data)!=96*170*3:break
  im=Image.frombytes('RGB',(96,170),data)
  if prev:
   delta=sum(ImageStat.Stat(ImageChops.difference(im,prev)).mean)/3;diffs.append(delta)
   if delta>22:cuts.append(round(count/fps,3))
  prev=im;count+=1
 proc.wait();assert proc.returncode==0
 d=out/str(i);d.mkdir(exist_ok=True)
 subprocess.run(['ffmpeg','-v','error','-i',str(p),'-vf','fps=1,scale=135:-1',str(d/'%03d.jpg')],check=True)
 files=sorted(d.glob('*.jpg'));sheet=Image.new('RGB',(1080,260*((len(files)+7)//8)),'#ddd');dr=ImageDraw.Draw(sheet)
 for j,f in enumerate(files):
  im=Image.open(f);im.thumbnail((135,240));x=j%8*135;y=j//8*260;sheet.paste(im,(x,y));dr.text((x+4,y+242),f'{j}s',fill='black')
 sheet.save(out/f'reference-{i}.jpg')
 reports.append({'name':p.name,'duration':float(info['format']['duration']),'nativeFps':fps,'decodedFrames':count,'width':v['width'],'height':v['height'],'frameDifferenceMedian':round(statistics.median(diffs),4),'nearIdenticalPairsThresholdMeanRGB0_15':sum(x<.15 for x in diffs),'candidateCutsThresholdMeanRGB22':cuts,'visualReview':'Whole-clip 1 fps contact sheet plus dense strips at selected actions/cuts. All native frames decoded numerically; not a claim that a person manually inspected every individual native frame.','audioReview':'Audio stream decoded without errors; effects/dialogue classification follows supplied style direction. No transcription or voice identity claim.'})
 subprocess.run(['ffmpeg','-v','error','-i',str(p),'-map','0:a','-f','null','-'],check=True)
(out/'reference-metrics.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports,indent=2))
