import {parseSemanticReceipt,semanticValue} from '../../../plugins/fs-platform-access/src/semantics.js'

export function SemanticCard({value}:{value:unknown}){
 let receipt;try{receipt=parseSemanticReceipt(value)}catch{return <p role="alert">指标结果无法确认，请重新查询。</p>}
 return <article className="semantic-card" aria-label="业务指标结果">
  <p className="eyebrow">合成电商案例 · 业务服务计算</p><h3>{receipt.definition.title}</h3>
  {receipt.coverage==='incomplete_sample'&&<p role="note">样本覆盖不足，以下仅为可见记录汇总，不能代表该月经营值。</p>}
  <p className="semantic-value">{semanticValue(receipt.total)}</p>
  <p>{receipt.period} · {receipt.timezone}</p><p className="muted">截至 {receipt.as_of}</p>
  <p className="muted">{receipt.coverage_note}</p>
  {receipt.groups.length>0&&<dl>{receipt.groups.map(group=><div key={group.channel}><dt>{group.channel}</dt><dd>{semanticValue(group)}</dd></div>)}</dl>}
  <details><summary>口径、快照与明细</summary><dl><dt>定义版本</dt><dd>{receipt.definition.version_id}</dd><dt>数据快照</dt><dd>{receipt.dataset_hash}</dd><dt>查询编号</dt><dd>{receipt.query_id}</dd></dl>
   {receipt.rows.length>0&&<div className="semantic-table"><table><thead><tr>{Object.keys(receipt.rows[0]!).map(key=><th key={key}>{({order_id:'订单',refund_id:'退款',customer_id:'客户',channel:'渠道',paid_fen:'支付（分）',amount_fen:'退款（分）',completed_at:'退款完成',paid_at:'支付时间',created_at:'创建时间',freight_fen:'运费（分）',unit_price_fen:'商品单价（分）',quantity:'数量',event_kind:'流水类型'} as Record<string,string>)[key]??key}</th>)}</tr></thead><tbody>{receipt.rows.map((row,index)=><tr key={index}>{Object.keys(receipt.rows[0]!).map(key=><td key={key}>{String(row[key]??'—')}</td>)}</tr>)}</tbody></table></div>}
   {receipt.next_offset!==null&&<p>还有明细，可让助手从第 {receipt.next_offset+1} 条继续查询。</p>}
  </details>
 </article>
}
