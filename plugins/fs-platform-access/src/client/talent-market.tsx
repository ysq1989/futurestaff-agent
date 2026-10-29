import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import type {PlatformAccessSnapshot} from '../controller.js'
import {filterTalentTemplates,talentAssistantKind,talentTabs,talentTemplateDisplay,talentApplicationAccess,talentApplicationKey,type TalentTemplate,type TalentFilter} from './talent-market-model.js'
import {decodeTalentCard,installedTalentsChanged,loadInstalledTalents,notifyInstalledTalentsChanged,openInstalledTalent,requestTalent,type InstalledTalent,type OpenTalentSession} from './installed-talents.js'
import {loadPublishedTalents,type PublishedTalent} from './published-talents.js'
import {PublishedTalentCard} from './published-talent-card.js'
import {loadCurrentSnapshotTalents,installCurrentSnapshot,type CurrentSnapshotTalent} from './current-snapshot-talents.js'
import {loadPlatformAssistants,usePlatformAssistant} from './platform-assistants.js'
import type {PlatformAssistant} from '../platform-assistants.js'

type Controller={subscribe(listener:()=>void):()=>void;getSnapshot():PlatformAccessSnapshot}
type StatusFilter='all'|'installed'|'updates'
export type StartPublishedTalent=(card:PublishedTalent,signal:AbortSignal)=>Promise<void>
export type StartCurrentSnapshot=(card:CurrentSnapshotTalent,signal:AbortSignal)=>Promise<void>
type MarketState={owner:string;templates:TalentTemplate[];installed:InstalledTalent[];published:PublishedTalent[];snapshots:CurrentSnapshotTalent[];platform:PlatformAssistant[];errors:Record<string,string>}
type TemplateItem={card:TalentTemplate;installed:InstalledTalent|undefined}
const empty:MarketState={owner:'',templates:[],installed:[],published:[],snapshots:[],platform:[],errors:{}}
const updateAvailable=({card,installed}:TemplateItem)=>!!installed&&card.compatible&&card.version!==installed.version

function TemplateTalentCard({item,busy,installationReady,installationFailed,onInstall,onStart,onUninstall}:{item:TemplateItem;busy:boolean;installationReady:boolean;installationFailed:boolean;onInstall(card:TalentTemplate):void;onStart(item:InstalledTalent):void;onUninstall(item:InstalledTalent):void}){
 const[confirm,setConfirm]=useState(false)
 const{card,installed}=item,display=talentTemplateDisplay(card)
 const localSystem=!!card.tools?.length&&card.requiredApplications.length>0
 const description=localSystem?'使用已适配的本机工具处理系统业务；能力以当前成员授权和人工确认为准。':display.description
 const bullets=localSystem?[]:display.bullets
 useEffect(()=>setConfirm(false),[installed?.presetId])
 return <article className="fs-talent-card" data-template-id={card.templateId} data-preset-id={installed?.presetId}>
  <div className="fs-talent-card-header"><span className="fs-talent-icon" aria-hidden="true">{card.icon&&card.icon!=='AI'?card.icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="6" width="16" height="14" rx="4"/><path d="M12 3v3M8 11h.01M16 11h.01M9 16h6"/></svg>}</span><div className="fs-talent-heading"><h2>{display.name}</h2>
  <span className="fs-agent-center-status" data-state={!installationReady?'unknown':installed?updateAvailable(item)?'updates':'installed':'new'}>{!installationReady?(installationFailed?'安装状态待核对':'正在核对安装状态…'):installed?updateAvailable(item)?'已安装 · 有新版本':'已安装':'未安装'}</span></div></div>
  <p className="fs-talent-description" title={description}>{description}</p>
  {!card.compatible&&<p>{card.unavailableReason||'此助手暂不支持在本机安装。'}</p>}
  <div className="fs-agent-center-actions">
   {installationReady&&(!installed||updateAvailable(item))&&<button type="button" className="fs-agent-primary" disabled={busy||!card.compatible} onClick={()=>onInstall(card)}>{!card.compatible?'暂不支持安装':installed?'更新安装':'下载并安装'}</button>}
   {installationReady&&installed&&<><button type="button" className="fs-agent-primary" disabled={busy||!card.compatible||!installed.compatible} onClick={()=>onStart(installed)}>开始对话</button></>}
  </div>
  <details className="fs-talent-details"><summary>智能体详情</summary><p className="fs-agent-note">{description}</p>{!!bullets.length&&<ul>{bullets.map((bullet,index)=><li key={index}>{bullet}</li>)}</ul>}<small>{talentAssistantKind(card)==='system'?'系统助手':'通用助手'} · {!installationReady?'安装状态待核对':installed?'已安装到本机':'安装后即可开始对话'}</small>{installationReady&&installed&&<div><button type="button" disabled={busy} onClick={()=>setConfirm(true)}>卸载</button></div>}</details>
  {installationReady&&confirm&&installed&&<div className="fs-agent-confirm"><p>卸载后不再出现在新会话中，已有会话和工程会保留。</p><button type="button" disabled={busy} onClick={()=>onUninstall(installed)}>确认卸载</button><button type="button" disabled={busy} onClick={()=>setConfirm(false)}>取消</button></div>}
 </article>
}

export function createTalentMarket(controller:Controller,onNewSession:()=>void,openSession?:OpenTalentSession){
 return function TalentMarket({visible=true,title,beforeNewSession,onStartPublished,onStartSnapshot}:{visible?:boolean;title?:string;beforeNewSession?():void;onStartPublished?:StartPublishedTalent;onStartSnapshot?:StartCurrentSnapshot}){
  const identity=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot)
  const owner=['ready','no_apps'].includes(identity.phase)?`${identity.activeTenantId}:${identity.user?.userId}`:''
  const applicationKey=talentApplicationKey(identity)
  const accessCurrent=()=>{const next=controller.getSnapshot();return ['ready','no_apps'].includes(next.phase)&&`${next.activeTenantId}:${next.user?.userId}`===owner&&talentApplicationKey(next)===applicationKey}
  const[state,setState]=useState<MarketState>(empty),[category,setCategory]=useState<TalentFilter>('all'),[status,setStatus]=useState<StatusFilter>('all')
  const[query,setQuery]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(0),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState('')
  const operation=useRef(new AbortController())
  const working=useRef(false)
  useEffect(()=>{const abort=new AbortController();operation.current=abort;working.current=false;setBusy(null);setError('');setCategory('all');setStatus('all');setQuery('');if(!owner||!visible)abort.abort();return()=>abort.abort()},[owner,applicationKey,visible])
  useEffect(()=>{const refresh=()=>setRevision(value=>value+1);window.addEventListener(installedTalentsChanged,refresh);return()=>window.removeEventListener(installedTalentsChanged,refresh)},[])
  useEffect(()=>{
   const abort=new AbortController()
   if(!owner||!visible){setLoading(0);return()=>abort.abort()}
   setState(previous=>previous.owner===owner?{...previous,errors:{}}:{...empty,owner});setLoading(5)
   const load=<K extends 'templates'|'installed'|'published'|'snapshots'|'platform'>(key:K,promise:Promise<MarketState[K]>,message:string)=>{
    void promise.then(value=>{if(!abort.signal.aborted)setState(previous=>previous.owner===owner?{...previous,[key]:value}:previous)})
     .catch(()=>{if(!abort.signal.aborted)setState(previous=>previous.owner===owner?{...previous,[key]:key==='installed'?previous.installed:[],errors:{...previous.errors,[key]:message}}:previous)})
     .finally(()=>{if(!abort.signal.aborted)setLoading(value=>value-1)})
   }
   load('templates',requestTalent('catalog',abort.signal).then(data=>{if(!Array.isArray(data.items)||data.items.length>200)throw Error('人才目录格式不兼容。');return data.items.map(decodeTalentCard)}),'人才目录暂不可用，请检查更新后重试。')
   load('installed',loadInstalledTalents(abort.signal),'本机安装状态暂不可用，请检查更新后重试。')
   load('platform',loadPlatformAssistants(abort.signal),'平台助手入口暂不可用，请刷新后重试。')
   load('published',loadPublishedTalents(abort.signal),'部分智能体目录暂不可用，请检查更新后重试。')
   load('snapshots',talentApplicationAccess({requiredApplications:['shop']},identity)?loadCurrentSnapshotTalents(abort.signal):Promise.resolve([]),'当前商城助手目录暂不可用，请检查更新后重试。')
   return()=>abort.abort()
  },[owner,applicationKey,visible,revision])
  const current=state.owner===owner&&visible&&owner?state:empty
  const byTemplate=new Map(current.installed.filter(item=>talentApplicationAccess(item,identity)).map(item=>[item.templateId,item]))
  const templates=current.templates.filter(item=>talentApplicationAccess(item,identity))
  const templateItems=filterTalentTemplates(templates,category,query).map(card=>({card,installed:byTemplate.get(card.templateId)}))
  const platform=current.platform.filter(card=>talentApplicationAccess(card,identity)&&(category==='all'||talentAssistantKind(card)===category)&&`${card.name} ${card.description} ${card.skills.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const published=current.published.filter(card=>!current.platform.some(item=>item.agentId===card.agentId)&&talentApplicationAccess(card,identity)&&(category==='all'||talentAssistantKind(card)===category)&&`${card.name} ${card.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const snapshots=current.snapshots.filter(card=>talentApplicationAccess(card,identity)&&!current.published.some(published=>published.agentId===card.agentId)&&(category==='all'||category==='system')&&`${card.name} ${card.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const counts={all:templateItems.length+published.length+snapshots.length+platform.length,installed:templateItems.filter(item=>!!item.installed).length+published.filter(item=>!!item.installedVersion).length+snapshots.filter(item=>item.installed).length+platform.filter(item=>item.installed).length,updates:templateItems.filter(updateAvailable).length+published.filter(item=>item.available&&item.updateAvailable).length+platform.filter(item=>item.updateAvailable).length}
  const cards=templateItems.filter(item=>status==='all'||(status==='installed'?!!item.installed:updateAvailable(item)))
  const publishedCards=published.filter(item=>status==='all'||(status==='installed'?!!item.installedVersion:item.available&&item.updateAvailable))
  const snapshotCards=snapshots.filter(item=>status==='all'||(status==='installed'&&item.installed))
  const platformCards=platform.filter(card=>status==='all'||status==='installed'&&card.installed||status==='updates'&&card.updateAvailable)
  const install=async(card:TalentTemplate)=>{
   if(loading||current.errors.installed||working.current||!owner||!card.compatible||!accessCurrent()||!talentApplicationAccess(card,controller.getSnapshot()))return
   const signal=operation.current.signal;working.current=true;setBusy(card.templateId);setError('')
   try{await requestTalent('install',signal,{templateId:card.templateId,version:card.version});signal.throwIfAborted();if(!accessCurrent())return;notifyInstalledTalentsChanged()}
   catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:'安装未完成，请重试。')}
   finally{if(!signal.aborted){working.current=false;setBusy(null)}}
  }
  const start=async(item:InstalledTalent)=>{
   if(working.current||!owner||!item.compatible||!accessCurrent()||!talentApplicationAccess(item,controller.getSnapshot()))return
   const signal=operation.current.signal;working.current=true;setBusy(item.presetId);setError('')
   try{if(!openSession)throw Error('本机会话入口尚未就绪。');const session=await openInstalledTalent(item.presetId,signal);signal.throwIfAborted();if(!accessCurrent())return;beforeNewSession?.();await openSession(session.sessionId)}
   catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:'会话未打开，请重试。')}
   finally{if(!signal.aborted){working.current=false;setBusy(null)}}
  }
  const startPublished=async(card:PublishedTalent)=>{
   if(working.current||!owner||!card.available||!card.installedVersion||!onStartPublished||!accessCurrent()||!talentApplicationAccess(card,controller.getSnapshot()))return
   const signal=operation.current.signal;working.current=true;setBusy(card.agentId);setError('')
   try{await onStartPublished(card,signal)}
   catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:'会话未打开，请重试。')}
   finally{if(!signal.aborted){working.current=false;setBusy(null)}}
  }
  const uninstall=async(item:InstalledTalent)=>{
   if(working.current||!owner||!accessCurrent())return
   const signal=operation.current.signal;working.current=true;setBusy(item.presetId);setError('')
   try{await requestTalent('uninstall',signal,{presetId:item.presetId});signal.throwIfAborted();notifyInstalledTalentsChanged()}
   catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:'卸载未完成，请重试。')}
   finally{if(!signal.aborted){working.current=false;setBusy(null)}}
  }
  const snapshotAction=async(card:CurrentSnapshotTalent,install:boolean)=>{
   if(working.current||!owner||!card.available||(!install&&!card.installed)||!accessCurrent()||!talentApplicationAccess(card,controller.getSnapshot()))return
   const signal=operation.current.signal;working.current=true;setBusy(card.agentId);setError('')
   try{
    if(install){await installCurrentSnapshot(card,signal);signal.throwIfAborted();if(accessCurrent())notifyInstalledTalentsChanged()}
    else if(onStartSnapshot)await onStartSnapshot(card,signal)
    else {beforeNewSession?.();onNewSession()}
   }catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:'商城助手操作未完成，请检查更新后重试。')}
   finally{if(!signal.aborted){working.current=false;setBusy(null)}}
  }
  const platformAction=async(card:PlatformAssistant,update=false)=>{
   if(working.current||loading||!owner||!accessCurrent()||!talentApplicationAccess(card,controller.getSnapshot()))return
   if(card.installed&&!update){const published=current.published.find(item=>item.agentId===card.agentId);if(published)await startPublished(published);else setError('本机版本尚未核对，请刷新目录。');return}
   const signal=operation.current.signal;working.current=true;setBusy(card.templateId);setError('')
   try{await usePlatformAssistant(card.templateId,signal);signal.throwIfAborted();if(accessCurrent())notifyInstalledTalentsChanged()}
   catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:'平台助手选用未完成，请刷新核对。')}
   finally{if(!signal.aborted){working.current=false;setBusy(null)}}
  }
  const pending=!!owner&&(!!loading||state.owner!==owner)
  const failures=Object.values(current.errors)
  const clearFilters=()=>{setQuery('');setCategory('all');setStatus('all')}
  return <div className="fs-talent-market" aria-label="智能体目录" key={owner}>
   <header className="fs-talent-market-header"><div>{title&&<h1>{title}</h1>}<p className="fs-talent-intro">选择适合当前工作的智能体，已安装的可直接开始对话。</p></div><button type="button" className="fs-talent-refresh" disabled={pending||!!busy||!owner} onClick={()=>setRevision(value=>value+1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></svg>检查更新</button></header>
   <nav className="fs-assistant-categories" aria-label="助手分类">{[{id:'all' as const,label:'全部助手'},...talentTabs(current.templates,[])].map(item=><button type="button" key={item.id} aria-pressed={category===item.id} onClick={()=>setCategory(item.id)}>{item.label}</button>)}</nav>
   {category!=='all'&&<p className="fs-assistant-description">{category==='system'?'与业务系统配套，处理该系统中的业务工作。':'用于项目、研究、创作等通用工作。'}</p>}
   <div className="fs-talent-toolbar"><nav className="fs-assistant-status" aria-label="安装状态">{(['all','installed','updates'] as const).map(value=><button type="button" key={value} aria-pressed={status===value} onClick={()=>setStatus(value)}>{({all:'全部',installed:'已安装',updates:'可更新'})[value]} · {pending||failures.length?'—':counts[value]}</button>)}</nav><label className="fs-talent-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" aria-label="搜索智能体" placeholder="搜索名称、用途或技能" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
   {pending&&<p className="fs-talent-loading" role="status">正在读取智能体…</p>}{busy&&owner&&<p role="status">正在处理，请稍候…</p>}
   {(error&&owner||failures.length>0)&&<div className="fs-talent-feedback"><div role="alert">{error&&owner&&<p>{error}</p>}{failures.map(message=><p key={message}>{message}</p>)}</div><button type="button" disabled={pending||!!busy} onClick={()=>{setError('');setRevision(value=>value+1)}}>重新加载</button></div>}
   <div className="fs-agent-center-grid" aria-busy={pending}>
    {platformCards.map(card=><article className="fs-talent-card" data-platform-template-id={card.templateId} key={'platform:'+card.templateId}>
     <div className="fs-talent-card-header"><span className="fs-talent-icon" aria-hidden="true">{card.icon}</span><div className="fs-talent-heading"><h2>{card.name}</h2><span className="fs-agent-center-status">{card.installed?(card.updateAvailable?'已安装 · 有新版本':'已安装'):card.state==='preparing'?'正在准备':card.state==='error'?'准备未完成':'平台助手'}</span></div></div>
     <p className="fs-talent-description">{card.description}</p>{card.unavailableReason&&<p>{card.unavailableReason}</p>}
     <div className="fs-agent-center-actions"><button type="button" className="fs-agent-primary" disabled={pending||!!busy} onClick={()=>void platformAction(card)}>{card.installed?'开始对话':card.state==='error'?'重试准备':'选用并安装'}</button>{card.updateAvailable&&<button type="button" className="fs-agent-primary" disabled={pending||!!busy} onClick={()=>void platformAction(card,true)}>更新安装</button>}</div>
     <details className="fs-talent-details"><summary>智能体详情</summary><p>平台统一提供制作方法，AI系统选择已授权模型；参考、提示词、工程和成品保存在企业私有素材库。视频实际生成以当前工具能力为准。</p></details>
    </article>)}
    {pending&&!cards.length&&!publishedCards.length&&!snapshotCards.length&&Array.from({length:6},(_,index)=><article key={'loading:'+index} aria-hidden="true">{Array.from({length:5},(_,line)=><span className="fs-talent-skeleton" key={line}/>)}</article>)}
    {cards.map(item=><TemplateTalentCard key={'template:'+item.card.templateId} item={item} busy={!!busy||pending} installationReady={!pending&&!current.errors.installed} installationFailed={!!current.errors.installed} onInstall={card=>void install(card)} onStart={item=>void start(item)} onUninstall={item=>void uninstall(item)}/>)}
    {publishedCards.map(card=><PublishedTalentCard key={'published:'+card.agentId} card={card} signal={operation.current.signal} disabled={!!busy} onChanged={()=>setRevision(value=>value+1)} onNewSession={onNewSession} {...(onStartPublished?{onStart:startPublished}:{})} {...(beforeNewSession?{beforeNewSession}:{})}/>)}
    {snapshotCards.map(card=><article className="fs-talent-card" data-current-agent-id={card.agentId} key={'snapshot:'+card.agentId}>
     <div className="fs-talent-card-header"><span className="fs-talent-icon" aria-hidden="true">商</span><div className="fs-talent-heading"><h2>{card.name}</h2><span className="fs-agent-center-status" data-state={card.installed?'installed':'new'}>{card.installed?'当前版本已安装':'未安装'}</span></div></div>
     <p className="fs-talent-description" title={card.description}>{card.description}</p><small>平台角色 · 系统助手</small>
     <div className="fs-agent-center-actions"><button type="button" className="fs-agent-primary" disabled={!!busy||!card.available} onClick={()=>void snapshotAction(card,!card.installed)}>{card.installed?(onStartSnapshot?'开始对话':'新建会话'):'安装当前版本'}</button></div>
     <details className="fs-talent-details"><summary>智能体详情</summary><p className="fs-agent-note">使用当前账号授权的商城角色创建新会话，已有会话和工程会保留。商品查询按当前权限执行，写操作仍需人工确认。</p></details>
    </article>)}
   </div>
   {!owner&&<p className="fs-agent-empty">登录后查看智能体。</p>}
   {!!owner&&!pending&&!failures.length&&!cards.length&&!publishedCards.length&&!snapshotCards.length&&!platformCards.length&&<div className="fs-agent-empty"><h2>{query.trim()?'没有匹配的智能体':status==='installed'?'此分类下尚未安装智能体':status==='updates'?'此分类下没有可更新的智能体':'此分类下暂无智能体'}</h2><p>{query.trim()?'试试其他名称、用途或技能关键词。':status==='installed'?'切换“全部”，选择需要的智能体下载安装。':status==='updates'?'已安装的智能体可继续使用，也可以浏览其他助手。':'可以切换分类查看，或稍后重新加载目录。'}</p><button type="button" onClick={clearFilters}>查看全部智能体</button></div>}
  </div>
 }
}



