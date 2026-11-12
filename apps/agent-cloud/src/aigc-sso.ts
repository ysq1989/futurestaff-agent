import {ApiError,digest,uuid} from './storage.js'
import type {Auth,Gateway} from './platform.js'

export const aigcCallback='https://aigc.fsstory.net/oauth/callback/futurestaff'
export const aigcEntry='https://aigc.fsstory.net/create'
type Input={launchId:string;tenantId:string;memberId:string;state:string;codeChallenge:string}

function parse(value:Record<string,unknown>,auth:Auth):Input {
  const keys=['launchId','tenantId','memberId','state','codeChallenge']
  if(Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>typeof value[k]!=='string'))throw new ApiError(400,'AIGC_HANDOFF_INVALID','AIGC登录请求不完整。')
  const input={launchId:uuid(value.launchId),tenantId:uuid(value.tenantId),memberId:uuid(value.memberId),state:value.state as string,codeChallenge:value.codeChallenge as string}
  if(!/^[A-Za-z0-9_-]{43,128}$/.test(input.state)||!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge))throw new ApiError(400,'AIGC_HANDOFF_INVALID','AIGC登录校验无效，请从入口重新进入。')
  if(input.tenantId!==auth.tenantId||input.memberId!==auth.user.userId)throw new ApiError(409,'IDENTITY_CHANGED','账号或主体已变化，请重新进入AIGC。')
  return input
}

function callback(value:string,state:string):string {
  try {
    const url=new URL(value)
    if(url.origin+url.pathname!==aigcCallback||url.username||url.password||url.hash||[...url.searchParams.keys()].sort().join(',')!=='code,state'||url.searchParams.get('state')!==state||!/^[A-Za-z0-9_-]{20,256}$/.test(url.searchParams.get('code')??''))throw Error()
    return url.href
  }catch{throw new ApiError(502,'AIGC_HANDOFF_INVALID_RESPONSE','AIGC登录服务返回无效，请重新进入。')}
}

/** Only short-lived callback codes are retained; desktop credentials stay in AuthService. */
export class AigcHandoffs {
  private pending=new Map<string,{hash:string;expires:number;result:Promise<{callbackUrl:string}>}>()
  constructor(private gateway:Gateway){}
  authorize(auth:Auth,value:Record<string,unknown>):Promise<{callbackUrl:string}> {
    const input=parse(value,auth),now=Date.now(),key=auth.id+':'+input.launchId
    for(const[k,item]of this.pending)if(item.expires<=now)this.pending.delete(k)
    const hash=digest(JSON.stringify(input)),prior=this.pending.get(key)
    if(prior){if(prior.hash!==hash)throw new ApiError(409,'AIGC_HANDOFF_CHANGED','同一登录请求不能更改校验内容。');return prior.result}
    if(this.pending.size>=1000)throw new ApiError(429,'AIGC_HANDOFF_BUSY','登录请求较多，请稍后重新进入。')
    const result=(async()=>{
      if(!this.gateway.authorizeAigc)throw new ApiError(503,'AIGC_HANDOFF_UNAVAILABLE','AIGC免登录服务暂不可用。')
      const response=await this.gateway.authorizeAigc(auth,{state:input.state,codeChallenge:input.codeChallenge},AbortSignal.timeout(20000))
      return {callbackUrl:callback(response.redirectUrl,input.state)}
    })()
    // Failed/ambiguous admissions also stay bound to the original launch ID.
    this.pending.set(key,{hash,expires:now+60000,result})
    return result
  }
}
