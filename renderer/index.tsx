import React from 'react';
import {AbsoluteFill,Audio,Composition,Sequence,registerRoot,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {svgFrameAtFrame,svgFrameForScene} from './engine.mjs';
import{timeline}from'../shared/timeline.mjs';
const Picture=({plan,sceneIndex=0,thumbnail=false})=>{const frame=useCurrentFrame();const{fps}=useVideoConfig();const svg=thumbnail?svgFrameAtFrame(plan,frame,{format:'landscape',thumbnail:true}):svgFrameForScene(plan,sceneIndex,frame/fps);return <AbsoluteFill><div style={{width:'100%',height:'100%'}} dangerouslySetInnerHTML={{__html:svg}}/></AbsoluteFill>};
const Film=({plan,audioFile,thumbnail=false})=>{
 const{fps}=useVideoConfig(),clock=timeline(plan);
 return <AbsoluteFill style={{background:'#c6c7b2'}}>{thumbnail?<Picture plan={plan} thumbnail/>:clock.scenes.map((range,sceneIndex)=><Sequence key={range.id} name={plan.scenes[sceneIndex].summary} from={range.from} durationInFrames={range.durationInFrames} premountFor={Math.round(fps*.2)}><Picture plan={plan} sceneIndex={sceneIndex}/></Sequence>)}
 {audioFile&&!thumbnail&&<Audio src={staticFile(audioFile)}/>}
 {thumbnail&&plan.seo.thumbnailText?.trim()&&<div style={{position:'absolute',left:32,bottom:28,padding:'16px 24px',border:'3px solid #293329',borderRadius:12,background:'#f5f2dc',fontFamily:'Arial',fontSize:48,fontWeight:900,color:'#293329'}}>{plan.seo.thumbnailText}</div>}
 </AbsoluteFill>
};
const Root=()=> <Composition id="StoryFilm" component={Film} width={1080} height={1920} fps={30} durationInFrames={60} defaultProps={{plan:null,audioFile:null}} calculateMetadata={({props})=>{const fps=props.plan.renderFps||30;return{fps,width:props.thumbnail?1280:props.plan.format==='landscape'?1920:1080,height:props.thumbnail?720:props.plan.format==='shorts'?1920:1080,durationInFrames:timeline(props.plan).durationInFrames}}}/>;
registerRoot(Root);
