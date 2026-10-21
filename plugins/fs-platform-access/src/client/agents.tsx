import { createElement, useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react'
import type { PlatformAccessSnapshot } from '../controller.js'

export interface DesktopAgentCard { agentId:string;name:string;description:string;available:boolean;unavailableReason:string|null;path:string }
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
const css=`
.fs-agents{display:flex;flex-direction:column;gap:8px;min-height:0;color:var(--text-primary);font-size:13px}.fs-agents h3{font-size:13px;margin:8px 0}.fs-agents button{font:inherit;color:inherit;background:transparent;border:1px solid var(--border-default);border-radius:8px;padding:9px;text-align:left;cursor:pointer}.fs-agents button:hover{background:var(--bg-hover)}.fs-agents button:focus-visible{outline:2px solid var(--accent-primary)}.fs-agents button:disabled{cursor:default;opacity:.65}.fs-agent-choice{display:flex;flex-direction:column;gap:4px;width:100%}.fs-agent-choice[aria-current=true]{border-color:var(--accent-primary);background:var(--bg-active)}.fs-agents small,.fs-agents p{color:var(--text-secondary);margin:0;line-height:1.5}.fs-agent-list{display:flex;flex-direction:column;gap:6px;overflow:auto}.fs-agent-session[aria-current=page]{color:var(--accent-primary);background:var(--bg-active)}.fs-agents-dialog{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;background:color-mix(in srgb,var(--bg-primary) 75%,transparent);padding:24px}.fs-agents-dialog>.fs-agents{width:min(480px,100%);max-height:80vh;padding:20px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:12px}.fs-agents-header{display:flex;align-items:center;justify-content:space-between;gap:8px}.fs-agent-legacy{margin-top:12px}.fs-agents-error{color:var(--error)!important}.fs-agents-data{overflow-wrap:anywhere;font-size:11px}
.fs-agents .fs-agent-choice{height:auto;min-height:68px;flex-shrink:0;overflow:hidden;align-items:stretch}.fs-agent-choice small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-height:3em;overflow:hidden;overflow-wrap:anywhere}.fs-agent-choice strong{overflow-wrap:anywhere}
.fs-agent-browser{flex:1;overflow:hidden}.fs-agent-browser h3{flex-shrink:0}.fs-agent-search{flex-shrink:0;box-sizing:border-box;width:100%;font:inherit;color:var(--text-primary);background:var(--bg-primary);border:1px solid var(--border-default);border-radius:6px;padding:8px}.fs-agent-browser>.fs-agent-list{flex:1;min-height:0}.fs-agent-session{display:flex;flex-direction:column;gap:3px;flex-shrink:0;min-width:0;width:100%}.fs-agent-session span,.fs-agent-session small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-agent-home{box-sizing:border-box;height:100%;padding:clamp(20px,4vw,48px);overflow:auto;background:var(--bg-primary)}.fs-agent-home-content{width:100%;max-width:1000px;margin:0 auto}.fs-agent-home h1{margin:0 0 8px;font-size:26px;font-weight:600;line-height:1.4}.fs-agent-home .fs-agent-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:12px;margin-top:24px;overflow:visible}.fs-agent-home .fs-agent-choice{padding:16px;min-height:108px;text-align:left}.fs-agent-home .fs-agent-choice strong{font-size:15px}.fs-agent-home [role=status],.fs-agent-home [role=alert]{margin-top:16px}.fs-agents-dialog>.fs-agents{height:auto}
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
  const [catalog,setCatalog]=useState<{owner:string;items:DesktopAgentCard[];directory:string}>({owner:'',items:[],directory:''})
  const [error,setError]=useState('');const [revision,refresh]=useState(0)
  useEffect(()=>{
    const abort=new AbortController();setError('')
    if(!owner){setCatalog({owner:'',items:[],directory:''});return()=>abort.abort()}
    void request('distribution',undefined,abort.signal).then(body=>{
      if(!Array.isArray(body.items)||typeof body.dataDirectory!=='string')throw new Error('智能体目录版本不兼容。')
      if(!abort.signal.aborted)setCatalog({owner,items:body.items.filter((item:{installedVersion?:string|null})=>!!item.installedVersion),directory:body.dataDirectory})
    }).catch(reason=>{if(!abort.signal.aborted)setError(reason.message)})
    return()=>abort.abort()
  },[owner,revision])
  return {items:catalog.owner===owner?catalog.items:[],directory:catalog.owner===owner?catalog.directory:'',error,refresh:()=>refresh(value=>value+1),owner}
}
function Choices({items,current,busy,choose}:{items:DesktopAgentCard[];current?:string|undefined;busy:boolean;choose:(agent:DesktopAgentCard)=>void}){
  return <div className="fs-agent-list">{items.map(agent=><button type="button" className="fs-agent-choice" key={agent.agentId} disabled={busy||!agent.available} aria-current={current===agent.agentId} onClick={()=>choose(agent)}>
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
export function createAgentHome(controller:Controller,openCenter?:()=>void){
  return function AgentHome(props:{createWorkspace(input:{path:string}):Promise<Workspace>;onPick(id:string):void|Promise<void>}){
    const {items,error:catalogError,refresh,owner}=useCatalog(controller)
    const operation=useOperationSignal(owner);const[busy,setBusy]=useState(false);const[error,setError]=useState('')
    useEffect(()=>{setBusy(false);setError('')},[owner])
    const choose=async(agent:DesktopAgentCard)=>{
      const signal=operation.current.signal;setBusy(true);setError('')
      try{const selected=await request('open-installed',{agentId:agent.agentId},signal);signal.throwIfAborted()
        const workspace=await props.createWorkspace({path:selected.path});signal.throwIfAborted();await props.onPick(workspace.workspaceId)
      }catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:'智能体会话创建失败。')}
      finally{if(!signal.aborted)setBusy(false)}
    }
    return <section className="fs-agents fs-agent-home" aria-label="新会话选择智能体"><style>{css}</style><div className="fs-agent-home-content">
      <div className="fs-agents-header"><div><h1>开始新会话</h1><p>选择一个智能体，使用它的知识和技能开始工作。</p></div><button type="button" onClick={refresh} disabled={busy}>刷新</button></div>
      <Choices items={items} busy={busy} choose={agent=>{void choose(agent)}}/>
      {busy&&<p role="status">正在准备智能体会话…</p>}
      {!items.length&&!catalogError&&<p role="status">尚未安装智能体，请先前往智能体中心安装。</p>}
      {openCenter&&<button type="button" onClick={openCenter} disabled={busy}>打开智能体中心</button>}
      {(error||catalogError)&&<p role="alert" className="fs-agents-error">{error||catalogError}</p>}
    </div></section>
  }
}
export interface AgentConversationProps extends Record<string,unknown>{
  useSessions<T>(select:(state:SessionList)=>T):T
  selectWorkspace(id:string):Promise<void>
}
export function createAgentConversation(controller:Controller,navigation:ReturnType<typeof createAgentNavigation>,createWorkspace:BrowserProps['createWorkspace'],Original:ComponentType<Record<string,unknown>>,openCenter?:()=>void){
  const Home=createAgentHome(controller,openCenter)
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
export function createAgentPicker(controller:Controller,openCenter?:()=>void){
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
      const signal=operation.current.signal;setBusy(true);setError('')
      try{
        const selected=await request('open-installed',{agentId:agent.agentId},signal);signal.throwIfAborted()
        const workspace=await props.createWorkspace({path:selected.path});signal.throwIfAborted()
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
        <p>使用平台配置的知识、技能与长期记忆开始对话。</p>
        <Choices items={items} busy={busy} choose={agent=>{void choose(agent)}}/>
        {!items.length&&!catalogError&&<p role="status">暂无已授权智能体。</p>}
        {openCenter&&<button type="button" onClick={()=>{props.onClose();openCenter()}}>打开智能体中心</button>}
        {(error||catalogError)&&<p role="alert" className="fs-agents-error">{error||catalogError}</p>}
        <button type="button" disabled={busy} onClick={refresh}>刷新智能体</button>
      </div>
    </div>
  }
}
