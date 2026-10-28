import {talentApplicationIds,type TalentTemplate} from './talent-market-model.js'
import { diagnosticFetch, diagnosticJson } from './diagnostics-request.js'

export interface InstalledTalent extends TalentTemplate {presetId:string;path:string}
export interface OpenedTalent {presetId:string;templateId:string;version:string;name:string;path:string;sessionId:string}
export type OpenTalentSession=(sessionId:string)=>void|Promise<void>
export const installedTalentsChanged='futurestaff:installed-talents-changed'
export function notifyInstalledTalentsChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event(installedTalentsChanged))}

export async function requestTalent(route:'catalog'|'mine'|'install'|'open'|'uninstall',signal:AbortSignal,body?:unknown):Promise<Record<string,unknown>>{
  const response=await diagnosticFetch('/_futurestaff/agent-market/'+route,{method:body===undefined?'GET':'POST',headers:{'x-futurestaff-market':'1','content-type':'application/json'},cache:'no-store',signal,...(body===undefined?{}:{body:JSON.stringify(body)})})
  const data:unknown=await diagnosticJson(response)
  if(!response.ok)throw Error('本机人才操作未完成，请刷新目录后重试。')
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('本机人才目录格式不兼容。')
  signal.throwIfAborted()
  return data as Record<string,unknown>
}
export function decodeTalentCard(value:unknown):TalentTemplate{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('人才目录格式不兼容。')
  const row=value as Record<string,unknown>
  if(typeof row.templateId!=='string'||!/^[a-f0-9-]{36}$/i.test(row.templateId)||typeof row.version!=='string'||!/^[a-f0-9]{64}$/.test(row.version)
    ||['name','description','icon','category'].some(key=>typeof row[key]!=='string')||typeof row.compatible!=='boolean'
    ||!(row.unavailableReason===null||typeof row.unavailableReason==='string')||!Array.isArray(row.capabilityBullets)||row.capabilityBullets.some(value=>typeof value!=='string')
    ||!Array.isArray(row.requiredApplications)||new Set(row.requiredApplications).size!==row.requiredApplications.length||row.requiredApplications.some(id=>!talentApplicationIds.includes(id as typeof talentApplicationIds[number])))throw Error('人才目录格式不兼容。')
  if(row.tools!==undefined&&(!Array.isArray(row.tools)||row.tools.length>64||new Set(row.tools).size!==row.tools.length
    ||row.tools.some(tool=>typeof tool!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(tool))))throw Error('人才目录格式不兼容。')
  return{templateId:row.templateId,version:row.version,name:row.name as string,description:row.description as string,icon:row.icon as string,category:row.category as string,capabilityBullets:row.capabilityBullets as string[],compatible:row.compatible,unavailableReason:row.unavailableReason,requiredApplications:row.requiredApplications as string[],...(row.tools!==undefined?{tools:[...row.tools as string[]]}:{})}
}
export async function loadInstalledTalents(signal:AbortSignal):Promise<InstalledTalent[]>{
  const data=await requestTalent('mine',signal)
  if(!Array.isArray(data.items)||data.items.length>200)throw Error('本机人才目录格式不兼容。')
  const ids=new Set<string>(),templates=new Set<string>()
  return data.items.map((value:unknown)=>{
    const card=decodeTalentCard(value),row=value as Record<string,unknown>
    if(typeof row.presetId!=='string'||!row.presetId||typeof row.path!=='string'||!row.path||ids.has(row.presetId)||templates.has(card.templateId))throw Error('本机人才目录格式不兼容。')
    ids.add(row.presetId);templates.add(card.templateId)
    return{...card,presetId:row.presetId,path:row.path}
  })
}
export async function openInstalledTalent(presetId:string,signal:AbortSignal):Promise<OpenedTalent>{
  const data=await requestTalent('open',signal,{presetId})
  if(data.presetId!==presetId||['templateId','version','name','path','sessionId'].some(key=>typeof data[key]!=='string'||!data[key]))throw Error('本机会话响应不兼容。')
  return data as unknown as OpenedTalent
}
