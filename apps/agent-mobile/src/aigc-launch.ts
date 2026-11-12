export const aigcOrigin='https://aigc.fsstory.net'
const callbackPath='/oauth/callback/futurestaff'
export interface AigcIdentity {tenantId:string;memberId:string;epoch:number}
export interface AigcChild {closed:boolean;postMessage(data:unknown,origin:string):void}
interface Challenge {state:string;codeChallenge:string}
type Result={launchId:string;status:'authorized'|'error'|'cancelled';callbackUrl?:string;message?:string}
interface Options {
  identity():AigcIdentity|undefined
  native():boolean
  open(url:string,native:boolean):AigcChild|undefined
  sendNative(value:Result):void
  authorize(body:Challenge&{launchId:string;tenantId:string;memberId:string},signal:AbortSignal):Promise<{callbackUrl:string}>
  status(state:'waiting'|'authorizing'|'ready'|'error'|'idle',message:string):void
  now?():number
}
interface Launch {id:string;identity:AigcIdentity;native:boolean;child?:AigcChild|undefined;created:number;lastAuthorize:number;phase:'waiting'|'authorizing'|'ready'|'blocked';states:Set<string>;abort?:AbortController|undefined}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
function parseChallenge(value:unknown):Challenge|undefined {
  if(!record(value)||Object.keys(value).sort().join(',')!=='appId,clientId,codeChallenge,codeChallengeMethod,redirectUri,state,successPath')return
  if(value.appId!=='aigc'||value.clientId!=='futurestaff-aigc-prod'||value.redirectUri!==aigcOrigin+callbackPath||value.codeChallengeMethod!=='S256'||value.successPath!=='/create')return
  if(typeof value.state!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(value.state)||typeof value.codeChallenge!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.codeChallenge))return
  return {state:value.state,codeChallenge:value.codeChallenge}
}
function checkedCallback(raw:string,state:string):string {
  const url=new URL(raw)
  if(url.origin!==aigcOrigin||url.pathname!==callbackPath||url.username||url.password||url.hash||[...url.searchParams.keys()].sort().join(',')!=='code,state'||url.searchParams.get('state')!==state||!/^[A-Za-z0-9_-]{20,256}$/.test(url.searchParams.get('code')??''))throw Error('AIGC登录返回无效，请从入口重新进入。')
  return url.href
}

/** Keeps identity handoffs on their original window; no business context enters this channel. */
export class AigcLauncher {
  private active:Launch|undefined
  private now:()=>number
  private options:Options
  constructor(options:Options){this.options=options;this.now=options.now??Date.now}
  start():string|undefined {
    this.cancel()
    const identity=this.options.identity();if(!identity)return
    const launch:Launch={id:crypto.randomUUID(),identity:{...identity},native:this.options.native(),created:this.now(),lastAuthorize:0,phase:'waiting',states:new Set()}
    this.active=launch
    try {
      launch.child=this.options.open(aigcOrigin+'/auth/agent-entry#launchId='+launch.id,launch.native)
      if(!launch.native&&!launch.child)throw Error('浏览器未能打开AIGC，请允许打开工作台后重试。')
      this.options.status('waiting','正在连接AIGC…')
      return launch.id
    }catch(error){this.active=undefined;this.options.status('error',error instanceof Error?error.message:'AIGC暂时无法打开。')}
  }
  cancel(){
    const launch=this.active;this.active=undefined
    if(!launch)return
    launch.abort?.abort()
    this.deliver(launch,{launchId:launch.id,status:'cancelled',message:'账号或工作窗口已变化，请从Agent重新进入。'})
    this.options.status('idle','')
  }
  private current(launch:Launch){
    const identity=this.options.identity()
    return this.active===launch&&identity&&identity.memberId===launch.identity.memberId&&identity.tenantId===launch.identity.tenantId&&identity.epoch===launch.identity.epoch&&(launch.native||!!launch.child&&!launch.child.closed)
  }
  private deliver(launch:Launch,result:Result){
    try {
      if(launch.native)this.options.sendNative(result)
      else if(launch.child&&!launch.child.closed)launch.child.postMessage({type:result.status==='cancelled'?'fs:aigc-sso-cancel':'fs:aigc-sso-result',version:1,...result},aigcOrigin)
    }catch{/* Closing a window retires its channel; it never redirects the parent. */}
  }
  receiveBrowser(event:{origin:string;source:unknown;data:unknown}):Promise<boolean> {
    const launch=this.active
    if(!launch||launch.native||event.origin!==aigcOrigin||event.source!==launch.child||!record(event.data)||event.data.type!=='fs:aigc-sso-challenge'||event.data.version!==1)return Promise.resolve(false)
    return this.receive(launch,event.data)
  }
  receiveNative(data:unknown):Promise<boolean> {
    const launch=this.active
    if(!launch?.native||!record(data))return Promise.resolve(false)
    return this.receive(launch,data)
  }
  nativeClosed(launchId:string){if(this.active?.native&&this.active.id===launchId)this.cancel()}
  private async receive(launch:Launch,data:Record<string,unknown>):Promise<boolean> {
    const challenge=parseChallenge(data.challenge)
    if(data.launchId!==launch.id||!challenge||!this.current(launch)||launch.phase==='blocked'||launch.phase==='authorizing'||launch.states.has(challenge.state))return false
    const now=this.now()
    if(launch.phase==='waiting'&&now-launch.created>120000||launch.phase==='ready'&&now-launch.lastAuthorize<60000||launch.states.size>=64)return false
    launch.phase='authorizing';launch.lastAuthorize=now;launch.states.add(challenge.state)
    const abort=new AbortController();launch.abort=abort
    const timer=setTimeout(()=>abort.abort(),25000)
    this.options.status('authorizing','正在验证AIGC访问权限…')
    try {
      const result=await this.options.authorize({launchId:launch.id,tenantId:launch.identity.tenantId,memberId:launch.identity.memberId,...challenge},abort.signal)
      if(!this.current(launch)||abort.signal.aborted)return false
      const callbackUrl=checkedCallback(result.callbackUrl,challenge.state)
      launch.phase='ready';this.deliver(launch,{launchId:launch.id,status:'authorized',callbackUrl})
      this.options.status('ready','AIGC工作台已连接。')
      return true
    }catch(error){
      if(!this.current(launch)||abort.signal.aborted&&this.active!==launch)return false
      launch.phase='blocked'
      const message=abort.signal.aborted?'AIGC连接超时，请从入口重新进入。':error instanceof Error?error.message:'AIGC暂时无法连接，请重新进入。'
      this.deliver(launch,{launchId:launch.id,status:'error',message});this.options.status('error',message)
      return true
    }finally{clearTimeout(timer);if(launch.abort===abort)launch.abort=undefined}
  }
}
