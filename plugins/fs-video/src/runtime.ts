import path from 'node:path'
import {access,realpath} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {spawn,type ChildProcess} from 'node:child_process'
import {VideoError} from './contracts.js'
import {validateInstalledVideoRuntime} from './bootstrap.js'

export interface VideoRuntime {runtimeRoot?:string;ffmpegPath?:string;ffprobePath?:string;pythonPath?:string;pythonModulePath?:string;browserExecutable?:string;fontPath?:string}
export interface ResolvedRuntime {ffmpegPath:string;ffprobePath:string;pythonPath:string;pythonModulePath?:string;browserExecutable:string;fontPath?:string;runtimeRoot?:string}
export const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')
export async function resolveRuntime(input:VideoRuntime):Promise<ResolvedRuntime>{
 const root=input.runtimeRoot??process.env.FUTURESTAFF_VIDEO_RUNTIME_ROOT
 if(root){try{await validateInstalledVideoRuntime(root)}catch{throw new VideoError('VIDEO_RUNTIME_HASH_MISMATCH')}}
 if(root){
  const expected:Record<string,string>={ffmpegPath:path.join(root,'bin','ffmpeg.exe'),ffprobePath:path.join(root,'bin','ffprobe.exe'),pythonPath:path.join(root,'python','python.exe'),fontPath:path.join(root,'fonts','NotoSansSC.ttf'),pythonModulePath:path.join(root,'python','Lib','site-packages')}
  for(const [key,file] of Object.entries(expected)){const override=input[key as keyof VideoRuntime];if(override&&path.resolve(override).toLowerCase()!==path.resolve(file).toLowerCase())throw new VideoError('VIDEO_RUNTIME_INVALID')}
 }
 const bin=(name:string)=>root?path.join(root,'bin',name+(process.platform==='win32'?'.exe':'')):undefined
 let browser=input.browserExecutable??process.env.FUTURESTAFF_VIDEO_BROWSER
 if(!browser){const choices=process.platform==='win32'?[path.join(process.env['ProgramFiles(x86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),path.join(process.env.ProgramFiles??'C:/Program Files','Microsoft/Edge/Application/msedge.exe')]:['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'];for(const candidate of choices){try{await access(candidate);browser=candidate;break}catch{}}}
 const ffmpeg=input.ffmpegPath??bin('ffmpeg'),ffprobe=input.ffprobePath??bin('ffprobe')
 const python=input.pythonPath??(root?path.join(root,'python',process.platform==='win32'?'python.exe':'bin/python3'):undefined)
 if(!ffmpeg||!ffprobe||!browser)throw new VideoError('VIDEO_RUNTIME_UNAVAILABLE','视频运行组件尚未安装或浏览器不可用。')
 for(const file of [ffmpeg,ffprobe,browser]){if(!path.isAbsolute(file))throw new VideoError('VIDEO_RUNTIME_INVALID');await access(file)}
 const font=input.fontPath??(root?path.join(root,'fonts/NotoSansSC.ttf'):undefined)
 if(font)await access(font)
 return {ffmpegPath:await realpath(ffmpeg),ffprobePath:await realpath(ffprobe),browserExecutable:await realpath(browser),pythonPath:python??'python',...(font?{fontPath:font}:{}),...(root?{runtimeRoot:root}:{}),...(input.pythonModulePath?{pythonModulePath:input.pythonModulePath}:{})}
}
export function stopProcess(child:ChildProcess){
 if(child.exitCode!==null)return
 if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill())}
 else child.kill('SIGTERM')
}
export async function command(file:string,args:string[],options:{signal?:AbortSignal;cwd?:string;env?:NodeJS.ProcessEnv;timeoutMs?:number;maxBytes?:number}={}):Promise<Buffer>{
 options.signal?.throwIfAborted()
 return new Promise((resolve,reject)=>{
  const child=spawn(file,args,{windowsHide:true,cwd:options.cwd,env:{...process.env,...options.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe']});const stdout:Buffer[]=[],stderr:Buffer[]=[];let size=0,failed=false
  const abort=()=>{failed=true;stopProcess(child)}
  const timer=setTimeout(abort,options.timeoutMs??120000);options.signal?.addEventListener('abort',abort,{once:true})
  child.stdout.on('data',(bytes:Buffer)=>{size+=bytes.length;if(size>(options.maxBytes??32*1024*1024))abort();else stdout.push(bytes)})
  child.stderr.on('data',(bytes:Buffer)=>{if(stderr.reduce((n,b)=>n+b.length,0)<16000)stderr.push(bytes)})
  const done=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort)}
  const streamError=()=>{failed=true;stopProcess(child);done();reject(new VideoError('VIDEO_PROCESS_IO_FAILED'))}
  child.stdout.on('error',streamError);child.stderr.on('error',streamError)
  child.once('error',e=>{done();reject(new VideoError('VIDEO_RUNTIME_UNAVAILABLE',e.message))})
  child.once('close',code=>{done();if(options.signal?.aborted)return reject(new VideoError('VIDEO_CANCELLED'));if(failed)return reject(new VideoError('VIDEO_PROCESS_LIMIT'));if(code!==0)return reject(new VideoError('VIDEO_PROCESS_FAILED',Buffer.concat(stderr).toString('utf8').slice(-2000)));resolve(Buffer.concat(stdout))})
 })
}
export async function probe(file:string,runtime:ResolvedRuntime,signal?:AbortSignal){const input=process.platform==='win32'&&path.isAbsolute(file)?path.toNamespacedPath(file):file;return JSON.parse((await command(runtime.ffprobePath,['-v','error','-show_streams','-show_format','-of','json',input],{signal})).toString('utf8')) as {streams:Record<string,unknown>[];format:Record<string,unknown>}}
