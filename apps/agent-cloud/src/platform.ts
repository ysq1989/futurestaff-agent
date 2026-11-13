import {PlatformDevApi,fetchAgentData,AdministrationService,AdministrationError,type DesktopSession,type User,type AgentSnapshot,type AgentCard,type PlatformModel} from '@futurestaff/fs-platform-access/cloud'
import {ApiError,Storage,Serial,opaque,digest,bounded,uuid} from './storage.js'
import {administrationBinding,type AdministrationBinding} from '@futurestaff/fs-platform-access/cloud'

export interface Auth {id:string;csrf:string;user:User;tenantId:string;session:DesktopSession;expiresAt:number;validUntil:number}
export interface Gateway {
  readonly origin:string
  login(input:{loginIdentifier:string;password:string}):Promise<{session:DesktopSession;user:User}>
  refresh(token:string):Promise<{session:DesktopSession}>
  currentUser(token:string):Promise<{activeTenantId:string;user:User}>
  tenants(token:string):Promise<{items:readonly {tenantId:string;displayName:string}[]}>
  switchTenant(token:string,tenantId:string):Promise<{session:DesktopSession}>
  logout(token:string):Promise<void>
  agents(auth:Auth,signal:AbortSignal):Promise<AgentCard[]>
  snapshot(auth:Auth,id:string,signal:AbortSignal):Promise<AgentSnapshot>
  models(auth:Auth):Promise<readonly PlatformModel[]>
  authorizeSystem(auth:Auth,systemId:'erp'|'web'|'administration'|'ecommerce-demo',signal:AbortSignal):Promise<void|AdministrationBinding>
  authorizeAigc?(auth:Auth,input:{state:string;codeChallenge:string},signal:AbortSignal):Promise<{redirectUrl:string}>
}
export class PlatformGateway implements Gateway {
  private api:PlatformDevApi
  constructor(readonly origin:string,private fetcher:typeof fetch=fetch){this.api=new PlatformDevApi(fetcher,origin)}
  login(input:{loginIdentifier:string;password:string}):ReturnType<Gateway['login']>{return this.api.loginWithPassword(input,AbortSignal.timeout(20000))}
  refresh(token:string):ReturnType<Gateway['refresh']>{return this.api.refresh(token,AbortSignal.timeout(15000))}
  currentUser(token:string){return this.api.currentUser(token,AbortSignal.timeout(15000))}
  tenants(token:string):ReturnType<Gateway['tenants']>{return this.api.listTenants(token,AbortSignal.timeout(15000))}
  switchTenant(token:string,tenantId:string):ReturnType<Gateway['switchTenant']>{return this.api.switchTenant(token,tenantId,AbortSignal.timeout(15000))}
  logout(token:string){return this.api.logout(token,AbortSignal.timeout(10000))}
  agents(auth:Auth,signal:AbortSignal){return fetchAgentData(this.origin,this.credentials(auth,signal),undefined,this.fetcher) as Promise<AgentCard[]>}
  snapshot(auth:Auth,id:string,signal:AbortSignal){return fetchAgentData(this.origin,this.credentials(auth,signal),id,this.fetcher,'1.1.0') as Promise<AgentSnapshot>}
  async models(auth:Auth){return(await this.api.listModels(auth.session.accessToken,auth.tenantId,AbortSignal.timeout(15000))).items}
  async authorizeSystem(auth:Auth,systemId:'erp'|'web'|'administration'|'ecommerce-demo',signal:AbortSignal){
    if(systemId==='ecommerce-demo'){
      const response=await this.fetcher(this.origin+'/desktop/v1/semantics/context',{headers:{Authorization:'Bearer '+auth.session.accessToken},signal,credentials:'omit',redirect:'error',cache:'no-store'})
      if(!response.ok)throw new ApiError(response.status,'SEMANTIC_APPLICATION_DENIED','当前成员没有电商案例权限。')
      const value=await response.json() as {contract_version?:string;tenant_id?:string;actor_id?:string;channels?:unknown[]}
      if(value.contract_version!=='1.0.0'||value.tenant_id!==auth.tenantId||value.actor_id!==auth.user.userId||!Array.isArray(value.channels)||!value.channels.length||value.channels.length>4)throw new ApiError(403,'SEMANTIC_IDENTITY_CHANGED','电商案例权限无法确认。')
      return
    }
    if(systemId==='administration'){
      // The old applications directory does not grant administrative employee access.
      // Context is an online, owner-validated read under the current desktop session.
      const administration=new AdministrationService(this.origin,async()=>this.credentials(auth,signal),this.fetcher)
      try{const context=await administration.call('administration.leave.context.v1',{},signal);return administrationBinding(context,{tenantId:auth.tenantId,userId:auth.user.userId})}
      catch(error){if(error instanceof AdministrationError)throw new ApiError(error.status,error.code,error.status===401?'登录已失效，请重新登录。':error.status===403?'当前成员没有行政系统权限。':'行政服务暂时不可用，请稍后重试。');throw error}
    }
    const apps=await this.api.listApplications(auth.session.accessToken,auth.tenantId,signal)
    if(!apps.items.some(app=>app.appId===systemId))throw new ApiError(403,'SYSTEM_NOT_AUTHORIZED','当前成员没有此业务系统的授权。')
  }
  authorizeAigc(auth:Auth,input:{state:string;codeChallenge:string},signal:AbortSignal){
    if(this.origin!=='https://platform.fsstory.net')throw new ApiError(403,'AIGC_ENVIRONMENT_DENIED','AIGC入口环境不匹配。')
    return this.api.authorizeModuleBrowser(auth.session.accessToken,'aigc',{clientId:'futurestaff-aigc-prod',redirectUri:'https://aigc.fsstory.net/oauth/callback/futurestaff',...input},signal)
  }
  credentials(auth:Auth,signal:AbortSignal){return{accessToken:auth.session.accessToken,userId:auth.user.userId,tenantId:auth.tenantId,signal}}
}
export class AuthService {
  readonly locks=new Serial()
  private revoked=new Set<string>()
  constructor(readonly store:Storage,readonly gateway:Gateway){}
  owner(auth:Auth){return digest(JSON.stringify([this.gateway.origin,auth.tenantId,auth.user.userId]))}
  async login(input:Record<string,unknown>){
    const result=await this.gateway.login({loginIdentifier:bounded(input.loginIdentifier,254).trim(),password:bounded(input.password,1024)})
    // Profile is authoritative for the member identity, including tenant-specific IDs.
    const profile=await this.gateway.currentUser(result.session.accessToken)
    if(profile.activeTenantId!==result.session.activeTenantId)throw new ApiError(403,'IDENTITY_MISMATCH','平台主体不一致。')
    const auth:Auth={id:opaque(),csrf:opaque(),user:profile.user,tenantId:profile.activeTenantId,session:result.session,expiresAt:Date.now()+result.session.expiresIn*1000,validUntil:Date.now()+7*86400000}
    await this.save(auth);return auth
  }
  async save(auth:Auth){if(this.revoked.has(auth.id))throw new ApiError(401,'LOGIN_REQUIRED','登录已退出。');await this.store.write('auth',digest(auth.id),auth,true)}
  async load(id:string|undefined):Promise<Auth>{
    if(!id||!/^[\w-]{43}$/.test(id)||this.revoked.has(id))throw new ApiError(401,'LOGIN_REQUIRED','请登录 FutureStaff。')
    const auth=await this.store.read<Auth>('auth',digest(id),true)
    if(!auth||auth.validUntil<Date.now())throw new ApiError(401,'LOGIN_REQUIRED','登录已过期，请重新登录。')
    if(this.revoked.has(id))throw new ApiError(401,'LOGIN_REQUIRED','登录已退出。');return auth
  }
  async fresh(id:string,checkProfile=true):Promise<Auth>{return this.locks.run(id,async()=>{
    const auth=await this.load(id)
    if(auth.expiresAt<Date.now()+60000){
      const r=await this.gateway.refresh(auth.session.refreshToken)
      if(r.session.activeTenantId!==auth.tenantId)throw new ApiError(401,'IDENTITY_CHANGED','主体已变化，请重新登录。')
      auth.session=r.session;auth.expiresAt=Date.now()+r.session.expiresIn*1000;await this.save(auth)
    }
    if(checkProfile){const p=await this.gateway.currentUser(auth.session.accessToken);if(p.activeTenantId!==auth.tenantId||p.user.userId!==auth.user.userId)throw new ApiError(401,'IDENTITY_CHANGED','成员身份已变化，请重新登录。');auth.user=p.user}
    if(this.revoked.has(id))throw new ApiError(401,'LOGIN_REQUIRED','登录已退出。');return auth
  })}
  async view(auth:Auth){return{authenticated:true,user:auth.user,tenantId:auth.tenantId,csrf:auth.csrf,tenants:(await this.gateway.tenants(auth.session.accessToken)).items}}
  async switch(auth:Auth,tenantId:unknown){return this.locks.run(auth.id,async()=>{
    const current=await this.load(auth.id),r=await this.gateway.switchTenant(current.session.accessToken,uuid(tenantId))
    const p=await this.gateway.currentUser(r.session.accessToken)
    if(p.activeTenantId!==r.session.activeTenantId)throw new ApiError(403,'IDENTITY_MISMATCH','平台主体不一致。')
    current.session=r.session;current.user=p.user;current.tenantId=p.activeTenantId;current.expiresAt=Date.now()+r.session.expiresIn*1000;current.csrf=opaque();await this.save(current);return current
  })}
  async logout(auth:Auth){this.revoked.add(auth.id);return this.locks.run(auth.id,async()=>{const latest=await this.store.read<Auth>('auth',digest(auth.id),true);await this.store.remove('auth',digest(auth.id));await this.gateway.logout((latest??auth).session.refreshToken).catch(()=>{})})}
}
