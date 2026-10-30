import test from 'node:test';
import assert from 'node:assert/strict';
import {emotionControls} from '../shared/acting-expressions.mjs';
import {elasticFace} from '../renderer/draw.mjs';

test('curiosity raises one brow and shock raises both in the renderer coordinate convention',()=>{
 const curious=emotionControls('curious'),shock=emotionControls('shock');
 assert.ok(curious.browHeight[0]>curious.browHeight[1]);
 assert.ok(shock.browHeight.every(h=>h>0));
 const svg=elasticFace({id:'hero',kind:'man',skin:'#eee8cc',hair:'#333333',hairStyle:'bald'},{face:'shock',...shock},1);
 assert.match(svg,/translate\(-27 -92\)/);assert.match(svg,/translate\(27 -89\)/);
});
test('laughing, crying and annoyance retain distinct mouth and eyelid controls instead of a flat neutral face',()=>{
 const laugh=emotionControls('laugh'),cry=emotionControls('cry'),annoyed=emotionControls('annoyed');
 assert.ok(laugh.mouthCurve>0&&laugh.mouthAperture>.4&&laugh.eyeOpen<.5);
 assert.ok(cry.mouthCurve<0&&cry.mouthAperture>0);assert.ok(annoyed.browTilt[0]>0&&annoyed.browTilt[1]<0);
 assert.notDeepEqual(laugh,cry);assert.notDeepEqual(cry,annoyed);
 const weak=emotionControls('shock',.25),strong=emotionControls('shock',1);
 assert.ok(weak.browHeight[0]<strong.browHeight[0]);assert.ok(weak.mouthAperture<strong.mouthAperture);
});
