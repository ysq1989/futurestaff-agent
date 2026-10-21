import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import type {PlatformAccessSnapshot} from '../controller.js'
import type {DistributionCard} from '../agent-distribution.js'
type Card=DistributionCard&{installedVersion:string|null;versions:string[];updateAvailable:boolean}
type Controller={subscribe(listener:()=>void):()=>void;getSnapshot():PlatformAccessSnapshot}
async function request(route:string,signal:AbortSignal,body?:unknown){
  const response=await fetch('/_futurestaff/agents/'+route,{method:body===undefined?'GET':'POST',headers:{'x-futurestaff-agent':'1','content-type':'application/json'},cache:'no-store',signal,...(body===undefined?{}:{body:JSON.stringify(body)})})
  const data=await response.json()
  if(!response.ok)throw Object.assign(Error(data.error==='AGENT_PERMISSION_CONFIRMATION_REQUIRED'?'CONFIRM_CAPABILITIES':data.error==='AGENT_DISTRIBUTION_UPGRADE_REQUIRED'?'平台尚未启用智能体发布服务，请联系管理员升级平台。':'操作未完成。请刷新目录，检查平台连接与使用权限后重试。'),{capabilities:Array.isArray(data.capabilities)?data.capabilities.filter((v:unknown)=>typeof v==='string'):[]})
  return data
}
const labels:Record<string,string>={'core.chat':'智能对话','local.files':'本地文件','video.production':'视频制作','geo.collection':'GEO 网页采集'}
const css=`.fs-agent-center{box-sizing:border-box;height:100%;overflow:auto;padding:clamp(20px,4vw,48px);color:var(--text-primary);background:var(--bg-primary);font-size:14px;line-height:1.6}.fs-agent-center>div{max-width:1120px;margin:auto}.fs-agent-center header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.fs-agent-center h1{margin:0 0 8px;font-size:28px;font-weight:600}.fs-agent-center p{color:var(--text-secondary);margin:6px 0 16px}.fs-agent-center button,.fs-agent-center input,.fs-agent-center select{box-sizing:border-box;font:inherit;color:inherit;border:1px solid var(--border-default);border-radius:8px;background:var(--bg-elevated);padding:8px 12px}.fs-agent-center button{cursor:pointer}.fs-agent-center button:hover{background:var(--bg-hover)}.fs-agent-center button:disabled{opacity:.55;cursor:default}.fs-agent-center :focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.fs-agent-center nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:24px 0}.fs-agent-center nav input{margin-left:auto;width:min(300px,100%)}.fs-agent-center button[aria-pressed=true]{background:var(--bg-active);color:var(--accent-primary);border-color:var(--accent-primary)}.fs-agent-center-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(310px,100%),1fr));gap:16px}.fs-agent-center article{border:1px solid var(--border-default);border-radius:12px;padding:22px;display:flex;flex-direction:column;min-width:0;overflow-wrap:anywhere}.fs-agent-center h2{font-size:17px;margin:0 0 8px}.fs-agent-center small{color:var(--text-secondary)}.fs-agent-center-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:20px}.fs-agent-center .fs-agent-primary{background:var(--accent-primary);color:var(--fs-on-accent,#fff);border-color:transparent}.fs-agent-center [role=alert]{color:var(--error)}.fs-agent-confirm{border-top:1px solid var(--border-default);margin-top:16px;padding-top:16px}.fs-agent-confirm button{margin:4px 8px 0 0}.fs-agent-center .fs-agent-note{font-size:12px;white-space:pre-wrap}.fs-agent-center .fs-agent-empty{padding:48px 20px;border:1px dashed var(--border-default);border-radius:12px;text-align:center}.fs-agent-center-status{font-size:12px;color:var(--accent-primary)}@media(max-width:600px){.fs-agent-center header{flex-wrap:wrap}.fs-agent-center nav input{width:100%;margin-left:0}}`
export function createAgentCenter(controller:Controller,onNewSession:()=>void){
  return function AgentCenter({visible=true}:{visible?:boolean}){
    const identity=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot)
    const owner=['ready','no_apps'].includes(identity.phase)?`${identity.activeTenantId}:${identity.user?.userId}`:''
    const [catalog,setCatalog]=useState<{owner:string;items:Card[]}>({owner:'',items:[]})
    const [tab,setTab]=useState<'installed'|'available'|'updates'>('installed'),[query,setQuery]=useState(''),[revision,setRevision]=useState(0)
    const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
    const [confirm,setConfirm]=useState<{agentId:string;version?:string;route:'install'|'rollback'|'uninstall';capabilities?:string[]}|null>(null)
    const operation=useRef(new AbortController())
    useEffect(()=>{const abort=new AbortController();operation.current=abort;setError('');setConfirm(null);setBusy(false);setNotice('')
      if(!owner||!visible)return()=>abort.abort()
      setBusy(true)
      void request('distribution',abort.signal).then(data=>{if(!Array.isArray(data.items))throw Error('智能体目录格式不兼容。');if(!abort.signal.aborted)setCatalog({owner,items:data.items})}).catch(reason=>{if(!abort.signal.aborted)setError(reason.message)}).finally(()=>{if(!abort.signal.aborted)setBusy(false)})
      return()=>abort.abort()
    },[owner,revision,visible])
    const items=catalog.owner===owner?catalog.items:[]
    const counts={installed:items.filter(c=>c.installedVersion).length,available:items.filter(c=>!c.installedVersion).length,updates:items.filter(c=>c.updateAvailable&&c.available).length}
    const cards=items.filter(c=>(tab==='installed'?!!c.installedVersion:tab==='updates'?c.updateAvailable&&c.available:!c.installedVersion)&&`${c.name} ${c.description}`.toLowerCase().includes(query.toLowerCase()))
    const act=async(route:'install'|'rollback'|'uninstall',card:Card,version?:string,confirmCapabilities=false)=>{
      const signal=operation.current.signal;setBusy(true);setError('');setNotice('')
      try{await request(route,signal,{agentId:card.agentId,...(version?{version}:{}),...(confirmCapabilities?{confirmCapabilities:true}:{})});signal.throwIfAborted();setConfirm(null);setRevision(v=>v+1)}catch(reason){if(!signal.aborted){if(reason instanceof Error&&reason.message==='CONFIRM_CAPABILITIES')setConfirm({agentId:card.agentId,route,...(version?{version}:{}),capabilities:(reason as Error&{capabilities:string[]}).capabilities});else setError(reason instanceof Error?reason.message:'操作失败。')}}finally{if(!signal.aborted)setBusy(false)}
    }
    return <section className="fs-agent-center" aria-label="智能体中心"><style>{css}</style><div>
      <header><div><h1>智能体中心</h1><p>从平台安装已发布的智能体，在这台电脑上使用并管理版本。</p></div><button type="button" disabled={busy} onClick={()=>setRevision(v=>v+1)}>检查更新</button></header>
      <nav aria-label="智能体筛选">{(['installed','available','updates'] as const).map(value=><button type="button" key={value} aria-pressed={tab===value} onClick={()=>{setTab(value);setConfirm(null)}}>{({installed:'已安装',available:'可安装',updates:'可更新'})[value]} · {counts[value]}</button>)}<input aria-label="搜索智能体" placeholder="搜索智能体" value={query} onChange={event=>setQuery(event.target.value)}/></nav>
      {busy&&<p role="status">正在处理，请稍候…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      <div className="fs-agent-center-grid">{cards.map(card=><article key={card.agentId}>
        <span className="fs-agent-center-status">{!card.available?'暂不可用':card.updateAvailable?'有新版本':card.installedVersion?'已安装':'平台已发布'}</span><h2>{card.name}</h2><p>{card.description||'平台配置的智能体'}</p>
        <small>平台版本 {card.version.slice(0,12)}{card.installedVersion&&` · 本机 ${card.installedVersion.slice(0,12)}`}</small>
        <p className="fs-agent-note">所需能力：{card.requirements.capabilities.map(cap=>labels[cap]||cap).join('、')}</p>{card.notes&&<p className="fs-agent-note">{card.notes}</p>}{!card.available&&<p>{card.unavailableReason||'平台已停用或撤销授权。'}</p>}
        <div className="fs-agent-center-actions">{(!card.installedVersion||card.updateAvailable)&&<button type="button" className="fs-agent-primary" disabled={busy||!card.available} onClick={()=>void act('install',card,card.version)}>{card.installedVersion?'更新':'安装'}</button>}{card.installedVersion&&<><button type="button" disabled={busy||!card.available} onClick={onNewSession}>前往新会话</button><button type="button" disabled={busy} onClick={()=>setConfirm({agentId:card.agentId,route:'uninstall'})}>卸载</button></>}</div>
        {card.installedVersion&&card.versions.some(v=>v!==card.installedVersion)&&<label><small>切换到本机保留的版本</small><select aria-label={`回滚${card.name}`} disabled={busy||!card.available} value="" onChange={event=>{if(event.target.value)setConfirm({agentId:card.agentId,route:'rollback',version:event.target.value})}}><option value="">选择版本…</option>{card.versions.filter(v=>v!==card.installedVersion).map(v=><option key={v} value={v}>{v.slice(0,12)}</option>)}</select></label>}
        {confirm?.agentId===card.agentId&&<div className="fs-agent-confirm"><p>{confirm.capabilities?'此版本增加了能力要求，请确认后继续。':confirm.route==='uninstall'?'卸载将停用本机安装。已有会话、工程和历史版本都会保留。':'切换后新会话使用所选版本，已有会话继续使用原版本。'}</p>{confirm.capabilities&&<p>{confirm.capabilities.map(cap=>labels[cap]||cap).join('、')}</p>}<button type="button" disabled={busy} onClick={()=>void act(confirm.route,card,confirm.version,!!confirm.capabilities)}>确认{confirm.route==='uninstall'?'卸载':'继续'}</button><button type="button" disabled={busy} onClick={()=>setConfirm(null)}>取消</button></div>}
      </article>)}</div>
      {!busy&&!error&&!cards.length&&<p className="fs-agent-empty">{tab==='installed'?'尚未安装智能体，请在“可安装”中选择。':tab==='updates'?'当前已是最新版本。':'暂无符合条件的已发布智能体，请联系平台管理员创建并发布。'}</p>}
      <p className="fs-agent-note">更新只对新会话生效。每个版本保留独立工程，旧会话与工程仍可从会话列表进入；卸载不会删除它们。</p>
    </div></section>
  }
}
