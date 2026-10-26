import {useState,useEffect,useRef} from 'react'
import type {Context} from '@deepseek-ai/cordis'
import type {ToolCallViewProps} from '@deepseek-ai/dsh-client-ui-tool/client'
import {InteractionWindow,InteractionTable,interactionCss} from './interaction.js'
import {ErpOrderForm,erpOrderFormCss} from './erp-order-form.js'
import {MessageCard,MessageCardAction,MessageCardNotice} from './message-card.js'
import {ErpCardStore,ErpCardError,type ErpCardMeta,type ErpCardView,type ErpCardState} from './erp-card-state.js'
import {erpCardDefinition,erpCardMeta,latestErpCard,type ErpGalleryItem} from './erp-gallery.js'
type Row=Record<string,unknown>
type View=ErpCardView
type Meta=ErpCardMeta
const labels:Record<string,string>={name:'名称',customer_name:'客户',supplier_name:'供应商',product_name:'产品',material_name:'物料',warehouse_name:'仓库',order_no:'订单号',record_no:'单号',payment_no:'登记单号',sku:'产品编码',code:'编码',unit:'单位',quantity:'数量',stock_qty:'库存量',cost_price:'成本价',unit_price:'单价',total_amount:'总金额',paid_amount:'已收付金额',amount:'金额',status:'状态',notes:'备注',reason:'业务原因',description:'说明',order_date:'订单日期',due_date:'交付日期',record_date:'业务日期',payment_date:'登记日期',category_name:'分类',new_status:'目标状态',profit:'利润',revenue:'收入',expense:'支出',total_value:'总价值',discount:'折扣金额',tax_amount:'税额'}
const values:Record<string,string>={active:'在用',inactive:'停用',draft:'草稿',pending:'待处理',confirmed:'已确认',completed:'已完成',cancelled:'已取消',income:'收入',expense:'支出',receipt:'收款',payment:'付款'}
const operations:Record<string,string>={'sales.create':'新建销售订单草稿','sales.edit':'编辑销售订单','sales.status':'销售状态流转','purchase.create':'新建采购订单草稿','purchase.edit':'编辑采购订单','purchase.status':'采购状态流转','stock.inbound':'入库登记','stock.outbound':'出库登记','stock.transfer':'仓库调拨','production.create':'新建生产工单','production.status':'生产状态流转','payments.create':'收付款登记'}
async function api(action:string,sessionId:string,body:Row={}):Promise<View>{
 const response=await fetch('/_futurestaff/erp',{method:'POST',headers:{'content-type':'application/json','x-futurestaff-erp':'1'},body:JSON.stringify({action,sessionId,...body}),cache:'no-store'});const result=await response.json()
 if(!response.ok){const messages:Record<string,string>={ERP_PERMISSION_DENIED:'当前岗位没有此操作权限。',ERP_AUTH_REQUIRED:'请重新登录。',ERP_RECORD_UNAVAILABLE:'记录不存在或不可访问。',ERP_VIEW_EXPIRED:'权限或数据已变化，请重新查询。',ERP_STATE_CHANGED:'业务记录已变化，请重新生成预览。',ERP_READBACK_PENDING:'业务已经保存，结果暂未读回。读取原结果不会重复写入。'};throw new ErpCardError(typeof result.error==='string'?result.error:'ERP_UNAVAILABLE',result.message??messages[result.error]??'操作未完成，请查询业务结果后重试。')}
 return result
}
function rows(value:unknown):Row[]{if(Array.isArray(value))return value as Row[];if(value&&typeof value==='object'){const r=value as Row;for(const key of ['items','data','rows'])if(Array.isArray(r[key]))return r[key] as Row[]}return []}
function text(key:string,value:unknown){if(value==null)return ['cost_price','unit_price','stock_qty','total_amount','profit'].includes(key)?'无权限':'—';return values[String(value)]??String(value)}
function Table({data,detail}:{data:unknown;detail?:(id:string)=>void}){
 const items=rows(data),columns=Object.keys(labels).filter(key=>items.some(r=>key in r)).slice(0,9)
 return <InteractionTable rows={items} columns={columns.map(key=>({key,label:labels[key]!,format:(value:unknown)=>text(key,value)}))} {...(detail?{onDetail:detail}:{})}/>
}
function Details({data}:{data:unknown}){const row=(data??{}) as Row;return <><dl>{Object.entries(row).filter(([k,v])=>labels[k]&&(v===null||typeof v!=='object')).map(([k,v])=><div key={k}><dt>{labels[k]}</dt><dd>{text(k,v)}</dd></div>)}</dl>{Array.isArray(row.items)&&<Table data={row.items}/>}</>}
export function previewDetails(data:Row):Row{
 const body=data.body as Row,refs=rows(data.references)
 return {...body,...(Array.isArray(body.items)?{items:body.items.map(item=>{const row=item as Row;return {...row,...(row.product_id?{product_name:refs.find(v=>v.id===row.product_id)?.name}:{}),...(row.material_id?{material_name:refs.find(v=>v.id===row.material_id)?.name}:{})}})}:{})}
}
export function applyErpClient(ctx:Context){
 const store=new ErpCardStore((action,sessionId,body)=>api(action,sessionId,body))
 const metaFor=(view:View):Meta=>({kind:'futurestaff.erp',viewId:view.confirmationViewId??view.viewId,sessionId:view.sessionId,title:view.title})
 const receiptKey=(meta:Meta)=>JSON.stringify([meta.sessionId,meta.viewId])
 const editableForms=new Map<string,View>(),cardReceipts=new Map<string,Meta>()
 const activeMeta=(meta:Meta)=>cardReceipts.get(receiptKey(meta))??meta
 const closeWindow=()=>update();let selected:View|undefined,identityRevision=0;const listeners=new Set<()=>void>();const update=(v?:View)=>{selected=v;if(v)store.adopt(v);listeners.forEach(fn=>fn())}
 function useCardState(meta:Meta):ErpCardState {
  const [,redraw]=useState(0)
  useEffect(()=>store.subscribe(()=>redraw(value=>value+1)),[])
  useEffect(()=>{void store.read(meta)},[meta.sessionId,meta.viewId])
  return store.peek(meta)
 }
 async function open(meta:Meta){const state=await store.read(meta);if(state.view&&state.status!=='expired')update(state.view)}
 async function confirm(meta:Meta){const state=await store.confirm(meta);if(state.status==='succeeded'&&state.view&&selected&&activeMeta(metaFor(selected)).viewId===meta.viewId&&selected.sessionId===meta.sessionId)update(state.view)}
 async function returnToEdit(meta:Meta){const state=await store.read(meta),form=editableForms.get(receiptKey(meta));if(state.status==='pending'&&form)update(form)}
 function StateNotice({state}:{state:ErpCardState}){
  if(state.status==='unconfirmed')return <MessageCardNotice kind="warning">{state.message??'结果待核实，请查询原操作，不要重复提交。'}</MessageCardNotice>
  if(state.status==='expired'||state.status==='failed')return <MessageCardNotice kind={state.status==='expired'?'warning':'error'}>{state.message}</MessageCardNotice>
  if(state.status==='succeeded')return <MessageCardNotice kind={state.view?.conversationUpdated===false?'warning':'success'}>{state.view?.conversationUpdated===false?'业务已保存，原会话暂未收到结果。重试只返回已保存结果。':state.view?.conversationUpdated===true?'已保存，结果已返回原 Agent 会话。':'业务已保存。'}</MessageCardNotice>
  return null
 }
 function Window(){
  const [view,setView]=useState(selected),[busy,setBusy]=useState(false),[error,setError]=useState(''),[,redraw]=useState(0)
  const pending=useRef(false)
  useEffect(()=>{const fn=()=>{setView(selected);setError('')};listeners.add(fn);const unsubscribe=store.subscribe(()=>redraw(value=>value+1));return()=>{listeners.delete(fn);unsubscribe()}},[])
  if(!view)return null
  const meta=activeMeta(metaFor(view)),state=store.peek(meta),locked=busy||state.status==='running',data=view.data as Row,editable=editableForms.get(receiptKey(meta))
  async function act(action:string,body:Row){if(pending.current||store.peek(meta).status==='running')return;const revision=identityRevision;pending.current=true;setBusy(true);setError('');try{const next=await api(action,view!.sessionId,body);if(revision===identityRevision)update(next)}catch(e){if(revision===identityRevision)setError((e as Error).message)}finally{pending.current=false;setBusy(false)}}
  return <InteractionWindow title={view.title} onClose={closeWindow} busy={locked} className="fs-erp-window">
   {state.status==='expired'?<StateNotice state={state}/>:view.kind==='form'?<fieldset className="fs-erp-form-lock" disabled={locked}><ErpOrderForm key={view.viewId} data={view.data as Row} resource={view.resource} onBusyChange={setBusy} onPreview={async input=>{const revision=identityRevision,next=await api('prepare',view.sessionId,{input});if(revision!==identityRevision)return;editableForms.set(receiptKey(metaFor(next)),{...view,data:{...(view.data as Row),draft:input.body}});cardReceipts.set(receiptKey(metaFor(view)),metaFor(next));update(next)}}/></fieldset>:view.kind==='preview'?<>
    <h3>{operations[String(data.operation)]??'业务操作'}</h3><p>{state.status==='running'?'正在执行，请勿重复操作…':state.status==='pending'?'尚未执行，请核对内容后确认。':'以下为原操作预览。'}</p>
    {editable&&state.status==='pending'&&<button disabled={locked} onClick={()=>{void returnToEdit(meta)}}>返回修改</button>}
    <ul>{rows(data.references).map((r,i)=><li key={i}>{String(r.name)}</li>)}</ul><Details data={previewDetails(data)}/>
    {state.status==='pending'&&<button disabled={locked} onClick={()=>{void confirm(meta)}}>确认执行</button>}
    {state.status==='unconfirmed'&&<button disabled={locked} onClick={()=>{void(state.recovery==='readback'?confirm(meta):store.read(meta))}}>{state.recovery==='readback'?'读取已保存结果':'查询原操作'}</button>}
   </>:view.kind==='entity'?<Details data={view.data}/>:<Table data={view.data} {...(!view.resource.includes('/')&&view.resource!=='stock'?{detail:(id:string)=>{void act('query',{input:{resource:view.resource,id}})}}:{})}/>}
   {state.status!=='expired'&&<StateNotice state={state}/>}
   {state.status==='succeeded'&&state.view?.conversationUpdated===false&&<button disabled={locked} onClick={()=>{void confirm(meta)}}>重试返回结果</button>}
   {error&&<p role="alert">{error}</p>}
  </InteractionWindow>
 }
 function LiveBridge(){
  useEffect(()=>{
   let owner='',controller:AbortController|undefined
   const start=()=>{
    const snapshot=ctx.platformClientSession.getSnapshot(),next=['ready','no_apps'].includes(snapshot.phase)?`${snapshot.activeTenantId}:${snapshot.user?.userId}`:''
    if(next===owner)return;owner=next;controller?.abort();update();if(!next)return
    const current=new AbortController();controller=current
    const run=async()=>{while(!current.signal.aborted){try{
     const response=await fetch('/_futurestaff/erp/events',{headers:{'x-futurestaff-erp':'1'},cache:'no-store',signal:current.signal})
     if(!response.ok||!response.body)throw Error('ERP_EVENTS_UNAVAILABLE')
     const reader=response.body.getReader(),decoder=new TextDecoder();let buffer=''
     while(!current.signal.aborted){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});if(buffer.length>20000)throw Error('ERP_EVENT_LIMIT');let end
      while((end=buffer.indexOf('\n\n'))>=0){const message=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!message.startsWith('data: '))continue
       const meta=JSON.parse(message.slice(6)) as Meta
       if(meta.kind!=='futurestaff.erp')continue
       void api('view',meta.sessionId,{viewId:meta.viewId}).then(value=>{
        if(current.signal.aborted)return
        store.adopt(value)
        if(selected&&selected.viewId===value.viewId&&selected.sessionId===value.sessionId&&!['form','preview'].includes(selected.kind))update(value)
       }).catch(()=>{})
      }
     }
    }catch{/* Identity and business error messages remain on the initiating action. */}
    if(!current.signal.aborted)await new Promise<void>(resolve=>{const timer=setTimeout(finish,1500);function finish(){clearTimeout(timer);current.signal.removeEventListener('abort',finish);resolve()};current.signal.addEventListener('abort',finish,{once:true})})
   }}
    void run()
   }
   start();const unsubscribe=ctx.platformClientSession.subscribe(start);return()=>{unsubscribe();controller?.abort()}
  },[])
  return null
 }
 function Card({meta}:{meta:Meta}){
  meta=activeMeta(meta)
  const state=useCardState(meta),view=state.view
  const editable=editableForms.has(receiptKey(meta))
  const statusLabels={loading:'读取中',ready:'待填写',pending:'待确认',running:state.activity==='delivery'?'正在返回结果':state.activity==='readback'?'正在读取结果':'执行中',succeeded:'已完成',failed:'读取未完成',expired:'已过期',unconfirmed:'结果待核实',readonly:'只读结果'}
  const description=state.status==='loading'?'正在验证当前账号权限并读取数据…':state.status==='pending'?'核对业务对象与变更，确认后执行本次操作。':state.status==='running'?state.activity==='delivery'?'正在将已保存结果返回原会话，不会重复写入。':state.activity==='readback'?'正在读取已保存的业务结果。':'正在执行，请勿重复操作…':view?.kind==='form'?'已知信息已带入，请打开开单窗口补全并预览。':state.status==='readonly'?'已读取当前授权范围的数据。':undefined
  return <MessageCard title={meta.title} eyebrow="ERP" status={state.status} statusLabel={statusLabels[state.status]} {...(description?{description}:{})} className="fs-erp-card" busy={state.status==='running'} actions={view&&state.status!=='expired'&&state.status!=='failed'?<>
   {state.status==='pending'&&<MessageCardAction variant="primary" onClick={()=>{void confirm(meta)}}>确认执行</MessageCardAction>}
   {editable&&['pending','running'].includes(state.status)&&<MessageCardAction variant="secondary" onClick={()=>{void returnToEdit(meta)}}>返回修改</MessageCardAction>}
   {state.status==='unconfirmed'&&<MessageCardAction variant="primary" onClick={()=>{void(state.recovery==='readback'?confirm(meta):store.read(meta))}}>{state.recovery==='readback'?'读取已保存结果':'查询原操作'}</MessageCardAction>}
   {state.status==='succeeded'&&view.conversationUpdated===false&&<MessageCardAction variant="primary" onClick={()=>{void confirm(meta)}}>重试返回结果</MessageCardAction>}
   <MessageCardAction variant={view.kind==='form'?'primary':'secondary'} onClick={()=>{void open(meta)}}>{view.kind==='form'?'打开开单窗口':view.kind==='preview'||state.status==='succeeded'?'查看详情':'打开业务窗口'}</MessageCardAction>
  </>:undefined} footer={state.status==='pending'?'仅执行当前预览；后续变更仍需单独确认。':undefined}>
   {view?.kind==='table'&&<Table data={view.data}/>}
   {view?.kind==='preview'&&<div className="fs-erp-message-details"><strong>{operations[String((view.data as Row).operation)]??'业务操作核对'}</strong><ul>{rows((view.data as Row).references).map((reference,index)=><li key={index}>{String(reference.name)}</li>)}</ul><Details data={previewDetails(view.data as Row)}/></div>}
   {state.status==='succeeded'&&view&&<div className="fs-erp-message-details"><Details data={view.data}/></div>}
   <StateNotice state={state}/>
  </MessageCard>
 }
 for(const name of ['call_erp_api','erp_query','erp_order_form','erp_prepare_action'])ctx.slots.inject('tool.call.toolview',()=>ctx.slots.register({name:'tool.call.toolview',key:name},(props:ToolCallViewProps)=>{
  const root=props.block
  if(!('kind' in root)||root.kind!=='tool-result')return <p>正在读取 ERP 业务数据…</p>
  if(root.isError)return <p role="alert">操作未完成，请检查权限与业务状态。</p>
  let meta=erpCardMeta(root.meta)
  if(meta?.kind!=='futurestaff.erp')for(const block of root.content){if(block.type!=='text')continue;try{const value=JSON.parse(block.text) as Meta;if(value.kind==='futurestaff.erp'){meta=value;break}}catch{}}
  return meta?.kind==='futurestaff.erp'?<Card meta={meta}/>:<p>业务结果已返回，请查看对话中的说明。</p>
 }))
 if(typeof ctx.inject==='function')ctx.inject(['uiConversation'],scope=>{
  scope.effect(()=>scope.uiConversation.events.register(erpCardDefinition))
  ctx.slots.inject('conversation.chat.turnTail',()=>ctx.slots.register({name:'conversation.chat.turnTail',priority:-85,select:(owner:{turn:{data:{get(key:'futurestaff-erp-cards'):{items:ErpGalleryItem[]}|undefined}};seq:number})=>latestErpCard(owner.turn.data.get('futurestaff-erp-cards')?.items??[],owner.seq)},(props:{matched:Meta})=><Card meta={props.matched}/>))
 })
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'futurestaff-erp-window',order:20},Window))
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'futurestaff-erp-view-events',order:19},LiveBridge))
 if(typeof document==='undefined')return
 ctx.effect(()=>{
  const session=ctx.platformClientSession
  if(!session?.getSnapshot)return()=>{}
  const owner=()=>{const value=session.getSnapshot();return ['ready','no_apps'].includes(value.phase)?`${value.activeTenantId}:${value.user?.userId}`:''}
  let current=owner()
  const unsubscribe=session.subscribe(()=>{const next=owner();if(next!==current){current=next;identityRevision++;editableForms.clear();cardReceipts.clear();store.resetIdentity();update()}})
  return()=>{unsubscribe();identityRevision++;editableForms.clear();cardReceipts.clear();store.resetIdentity();update()}
 },'ERP message identity lifecycle')
 const style=document.createElement('style');style.textContent=interactionCss+erpOrderFormCss+`.fs-erp-window{color:var(--text-primary);background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:12px;padding:18px}.fs-erp-window header{display:flex;justify-content:space-between;align-items:center;gap:16px}.fs-erp-window button{padding:8px 12px;border:1px solid var(--border-default);border-radius:7px;background:var(--bg-tertiary);color:var(--text-primary);cursor:pointer}.fs-erp-window button:disabled{opacity:.5;cursor:default}.fs-erp-window p,.fs-erp-window dt{color:var(--text-secondary)}.fs-erp-backdrop{position:fixed;inset:0;z-index:90;display:flex;justify-content:flex-end;background:color-mix(in srgb,var(--bg-primary) 65%,transparent)}.fs-erp-window{width:min(850px,100vw);height:100%;overflow:auto;border-radius:12px 0 0 12px}.fs-erp-scroll{overflow:auto}.fs-erp-scroll table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:13px}.fs-erp-scroll td,.fs-erp-scroll th{padding:10px;border-bottom:1px solid var(--border-default);text-align:left}.fs-erp-scroll th{background:var(--bg-tertiary)}.fs-erp-form-lock{border:0;padding:0;margin:0;min-width:0}.fs-erp-form{display:grid;gap:16px}.fs-erp-form label{display:grid;gap:6px}.fs-erp-form input,.fs-erp-form select,.fs-erp-form textarea{width:100%;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border-default);padding:9px;border-radius:7px}.fs-erp-line{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;align-items:end}.fs-erp-message-details{min-width:0}.fs-erp-message-details>strong{display:block;margin-bottom:8px}.fs-erp-message-details ul{margin:0 0 12px;padding-left:20px;color:var(--text-secondary)}.fs-erp-message-details dl,.fs-erp-window dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fs-erp-message-details dl>div{min-width:0}.fs-erp-message-details dt{color:var(--text-secondary);font-size:12px}.fs-erp-message-details dd{margin:4px 0;overflow-wrap:anywhere}.fs-erp-window dd{margin:4px 0;overflow-wrap:anywhere}.fs-erp-window [role=alert]{color:var(--error)}.fs-erp-window :focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}@media(max-width:650px){.fs-erp-line{grid-template-columns:1fr 1fr}.fs-erp-window dl,.fs-erp-message-details dl{grid-template-columns:1fr}}`;document.head.append(style);ctx.effect(()=>()=>{style.remove();update();listeners.clear()},'ERP interaction lifecycle')
}
