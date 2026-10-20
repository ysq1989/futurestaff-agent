import {writeFile,rename,readFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import path from 'node:path'
import {VideoError,type ProjectRevision,type VideoResult} from './contracts.js'
import {resolveRuntime,command,probe,digest,stopProcess,type VideoRuntime} from './runtime.js'
import {prepareAudio,toSrt} from './audio.js'
import {frameBrowser} from './browser.js'

export interface RenderRequest {revision:ProjectRevision;directory:string;runtime:VideoRuntime;signal:AbortSignal;profile:'preview'|'final';limits:{maxDurationSeconds?:number;maxFrames?:number;maxJobMs?:number};onProgress:(stage:string,progress:number)=>Promise<void>}
export async function renderVideo(request:RenderRequest):Promise<VideoResult>{
 const{revision,directory,signal,onProgress}=request,runtime=await resolveRuntime(request.runtime)
 const versions={ffmpeg:(await command(runtime.ffmpegPath,['-version'],{signal})).toString().split('\n')[0],renderer:'FutureStaff controlled Canvas 1.0',voice:revision.voice}
 const{timeline,master}=await prepareAudio(revision,directory,runtime,signal,Math.min(180,request.limits.maxDurationSeconds??180),onProgress)
 if(timeline.durationFrames>(request.limits.maxFrames??5400))throw new VideoError('VIDEO_FRAME_LIMIT')
 if(revision.aspectRatio==='16:9'){timeline.width=1920;timeline.height=1080}
 if(request.profile==='preview'){timeline.width=Math.round(timeline.width*2/3);timeline.height=Math.round(timeline.height*2/3)}
 const subtitlesPath=path.join(directory,'subtitles.srt'),videoPath=path.join(directory,'video.mp4'),webmPath=path.join(directory,'preview.webm'),posterPath=path.join(directory,'poster.jpg'),manifestPath=path.join(directory,'render-manifest.json'),partial=path.join(directory,'video.partial.mp4')
 await writeFile(subtitlesPath,toSrt(timeline.captions));await writeFile(path.join(directory,'timeline.json'),JSON.stringify(timeline,null,2))
 const browser=await frameBrowser(runtime,revision,timeline,directory,signal)
 const args=['-hide_banner','-y','-f','image2pipe','-framerate','30','-vcodec','mjpeg','-i','pipe:0','-i',master,'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709,sidedata=mode=delete:type=ICC_PROFILE','-c:v','libx264','-profile:v','main','-level:v','4.0','-preset','fast','-crf','19','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-g','60','-maxrate','12M','-bufsize','24M','-threads','2','-c:a','aac','-b:a','192k','-ar','48000','-frames:v',String(timeline.durationFrames),'-movflags','+faststart',partial]
 const child=spawn(runtime.ffmpegPath,args,{windowsHide:true,stdio:['pipe','ignore','pipe']});const log:Buffer[]=[];let processError:Error|undefined;child.on('error',error=>{processError=error});child.stderr.on('data',(bytes:Buffer)=>{if(log.reduce((n,b)=>n+b.length,0)<1000000)log.push(bytes)});const ended=new Promise<number|null>(resolve=>child.once('close',code=>resolve(code)));const abort=()=>stopProcess(child);signal.addEventListener('abort',abort,{once:true})
 child.stdin.on('error',()=>{})
 try{await writeFile(posterPath,await browser.frame(Math.min(70,timeline.scenes[0]!.durationFrames-1)));for(let frame=0;frame<timeline.durationFrames;frame++){signal.throwIfAborted();if(processError||child.exitCode!==null)throw new VideoError('VIDEO_ENCODING_FAILED',processError?.message);const bytes=await browser.frame(frame);if(!child.stdin.write(bytes))await Promise.race([once(child.stdin,'drain'),ended.then(()=>{throw new VideoError('VIDEO_ENCODING_FAILED')})]);if(frame%30===0)await onProgress('frames',.17+.59*frame/timeline.durationFrames)}child.stdin.end();const code=await ended;if(code!==0||processError)throw new VideoError('VIDEO_ENCODING_FAILED',Buffer.concat(log).toString().slice(-1800))}
 finally{signal.removeEventListener('abort',abort);browser.close();if(child.exitCode===null){stopProcess(child);await ended}await writeFile(path.join(directory,'encode.log'),Buffer.concat(log))}
 signal.throwIfAborted();await rename(partial,videoPath);await onProgress('preview',.79)
 const webmArgs=['-hide_banner','-y','-i',videoPath,'-vf',timeline.width<timeline.height?'scale=720:1280':'scale=1280:720','-c:v','libvpx-vp9','-crf','33','-b:v','0','-deadline','good','-cpu-used','5','-row-mt','1','-threads','2','-c:a','libopus','-b:a','96k',webmPath]
 await command(runtime.ffmpegPath,webmArgs,{signal,timeoutMs:300000});await onProgress('verify',.94)
 const metadata=await probe(videoPath,runtime,signal),video=metadata.streams.find(s=>s.codec_type==='video'),audio=metadata.streams.find(s=>s.codec_type==='audio')
 if(video?.profile!=='Main'||video.pix_fmt!=='yuv420p'||video.color_range!=='tv'||Number(video.nb_frames)!==timeline.durationFrames||audio?.codec_name!=='aac')throw new VideoError('VIDEO_OUTPUT_INVALID')
 for(const file of [videoPath,webmPath])await command(runtime.ffmpegPath,['-v','error','-i',file,'-f','null','-'],{signal,timeoutMs:180000})
 const result={videoPath,webmPath,posterPath,subtitlesPath,manifestPath},outputs=[]
 for(const file of Object.values(result).filter(p=>p!==manifestPath)){const bytes=await readFile(file);outputs.push({path:path.basename(file),bytes:bytes.length,sha256:digest(bytes)})}
 const manifest={schemaVersion:1,projectId:revision.projectId,revisionId:revision.revisionId,parentRevisionId:revision.parentRevisionId,contentHash:revision.contentHash,createdAt:new Date().toISOString(),versions,timeline:{fps:30,width:timeline.width,height:timeline.height,durationFrames:timeline.durationFrames,duration:timeline.duration},outputs,encoding:{profile:'Main',level:40,pixelFormat:'yuv420p',range:'tv',faststart:true},paidApiCalls:0,sourceRevisionPath:path.relative(directory,path.join(directory,'../../revisions',revision.revisionId,'project.json')).replaceAll('\\','/'),commands:[args,webmArgs],verification:{fullDecodePassed:true,voiceProvider:revision.voice.provider},music:'original procedural composition; no third-party sample/track'}
 await writeFile(manifestPath,JSON.stringify(manifest,null,2));return result
}
