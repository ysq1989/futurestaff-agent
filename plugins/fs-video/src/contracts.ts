export class VideoError extends Error {
  constructor(readonly code:string,message=code){super(message);this.name='VideoError'}
}
export type Visual='hero'|'benefits'|'steps'|'offer'|'cta'
export type Music='upbeat'|'gentle'|'none'
export type Theme='warm'|'clean'|'bold'
export interface VideoScene {id:string;title:string;narration:string;lines:string[];visual:Visual;durationSeconds?:number;assetId?:string}
export interface Voice {provider:'edge'|'none';name:string;rate:string;pitch:string}
export interface ProjectContent {title:string;brief:string;scenes:VideoScene[];aspectRatio:'9:16'|'16:9';music:Music;theme:Theme;voice:Voice}
export interface CreateInput extends ProjectContent {requestId:string}
export interface ReviseInput {requestId:string;projectId:string;baseRevisionId:string;changes:Partial<ProjectContent>}
export interface RenderInput {requestId:string;projectId:string;revisionId:string;profile:'preview'|'final'}
export interface ProjectRevision extends ProjectContent {schemaVersion:1;projectId:string;revisionId:string;parentRevisionId:string|null;ownerHash:string;createdAt:string;contentHash:string}
export interface ProjectRecord {schemaVersion:1;projectId:string;ownerHash:string;createdAt:string;updatedAt:string;currentRevisionId:string;title:string}
export interface VideoResult {videoPath:string;webmPath:string;posterPath:string;subtitlesPath:string;manifestPath:string}
export interface VideoJob {schemaVersion:1;projectId:string;revisionId:string;jobId:string;requestId:string;status:'queued'|'running'|'succeeded'|'failed'|'cancelled';stage:string;progress:number;createdAt:string;updatedAt:string;profile:'preview'|'final';result?:VideoResult;error?:{code:string;message:string}}
export interface TimedScene extends VideoScene {startFrame:number;durationFrames:number;start:number;end:number}
export interface Caption {start:number;end:number;text:string}
export interface VideoTimeline {fps:30;width:number;height:number;durationFrames:number;duration:number;scenes:TimedScene[];captions:Caption[]}

const fail=()=>{throw new VideoError('VIDEO_INPUT_INVALID')}
export function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return fail();return value as Record<string,unknown>}
export function keys(raw:Record<string,unknown>,allowed:string[],required:string[]=[]){if(Object.keys(raw).some(k=>!allowed.includes(k))||required.some(k=>!(k in raw)))fail()}
function text(value:unknown,min:number,max:number):string{if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))return fail();return value.trim()}
export function identifier(value:unknown):string{const s=text(value,1,80);if(!/^[a-zA-Z0-9_-]+$/.test(s))return fail();return s}
export function uuid(value:unknown):string{const s=text(value,36,36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s))return fail();return s.toLowerCase()}
export function requestId(value:unknown):string{const s=identifier(value);if(s.length<8)return fail();return s}
function choice<const T extends string>(value:unknown,options:readonly T[]):T{if(typeof value!=='string'||!options.includes(value as T))return fail();return value as T}
export function parseVoice(value:unknown):Voice{
  const v=value===undefined?{}:object(value);keys(v,['provider','name','rate','pitch'])
  const name=v.name===undefined?'zh-CN-XiaoxiaoNeural':text(v.name,1,100)
  // Only public built-in voices; no cloning, arbitrary SSML or custom endpoints.
  if(!/^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+Neural$/.test(name))return fail()
  const rate=v.rate===undefined?'+8%':text(v.rate,2,6),pitch=v.pitch===undefined?'+2Hz':text(v.pitch,3,7)
  if(!/^[+-]\d{1,2}%$/.test(rate)||Math.abs(parseInt(rate))>30||!/^[+-]\d{1,2}Hz$/.test(pitch)||Math.abs(parseInt(pitch))>20)return fail()
  return {provider:v.provider===undefined?'edge':choice(v.provider,['edge','none']),name,rate,pitch}
}
export function parseScene(value:unknown):VideoScene{
 const s=object(value);keys(s,['id','title','narration','lines','visual','durationSeconds','assetId'],['id','title','narration','lines','visual'])
 if(!Array.isArray(s.lines)||s.lines.length>4)return fail()
 const duration=s.durationSeconds;if(duration!==undefined&&(typeof duration!=='number'||!Number.isFinite(duration)||duration<2||duration>30))return fail()
 return {id:identifier(s.id),title:text(s.title,1,90),narration:text(s.narration,0,1200),lines:s.lines.map(x=>text(x,1,100)),visual:choice(s.visual,['hero','benefits','steps','offer','cta']),...(duration===undefined?{}:{durationSeconds:duration as number}),...(s.assetId===undefined?{}:{assetId:uuid(s.assetId)})}
}
function scenes(value:unknown):VideoScene[]{if(!Array.isArray(value)||value.length<1||value.length>12)return fail();const v=value.map(parseScene);if(new Set(v.map(s=>s.id)).size!==v.length||v.reduce((a,s)=>a+(s.durationSeconds??6),0)>180||v.reduce((a,s)=>a+s.narration.length,0)>5000)return fail();return v}
export function parseContent(value:unknown,partial=false):Partial<ProjectContent>{
 const v=object(value);keys(v,['title','brief','scenes','aspectRatio','music','theme','voice'],partial?[]:['title','brief','scenes'])
 const out:Partial<ProjectContent>={}
 if(v.title!==undefined)out.title=text(v.title,1,160)
 if(v.brief!==undefined)out.brief=text(v.brief,1,6000)
 if(v.scenes!==undefined)out.scenes=scenes(v.scenes)
 if(v.aspectRatio!==undefined)out.aspectRatio=choice(v.aspectRatio,['9:16','16:9'])
 if(v.music!==undefined)out.music=choice(v.music,['upbeat','gentle','none'])
 if(v.theme!==undefined)out.theme=choice(v.theme,['warm','clean','bold'])
 if(v.voice!==undefined)out.voice=parseVoice(v.voice)
 if(partial&&Object.keys(out).length===0)return fail()
 return out
}
export function parseCreate(value:unknown):CreateInput{
 const v=object(value);keys(v,['requestId','title','brief','scenes','aspectRatio','music','theme','voice'],['requestId','title','brief','scenes'])
 const {requestId:request,...content}=v
 return {aspectRatio:'9:16',music:'upbeat',theme:'warm',voice:parseVoice(undefined),...parseContent(content),requestId:requestId(request)} as CreateInput
}
export function parseRevise(value:unknown):ReviseInput{const v=object(value);keys(v,['requestId','projectId','baseRevisionId','changes'],['requestId','projectId','baseRevisionId','changes']);return {requestId:requestId(v.requestId),projectId:uuid(v.projectId),baseRevisionId:uuid(v.baseRevisionId),changes:parseContent(v.changes,true)}}
export function parseRender(value:unknown):RenderInput{const v=object(value);keys(v,['requestId','projectId','revisionId','profile'],['requestId','projectId','revisionId']);return {requestId:requestId(v.requestId),projectId:uuid(v.projectId),revisionId:uuid(v.revisionId),profile:v.profile===undefined?'final':choice(v.profile,['preview','final'])}}
export function parseRef(value:unknown,job=false):{projectId:string;revisionId?:string;jobId?:string}{const v=object(value);keys(v,job?['projectId','jobId']:['projectId','revisionId'],job?['projectId','jobId']:['projectId']);return {projectId:uuid(v.projectId),...(v.revisionId===undefined?{}:{revisionId:uuid(v.revisionId)}),...(v.jobId===undefined?{}:{jobId:uuid(v.jobId)})}}
