import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {command,digest,videoProcessFilePath,type ResolvedRuntime} from './runtime.js'
import {VideoError,type Caption,type ProjectRevision,type VideoTimeline,type TimedScene} from './contracts.js'

const SR=48000
export function wav(samples:Int16Array,channels=2){const bytes=Buffer.alloc(44+samples.byteLength);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(channels,22);bytes.writeUInt32LE(SR,24);bytes.writeUInt32LE(SR*channels*2,28);bytes.writeUInt16LE(channels*2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.byteLength,40);Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength).copy(bytes,44);return bytes}
const clean=(s:string)=>s.replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase()
function captionChunks(text:string){const result:string[]=[];let current='';for(const char of text){current+=char;if(current.length>=19||(/[。！？；，,.!?;]/.test(char)&&current.length>=8)){result.push(current);current=''}}if(current)result.push(current);return result}
function captions(text:string,words:{offset:number;duration:number;text:string}[],start:number,duration:number):Caption[]{
 const chunks=captionChunks(text);if(!chunks.length)return[]
 let cursor=0,total=0;const joined=clean(words.map(w=>w.text).join(''));const accurate=joined===clean(text)&&words.length>0
 const weighted=chunks.reduce((n,s)=>n+Math.max(1,clean(s).length),0)
 return chunks.map((chunk,i)=>{const count=Math.max(1,clean(chunk).length);let begin,end
  if(accurate){begin=words[Math.min(cursor,words.length-1)]!.offset/1e7;let n=0,last=words[cursor]!;while(cursor<words.length&&n<count){last=words[cursor++]!;n+=clean(last.text).length}end=(last.offset+last.duration)/1e7}
  else{begin=duration*total/weighted;end=duration*(total+count)/weighted}
  total+=count;return{start:start+begin,end:start+Math.min(duration,Math.max(begin+.12,end+(i===chunks.length-1?.15:0))),text:chunk}
 })
}
export async function prepareAudio(revision:ProjectRevision,directory:string,runtime:ResolvedRuntime,signal:AbortSignal,maxDuration:number,onProgress:(stage:string,p:number)=>Promise<void>){
 const scenes:TimedScene[]=[],allCaptions:Caption[]=[],voices:Int16Array[]=[];const sources:Record<string,unknown>[]=[];let frame=0
 for(let i=0;i<revision.scenes.length;i++){
  signal.throwIfAborted();const scene=revision.scenes[i]!,prefix=path.join(directory,'scene-'+String(i+1).padStart(2,'0'));let pcm:Int16Array=new Int16Array(),words:{offset:number;duration:number;text:string}[]=[]
  if(revision.voice.provider==='edge'&&scene.narration.trim()){
   const request=prefix+'.tts.json',audio=prefix+'.mp3';await writeFile(request,JSON.stringify({text:scene.narration,voice:revision.voice}),{mode:0o600})
   const script=fileURLToPath(new URL('./assets/voice.py',import.meta.url));await command(runtime.pythonPath,[script,request,audio].map(file=>videoProcessFilePath(file)),{signal,timeoutMs:90000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',...(runtime.pythonModulePath?{PYTHONPATH:videoProcessFilePath(runtime.pythonModulePath)}:{})}})
   const bytes=await command(runtime.ffmpegPath,['-v','error','-i',videoProcessFilePath(audio),'-f','s16le','-ar',String(SR),'-ac','1','-'],{signal,maxBytes:SR*2*maxDuration})
   pcm=new Int16Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));words=JSON.parse(await readFile(prefix+'.words.json','utf8'));sources.push({sceneId:scene.id,provider:'edge',voice:revision.voice,audioSha256:digest(await readFile(audio)),wordBoundaryMatches:clean(words.map(w=>w.text).join(''))===clean(scene.narration)})
  }
  const durationFrames=Math.ceil(Math.max(scene.durationSeconds??(revision.voice.provider==='none'?6:2),pcm.length/SR+.38)*30)
  if((frame+durationFrames)/30>maxDuration)throw new VideoError('VIDEO_DURATION_LIMIT')
  const duration=durationFrames/30;scenes.push({...scene,startFrame:frame,durationFrames,start:frame/30,end:(frame+durationFrames)/30});voices.push(pcm);allCaptions.push(...captions(scene.narration,words,frame/30,pcm.length?pcm.length/SR:duration-.2));frame+=durationFrames
  await onProgress('voice',(i+1)/revision.scenes.length*.15)
 }
 const timeline:VideoTimeline={fps:30,width:1080,height:1920,durationFrames:frame,duration:frame/30,scenes,captions:allCaptions}
 const total=Math.round(timeline.duration*SR),mixed=new Int16Array(total*2),dry=new Int16Array(total);const voiceAt=new Float32Array(total)
 for(let i=0;i<scenes.length;i++){const pcm=voices[i]!,offset=Math.round(scenes[i]!.start*SR);let power=0;for(const value of pcm)power+=(value/32768)**2;const rms=Math.sqrt(power/Math.max(1,pcm.length)),gain=Math.min(4,.135/Math.max(.005,rms));for(let n=0;n<pcm.length&&offset+n<total;n++)voiceAt[offset+n]=pcm[n]!/32768*gain}
 const bpm=revision.music==='gentle'?86:112,beat=60/bpm,notes=[60,64,67,72,69,67,64,62],chords=[[48,52,55],[45,48,52],[41,45,48],[43,47,50]],seed=parseInt(revision.contentHash.slice(0,8),16)
 for(let n=0;n<total;n++){
  const t=n/SR,v=voiceAt[n]!,envelope=Math.min(1,t/.25,(timeline.duration-t)/.8),musical=t%(beat/2),step=Math.floor(t/(beat/2)),frequency=440*Math.pow(2,(notes[(step+seed)%notes.length]!-69)/12)
  const pluck=Math.sin(2*Math.PI*frequency*musical)*Math.exp(-musical*12)+.22*Math.sin(4*Math.PI*frequency*musical)*Math.exp(-musical*18)
  const chord=chords[Math.floor(t/(beat*4))%chords.length]!,pad=chord.reduce((sum,note)=>sum+Math.sin(2*Math.PI*440*Math.pow(2,(note-69)/12)*t),0)/3
  const phase=t%beat,kick=revision.music==='upbeat'?Math.sin(2*Math.PI*(68-35*Math.min(1,phase/.12))*phase)*Math.exp(-phase*24):0
  const music=revision.music==='none'?0:(pluck*.035+pad*.018+kick*.035)*envelope*(Math.abs(v)>.015?.72:1)
  const sample=Math.max(-.95,Math.min(.95,v+music));dry[n]=Math.round(Math.max(-.95,Math.min(.95,v))*32767);mixed[n*2]=Math.round(sample*32767);mixed[n*2+1]=Math.round(Math.max(-.95,Math.min(.95,v+music*.97))*32767)
 }
 const master=path.join(directory,'master.wav');await writeFile(master,wav(mixed));await writeFile(path.join(directory,'voiceover.wav'),wav(dry,1));await writeFile(path.join(directory,'audio-provenance.json'),JSON.stringify({voiceSources:sources,music:{kind:'original-procedural',style:revision.music,bpm,seed,externalMusic:false,creditRequired:false},masterSha256:digest(await readFile(master)),paidApiCalls:0},null,2));return{timeline,master}
}
export function toSrt(captions:Caption[]){const clock=(n:number)=>{const ms=Math.max(0,Math.round(n*1000));return`${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`};return captions.map((s,i)=>`${i+1}\n${clock(s.start)} --> ${clock(s.end)}\n${s.text}\n`).join('\n')}
