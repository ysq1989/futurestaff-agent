import type {Context} from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@futurestaff/fs-platform-access';
import {defineToolMetadata} from '@futurestaff/fs-core';
import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {GeoAssistant,assistantInputs,type AssistantTool,type AssistantOwner} from './assistant.js';
import {DoubaoBrowser} from './doubao-browser.js';
import {authorizeGeo} from './authorization.js';
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const id={type:'string',description:'先前工具返回的真实UUID，不得猜测。'},project={projectId:id},job={...project,jobId:id};
type NativeExecution=Parameters<Parameters<Context['tools']['register']>[0]['execute']>[1];
export async function readAssistantResponse(response:Response,limit=2_000_000){
 const reader=response.body?.getReader();if(!reader)throw Error('GEO_API_UNAVAILABLE');const chunks:Uint8Array[]=[];let size=0;
 try{if(Number(response.headers.get('content-length')??0)>limit)throw Error('GEO_RESPONSE_LIMIT');for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('GEO_RESPONSE_LIMIT');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export const geoToolSchemas={
 geo_projects_list:object({}),geo_questions_list:object(project,['projectId']),geo_collection_list:object({...project,page:{type:'integer',description:'1至10之间的整数，每页100条，默认第1页；满页时继续下一页找历史基线。'}},['projectId']),geo_doubao_open:object({}),
 geo_collection_create:object({...project,promptId:id,requestId:{type:'string',description:'8至80位字母、数字、短横线或下划线；同一次采样重试保持相同编号。'},mode:{type:'string',enum:['豆包 快速']}},['projectId','promptId','requestId']),
 geo_collection_run:object(job,['projectId','jobId']),geo_collection_get:object(job,['projectId','jobId']),
 geo_effect_report:object({...project,jobIds:{type:'array',items:id},baselineJobIds:{type:'array',items:id}},['projectId','jobIds']),
};
const descriptions:Record<AssistantTool,string>={
 geo_projects_list:'GEO助手：读取当前主体真实推广计划，后续采集只能使用返回的计划编号。',
 geo_questions_list:'GEO助手：读取计划已有检测问题。保留问题原文，不自行改写或猜测编号；问题可在GEO工作台维护。',
 geo_collection_list:'GEO助手：读取当前计划的真实采集任务，执行等待中的任务或查看原任务，避免为同一次采样重复创建任务。',
 geo_doubao_open:'GEO助手：打开本机专用豆包浏览器，用户自行登录。返回READY仅表示当前可见模式已读取，真实采集需执行检测任务。',
 geo_collection_create:'GEO助手：冻结计划中的一个问题并创建豆包网页采集任务。成功仅代表排队，随后对原jobId执行run；不调用模型API冒充豆包产品。',
 geo_collection_run:'GEO助手：用本机专用豆包会话采集原题的真实回答、来源与截图并回传GEO。耗时数分钟；同jobId重试只恢复回传，结果未知不得新建任务重问。需登录时先open，用户完成后明确创建新采样。',
 geo_collection_get:'GEO助手：读取原采集任务、回答、来源、截图编号及实际指标。UNKNOWN/FAILED/NEEDS_LOGIN不能说已完成或未被提及。',
 geo_effect_report:'GEO助手：按真实网页证据计算提及和官网原生引用。baselineJobIds可做同条件前后对比，品牌题不纳入自然发现；搜索参考不计原生引用，未知不计零。',
};
export function mountGeoAssistant(ctx:Context){
 const host=new GeoAssistant({root:path.join(os.homedir(),'.futurestaff','geo-assistant'),executorId:createHash('sha256').update(os.hostname()).digest('hex').slice(0,32),
  authorize:async(sessionId,signal)=>{
   const binding=await ctx.futurestaffGeoAssistantSession.authorize(sessionId,signal),actor=await authorizeGeo(ctx.platformDevLogin);
   if(!actor.permissions.some(p=>['geo.operator','geo.admin'].includes(p)))throw Error('GEO_PERMISSION_REQUIRED');
   const origin=actor.namespace==='https://platform.fsstory.net'?'https://geo.fsstory.net':actor.namespace==='https://dev.fsstory.net'?'https://geo-dev.fsstory.net':null;
   if(!origin)throw Error('GEO_ENVIRONMENT_REJECTED');
   const key=JSON.stringify([actor.namespace,actor.tenantId,actor.userId,binding.agentId,binding.agentVersion]);return {key,origin,signal:actor.signal};
  },
  request:async(owner:AssistantOwner,method,url,body,signal)=>{
   const grant=await ctx.platformDevLogin.issueApplicationToken('geo');owner.signal.throwIfAborted();
   const actor=await authorizeGeo(ctx.platformDevLogin),binding=JSON.parse(owner.key) as string[];
   if(actor.namespace!==binding[0]||actor.tenantId!==binding[1]||actor.userId!==binding[2]||grant.tenantId!==actor.tenantId||grant.audience!==(owner.origin==='https://geo.fsstory.net'?'futurestaff-geo-prod':'futurestaff-geo-dev'))throw Error('GEO_IDENTITY_CHANGED');
   const response=await fetch(owner.origin+'/api/geo/native/v1/assistant'+url,{method,redirect:'error',signal:AbortSignal.any([owner.signal,...(signal?[signal]:[]),AbortSignal.timeout(15000)]),headers:{authorization:'Bearer '+grant.accessToken,...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
   if(!response.ok){const code=(await readAssistantResponse(response,64000).catch(()=>null))?.error?.code;throw Error(typeof code==='string'&&/^[A-Z_]{3,80}$/.test(code)?code:'GEO_API_UNAVAILABLE');}
   return (await readAssistantResponse(response)).data;
  },driver:(_owner,directory)=>new DoubaoBrowser(directory),
 });
 const deviceId=os.hostname(),metadata=defineToolMetadata({execution:'local',requiresApproval:true,tenantScoped:true,deviceId});
 ctx.on('tools/pre-execute',async(exec:{name:string},next)=>Object.hasOwn(assistantInputs,exec.name)?{kind:'ask' as const,reason:`GEO助手将在本机 ${deviceId} 执行已授权检测操作；采集会向豆包发送计划问题并回传证据。`}:next());
 for(const name of Object.keys(geoToolSchemas) as AssistantTool[]){
  ctx.effect(()=>ctx.tools.register({name,description:descriptions[name],parameters:geoToolSchemas[name],metadata,timeoutMs:600000,
   output:{schema:{type:'object',additionalProperties:true},render:(_args:unknown,value:unknown)=>[{type:'text',text:JSON.stringify(value)}]},
   execute:async(input:unknown,execution:NativeExecution)=>{if(!execution.agent)throw Error('GEO_SESSION_REQUIRED');return host.execute(name,input,execution.agent.id,execution.signal);},
  } as Parameters<typeof ctx.tools.register>[0]),'GEO assistant '+name);
 }
 ctx.effect(()=>()=>{void host.close();},'GEO assistant lifecycle');return host;
}
