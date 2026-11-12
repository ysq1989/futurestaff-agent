import {createServer,type IncomingMessage,type ServerResponse} from 'node:http'
import {readFile,stat} from 'node:fs/promises'
import path from 'node:path'
import {isIP} from 'node:net'
import {PlatformApiError} from '@futurestaff/fs-platform-access/cloud'
import {ApiError,Storage,bounded} from './storage.js'
import {AuthService,PlatformGateway,type Gateway} from './platform.js'
import {Sessions,type SessionsOptions} from './sessions.js'
import {AigcHandoffs,aigcEntry} from './aigc-sso.js'

export interface ServerConfig {publicOrigin:string;platformOrigin:string;dataDir:string;encryptionKey:string;staticDir:string;gateway?:Gateway;sessions?:SessionsOptions;buildId?:string;trustProxy?:boolean;logger?:(record:Record<string,unknown>)=>void}
export async function body(req:IncomingMessage,limit=96*1024):Promise<Buffer>{
  const declared=Number(req.headers['content-length']??0);if(!Number.isFinite(declared)||declared>limit)throw new ApiError(413,'BODY_LIMIT','上传内容过大。')
  const chunks:Buffer[]=[];let size=0
  for await(const part of req){const b=Buffer.from(part);size+=b.length;if(size>limit)throw new ApiError(413,'BODY_LIMIT','上传内容过大。');chunks.push(b)}
  return Buffer.concat(chunks)
}
async function json(req:IncomingMessage){try{const b=await body(req);const v:unknown=JSON.parse(b.toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v as Record<string,unknown>}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(400,'INVALID_JSON','请求格式无效。')}}
function send(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.ico':'image/x-icon'}
export async function createCloudServer(config:ServerConfig){
  const origin=new URL(config.publicOrigin).origin,secure=origin.startsWith('https:'),cookieName=secure?'__Host-fs_agent':'fs_agent'
  if(!secure&&!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))throw Error('public origin requires HTTPS')
  const store=new Storage(config.dataDir,config.encryptionKey);await store.init()
  const auth=new AuthService(store,config.gateway??new PlatformGateway(config.platformOrigin)),sessions=new Sessions(auth,config.sessions)
  const aigc=new AigcHandoffs(auth.gateway)
  const cookie=(id:string,maxAge=7*86400)=>`${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`
  const rate=new Map<string,{count:number;until:number}>()
  const server=createServer(async(req,res)=>{
    const start=Date.now();let route='unknown'
    res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','same-origin');res.setHeader('x-frame-options','DENY')
    res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; manifest-src 'self'")
    res.on('finish',()=>config.logger?.({event:'http',method:req.method,route,status:res.statusCode,durationMs:Date.now()-start}))
    try{
      const url=new URL(req.url??'/',origin),pathname=url.pathname,method=req.method??'GET';route=pathname.replace(/[a-f0-9-]{36}/gi,':id')
      if(pathname==='/health'&&method==='GET'){send(res,200,{ok:true,service:'futurestaff-agent-cloud',version:'0.1.0',buildId:config.buildId??'development'});return}
      if(pathname.startsWith('/api/')){
        res.setHeader('cache-control','no-store')
        if(!['GET','POST'].includes(method))throw new ApiError(405,'METHOD_NOT_ALLOWED','此方法不可用。')
        if(method==='POST'&&req.headers.origin!==origin)throw new ApiError(403,'ORIGIN_DENIED','请求来源不一致，请从应用入口重试。')
        if(pathname==='/api/v1/login'&&method==='POST'){
          const forwarded=String(req.headers['x-real-ip']??'')
          const ip=config.trustProxy&&isIP(forwarded)?forwarded:req.socket.remoteAddress??'unknown'
          const previous=rate.get(ip),r=previous&&previous.until>Date.now()?previous:{count:0,until:Date.now()+15*60000};r.count++;rate.set(ip,r)
          if(rate.size>10000)for(const[k,v]of rate)if(v.until<Date.now())rate.delete(k)
          if(r.count>15)throw new ApiError(429,'LOGIN_RATE_LIMIT','登录尝试过多，请稍后再试。')
          const logged=await auth.login(await json(req));res.setHeader('set-cookie',cookie(logged.id));send(res,200,await auth.view(logged));return
        }
        const rawCookie=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)
        const loaded=await auth.load(rawCookie)
        if(method==='POST'&&req.headers['x-csrf-token']!==loaded.csrf)throw new ApiError(403,'CSRF_DENIED','页面凭据已更新，请刷新后重试。')
        if(pathname==='/api/v1/logout'&&method==='POST'){await sessions.revoke(loaded.id);await auth.logout(loaded);res.setHeader('set-cookie',cookie('',0));send(res,200,{ok:true});return}
        const member=await auth.fresh(loaded.id)
        if(pathname==='/api/v1/aigc/authorize'&&method==='POST'){send(res,200,await aigc.authorize(member,await json(req)));return}
        if(pathname==='/api/v1/me'&&method==='GET'){send(res,200,await auth.view(member));return}
        if(pathname==='/api/v1/tenant'&&method==='POST'){const input=await json(req);try{await sessions.revoke(member.id);const switched=await auth.switch(member,input.tenantId);send(res,200,await auth.view(switched))}finally{sessions.unblock(member.id)}return}
        if(pathname==='/api/v1/agents'&&method==='GET'){const items=await auth.gateway.agents(member,AbortSignal.timeout(20000));send(res,200,{items:items.map(x=>({...x,displayName:x.name}))});return}
        if(pathname==='/api/v1/systems'&&method==='GET'){send(res,200,{items:[...await sessions.systems(member),{systemId:'aigc',displayName:'AIGC',mode:'external',available:true,unavailableReason:null,agents:[],entryUrl:aigcEntry}]});return}
        if(pathname==='/api/v1/sessions'){
          if(method==='GET'){send(res,200,{items:await sessions.list(member,url.searchParams.get('systemId')??'legacy')});return}
          const input=await json(req),doc=await sessions.create(member,input.agentId,input.systemId,input.scope);send(res,201,{session:sessions.view(doc)});return
        }
        const match=/^\/api\/v1\/sessions\/([a-f0-9-]{36})(?:\/(messages|stop|answer|attachments|export)(?:\/([a-f0-9-]{36}))?)?$/.exec(pathname)
        if(match){
          const systemId=String(req.headers['x-fs-system']??(method==='GET'?url.searchParams.get('systemId')??'':''))
          if(!systemId)throw new ApiError(400,'SYSTEM_REQUIRED','请选择当前业务系统。')
          const doc=await sessions.get(member,match[1]!,systemId)
          if(method==='GET'&&!match[2]){send(res,200,{session:sessions.view(doc)});return}
          if(method==='GET'&&match[2]==='export'&&!match[3]){res.writeHead(200,{'content-type':'text/markdown; charset=utf-8','cache-control':'no-store','content-disposition':`attachment; filename="futurestaff-${doc.id}.md"`});res.end(`# ${doc.title}\n\n智能体：${doc.agentName}\n会话：${doc.id}\n\n`+doc.messages.map(m=>`## ${m.role==='user'?'用户':m.role==='assistant'?doc.agentName:m.role==='tool'?'工具':'状态'}\n\n${m.text}\n`).join('\n'));return}
          if(method==='POST'&&match[2]==='messages'){await sessions.send(member,doc,await json(req));send(res,202,{session:sessions.view(doc)});return}
          if(method==='POST'&&match[2]==='answer'){await sessions.answer(member,doc,await json(req));send(res,202,{session:sessions.view(doc)});return}
          if(method==='POST'&&match[2]==='stop'){const input=await json(req);sessions.writeContext(doc,input.contextVersion);await sessions.stop(doc);send(res,200,{session:sessions.view(doc)});return}
          if(method==='POST'&&match[2]==='attachments'&&!match[3]){
            sessions.writeContext(doc,req.headers['x-fs-context'])
            let name='图片.png';try{name=decodeURIComponent(String(req.headers['x-file-name']??name))}catch{}
            const attachment=await sessions.upload(doc,await body(req,8*1024*1024),String(req.headers['content-type']??'').split(';')[0]!,name);send(res,201,{attachment:{...attachment,url:attachment.url+'?systemId='+doc.systemId}});return
          }
          if(method==='GET'&&match[2]==='attachments'&&match[3]){const attachment=await sessions.attachment(doc,match[3]);res.writeHead(200,{'content-type':attachment.mime,'cache-control':'no-store','content-disposition':'inline'});res.end(attachment.bytes);return}
        }
        throw new ApiError(404,'NOT_FOUND','接口不存在。')
      }
      if(method!=='GET'&&method!=='HEAD')throw new ApiError(405,'METHOD_NOT_ALLOWED','此方法不可用。')
      let file=pathname==='/'?'index.html':decodeURIComponent(pathname).slice(1)
      if(!file||file.split('/').some(p=>p==='..'||p.startsWith('.'))||file.includes('\\')||file.includes('\0'))throw new ApiError(404,'NOT_FOUND','文件不存在。')
      const extension=path.extname(file)
      if(!mime[extension])throw new ApiError(404,'NOT_FOUND','文件不存在。')
      const target=path.join(config.staticDir,file)
      const info=await stat(target).catch(()=>undefined)
      if(!info?.isFile())throw new ApiError(404,'NOT_FOUND','文件不存在。')
      res.setHeader('cache-control',file==='sw.js'||file==='index.html'||file.endsWith('webmanifest')?'no-cache':'public, max-age=3600')
      if(file==='sw.js')res.setHeader('service-worker-allowed','/')
      res.setHeader('content-type',mime[extension]!);res.statusCode=200;res.end(method==='HEAD'?undefined:await readFile(target))
    }catch(e){
      if(res.headersSent){res.end();return}
      if(e instanceof ApiError)send(res,e.status,{error:{code:e.code,message:e.message}})
      else if(e instanceof PlatformApiError){const status=e.status===401?401:e.status===403?403:503;send(res,status,{error:{code:e.code,message:status===401?'登录已失效，请重新登录。':status===403?'当前成员没有此项权限。':'平台暂时不可用，请稍后再试。'}})}
      else{config.logger?.({event:'request_error',route,errorClass:e instanceof Error?e.name:'unknown'});send(res,503,{error:{code:'SERVICE_UNAVAILABLE',message:'服务暂时不可用，请稍后再试。'}})}
    }
  })
  server.requestTimeout=30000;server.headersTimeout=15000
  return{server,auth,sessions,async close(){await sessions.close();await new Promise<void>((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections()})}}
}
