import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { AgentWorkspaceStore, fetchAgentData, type AgentCard, type AgentCredentials, type AgentSnapshot } from './agents.js'
import type { WorkspaceIdentity } from './workspace.js'
import path from 'node:path'
import {lstat,realpath} from 'node:fs/promises'
import type {BusinessSystem} from './business-scope.js'
import { AgentInstallationStore, downloadAgentRelease, decodeRelease } from './agent-distribution.js'
import { mountAgentDistribution } from './agent-distribution-host.js'
import { systemScopeAllowed, requireSystemScope } from './system-assistant-access.js'
import type { LocalTemplatePrincipal } from './market-host.js'
import { mountAgentSnapshots } from './agent-snapshot-host.js'
import {mountPlatformAssistants} from './platform-assistants.js'

type AgentBinding = NonNullable<Awaited<ReturnType<AgentWorkspaceStore['binding']>>> & { snapshotVersion?: string }

/** Session cwd comes from the Host SessionStore, never the renderer. */
export async function resolveSessionAgent(store: AgentWorkspaceStore, sessionId: string, cwd: string | undefined) {
  if (!cwd || !path.isAbsolute(cwd)) return undefined
  if (path.basename(cwd) !== 'workspace') return undefined
  const agentId = path.basename(path.dirname(cwd))
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(agentId)) return undefined
  const expected=path.resolve(await store.workspacePath(agentId))
  if (path.resolve(cwd) !== expected) {
    // Windows can supply an ordinary 8.3 TEMP path for the same native workspace.
    // Canonicalize existing Host paths, but never accept a junction as an alias.
    const check=async(directory:string):Promise<void>=>{
      const parent=path.dirname(directory);if(parent!==directory)await check(parent)
      if((await lstat(directory)).isSymbolicLink())throw Error('AGENT_DIRECTORY_UNSAFE')
    }
    try{await check(cwd);if(path.resolve(await realpath(cwd))!==expected)return undefined}
    catch{return undefined}
  }
  await store.bind(sessionId, agentId)
  return store.binding(sessionId)
}

/** Renderer sees only public projections; credentials never leave the Host. */
export function mountAgents(ctx: Context, origin: string, identity: WorkspaceIdentity, root: string,
  authorize: () => Promise<AgentCredentials>, fetcher=globalThis.fetch,
  resolveLocalRole?: (sessionId: string, system: BusinessSystem | 'agent', tool?: string) => Promise<LocalTemplatePrincipal | undefined>) {
  const store=new AgentWorkspaceStore(root,identity)
  const installations=new AgentInstallationStore(root,identity)
  mountAgentDistribution(ctx,origin,installations,authorize,fetcher)
  mountPlatformAssistants(ctx,origin,installations,authorize,fetcher)
  const snapshotRuntime=(version:string)=>new AgentWorkspaceStore(root,identity,undefined,version)
  const freshSnapshotAuthority=async(previous:AgentCredentials,systems:BusinessSystem[]|undefined)=>{
    previous.signal.throwIfAborted();const fresh=await authorize();previous.signal.throwIfAborted();fresh.signal.throwIfAborted()
    if(fresh.tenantId!==identity.tenantId||fresh.userId!==identity.userId)throw Error('AGENT_IDENTITY_MISMATCH')
    await requireSystemScope(origin,fresh,systems,fetcher)
  }
  mountAgentSnapshots(ctx,origin,snapshotRuntime,identity,authorize,fetcher)
  const workspacePath=async(binding:{agentId:string;releaseVersion?:string|undefined;snapshotVersion?:string|undefined})=>{
    if(binding.releaseVersion&&binding.snapshotVersion)throw Error('AGENT_SESSION_MISMATCH')
    return (binding.releaseVersion?installations.runtime(binding.releaseVersion):binding.snapshotVersion?snapshotRuntime(binding.snapshotVersion):store).workspacePath(binding.agentId)
  }
  let queue:Promise<unknown>=Promise.resolve()
  const resolveBinding = (sessionId: string):Promise<AgentBinding|undefined> => {
    const operation = async ():Promise<AgentBinding|undefined> => {
      const sessions = ctx.get('sessions') as unknown as { get(id:string): {header:{cwd?:string}}|undefined } | undefined
      const cwd=sessions?.get(sessionId)?.header.cwd
      const old=await store.binding(sessionId)
      if(old?.releaseVersion){
        const runtime=installations.runtime(old.releaseVersion)
        if(!cwd||path.resolve(cwd)!==await runtime.workspacePath(old.agentId))throw Error('AGENT_SESSION_MISMATCH')
        return old
      }
      if(cwd){
        const relative=path.relative(path.join(root,'agents'),cwd).split(path.sep)
        if(relative.length===4&&relative[1]==='snapshots'&&relative[3]==='workspace'&&/^[a-f0-9]{64}$/.test(relative[2]??'')){
          const agentId=relative[0]!,version=relative[2]!,runtime=snapshotRuntime(version)
          // Only canonical Host-owned cwd may admit this namespace; no renderer path
          // or cached historical snapshot can choose another model/content version.
          if(path.resolve(cwd)!==await runtime.workspacePath(agentId))throw Error('AGENT_SESSION_MISMATCH')
          const snapshot=await runtime.snapshot(agentId)
          if(snapshot.agentId!==agentId||snapshot.version!==version)throw Error('AGENT_SESSION_MISMATCH')
          if(!old){
            const c=await authorize()
            if(c.tenantId!==identity.tenantId||c.userId!==identity.userId)throw Error('AGENT_IDENTITY_MISMATCH')
            const current=await fetchAgentData(origin,c,agentId,fetcher,'1.1.0') as AgentSnapshot
            await requireSystemScope(origin,c,current.businessSystems,fetcher)
            if(current.businessSystems?.length!==1||current.businessSystems[0]!=='shop'||current.version!==version||JSON.stringify(current)!==JSON.stringify(snapshot))throw Error('AGENT_MODEL_VERSION_CHANGED')
            await freshSnapshotAuthority(c,current.businessSystems)
          }
          await runtime.bind(sessionId,agentId)
          const binding=await store.binding(sessionId)
          if(!binding||binding.modelVersion!==version||binding.version!==snapshot.legacyVersion)throw Error('AGENT_SESSION_MISMATCH')
          return {...binding,snapshotVersion:version}
        }
        if(relative.length===4&&relative[1]==='releases'&&relative[3]==='workspace'&&/^[a-f0-9]{64}$/.test(relative[2]??'')){
          const agentId=relative[0]!,version=relative[2]!,runtime=installations.runtime(version)
          if(path.resolve(cwd)!==await runtime.workspacePath(agentId))throw Error('AGENT_SESSION_MISMATCH')
          await installations.read(agentId,version)
          await runtime.bind(sessionId,agentId);return store.binding(sessionId)
        }
      }
      return resolveSessionAgent(store, sessionId, cwd)
    }
    const pending = queue.then(operation, operation); queue = pending.catch(() => {})
    return pending
  }
  for(const [suffix,method] of [['catalog','GET'],['select','POST'],['bind','POST']] as const){
    ctx.effect(()=>ctx.webServer.register({kind:'exact',path:`/_futurestaff/agents/${suffix}`,handler:async(request,response)=>{
      const send=(status:number,body:unknown)=>{
        response.statusCode=status;response.setHeader('content-type','application/json; charset=utf-8')
        response.setHeader('cache-control','no-store');response.setHeader('x-content-type-options','nosniff');response.end(JSON.stringify(body))
      }
      if(request.method!==method||request.headers['x-futurestaff-agent']!=='1'
        ||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress??''))return send(403,{error:'LOCAL_REQUEST_REQUIRED'})
      try{
        const credentials=await authorize()
        if(credentials.tenantId!==identity.tenantId||credentials.userId!==identity.userId)throw new Error('AGENT_IDENTITY_MISMATCH')
        if(suffix==='catalog'){
          const cards=await fetchAgentData(origin,credentials,undefined,fetcher) as AgentCard[]
          const items=await Promise.all(cards.map(async card=>{
            try{
              const snapshot=await fetchAgentData(origin,credentials,card.agentId,fetcher) as AgentSnapshot
              if(!await systemScopeAllowed(origin,credentials,snapshot.businessSystems,fetcher))return undefined
              return {...card,path:await store.workspacePath(card.agentId)}
            }catch{credentials.signal.throwIfAborted();return undefined}
          }))
          return send(200,{items:items.filter(item=>item!==undefined),dataDirectory:root})
        }
        let raw='';for await(const chunk of request){raw+=chunk.toString();if(Buffer.byteLength(raw)>2048)throw new Error('AGENT_REQUEST_INVALID')}
        const body=JSON.parse(raw)
        if(suffix==='select'){
          if(Object.keys(body).join()!=='agentId'||typeof body.agentId!=='string')throw new Error('AGENT_REQUEST_INVALID')
          const snapshot=await fetchAgentData(origin,credentials,body.agentId,fetcher,'1.1.0') as AgentSnapshot
          await requireSystemScope(origin,credentials,snapshot.businessSystems,fetcher)
          const operation=()=>store.materialize(snapshot,credentials.signal)
          const pending=queue.then(operation,operation);queue=pending.catch(()=>{})
          const directory=await pending;credentials.signal.throwIfAborted()
          const registry=ctx.get('workspaceRegistry') as unknown as {create(path:string,title?:string):Promise<unknown>}|undefined
          if(!registry)throw new Error('AGENT_WORKSPACE_SERVICE_REQUIRED')
          await registry.create(path.join(directory,'workspace'),snapshot.name)
          credentials.signal.throwIfAborted()
          return send(200,{agentId:snapshot.agentId,name:snapshot.name,path:await store.workspacePath(snapshot.agentId),version:snapshot.version})
        }
        if(Object.keys(body).sort().join()!=='agentId,sessionId'||typeof body.agentId!=='string'||typeof body.sessionId!=='string')throw new Error('AGENT_REQUEST_INVALID')
        // Recheck current platform visibility before accepting a persistent binding.
        const snapshot=await fetchAgentData(origin,credentials,body.agentId,fetcher) as AgentSnapshot
        await requireSystemScope(origin,credentials,snapshot.businessSystems,fetcher)
        const binding = await resolveBinding(body.sessionId)
        if (!binding || binding.agentId !== body.agentId) throw new Error('AGENT_SESSION_MISMATCH')
        credentials.signal.throwIfAborted();return send(200,{ok:true})
      }catch{send(409,{error:'AGENT_UNAVAILABLE'})}
    }}),`futurestaff persistent agents ${suffix}`)
  }
  const resolvePolicyBinding=async(sessionId:string)=>{
    let binding=await resolveBinding(sessionId);if(!binding)return undefined
    const credentials=await authorize()
    if(credentials.tenantId!==identity.tenantId||credentials.userId!==identity.userId)throw Error('AGENT_IDENTITY_MISMATCH')
    const snapshot=binding.releaseVersion
      ? decodeRelease(await downloadAgentRelease(origin,credentials,binding.agentId,binding.releaseVersion,fetcher),binding.agentId,binding.releaseVersion).snapshot
      : await fetchAgentData(origin,credentials,binding.agentId,fetcher,'1.1.0') as AgentSnapshot
    await requireSystemScope(origin,credentials,snapshot.businessSystems,fetcher)
    // Existing business APIs keep the legacy content version; chat additionally pins model policy.
    if(snapshot.legacyVersion!==binding.version||!snapshot.modelPolicy)throw Error('AGENT_MODEL_VERSION_CHANGED')
    if(!binding.modelVersion)binding=await store.pinModelVersion(sessionId,binding.agentId,binding.version,snapshot.version)
    if(snapshot.version!==binding.modelVersion)throw Error('AGENT_MODEL_VERSION_CHANGED')
    if(binding.snapshotVersion){
      const installed=await snapshotRuntime(binding.snapshotVersion).snapshot(binding.agentId)
      if(snapshot.version!==binding.snapshotVersion||JSON.stringify(installed)!==JSON.stringify(snapshot))throw Error('AGENT_MODEL_VERSION_CHANGED')
      await freshSnapshotAuthority(credentials,snapshot.businessSystems)
    }
    return {agentId:binding.agentId,version:snapshot.version,modelPolicy:snapshot.modelPolicy,...(binding.releaseVersion?{releaseVersion:binding.releaseVersion}:{}),
      identity:{userId:identity.userId,tenantId:identity.tenantId},signal:credentials.signal,
      ...(snapshot.businessSystems?{businessSystems:snapshot.businessSystems}:{})}
  }
  const authorizeBusiness=async(sessionId:string,system:BusinessSystem|'agent',tool?:string)=>{
    const local = await resolveLocalRole?.(sessionId, system, tool)
    if (local) { local.signal.throwIfAborted(); return local }
    if (system === 'agent') throw Error('AGENT_BUSINESS_SCOPE_DENIED')
    const binding=await resolveBinding(sessionId)
    if(!binding)throw Error('AGENT_BUSINESS_SCOPE_DENIED')
    const credentials=await authorize()
    if(credentials.tenantId!==identity.tenantId||credentials.userId!==identity.userId)throw Error('AGENT_IDENTITY_MISMATCH')
    const snapshot=await fetchAgentData(origin,credentials,binding.agentId,fetcher) as AgentSnapshot
    await requireSystemScope(origin,credentials,snapshot.businessSystems,fetcher)
    if(binding.releaseVersion){
      const released=decodeRelease(await downloadAgentRelease(origin,credentials,binding.agentId,binding.releaseVersion,fetcher),binding.agentId,binding.releaseVersion).snapshot
      await requireSystemScope(origin,credentials,released.businessSystems,fetcher)
      if(released.legacyVersion!==binding.version||(released.businessSystems&&!released.businessSystems.includes(system)))throw Error('AGENT_BUSINESS_SCOPE_DENIED')
    }else if(snapshot.version!==binding.version)throw Error('AGENT_VERSION_CHANGED')
    if(binding.snapshotVersion){
      const current=await fetchAgentData(origin,credentials,binding.agentId,fetcher,'1.1.0') as AgentSnapshot
      await requireSystemScope(origin,credentials,current.businessSystems,fetcher)
      const installed=await snapshotRuntime(binding.snapshotVersion).snapshot(binding.agentId)
      if(current.legacyVersion!==binding.version||current.version!==binding.modelVersion||current.version!==binding.snapshotVersion||JSON.stringify(installed)!==JSON.stringify(current))throw Error('AGENT_MODEL_VERSION_CHANGED')
      if(!current.businessSystems?.includes(system))throw Error('AGENT_BUSINESS_SCOPE_DENIED')
      await freshSnapshotAuthority(credentials,current.businessSystems)
    }
    if(snapshot.businessSystems&&!snapshot.businessSystems.includes(system))throw Error('AGENT_BUSINESS_SCOPE_DENIED')
    return binding
  }
  const boundSnapshot=async(agentId:string,releaseVersion?:string,snapshotVersion?:string)=>{
    const c=await authorize()
    if(c.tenantId!==identity.tenantId||c.userId!==identity.userId)throw Error('AGENT_IDENTITY_MISMATCH')
    if(releaseVersion&&snapshotVersion)throw Error('AGENT_SESSION_MISMATCH')
    if(snapshotVersion){
      const current=await fetchAgentData(origin,c,agentId,fetcher,'1.1.0') as AgentSnapshot
      await requireSystemScope(origin,c,current.businessSystems,fetcher)
      const installed=await snapshotRuntime(snapshotVersion).snapshot(agentId)
      if(current.version!==snapshotVersion||JSON.stringify(installed)!==JSON.stringify(current))throw Error('AGENT_MODEL_VERSION_CHANGED')
      await freshSnapshotAuthority(c,current.businessSystems)
      return {...current,version:current.legacyVersion!}
    }
    if(!releaseVersion){const snapshot=await fetchAgentData(origin,c,agentId,fetcher) as AgentSnapshot;await requireSystemScope(origin,c,snapshot.businessSystems,fetcher);return snapshot}
    const snapshot=decodeRelease(await downloadAgentRelease(origin,c,agentId,releaseVersion,fetcher),agentId,releaseVersion).snapshot
    await requireSystemScope(origin,c,snapshot.businessSystems,fetcher)
    return {...snapshot,version:snapshot.legacyVersion!}
  }
  return {store,installations,boundSnapshot,resolveBinding,resolvePolicyBinding,authorizeBusiness,workspacePath}
}
