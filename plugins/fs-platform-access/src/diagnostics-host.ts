import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {FutureStaffDiagnostics, sanitizeDiagnosticInput, type DiagnosticsOptions} from './diagnostics.js'

/** Same-origin renderer bridge; owner and credentials remain inside the Host. */
export function mountDiagnosticsHost(ctx:Context, options:DiagnosticsOptions):FutureStaffDiagnostics {
  const diagnostics=new FutureStaffDiagnostics(options)
  ctx.provide('futurestaffDiagnostics',diagnostics)
  ctx.effect(()=>()=>diagnostics.dispose(),'FutureStaff diagnostics outbox lifecycle')
  let windowStarted=0, requests=0
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/_futurestaff/platform-dev/diagnostics',handler:async(request,response)=>{
    const send=(status:number)=>{response.statusCode=status;response.setHeader('content-type','application/json');response.setHeader('cache-control','no-store');response.end(JSON.stringify({accepted:status===202}))}
    let localOrigin:string
    try {
      const url=new URL('http://'+request.headers.host)
      if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'
        ||(request.socket.localPort!==undefined&&Number(url.port||80)!==request.socket.localPort))return send(403)
      localOrigin=url.origin
    }catch{return send(403)}
    if(request.method!=='POST'||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress??'')
      ||request.headers['x-futurestaff-diagnostics']!=='1'||request.headers['sec-fetch-site']==='cross-site'
      ||request.headers.origin!==undefined&&request.headers.origin!==localOrigin)return send(403)
    const now=Date.now()
    if(now-windowStarted>=60000){windowStarted=now;requests=0}
    if(++requests>60)return send(429)
    try {
      const chunks:Buffer[]=[];let length=0
      for await(const raw of request){const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(raw);length+=bytes.length;if(length>2048)return send(413);chunks.push(bytes)}
      const input:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if(!input||typeof input!=='object'||Array.isArray(input))return send(400)
      const safe=sanitizeDiagnosticInput(input),raw=input as Record<string,unknown>
      if(Object.keys(raw).some(key=>!(key in safe)||raw[key]!==safe[key as keyof typeof safe]))return send(400)
      const identity=await options.authorize()
      identity.signal.throwIfAborted()
      if(identity.userId!==options.identity.userId||identity.tenantId!==options.identity.tenantId)return send(403)
      diagnostics.capture(safe)
      return send(202)
    }catch{return send(400)}
  }}),'FutureStaff same-origin diagnostics bridge')
  return diagnostics
}

declare module '@deepseek-ai/cordis' {interface Context {futurestaffDiagnostics:FutureStaffDiagnostics}}
