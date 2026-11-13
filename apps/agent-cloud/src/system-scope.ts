import type {AgentSnapshot} from '@futurestaff/fs-platform-access/cloud'
import {ApiError} from './storage.js'

export const chatSystemIds=['agent','erp','web','administration','ecommerce-demo'] as const
export type ChatSystemId=typeof chatSystemIds[number]
export type SystemScope={kind:'system'}
export function chatSystem(value:unknown):ChatSystemId {
  if(typeof value!=='string'||!chatSystemIds.includes(value as ChatSystemId))throw new ApiError(400,'SYSTEM_REQUIRED','请选择当前业务系统。')
  return value as ChatSystemId
}
export function systemAllowed(snapshot:AgentSnapshot,system:ChatSystemId){
  const systems=snapshot.businessSystems
  return Array.isArray(systems)&&(system==='agent'?systems.length===0:systems.length===1&&systems[0]===system)
}
export function assertSystem(snapshot:AgentSnapshot,system:ChatSystemId){
  if(!systemAllowed(snapshot,system))throw new ApiError(403,'SYSTEM_NOT_AUTHORIZED','此助手没有当前系统的授权。')
}
export function systemScope(value:unknown):SystemScope {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).join()!=='kind'||(value as SystemScope).kind!=='system')throw new ApiError(400,'SCOPE_INVALID','业务工作范围无效。')
  return{kind:'system'}
}
/** Defensive filtering only: upstream chat rehydrates publications, so admission also requires a dedicated system snapshot. */
export function scopedFiles(snapshot:AgentSnapshot,system:ChatSystemId){
  return system==='agent'||snapshot.businessSystems?.length===1?snapshot.files:[]
}
export const systemNames:Record<ChatSystemId,string>={agent:'资料工作区',erp:'ERP',web:'Website',administration:'行政','ecommerce-demo':'电商经营分析（合成案例）'}
