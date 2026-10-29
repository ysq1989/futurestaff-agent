import type {PlatformAssistant} from '../platform-assistants.js'
import {diagnosticFetch,diagnosticJson} from './diagnostics-request.js'

async function request(signal:AbortSignal,templateId?:string):Promise<Record<string,unknown>>{
 const response=await diagnosticFetch('/_futurestaff/agents/'+(templateId?'platform-assistant-use':'platform-assistants'),{method:templateId?'POST':'GET',headers:{'x-futurestaff-agent':'1','content-type':'application/json'},cache:'no-store',signal,...templateId?{body:JSON.stringify({templateId})}:{}},{ignoreStatuses:[404]})
 if(!templateId&&response.status===404){await response.body?.cancel();return {items:[]}}
 const value=await diagnosticJson(response);signal.throwIfAborted()
 if(!response.ok||!value||typeof value!=='object'||Array.isArray(value))throw Error('平台助手暂不可用，请刷新目录后重试。')
 return value as Record<string,unknown>
}
export async function loadPlatformAssistants(signal:AbortSignal):Promise<PlatformAssistant[]>{
 const data=await request(signal)
 if(!Array.isArray(data.items)||data.items.length>50)throw Error('平台助手目录格式不兼容。')
 const seen=new Set<string>()
 return data.items.map(item=>{
  if(!item||typeof item.templateId!=='string'||!/^[a-f0-9-]{36}$/.test(item.templateId)||seen.has(item.templateId)
   ||typeof item.name!=='string'||typeof item.description!=='string'||!['available','preparing','ready','error'].includes(item.state)
   ||typeof item.installed!=='boolean'||typeof item.updateAvailable!=='boolean'||!(item.installedVersion===null||typeof item.installedVersion==='string'&&/^[a-f0-9]{64}$/.test(item.installedVersion))||!Array.isArray(item.requiredApplications)||!Array.isArray(item.skills))throw Error('平台助手目录格式不兼容。')
  seen.add(item.templateId);return item as PlatformAssistant
 })
}
async function pause(signal:AbortSignal){
 signal.throwIfAborted();let cancel:()=>void=()=>{}
 try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,1200);cancel=()=>{clearTimeout(timer);reject(signal.reason)};signal.addEventListener('abort',cancel,{once:true})})}
 finally{signal.removeEventListener('abort',cancel)}
 signal.throwIfAborted()
}
export async function usePlatformAssistant(templateId:string,signal:AbortSignal):Promise<void>{
 let result=await request(signal,templateId)
 for(let attempt=0;attempt<60;attempt++){
  if(result.state==='installed')return
  await pause(signal)
  const current=(await loadPlatformAssistants(signal)).find(item=>item.templateId===templateId)
  if(!current)throw Error('平台已调整此助手，请刷新目录。')
  if(current.state==='error')throw Error(current.unavailableReason||'助手准备未完成，请重试；已有工程保留。')
  if(current.state==='ready')result=await request(signal,templateId)
 }
 throw Error('助手仍在准备中，请稍后刷新；原请求和已有工程已保留。')
}
