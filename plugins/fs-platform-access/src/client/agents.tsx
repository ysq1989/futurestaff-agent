import { createElement, useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react'
import type { PlatformAccessSnapshot } from '../controller.js'
import {installedTalentsChanged,loadInstalledTalents,openInstalledTalent,requestTalent,decodeTalentCard,type InstalledTalent,type OpenTalentSession} from './installed-talents.js'
import {talentTemplateDisplay,talentApplicationAccess,talentApplicationKey,type TalentClassificationSource,type TalentAccessSnapshot} from './talent-market-model.js'
import {createAgentCenter} from './agent-center.js'
import type {PublishedTalent} from './published-talents.js'
import {loadCurrentSnapshotTalents,openCurrentSnapshot,type CurrentSnapshotTalent} from './current-snapshot-talents.js'

interface InstalledChoice extends TalentClassificationSource {key:string;name:string;description:string;available:boolean;unavailableReason:string|null;path:string}
export type DesktopAgentCard=InstalledChoice&({kind:'template';selectionRoute:'open-template';talent:InstalledTalent}|{kind:'published';agentId:string;selectionRoute:'open-installed';installedVersion:string;versions:string[];updateAvailable:boolean}|{kind:'snapshot';agentId:string;version:string;selectionRoute:'open-snapshot'})
interface SessionList { current?:string;ids:readonly string[];byId:Record<string,{title?:string;cwd?:string;blank?:boolean}> }
interface Workspace {workspaceId:string;path:string;title?:string;sessionIds:readonly string[]}
interface BrowserProps {
  useSessions<T>(select:(state:SessionList)=>T):T
  useWorkspaces<T>(select:(state:{items:readonly Workspace[];archivedSessionIds:readonly string[]})=>T):T
  createWorkspace(input:{path:string}):Promise<Workspace>
  startSession(workspaceId?:string):void
  open(id:string):void
  archiveSession(id:string):Promise<void>
  wide:boolean
}
interface PickerProps {open:boolean;onClose():void;onPick(id:string):void;createWorkspace(input:{path:string}):Promise<Workspace>}
interface Controller {subscribe(listener:()=>void):()=>void;getSnapshot():PlatformAccessSnapshot}
export function createAgentNavigation(){
  let selecting=false;const listeners=new Set<()=>void>()
  const update=(value:boolean)=>{if(selecting===value)return;selecting=value;for(const listener of listeners)listener()}
  return {subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)},getSnapshot:()=>selecting,begin:()=>update(true),finish:()=>update(false)}
}
async function request(route:string,body?:unknown,signal?:AbortSignal){
  const response=await fetch(`/_futurestaff/agents/${route}`,{
    method:body===undefined?'GET':'POST',headers:{'x-futurestaff-agent':'1','content-type':'application/json'},cache:'no-store',
    ...(body===undefined?{}:{body:JSON.stringify(body)}),...(signal?{signal}:{}),
  })
  if(!response.ok)throw new Error('无法读取智能体，请检查平台连接、使用权限或配置是否已更新。')
  return response.json()
}
/** Only enabled local installations belong in new-session choices. */
export async function loadDesktopAgentCatalog(signal?:AbortSignal,identity:TalentAccessSnapshot={}):Promise<{items:DesktopAgentCard[];dataDirectory:string}>{
  const operation=signal??new AbortController().signal
  const[local,published,snapshots]=await Promise.all([loadLocalChoices(operation),loadPublishedChoices(operation),loadSnapshotChoices(operation,identity)])
  signal?.throwIfAborted()
  return{items:[...local,...published.items,...snapshots.filter(card=>!published.items.some(item=>item.kind==='published'&&item.agentId===card.agentId))].filter(card=>talentApplicationAccess(card.kind==='template'?card.talent:card,identity)),dataDirectory:published.dataDirectory}
}
async function loadSnapshotChoices(signal:AbortSignal,identity:TalentAccessSnapshot):Promise<(DesktopAgentCard&{kind:'snapshot'})[]>{
  if(!talentApplicationAccess({requiredApplications:['shop']},identity))return[]
  return(await loadCurrentSnapshotTalents(signal)).filter(card=>card.installed).map(card=>({...card,kind:'snapshot',key:'snapshot:'+card.agentId,selectionRoute:'open-snapshot',path:''}))
}
async function loadLocalChoices(signal:AbortSignal):Promise<DesktopAgentCard[]>{
  const[talents,catalog]=await Promise.all([loadInstalledTalents(signal),requestTalent('catalog',signal)])
  if(!Array.isArray(catalog.items)||catalog.items.length>200)throw Error('人才目录格式不兼容。')
  const current=new Map(catalog.items.map(value=>{const card=decodeTalentCard(value);return[card.templateId,card]}))
  return localChoices(talents.flatMap(talent=>{const card=current.get(talent.templateId);return card?[{...talent,requiredApplications:card.requiredApplications,
    compatible:talent.compatible&&card.compatible,unavailableReason:card.compatible?talent.unavailableReason:card.unavailableReason}]:[]}))
}
function localChoices(talents:InstalledTalent[]):DesktopAgentCard[]{
  return talents.map(talent=>({kind:'template',key:talent.presetId,talent,selectionRoute:'open-template',path:talent.path,name:talentTemplateDisplay(talent).name,
    description:(talent.tools?.length??0)>0&&talent.requiredApplications.length>0
      ?'使用已适配的本机工具处理系统业务；能力以当前成员授权和人工确认为准。'
      :talentTemplateDisplay(talent).description,
    available:talent.compatible,unavailableReason:talent.unavailableReason}))
}
async function loadPublishedChoices(signal:AbortSignal):Promise<{items:DesktopAgentCard[];dataDirectory:string}>{
  const distribution=await request('distribution',undefined,signal).catch(()=>undefined)
  signal.throwIfAborted()
  const installed=Array.isArray(distribution?.items)?distribution.items.filter((row:{installedVersion?:string|null})=>!!row.installedVersion):[]
  if(!installed.length)return{items:[],dataDirectory:''}
  const catalog=await request('catalog',undefined,signal).catch(()=>undefined)
  signal.throwIfAborted()
  return{items:installed.flatMap((publication:{agentId:string;name:string;description?:string;available:boolean;unavailableReason?:string|null;installedVersion:string;versions?:string[];updateAvailable?:boolean}&TalentClassificationSource)=>{
    const agent=Array.isArray(catalog?.items)?catalog.items.find((row:{agentId:string})=>row.agentId===publication.agentId):undefined
    if(!agent)return[]
    return[{kind:'published' as const,key:publication.agentId,agentId:publication.agentId,name:agent.name??publication.name,description:agent.description??publication.description??'',path:agent.path??'',selectionRoute:'open-installed' as const,installedVersion:publication.installedVersion,versions:publication.versions??[],updateAvailable:publication.updateAvailable===true,available:!!agent.available&&publication.available,unavailableReason:!agent.available?agent.unavailableReason:publication.available?null:publication.unavailableReason||'已发布版本暂不可用。',
      ...(publication.category===undefined?{}:{category:publication.category}),...(publication.businessSystems===undefined?{}:{businessSystems:publication.businessSystems}),
      ...(publication.requiredApplications===undefined?{}:{requiredApplications:publication.requiredApplications}),...(publication.classificationKnown===undefined?{}:{classificationKnown:publication.classificationKnown})}]
  }),dataDirectory:typeof catalog?.dataDirectory==='string'?catalog.dataDirectory:''}
}
const css=`
.fs-agents{display:flex;flex-direction:column;gap:8px;min-height:0;color:var(--text-primary);font-size:13px}.fs-agents h3{font-size:13px;margin:8px 0}.fs-agents button{font:inherit;color:inherit;background:transparent;border:1px solid var(--border-default);border-radius:8px;padding:9px;text-align:left;cursor:pointer}.fs-agents button:hover{background:var(--bg-hover)}.fs-agents button:focus-visible{outline:2px solid var(--accent-primary)}.fs-agents button:disabled{cursor:default;opacity:.65}.fs-agent-choice{display:flex;flex-direction:column;gap:4px;width:100%}.fs-agent-choice[aria-current=true]{border-color:var(--accent-primary);background:var(--bg-active)}.fs-agents small,.fs-agents p{color:var(--text-secondary);margin:0;line-height:1.5}.fs-agent-list{display:flex;flex-direction:column;gap:6px;overflow:auto}.fs-agent-session[aria-current=page]{color:var(--accent-primary);background:var(--bg-active)}.fs-agents-dialog{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;background:color-mix(in srgb,var(--bg-primary) 75%,transparent);padding:24px}.fs-agents-dialog>.fs-agents{width:min(480px,100%);max-height:80vh;padding:20px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:12px}.fs-agents-header{display:flex;align-items:center;justify-content:space-between;gap:8px}.fs-agent-legacy{margin-top:12px}.fs-agents-error{color:var(--error)!important}.fs-agents-data{overflow-wrap:anywhere;font-size:11px}
.fs-agents .fs-agent-choice{height:auto;min-height:68px;flex-shrink:0;overflow:hidden;align-items:stretch}.fs-agent-choice small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-height:3em;overflow:hidden;overflow-wrap:anywhere}.fs-agent-choice strong{overflow-wrap:anywhere}
.fs-agent-browser{flex:1;overflow:hidden}.fs-agent-browser h3{flex-shrink:0}.fs-agent-search{flex-shrink:0;box-sizing:border-box;width:100%;font:inherit;color:var(--text-primary);background:var(--bg-primary);border:1px solid var(--border-default);border-radius:6px;padding:8px}.fs-agent-browser>.fs-agent-list{flex:1;min-height:0}.fs-agent-session{display:flex;flex-direction:column;gap:3px;flex-shrink:0;min-width:0;width:100%}.fs-agent-session span,.fs-agent-session small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-agents-dialog>.fs-agents{height:auto}
.fs-agent-browser{gap:12px}.fs-agent-browser h3{margin:0;padding:0 8px;font-size:11px;font-weight:500;color:var(--text-secondary)}
.fs-agent-search-wrap{display:flex;align-items:center;gap:8px;flex-shrink:0;box-sizing:border-box;height:36px;margin:2px;padding:0 10px;border:1px solid var(--border-default);border-radius:8px;background:var(--bg-primary);transition:border-color .15s,box-shadow .15s}.fs-agent-search-wrap>svg{flex:none;color:var(--text-secondary);pointer-events:none}.fs-agent-search-wrap:focus-within{border-color:var(--accent-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-primary) 14%,transparent)}.fs-agent-browser .fs-agent-search-wrap .fs-agent-search{flex:1;min-width:0;width:100%;height:100%;padding:0;border:0;border-radius:0;outline:none;box-shadow:none;background:transparent;font-size:12px;appearance:none}.fs-agent-browser .fs-agent-search-wrap .fs-agent-search:focus{outline:0!important;box-shadow:none!important}.fs-agent-search::placeholder{color:var(--text-secondary)}
.fs-agent-browser>.fs-agent-list{gap:2px;scrollbar-width:thin;scrollbar-color:var(--border-default) transparent;padding:2px}.fs-agent-session-row{position:relative;display:flex;align-items:center;flex-shrink:0;min-width:0;border-radius:7px}.fs-agent-session-row:hover,.fs-agent-session-row:focus-within{background:var(--bg-hover)}.fs-agent-session-row:has([aria-current=page]){background:var(--bg-active)}.fs-agent-session-row:has([aria-current=page]):before{content:'';position:absolute;left:0;top:12px;bottom:12px;width:2px;border-radius:2px;background:var(--accent-primary)}
.fs-agent-browser .fs-agent-session{flex:1;width:100%;border:0;background:transparent;padding:9px 36px 9px 12px;gap:4px;min-height:54px;box-sizing:border-box}.fs-agent-browser .fs-agent-session:hover,.fs-agent-browser .fs-agent-session[aria-current=page]{background:transparent}.fs-agent-session span{font-size:13px;line-height:18px}.fs-agent-session small{font-size:11px;line-height:15px}.fs-agent-session[aria-current=page] span{font-weight:600}
.fs-agent-session-row .fs-agent-archive{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:28px;height:28px;min-height:28px;padding:0;border:0;border-radius:5px;color:var(--text-secondary);opacity:0;transition:opacity 120ms}.fs-agent-session-row:hover .fs-agent-archive,.fs-agent-session-row:focus-within .fs-agent-archive,.fs-agent-archive:disabled{opacity:1}.fs-agent-archive svg{width:15px;height:15px}.fs-agent-empty{padding:20px 10px;text-align:center}
@media(hover:none){.fs-agent-session-row .fs-agent-archive{opacity:1}}@media(prefers-reduced-motion:reduce){.fs-agent-session-row .fs-agent-archive{transition:none}}
`
function useCatalog(controller:Controller){
  const identity=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot)
  const owner=['ready','no_apps'].includes(identity.phase)?`${identity.activeTenantId}:${identity.user?.userId}`:''
  const applicationKey=talentApplicationKey(identity)
  const [catalog,setCatalog]=useState<{owner:string;items:DesktopAgentCard[];directory:string}>({owner:'',items:[],directory:''})
  const [error,setError]=useState('');const [revision,refresh]=useState(0)
  useEffect(()=>{const update=()=>refresh(value=>value+1);window.addEventListener(installedTalentsChanged,update);return()=>window.removeEventListener(installedTalentsChanged,update)},[])
  useEffect(()=>{
    const abort=new AbortController();setError('')
    if(!owner){setCatalog({owner:'',items:[],directory:''});return()=>abort.abort()}
    let local:DesktopAgentCard[]=[],published:DesktopAgentCard[]=[],snapshots:(DesktopAgentCard&{kind:'snapshot'})[]=[],directory=''
    const publish=()=>{if(!abort.signal.aborted)setCatalog({owner,items:[...local,...published,...snapshots.filter(card=>!published.some(item=>item.kind==='published'&&item.agentId===card.agentId))],directory})}
    // Local template choices must not wait for the independent published-Agent directory.
    void loadLocalChoices(abort.signal).then(items=>{local=items;publish()}).catch(reason=>{if(!abort.signal.aborted)setError(reason.message)})
    void loadPublishedChoices(abort.signal).then(body=>{published=body.items;directory=body.dataDirectory;publish()}).catch(reason=>{if(!abort.signal.aborted)setError(reason.message)})
    void loadSnapshotChoices(abort.signal,identity).then(items=>{snapshots=items;publish()}).catch(reason=>{if(!abort.signal.aborted)setError(reason.message)})
    return()=>abort.abort()
  },[owner,applicationKey,revision])
  return {items:catalog.owner===owner?catalog.items.filter(card=>talentApplicationAccess(card.kind==='template'?card.talent:card,identity)):[],directory:catalog.owner===owner?catalog.directory:'',error,refresh:()=>refresh(value=>value+1),owner:catalogOperationOwner(identity)}
}
function catalogOperationOwner(identity:PlatformAccessSnapshot){return ['ready','no_apps'].includes(identity.phase)?`${identity.activeTenantId}:${identity.user?.userId}\n${talentApplicationKey(identity)}`:''}
function currentChoice(controller:Controller,owner:string,agent:DesktopAgentCard){const identity=controller.getSnapshot();return catalogOperationOwner(identity)===owner&&talentApplicationAccess(agent.kind==='template'?agent.talent:agent,identity)}
function Choices({items,current,busy,choose}:{items:DesktopAgentCard[];current?:string|undefined;busy:boolean;choose:(agent:DesktopAgentCard)=>void}){
  return <div className="fs-agent-list">{items.map(agent=><button type="button" className="fs-agent-choice" key={agent.key} disabled={busy||!agent.available} aria-current={current===agent.key} onClick={()=>choose(agent)}>
    <strong>{agent.name}</strong><small>{agent.available?agent.description:agent.unavailableReason}</small>
  </button>)}</div>
}
function useOperationSignal(owner:string, enabled=true){
  const operation=useRef(new AbortController())
  useEffect(()=>{
    operation.current=new AbortController()
    if(!owner||!enabled)operation.current.abort()
    return()=>operation.current.abort()
  },[owner,enabled])
  return operation
}
export function createAgentBrowser(controller:Controller,_Legacy:ComponentType<BrowserProps>,navigation?:ReturnType<typeof createAgentNavigation>){
  return function AgentBrowser(props:BrowserProps){
    const identity=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot)
    const sessions=props.useSessions(value=>value)
    const workspaces=props.useWorkspaces(value=>value)
    const [query,setQuery]=useState('')
    const [archiving,setArchiving]=useState<string|null>(null)
    const [archiveError,setArchiveError]=useState('')
    const owner=['ready','no_apps'].includes(identity.phase)?`${identity.activeTenantId}:${identity.user?.userId}`:''
    const operation=useOperationSignal(owner)
    useEffect(()=>{setArchiving(null);setArchiveError('')},[owner])
    const archive=async(id:string)=>{
      if(archiving||!owner)return
      const signal=operation.current.signal
      setArchiving(id);setArchiveError('')
      try{await props.archiveSession(id)}catch{if(!signal.aborted)setArchiveError('归档失败，请稍后重试。')}
      finally{if(!signal.aborted)setArchiving(null)}
    }
    useEffect(()=>setQuery(''),[identity.activeTenantId,identity.user?.userId])
    const visible=sessions.ids.filter(id=>!workspaces.archivedSessionIds.includes(id)&&sessions.byId[id]
      &&(!sessions.byId[id]?.blank||id===sessions.current))
    const rows=visible.map(id=>({id,title:sessions.byId[id]?.title||'新会话',workspace:workspaces.items.find(w=>w.sessionIds.includes(id))}))
      .filter(row=>`${row.title} ${row.workspace?.title??''}`.toLowerCase().includes(query.toLowerCase()))
    return <div className="fs-agents fs-agent-browser"><style>{css}</style><h3>最近会话</h3>
      <div className="fs-agent-search-wrap"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input className="fs-agent-search" type="search" aria-label="搜索会话" placeholder="搜索会话" value={query} onChange={event=>setQuery(event.target.value)}/></div>
      {archiveError&&<p className="fs-agents-error" role="alert">{archiveError}</p>}
      {['ready','no_apps'].includes(identity.phase)?<div className="fs-agent-list">{rows.map(row=><div className="fs-agent-session-row" key={row.id}><button type="button" className="fs-agent-session" title={row.title} aria-current={sessions.current===row.id?'page':undefined} onClick={()=>{navigation?.finish();props.open(row.id)}}>
        <span>{row.title}</span><small>{row.workspace?.title||'历史会话'}</small>
      </button><button type="button" className="fs-agent-archive" aria-label={`归档会话：${row.title}`} aria-busy={archiving===row.id} title="归档会话，保留记录" disabled={archiving!==null} onClick={()=>{void archive(row.id)}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v4H4z M6 8v12h12V8 M10 12h4"/></svg></button></div>)}{!rows.length&&<small className="fs-agent-empty">{query?'没有匹配的会话':'暂无会话，点击新会话开始。'}</small>}</div>:<small>登录后查看会话。</small>}
    </div>
  }
}
export function createAgentHome(controller:Controller,openCenter?:()=>void,openSession?:OpenTalentSession){
  const Center=createAgentCenter(controller,()=>openCenter?.(),openSession)
  return function AgentHome(props:{createWorkspace(input:{path:string}):Promise<Workspace>;onPick(id:string):void|Promise<void>}){
    const startSnapshot=async(agent:CurrentSnapshotTalent,signal:AbortSignal)=>{
      const owner=catalogOperationOwner(controller.getSnapshot())
      const current=()=>!!owner&&catalogOperationOwner(controller.getSnapshot())===owner&&talentApplicationAccess(agent,controller.getSnapshot())
      signal.throwIfAborted();if(!current()||!agent.available||!agent.installed)return
      const selected=await openCurrentSnapshot(agent,signal);signal.throwIfAborted();if(!current())return
      const workspace=await props.createWorkspace({path:selected.path});signal.throwIfAborted()
      if(current())await props.onPick(workspace.workspaceId)
    }
    const startPublished=async(agent:PublishedTalent,signal:AbortSignal)=>{
      const owner=catalogOperationOwner(controller.getSnapshot())
      const current=()=>!!owner&&catalogOperationOwner(controller.getSnapshot())===owner&&talentApplicationAccess(agent,controller.getSnapshot())
      signal.throwIfAborted()
      if(!current()||!agent.available||!agent.installedVersion)return
      const selected=await request('open-installed',{agentId:agent.agentId},signal);signal.throwIfAborted()
      if(!current())return
      if(typeof selected.path!=='string'||!selected.path.trim())throw Error('智能体工作区暂不可用，请重新加载后重试。')
      const workspace=await props.createWorkspace({path:selected.path});signal.throwIfAborted()
      if(current())await props.onPick(workspace.workspaceId)
    }
    return <Center home onStartPublished={startPublished} onStartSnapshot={startSnapshot}/>
  }
}
export interface AgentConversationProps extends Record<string,unknown>{
  useSessions<T>(select:(state:SessionList)=>T):T
  selectWorkspace(id:string):Promise<void>
}
export function createAgentConversation(controller:Controller,navigation:ReturnType<typeof createAgentNavigation>,createWorkspace:BrowserProps['createWorkspace'],Original:ComponentType<Record<string,unknown>>,openCenter?:()=>void,openSession?:OpenTalentSession){
  const Home=createAgentHome(controller,openCenter,openSession)
  function Managed(props:AgentConversationProps){
    const selecting=useSyncExternalStore(navigation.subscribe,navigation.getSnapshot,navigation.getSnapshot)
    const identity=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot)
    const current=props.useSessions(state=>state.current)
    if(['ready','no_apps'].includes(identity.phase)&&(selecting||!current))return <Home createWorkspace={createWorkspace} onPick={async id=>{await props.selectWorkspace(id);navigation.finish()}}/>
    return createElement(Original,props)
  }
  return function AgentConversation(props:AgentConversationProps){
    return typeof props.useSessions==='function'&&typeof props.selectWorkspace==='function'?<Managed {...props}/>:createElement(Original,props)
  }
}
export function createAgentPicker(controller:Controller,openCenter?:()=>void,openSession?:OpenTalentSession){
  return function AgentPicker(props:PickerProps){
    const {items,error:catalogError,refresh,owner}=useCatalog(controller)
    const operation=useOperationSignal(owner,props.open)
    const [busy,setBusy]=useState(false);const [error,setError]=useState('');const dialog=useRef<HTMLDivElement>(null)
    useEffect(()=>{
      setBusy(false);setError('')
      if(!props.open)return
      const previous=document.activeElement
      dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
      return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus()}
    },[props.open,owner])
    const choose=async(agent:DesktopAgentCard)=>{
      if(busy||!owner||!agent.available||!currentChoice(controller,owner,agent))return
      const signal=operation.current.signal;setBusy(true);setError('')
      try{
        if(agent.kind==='template'){if(!openSession)throw Error('本机会话入口尚未就绪。');const selected=await openInstalledTalent(agent.talent.presetId,signal);signal.throwIfAborted();if(!currentChoice(controller,owner,agent))return;props.onClose();await openSession(selected.sessionId);return}
        const selected=agent.kind==='snapshot'?await openCurrentSnapshot(agent,signal):await request(agent.selectionRoute,{agentId:agent.agentId},signal);signal.throwIfAborted()
        if(!currentChoice(controller,owner,agent))return
        const workspace=await props.createWorkspace({path:selected.path});signal.throwIfAborted();if(!currentChoice(controller,owner,agent))return
        props.onPick(workspace.workspaceId);props.onClose()
      }catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:'智能体工作区创建失败。')}
      finally{if(!signal.aborted)setBusy(false)}
    }
    if(!props.open)return null
    return <div className="fs-agents-dialog" onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();props.onClose()}
      if(event.key==='Tab'){
        const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])
        const first=buttons[0],last=buttons.at(-1)
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }
    }}>
      <style>{css}</style><div ref={dialog} className="fs-agents" role="dialog" aria-modal="true" aria-label="选择智能体">
        <div className="fs-agents-header"><h3>选择智能体</h3><button type="button" onClick={props.onClose}>关闭</button></div>
        <p>选择已经下载安装到本机的智能体。</p>
        <Choices items={items} busy={busy} choose={agent=>{void choose(agent)}}/>
        {!items.length&&!catalogError&&<p role="status">尚未安装智能体。</p>}
        {openCenter&&<button type="button" onClick={()=>{props.onClose();openCenter()}}>打开智能体中心</button>}
        {(error||catalogError)&&<p role="alert" className="fs-agents-error">{error||catalogError}</p>}
        <button type="button" disabled={busy} onClick={refresh}>刷新智能体</button>
      </div>
    </div>
  }
}
