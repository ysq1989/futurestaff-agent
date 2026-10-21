import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@futurestaff/fs-platform-access';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {z} from 'zod';
import {GeoAgentBridge} from './agent-bridge.js';
import {ToutiaoAccountProfiles} from './publication-accounts.js';
import {authorizeGeo} from './authorization.js';
import type { GeoDesktopService } from './service.js';
import {mountGeoAssistant} from './assistant-host.js';
export {mountGeoAssistant,geoToolSchemas,readAssistantResponse} from './assistant-host.js';

export const inject=['webServer','platformDevLogin'];
export const routePrefix='/_futurestaff/geo';
export function geoRequestAllowed(request:IncomingMessage,api=false){
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress??'')||request.headers['sec-fetch-site']==='cross-site')return false;
  try{
    const host=new URL(`http://${request.headers.host}`);
    if(!['127.0.0.1','[::1]','localhost'].includes(host.hostname)||host.username||host.password)return false;
    const origin=request.headers.origin;
    if(origin&&(typeof origin!=='string'||new URL(origin).origin!==host.origin))return false;
    return !api||request.headers['x-futurestaff-geo']==='1';
  }catch{return false}
}
function failure(response:ServerResponse,status:number,code:string,message:string){response.statusCode=status;response.setHeader('content-type','application/json');response.setHeader('cache-control','no-store');response.end(JSON.stringify({error:{code,message}}))}
export function geoStaticFile(url:string,root:string){
  const pathname=new URL(url,'http://localhost').pathname;
  const relative=pathname.slice(routePrefix.length).replace(/^\//,'')||'index.html';
  if(!/^(index\.html|(?:assets|brand|audio)\/[A-Za-z0-9_-]+\.(?:js|css|svg|png|webp|woff2?|wav))$/.test(relative))throw Error('GEO_ASSET_REJECTED');
  return path.join(root,relative);
}
export function createGeoHandler(service:GeoDesktopService,assets:string){
 return async(request:IncomingMessage,response:ServerResponse)=>{
  const url=request.url??'';const api=url.startsWith(routePrefix+'/api/geo/v1/');
  response.setHeader('x-content-type-options','nosniff');response.setHeader('cache-control','no-store');
  if(!geoRequestAllowed(request,api))return failure(response,403,'LOCAL_REQUEST_REQUIRED','请从 DSH 打开 GEO');
  try{
   if(api){
    if(!['GET','POST'].includes(request.method??''))return failure(response,405,'METHOD_NOT_ALLOWED','操作方法不支持');
    let body:unknown=undefined;
    if(request.method==='POST'){
      if(!String(request.headers['content-type']).startsWith('application/json'))return failure(response,415,'JSON_REQUIRED','请使用 JSON 请求');
      let size=0;const chunks:Buffer[]=[];
      for await(const raw of request){const chunk=Buffer.from(raw);size+=chunk.length;if(size>150000)return failure(response,413,'REQUEST_LIMIT','请求内容过大');chunks.push(chunk)}
      body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    const key=request.headers['idempotency-key'];
    const result=await service.dispatch({method:request.method!,url:url.slice(routePrefix.length),...(body===undefined?{}:{body}),...(typeof key==='string'?{headers:{'idempotency-key':key}}:{})});
    response.statusCode=result.statusCode;
    for(const name of ['content-type','content-disposition','x-geo-tenant','x-geo-user']){const value=result.headers[name];if(typeof value==='string')response.setHeader(name,value)}
    response.end(result.body);return;
   }
   if(request.method!=='GET')return failure(response,405,'METHOD_NOT_ALLOWED','操作方法不支持');
   const file=geoStaticFile(url,assets);
   const type:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.wav':'audio/wav'};
   response.setHeader('content-type',type[path.extname(file)]??'application/octet-stream');
   response.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
   response.end(await readFile(file));
  }catch(error){
    const code=error instanceof Error?error.message:'';
    if((error as NodeJS.ErrnoException)?.code==='ENOENT'||code==='GEO_ASSET_REJECTED')return failure(response,404,'NOT_FOUND','资源不存在');
    if(['GEO_PERMISSION_REQUIRED','GEO_IDENTITY_CHANGED','PLATFORM_LOGIN_REQUIRED'].includes(code))return failure(response,403,code,'请在 DSH 登录并核对 GEO 应用授权');
    if(code==='GEO_AUTH_UNAVAILABLE')return failure(response,503,code,'平台授权核验暂不可用，请恢复连接后重试');
    if(error instanceof SyntaxError)return failure(response,422,'VALIDATION_ERROR','请求格式无效');
    failure(response,503,'GEO_UNAVAILABLE','GEO 本地工作区暂不可用，请重新打开页面');
  }
 };
}
export function apply(ctx:Context){
 ctx.inject(['tools','futurestaffGeoAssistantSession'],assistantCtx=>{mountGeoAssistant(assistantCtx);});
 const bridge=new GeoAgentBridge({authorize:()=>authorizeGeo(ctx.platformDevLogin),authorizeBrowser:input=>ctx.platformDevLogin.authorizeGeoBrowser(input),
  profiles:authorize=>new ToutiaoAccountProfiles(path.join(os.homedir(),'.futurestaff','geo-publishing','accounts'),authorize),
  lookupAccount:async input=>{
   const grant=await ctx.platformDevLogin.issueApplicationToken('geo');
   const expected=input.origin==='https://geo.fsstory.net'?'futurestaff-geo-prod':'futurestaff-geo-dev';
   if(grant.audience!==expected||grant.tenantId!==input.owner.tenantId||grant.expiresIn!==60)throw Error('GEO_ACCOUNT_SCOPE_REJECTED');
   const response=await fetch(input.origin+'/api/geo/native/v1/account',{method:'POST',redirect:'error',signal:AbortSignal.any([input.owner.signal,AbortSignal.timeout(5000)]),headers:{authorization:'Bearer '+grant.accessToken,'content-type':'application/json'},body:JSON.stringify({projectId:input.projectId,accountId:input.accountId})});
   if(!response.ok)throw Error('GEO_ACCOUNT_SCOPE_REJECTED');
   return z.object({data:z.object({tenantId:z.uuid(),userId:z.uuid(),projectId:z.uuid(),account:z.object({id:z.uuid(),platform:z.literal('toutiao'),label:z.string().max(200)}).strict()}).strict()}).strict().parse(await response.json()).data;
  },
 });
 // User selected cloud-owned GEO data. Preserve legacy code/files, but do not
 // expose another writable local workspace through the active product plugin.
 ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:routePrefix+'/',handler:async(request,response)=>{
  if(request.url!==routePrefix+'/launch')return failure(response,409,'GEO_CLOUD_WORKSPACE_REQUIRED','请使用云端 GEO 工作台；旧本地数据已保留');
  if(!geoRequestAllowed(request,true)||request.method!=='POST')return failure(response,403,'LOCAL_REQUEST_REQUIRED','请从 Agent 打开 GEO');
  try{
   if(!String(request.headers['content-type']).startsWith('application/json'))throw Error();
   let size=0;const chunks:Buffer[]=[];for await(const raw of request){const bytes=Buffer.from(raw);size+=bytes.length;if(size>1024)throw Error();chunks.push(bytes)}
   z.object({}).strict().parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
   const result=await bridge.launch();response.setHeader('content-type','application/json');response.setHeader('cache-control','no-store');response.end(JSON.stringify({data:result}));
  }catch{return failure(response,503,'GEO_LAUNCH_UNAVAILABLE','GEO 登录交接暂不可用，请核对 Agent 和 Platform 版本及应用授权')}
 }}),'futurestaff-geo: cloud workspace boundary');
 ctx.effect(()=>()=>bridge.close(),'futurestaff-geo: local bridge lifecycle');
}
