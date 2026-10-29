"""Reproduce V9 fixtures from the included CC0 Freesound HQ preview recordings."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
for name,source,filters in [
 ('flight-wind','wind.mp3','atrim=start=0.1:end=3.2,asetpts=PTS-STARTPTS,highpass=f=100,lowpass=f=4500,loudnorm=I=-20:TP=-3:LRA=7,afade=t=in:d=0.1,afade=t=out:st=2.9:d=0.2'),
 ('wet-plop','wet-plop.mp3','silenceremove=start_periods=1:start_threshold=-32dB,atrim=duration=0.48,asetpts=PTS-STARTPTS,highpass=f=80,loudnorm=I=-18:TP=-3:LRA=7,afade=t=in:d=0.004,afade=t=out:st=0.4:d=0.08')]:
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(root/'assets/sfx-sources'/source),'-af',filters,'-ar','48000','-ac','2',str(root/'assets/sfx'/(name+'.wav'))],check=True)
