import { consentReadyEnvelope } from './desktop-consent-window-contract.ts'
import type { ConsentWindowTarget } from './desktop-consent-window-contract.ts'

/** Fixed owned document. No remote dependencies, preload, storage or general Host API.
 * The short-lived body is confined to this nonpersistent page, never a URL/log/file.
 */
export function consentWindowDocument(target: ConsentWindowTarget, nonce: string): string {
  const json = JSON.stringify(target).replaceAll('<', '\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029')
  return String.raw`<!doctype html><html lang="zh"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; frame-src 'none'; form-action 'none'; base-uri 'none'"><title>本次候选确认</title><style>body{font:16px system-ui;max-width:34rem;margin:3rem auto;padding:1rem;color:#172554}button{font:inherit;padding:.7rem;margin:.5rem}p{line-height:1.6}</style><h1>本次候选确认</h1><p>仅向已核验的平台确认页交接本次必要内容。网页仍需本人核对并确认，交接不代表已提交。</p><p id="status" role="status">准备打开本次确认页</p><button id="open">打开本次平台确认</button><button id="cancel">取消本次交接</button><script nonce="${nonce}">
(()=>{'use strict';
document.currentScript.remove();const config=${json};let body=config.payloadJson;delete config.payloadJson;
let child=null,base=null,phase='opening',port=null;
const report=state=>{document.body.dataset.consentState=state;document.getElementById('status').textContent=({awaiting_web:'等待网页接收本次内容',transferred:'必要内容已交接；尚需网页本人确认',cancelled:'已取消本次本地交接',expired:'本次交接已过期',closed:'确认窗口已关闭',not_connected:'安全窗口关系未建立，交接已关闭'})[state]||'准备打开本次确认页';console.info('futurestaff-consent-state:'+state)};
const stop=state=>{if(phase==='closed')return;phase='closed';body=null;base=null;window.removeEventListener('message',receive);clearTimeout(timer);clearInterval(watch);if(port){port.close();port=null}try{if(child&&!child.closed)child.close()}catch{}report(state)};
const valid=()=>phase!=='closed'&&location.href===config.openerUrl&&Date.now()<Date.parse(config.expiresAt)&&child&&!child.closed;
const fields=['type','channel_id','request_id','target_hash','binding','actor_id','tenant_id','expires_at','max_bytes'];
const readyEnvelope=${consentReadyEnvelope.toString()};
const same=(a,b)=>fields.filter(k=>k!=='type').every(k=>a[k]===b[k]);
const closed=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...fields].sort().join(',');
const ready=v=>readyEnvelope(v,config,Date.now())!==null;
function receive(event){if(!event.isTrusted||event.source!==child)return;if(event.origin!==config.platformOrigin){stop('not_connected');return}try{if(!valid())throw 0;const v=event.data;if(phase==='awaiting_web'){if(event.ports.length||!ready(v))throw 0;base=Object.freeze({...v});phase='offered';child.postMessage({...base,type:'futurestaff.desktop-consent.offer.v1'},config.platformOrigin);return}if(phase!=='offered'||!closed(v)||v.type!=='futurestaff.desktop-consent.connect.v1'||event.ports.length!==1||!same(v,base)||Date.now()>=Date.parse(base.expires_at))throw 0;phase='consumed';window.removeEventListener('message',receive);port=event.ports[0];const payload=body;body=null;if(typeof payload!=='string'||new TextEncoder().encode(payload).byteLength>base.max_bytes||!valid())throw 0;port.postMessage({type:'futurestaff.desktop-consent.payload.v1',channel_id:base.channel_id,request_id:base.request_id,target_hash:base.target_hash,binding:base.binding,payload_json:payload});port.close();port=null;clearTimeout(timer);timer=setTimeout(()=>stop('expired'),Math.max(0,Date.parse(config.expiresAt)-Date.now()));report('transferred')}catch{stop('not_connected')}}
document.getElementById('open').addEventListener('click',event=>{if(!event.isTrusted||phase!=='opening')return;if(Date.now()>=Date.parse(config.expiresAt)){stop('expired');return}document.getElementById('open').disabled=true;child=window.open(config.confirmationUrl,'futurestaff-consent-'+config.requestId);if(!child){stop('not_connected');return}phase='awaiting_web';report(phase)});
document.getElementById('cancel').addEventListener('click',event=>{if(event.isTrusted)stop('cancelled')});
window.addEventListener('message',receive);window.addEventListener('pagehide',()=>stop('closed'),{once:true});
let timer=setTimeout(()=>stop('expired'),Math.max(0,Math.min(60000,Date.parse(config.expiresAt)-Date.now())));
const watch=setInterval(()=>{if(child&&child.closed)stop('closed')},100);report('opening');
})();</script></html>`
}
