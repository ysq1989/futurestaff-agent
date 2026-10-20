import {spawn,type ChildProcess} from 'node:child_process'
import {createServer} from 'node:http'
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {stopProcess,type ResolvedRuntime} from './runtime.js'
import {VideoError,type ProjectRevision,type VideoTimeline} from './contracts.js'

class Cdp {
 private id=0;private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>()
 constructor(private socket:WebSocket){socket.addEventListener('message',event=>{const data=JSON.parse(String(event.data));if(data.id){const target=this.pending.get(data.id);this.pending.delete(data.id);if(data.error)target?.reject(new VideoError('VIDEO_BROWSER_FAILED',data.error.message));else target?.resolve(data.result)}});socket.addEventListener('close',()=>{for(const p of this.pending.values())p.reject(new VideoError('VIDEO_BROWSER_CLOSED'));this.pending.clear()})}
 static async connect(url:string){const socket=new WebSocket(url);await new Promise<void>((resolve,reject)=>{socket.addEventListener('open',()=>resolve(),{once:true});socket.addEventListener('error',()=>reject(new VideoError('VIDEO_BROWSER_UNAVAILABLE')),{once:true})});return new Cdp(socket)}
 send(method:string,params:Record<string,unknown>={},sessionId?:string):Promise<any>{const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))})}
 close(){this.socket.close()}
}
const pause=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms);const abort=()=>{clearTimeout(timer);reject(new VideoError('VIDEO_CANCELLED'))};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()})
export async function frameBrowser(runtime:ResolvedRuntime,revision:ProjectRevision,timeline:VideoTimeline,directory:string,signal:AbortSignal){
 const token=randomUUID(),html=await readFile(fileURLToPath(new URL('./assets/renderer.html',import.meta.url)));let browser:ChildProcess|undefined,cdp:Cdp|undefined
 const server=createServer(async(req,res)=>{try{if(req.url==='/'+token){res.setHeader('content-type','text/html');res.end(html)}else if(req.url==='/'+token+'/font'&&runtime.fontPath){res.setHeader('content-type','font/ttf');res.end(await readFile(runtime.fontPath))}else{res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}})
 // Chromium still has Windows MAX_PATH-sensitive profile internals. Use a unique
 // OS-user-private scratch profile; no existing user/browser profile is read.
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port,url=`http://127.0.0.1:${port}/${token}`,profile=await mkdtemp(path.join(os.tmpdir(),'FutureStaff-video-'))
 const stop=()=>{if(browser)stopProcess(browser);cdp?.close();server.close()};signal.addEventListener('abort',stop,{once:true})
 try{
  browser=spawn(runtime.browserExecutable,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--disable-sync','--metrics-recording-only','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});browser.stdout?.resume();const bootLog:Buffer[]=[];browser.stderr?.on('data',(b:Buffer)=>{if(bootLog.length<100)bootLog.push(b)});browser.once('error',()=>stop());browser.once('close',()=>{void writeFile(path.join(directory,'browser.log'),Buffer.concat(bootLog)).catch(()=>{});void rm(profile,{recursive:true,force:true}).catch(()=>{})})
  let endpoint='';for(let i=0;i<150;i++){signal.throwIfAborted();if(browser.exitCode!==null)throw new VideoError('VIDEO_BROWSER_UNAVAILABLE');try{const lines=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');endpoint=`ws://127.0.0.1:${lines[0]}${lines[1]}`;break}catch{await pause(100,signal)}}
  if(!endpoint)throw new VideoError('VIDEO_BROWSER_TIMEOUT');cdp=await Cdp.connect(endpoint);const target=await cdp.send('Target.createTarget',{url:'about:blank'}),attached=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true}),sessionId=attached.sessionId
  await cdp.send('Page.enable',{},sessionId);await cdp.send('Page.navigate',{url},sessionId)
  for(let i=0;i<100;i++){signal.throwIfAborted();const ready=await cdp.send('Runtime.evaluate',{expression:'typeof window.configure === "function"',returnByValue:true},sessionId);if(ready.result?.value)break;await pause(50,signal)}
  const config=JSON.stringify({revision,timeline,...(runtime.fontPath?{fontUrl:url+'/font'}:{})});const initialized=await cdp.send('Runtime.evaluate',{expression:`window.configure(${config})`,awaitPromise:true,returnByValue:true},sessionId);if(initialized.exceptionDetails)throw new VideoError('VIDEO_BROWSER_FAILED','画布初始化失败。')
  // The trusted renderer has now loaded its one local font. Block all subsequent network access.
  await cdp.send('Network.enable',{},sessionId);await cdp.send('Network.setBlockedURLs',{urls:['*']},sessionId)
  return {frame:async(frame:number,format:'jpeg'|'png'='jpeg')=>{signal.throwIfAborted();const value=await cdp!.send('Runtime.evaluate',{expression:`window.renderFrame(${Math.trunc(frame)},${JSON.stringify(format)})`,returnByValue:true},sessionId);if(value.exceptionDetails||typeof value.result?.value!=='string')throw new VideoError('VIDEO_FRAME_FAILED');return Buffer.from(value.result.value,'base64')},close:()=>{signal.removeEventListener('abort',stop);stop()}}
 }catch(e){signal.removeEventListener('abort',stop);stop();throw e}
}
