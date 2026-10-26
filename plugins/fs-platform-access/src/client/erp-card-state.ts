export interface ErpCardMeta {kind:string;viewId:string;sessionId:string;title:string}
export interface ErpCardView {
 viewId:string;sessionId:string;kind:string;title:string;resource:string;data:unknown
 conversationUpdated?:boolean;confirmationViewId?:string
}
export type ErpCardStatus='loading'|'ready'|'pending'|'running'|'succeeded'|'failed'|'expired'|'unconfirmed'|'readonly'
export interface ErpCardState {
 status:ErpCardStatus;view?:ErpCardView;message?:string;recovery?:'readback'
 activity?:'confirm'|'delivery'|'readback'
}
export class ErpCardError extends Error {
 constructor(readonly code:string,message:string){super(message);this.name='ErpCardError'}
}
type Entry={state:ErpCardState;pending?:Promise<ErpCardState>}
type Request=(action:'view'|'confirm',sessionId:string,body:{viewId:string})=>Promise<ErpCardView>
const key=(meta:ErpCardMeta)=>JSON.stringify([meta.sessionId,meta.viewId])
const expired=():ErpCardState=>({status:'expired',message:'登录身份或业务权限已变化，请在当前会话重新查询。'})
const terminalCodes=new Set(['ERP_VIEW_EXPIRED','ERP_STATE_CHANGED','ERP_PERMISSION_DENIED','ERP_AUTH_REQUIRED','ERP_RECORD_UNAVAILABLE'])

/** One receipt owns one action lock across the chat card and its detail drawer. */
export class ErpCardStore {
 private entries=new Map<string,Entry>()
 private invalid=new Set<string>()
 private listeners=new Set<()=>void>()
 private epoch=0
 constructor(private request:Request){}
 subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private publish(){for(const listener of this.listeners)listener()}
 private entry(meta:ErpCardMeta):Entry {
  const id=key(meta);let entry=this.entries.get(id)
  if(!entry){entry={state:this.invalid.has(id)?expired():{status:'loading'}};this.entries.set(id,entry)}
  return entry
 }
 peek(meta:ErpCardMeta){return this.entry(meta).state}
 resetIdentity(){
  this.epoch++
  for(const id of this.entries.keys())this.invalid.add(id)
  this.entries.clear();this.publish()
 }
 adopt(view:ErpCardView){
  const meta={kind:'futurestaff.erp',viewId:view.confirmationViewId??view.viewId,sessionId:view.sessionId,title:view.title}
  if(this.invalid.has(key(meta)))return
  const entry=this.entry(meta)
  if(entry.pending||entry.state.status==='unconfirmed'||entry.state.status==='succeeded')return
  entry.state=this.accept(view);this.publish()
 }
 private accept(view:ErpCardView):ErpCardState {
  return {status:view.conversationUpdated!==undefined?'succeeded':view.kind==='preview'?'pending':view.kind==='form'?'ready':'readonly',view}
 }
 private checked(view:ErpCardView,meta:ErpCardMeta){
  if(!view||view.sessionId!==meta.sessionId||typeof view.viewId!=='string'||typeof view.kind!=='string')throw new ErpCardError('ERP_VIEW_EXPIRED','业务结果与当前会话不符，请重新查询。')
  return view
 }
 async read(meta:ErpCardMeta):Promise<ErpCardState>{
  const entry=this.entry(meta)
  if(this.invalid.has(key(meta)))return entry.state
  if(entry.pending)return entry.pending
  const epoch=this.epoch,previous=entry.state
  const pending=(async()=>{
   try{
    const view=this.checked(await this.request('view',meta.sessionId,{viewId:meta.viewId}),meta)
    if(epoch===this.epoch){
     // The read endpoint returns the saved entity without the confirmation
     // endpoint's receipt/delivery metadata. A read cannot revoke that fact.
     if(previous.status==='succeeded')entry.state=view.kind==='preview'?previous:{...previous,view:{...view,
      ...(previous.view?.confirmationViewId!==undefined?{confirmationViewId:previous.view.confirmationViewId}:{}),
      ...(previous.view?.conversationUpdated!==undefined?{conversationUpdated:previous.view.conversationUpdated}:{}),
     }}
     else entry.state=previous.status==='unconfirmed'&&view.kind==='preview'?previous:this.accept(view)
    }
   }catch(error){if(epoch===this.epoch){const failure=error instanceof Error?error:Error('业务结果读取失败。');entry.state=failure instanceof ErpCardError&&terminalCodes.has(failure.code)?{status:'expired',message:failure.message}:previous.status==='unconfirmed'||previous.status==='succeeded'?{...previous,message:failure.message}:{status:'failed',message:failure.message}}}
   finally{delete entry.pending;if(epoch===this.epoch)this.publish()}
   return epoch===this.epoch?entry.state:expired()
  })()
  entry.pending=pending;return pending
 }
 async confirm(meta:ErpCardMeta):Promise<ErpCardState>{
  const entry=this.entry(meta)
  if(entry.pending)return entry.pending
  if(this.invalid.has(key(meta)))return entry.state
  const previous=entry.state,delivery=previous.status==='succeeded'&&previous.view?.conversationUpdated===false
  const readback=previous.status==='unconfirmed'&&previous.recovery==='readback'
  if(!delivery&&!readback&&!(previous.status==='pending'&&previous.view?.kind==='preview'))return previous
  const epoch=this.epoch
  entry.state={...previous,status:'running',activity:delivery?'delivery':readback?'readback':'confirm'};this.publish()
  const pending=(async()=>{
   try{
    const view=this.checked(await this.request('confirm',meta.sessionId,{viewId:meta.viewId}),meta)
    if(view.kind==='preview'||view.kind==='form')throw new ErpCardError('ERP_RESULT_UNCONFIRMED','提交结果待核实，请查询原操作，不要重复提交。')
    if(epoch===this.epoch)entry.state={status:'succeeded',view}
   }catch(error){if(epoch===this.epoch){
    const failure=error instanceof Error?error:Error('执行结果待核实。'),code=failure instanceof ErpCardError?failure.code:''
    if(terminalCodes.has(code))entry.state={status:'expired',message:failure.message}
    else if(delivery)entry.state={...previous,message:'业务已保存，结果暂未返回原会话。可重试返回结果。'}
    else entry.state={status:'unconfirmed',...(previous.view?{view:previous.view}:{}),message:code==='ERP_READBACK_PENDING'?'业务已经保存，结果暂未读回。读取原结果不会重复写入。':'执行结果待核实。请查询原操作，不要重复提交。',...(code==='ERP_READBACK_PENDING'?{recovery:'readback' as const}:{})}
   }}finally{delete entry.pending;if(epoch===this.epoch)this.publish()}
   return epoch===this.epoch?entry.state:expired()
  })()
  entry.pending=pending;return pending
 }
}
