import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
const compiled=await build({stdin:{contents:`import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server.browser';import {SemanticCard} from './src/semantic-card.tsx';export const render=value=>renderToStaticMarkup(createElement(SemanticCard,{value}));`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
const {render}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const id='10000000-0000-4000-8000-000000000001',hash='a'.repeat(64)
const receipt={contract_version:'1.0.0',query_id:id,capability:'ecommerce-demo.query.v1',metric_key:'payment-inflow',definition:{id,version_id:id,content_hash:hash,title:'当期支付金额'},binding:{id,version:1,validation_hash:hash},dataset_hash:hash,period:'2026-10',timezone:'Asia/Shanghai',as_of:'2026-11-10T23:59:59+08:00',coverage:'sample_slice',coverage_note:'合成交易切片，非整月经营全量',total:{raw:453300,unit:'fen'},groups:[],rows:[{order_id:'EC-SYNTHETIC-1',paid_fen:100}],next_offset:null}
test('shipped card displays authoritative raw values, traceability and evidence without model prose',()=>{
 const html=render(receipt);assert.ok(html.includes('¥4,533.00'));assert.ok(html.includes('EC-SYNTHETIC-1'));assert.ok(html.includes('合成交易切片'));assert.ok(html.includes(id));assert.ok(html.includes(hash))
 const ratio=render({...receipt,total:{raw:null,unit:'ratio',numerator:9,denominator:18}});assert.ok(ratio.includes('50%（9/18）'))
})
test('incomplete coverage is visible and malformed values never become a zero card',()=>{
 assert.ok(render({...receipt,coverage:'incomplete_sample'}).includes('不能代表该月经营值'))
 assert.ok(render({...receipt,total:{raw:4.5,unit:'fen'}}).includes('指标结果无法确认'))
})
