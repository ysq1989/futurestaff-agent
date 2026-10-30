import {createElement,Fragment,useEffect,useState,useRef} from 'react'
import type {Context} from '@deepseek-ai/cordis'
import type {ToolCallViewProps} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {ContentBlock} from '@deepseek-ai/dsh-llm'
import {fashionGalleryDefinition,uniqueFashionGallery,galleryToolResult,previewImageTools,type FashionGalleryItem} from './fashion-gallery.js'
import {fashionPreviewCss} from './fashion-preview-style.js'
import {MessageCard,MessageCardAction,MessageCardNotice} from './message-card.js'

/** Images remain session-authorized attachments; renderer never reads local paths. */
export function mountFashionPreviews(ctx:Context){
 ctx.inject(['uiConversation'],scope=>{
 scope.effect(()=>scope.uiConversation.events.register(fashionGalleryDefinition))
 scope.effect(()=>{const style=document.createElement('style');style.dataset.futurestaffFashion='gallery';style.textContent=fashionPreviewCss;document.head.append(style);return()=>style.remove()})
 function FashionPreview({block,sessionId,openFile,toolName}:ToolCallViewProps){
  const settled='kind' in block&&block.kind==='tool-result'?block:undefined
  const content:readonly ContentBlock[]=settled?.content??[]
  const images=content.filter(item=>item.type==='image'),image=images[0],source=images[1]
  let receipt:Record<string,unknown>={}
  try{const text=content.find(item=>item.type==='text');if(text?.type==='text')receipt=JSON.parse(text.text)}catch{}
  const commerce=receipt.previewKind==='commerce'||toolName?.startsWith('commerce_image_')||toolName==='creative_asset_download'
  const [url,setUrl]=useState<string>(),[error,setError]=useState(false)
  const [sourceUrl,setSourceUrl]=useState<string>()
  const [exportState,setExportState]=useState(''),[exporting,setExporting]=useState(false)
  const [revoked,setRevoked]=useState(false),[awaitingIdentity,setAwaitingIdentity]=useState(false),exportPending=useRef(false),generation=useRef(0),available=useRef(false),exportController=useRef<AbortController>()
  const [zoom,setZoom]=useState(false),dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{if(zoom&&url)dialog.current?.showModal();return()=>dialog.current?.close()},[zoom,url])
  const attachment=image?.type==='image'?image.attachment:undefined
  const file=typeof receipt.imagePath==='string'?receipt.imagePath:undefined
  const requestId=typeof receipt.requestId==='string'?receipt.requestId:undefined
  useEffect(()=>{
   let live=true,loaded=false,initialOwner:string|undefined;generation.current++;available.current=false;exportPending.current=false
   setUrl(undefined);setSourceUrl(undefined);setError(false);setRevoked(false);setExportState('');setExporting(false);setZoom(false)
   const session=ctx.platformClientSession
   const owner=()=>{const value=session!.getSnapshot();return ['ready','no_apps'].includes(value.phase)&&value.activeTenantId&&value.user?.userId?`${value.activeTenantId}:${value.user.userId}`:''}
   const invalidate=()=>{
    live=false;generation.current++;available.current=false;exportPending.current=false;exportController.current?.abort()
    setRevoked(true);setAwaitingIdentity(false);setUrl(undefined);setSourceUrl(undefined);setZoom(false);setError(false);setExportState('');setExporting(false)
   }
   const load=()=>{
    if(!live||loaded)return
    loaded=true;available.current=true;setAwaitingIdentity(false)
    if(attachment)scope.uiConversation.imageUrl(sessionId,attachment).then(value=>{if(live)setUrl(value)},()=>{if(live)setError(true)})
    if(source?.type==='image')scope.uiConversation.imageUrl(sessionId,source.attachment).then(value=>{if(live)setSourceUrl(value)},()=>{})
   }
   const observe=()=>{
    if(!live)return
    const current=owner()
    if(initialOwner===undefined){
     // A restored conversation can mount before login restoration completes.
     // Wait without reading bytes; only a later change of an established owner revokes the card.
     if(!current){setAwaitingIdentity(true);return}
     initialOwner=current;load()
    }else if(current!==initialOwner)invalidate()
   }
   const unsubscribe=typeof session?.subscribe==='function'&&typeof session.getSnapshot==='function'?session.subscribe(observe):undefined
   if(typeof session?.getSnapshot==='function')observe();else load()
   return ()=>{live=false;generation.current++;available.current=false;exportPending.current=false;exportController.current?.abort();unsubscribe?.()}
  },[sessionId,requestId,attachment?.attachmentId,source?.attachment.attachmentId])
  const download=async()=>{
   if(exportPending.current||!available.current)return
   exportPending.current=true;const current=generation.current,controller=new AbortController();exportController.current=controller
   setExporting(true);setExportState('')
   try{
    const response=await fetch('/_futurestaff/fashion/export',{method:'POST',headers:{'content-type':'application/json','x-futurestaff-fashion':'1'},body:JSON.stringify({sessionId,requestId}),cache:'no-store',signal:controller.signal})
    if(!response.ok)throw Error('export')
    const result=await response.json() as {path:string};if(current===generation.current&&available.current)setExportState('已下载原图：'+result.path)
   }catch{if(current===generation.current&&available.current)setExportState('下载未完成，请稍后重试；已生成文件仍保留。')}
   finally{if(current===generation.current){exportPending.current=false;exportController.current=undefined;setExporting(false)}}
  }
  const copied=receipt.fidelityMode==='source-crop',failed=Boolean(settled?.isError)||receipt.status==='failed',unconfirmed=!failed&&receipt.status==='unknown',generated=receipt.fidelityMode==='reference-generation'||receipt.model==='futurestaff-image',title=failed?'处理未完成':unconfirmed?'生成结果待确认':!settled?'正在处理素材':typeof receipt.label==='string'?receipt.label:commerce?'电商图片':receipt.imageRole==='on-model'?'模特上身图':attachment?'服装素材':'规格检查'
  const status=failed?'failed':unconfirmed?'unconfirmed':!settled?'running':copied?'readonly':attachment?'pending':'ready'
  const statusLabel=failed?'处理未完成':unconfirmed?'未确认':!settled?'处理中':copied?'原图裁切':attachment?'待审核':'检查完成'
  const failureText=failed?content.filter(item=>item.type==='text').map(item=>item.type==='text'?item.text:'').join('\n'):''
  const actions=!revoked&&!awaitingIdentity&&(file||url)?createElement(Fragment,null,
   commerce&&file?createElement(MessageCardAction,{variant:'primary',className:'fs-fashion-action',onClick:()=>{if(available.current)openFile(file)}},'打开文件'):requestId&&file?createElement(MessageCardAction,{variant:'primary',className:'fs-fashion-action','aria-label':'下载原图',disabled:exporting,onClick:download},exporting?'下载中…':'下载原图'):null,
   url?createElement(MessageCardAction,{className:'fs-fashion-action',onClick:()=>{if(available.current)setZoom(true)}},sourceUrl?'原图对照':'放大预览'):!commerce&&file?createElement(MessageCardAction,{className:'fs-fashion-action',onClick:()=>{if(available.current)openFile(file)}},'打开文件'):null):null
  const footer=revoked||exportState||unconfirmed||failed?createElement(Fragment,null,
   revoked?createElement(MessageCardNotice,{kind:'warning'},'登录身份已变化，请在当前会话重新读取图片成果。'):null,
   exportState?createElement('p',{role:'status',className:'fs-fashion-card__note'},exportState):null,
   unconfirmed?createElement(MessageCardNotice,{kind:'warning'},`原请求 ${typeof receipt.requestId==='string'?receipt.requestId:''} 尚未确认，请查询原请求；不会自动重新生成。`):null,
   failed?createElement(MessageCardNotice,{kind:'error'},createElement('pre',{className:'fs-fashion-card__error'},failureText||'本次处理未完成，请查看原请求状态后再继续。')):null):null
  return createElement('div',{'data-fashion-preview':true,className:'fs-fashion-result'},
   createElement(MessageCard,{title,eyebrow:'图片素材',status:revoked?'expired':awaitingIdentity?'running':status,statusLabel:revoked?'不可访问':awaitingIdentity?'加载中':statusLabel,className:'fs-fashion-card',busy:!revoked&&(!settled||exporting||awaitingIdentity),actions,footer},
   attachment&&!revoked?createElement('button',{type:'button',className:'fs-fashion-card__media',disabled:!url,onClick:()=>{if(available.current)setZoom(true)},'aria-label':'查看生成图片'},url?createElement('img',{src:url,alt:title,onError:()=>{setError(true);setUrl(undefined)}}):createElement('p',{role:error?'alert':'status'},error?'预览暂不可用，原文件已保留':'正在加载预览…')):null,
   attachment?createElement('p',{className:'fs-fashion-card__meta'},createElement('span',null,`${attachment.width} × ${attachment.height}`),createElement('span',null,copied?'来源像素保持':generated?'参考图生成':'图片素材')):null),
   zoom&&url?createElement('dialog',{ref:dialog,className:'fs-fashion-dialog','aria-label':'生成图片预览',onClose:()=>setZoom(false),onCancel:()=>setZoom(false)},
    createElement('div',{className:'fs-fashion-dialog__head'},createElement('strong',null,sourceUrl?'原图与素材对照':title),createElement(MessageCardAction,{onClick:()=>setZoom(false)},'关闭预览')),
    createElement('div',{className:'fs-fashion-dialog__grid'+(sourceUrl?'':' fs-fashion-dialog__grid--single')},
     sourceUrl?createElement('figure',null,createElement('figcaption',null,'商家原图'),createElement('img',{src:sourceUrl,alt:commerce?'商家商品原图':'商家服装原图'})):null,
     createElement('figure',null,createElement('figcaption',null,copied?'原图像素裁切':'生成素材 · 待审核'),createElement('img',{src:url,alt:title}))),
    createElement('p',{className:'fs-fashion-dialog__note'},commerce?'核对商品外观、颜色、结构与文字；使用前请审核。':'核对版型、颜色、腰带、口袋与袖口；尺寸检查不能代替商品保真审核。')):null)
 }
 for(const key of previewImageTools)ctx.slots.inject('tool.call.toolview',()=>ctx.slots.register({name:'tool.call.toolview',key,priority:-100},FashionPreview))
 ctx.slots.inject('conversation.chat.turnTail',()=>ctx.slots.register({name:'conversation.chat.turnTail',priority:-100,select:(owner:{turn:{data:{get(key:'futurestaff-fashion-gallery'):{items:FashionGalleryItem[]}|undefined}};seq:number})=>{
  const items=uniqueFashionGallery(owner.turn.data.get('futurestaff-fashion-gallery')?.items??[],owner.seq)
  return items.length?items:null
 }},(props:ToolCallViewProps & {matched:FashionGalleryItem[]})=>createElement('section',{'aria-label':'本轮图片','data-fashion-gallery':true,className:'fs-fashion-gallery'},
  createElement('header',{className:'fs-fashion-gallery__head'},createElement('h3',null,'本轮图片'),createElement('span',null,`${props.matched.length} 张素材 · 使用前请审核`)),
  createElement('div',{className:'fs-fashion-gallery__grid'},...props.matched.map((item:FashionGalleryItem)=>createElement(FashionPreview,{...props,block:galleryToolResult(item),callId:item.callId,toolName:item.toolName??'fashion_image_generate',key:item.callId}))))) )
 })
}
