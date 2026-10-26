import {useEffect,useRef,useState} from 'react'
import {shopProductImage,type ShopProductCandidate,type ShopRecommendationData} from '../shop-products.js'
import {InteractionWindow} from './interaction.js'
import {MessageCardAction,MessageCardNotice} from './message-card.js'

function ProductImage({product,large=false}:{product:ShopProductCandidate;large?:boolean}){
 const [state,setState]=useState<'loading'|'loaded'|'failed'>('loading'),src=shopProductImage(product.image)
 return <span className={`fs-shop-product-image${large?' fs-shop-product-image-large':''}`}>
  {src&&state!=='failed'?<><img src={src} alt={product.name} loading={large?'eager':'lazy'} decoding="async" referrerPolicy="no-referrer" onLoad={()=>setState('loaded')} onError={()=>setState('failed')}/>{state==='loading'&&<span className="fs-shop-image-status">图片加载中…</span>}</>:<span className="fs-shop-image-status">{src?'图片加载失败':'暂无商品图片'}</span>}
 </span>
}
export function ShopRecommendations({data,onSelect,readOnly=false}:{data:ShopRecommendationData;onSelect:(id:number)=>Promise<boolean>;readOnly?:boolean}){
 const [image,setImage]=useState<ShopProductCandidate>(),[pending,setPending]=useState<number>(),[error,setError]=useState(''),[delivered,setDelivered]=useState(true)
 const selected=data.products.find(product=>product.id===data.selectedProductId)
 const choosing=useRef(false)
 useEffect(()=>{if(readOnly)setError('')},[readOnly])
 async function choose(id:number){if(readOnly||choosing.current)return;choosing.current=true;setPending(id);setError('');try{setDelivered(await onSelect(id))}catch(reason){setError((reason as Error).message)}finally{choosing.current=false;setPending(undefined)}}
 return <div className="fs-shop-recommendations">
  <div className="fs-shop-recommendation-heading"><span>本店已有商品 · 点击图片看大图</span></div>
  {!data.products.length?<p role="status">暂无匹配商品，请调整选品条件后重新查询。</p>:<div className="fs-shop-product-grid" aria-busy={pending!==undefined}>
   {data.products.map((product,index)=><article className="fs-shop-product" data-selected={selected?.id===product.id} key={product.id}>
    <button type="button" className="fs-shop-product-photo" aria-label={`查看${product.name}大图`} onClick={()=>setImage(product)}><ProductImage key={product.image??'missing'} product={product}/></button>
    <div className="fs-shop-product-info">
     <div className="fs-shop-product-meta"><span>候选 {index+1} · 编号 {product.id}</span><span>{product.onSale===true?'已上架':product.onSale===false?'未上架':'上架状态未知'}</span></div>
     <h3>{product.name}</h3>
     <div className="fs-shop-product-facts"><strong>{product.price===null?'价格待核实':`¥${Number(product.price).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:4})}`}</strong><span>{product.stock===null?'库存待核实':`库存 ${product.stock}`}</span></div>
     <p className="fs-shop-product-reason"><span>推荐理由</span>{product.reason}</p>
     <MessageCardAction className="fs-shop-product-select" variant={selected?.id===product.id?'secondary':'primary'} aria-pressed={selected?.id===product.id} disabled={readOnly||pending!==undefined||selected?.id===product.id&&delivered} onClick={()=>{void choose(product.id)}}>{readOnly?(selected?.id===product.id?'历史已选':'历史推荐，仅供查看'):pending===product.id?'正在记录选择…':selected?.id===product.id?(delivered?'✓ 已选中':'重试返回选择'):'选择这款'}</MessageCardAction>
    </div>
   </article>)}
  </div>}
  <p className="fs-shop-selection-status" role="status" aria-live="polite">{readOnly?(selected?`历史已选：${selected.name}（${selected.id}）。`:'这是当时的商品推荐记录。'):selected?`已选：${selected.name}（${selected.id}）。本店已有商品，无需导入。`:'先比较商品，再选择喜欢的一款。选择不会导入或上架商品。'}{!readOnly&&!delivered&&' 选择已记录，但原会话暂未收到，请重试返回选择。'}</p>
  {error&&<MessageCardNotice kind="error">{error}</MessageCardNotice>}
  {image&&<InteractionWindow title={image.name} mode="dialog" className="fs-shop-image-dialog" onClose={()=>setImage(undefined)}><ProductImage key={image.image??'missing'} product={image} large/><p>商品编号 {image.id} · 本店真实商品图片</p></InteractionWindow>}
 </div>
}
export const shopRecommendationCss=`
.fs-shop-recommendations{min-width:0;color:var(--text-primary)}
.fs-shop-recommendation-heading{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.fs-shop-recommendation-heading>span,.fs-shop-product-meta,.fs-shop-product-facts>span{color:var(--text-secondary);font-size:12px}
.fs-shop-product-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:12px}
.fs-shop-product{min-width:0;border:1px solid var(--border-default);border-radius:10px;background:var(--bg-primary);overflow:hidden;display:flex;flex-direction:column}
.fs-shop-product[data-selected=true]{border-color:var(--accent-primary);box-shadow:0 0 0 1px var(--accent-primary)}
.fs-shop-card .fs-shop-product-photo{display:block;width:100%;padding:0;border:0;border-radius:0;background:var(--bg-tertiary);cursor:zoom-in}
.fs-shop-product-image{position:relative;display:flex;width:100%;height:190px;align-items:center;justify-content:center;background:var(--bg-tertiary);overflow:hidden}
.fs-shop-product-image img{display:block;width:100%;height:100%;object-fit:contain}
.fs-shop-image-status{color:var(--text-secondary);font-size:13px;padding:12px;text-align:center}
.fs-shop-product-image img+.fs-shop-image-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg-tertiary)}
.fs-shop-product-info{padding:12px;display:flex;flex-direction:column;gap:10px;flex:1;min-width:0}
.fs-shop-product-meta,.fs-shop-product-facts{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.fs-shop-product-info h3{font-size:14px;line-height:1.5;margin:0;overflow-wrap:anywhere;font-weight:600}
.fs-shop-product-facts strong{font-size:19px;font-variant-numeric:tabular-nums}
.fs-shop-card .fs-shop-product-reason{font-size:13px;line-height:1.65;margin:0 0 2px;overflow-wrap:anywhere}
.fs-shop-product-reason>span{display:block;font-size:12px;color:var(--text-secondary);margin-bottom:2px}
.fs-shop-card .fs-shop-product-select{margin-top:auto;min-height:40px;width:100%;font-weight:600}
.fs-shop-card .fs-shop-product-select[aria-pressed=true]{color:var(--accent-primary);border-color:var(--accent-primary);background:color-mix(in srgb,var(--accent-primary) 9%,var(--bg-primary));opacity:1}
.fs-shop-card button:disabled{cursor:default;opacity:.65}.fs-shop-card :focus-visible{outline:2px solid var(--accent-primary);outline-offset:-3px}
.fs-shop-selection-status{margin:14px 0 0;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.fs-shop-recommendations [role=alert]{color:var(--error)}
.fs-shop-image-dialog .fs-shop-product-image-large{height:min(65vh,620px);margin-top:12px}.fs-shop-image-dialog p{font-size:13px;color:var(--text-secondary)}
@media(max-width:480px){.fs-shop-product-image{height:220px}.fs-shop-product-grid{grid-template-columns:1fr}.fs-shop-product-info{padding:14px}}
`
