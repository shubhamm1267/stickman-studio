import fs from 'node:fs/promises';
import {once} from 'node:events';
import {Resvg} from '@resvg/resvg-js';
import {svgFrameAtFrame} from '../renderer/engine.mjs';
import {timeline} from '../shared/timeline.mjs';
const [file,size]=process.argv.slice(2),plan=JSON.parse(await fs.readFile(file,'utf8')),clock=timeline(plan),width=Number(size);
for(let frame=0;frame<clock.durationInFrames;frame++){
 const raster=new Resvg(svgFrameAtFrame(plan,frame),{fitTo:{mode:'width',value:width}}).render();
 if(!process.stdout.write(raster.pixels))await once(process.stdout,'drain');
 if(frame%10===0)global.gc?.();
 if(frame%clock.fps===0)process.stderr.write(JSON.stringify({frame,total:clock.durationInFrames})+'\n');
}
