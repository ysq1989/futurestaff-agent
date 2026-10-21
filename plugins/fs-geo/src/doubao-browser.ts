import {mkdir} from 'node:fs/promises';
import type {BrowserContext,Page} from 'playwright-core';
import type {CollectionDriver,CollectionJob} from './assistant.js';
const rootUrl='https://www.doubao.com/chat/';
const markerSelector='[data-testid="receive_message"] [data-testid="message_text_content"] span.container-sWvQla';
interface Source {role:'CITED'|'RETRIEVED'|'TEXT_URL';url:string;title:string;marker:string|null}
type EvidenceScreenshot={role:'ANSWER'|'SOURCES';base64:string};
/** Keep a bounded prefix for an explicit incomplete receipt; never call it complete evidence. */
export function appendEvidenceScreenshots(target:EvidenceScreenshot[],frames:EvidenceScreenshot[]){
 let bytes=target.reduce((n,s)=>n+s.base64.length,0);
 for(const frame of frames){if(target.length>=16||bytes+frame.base64.length>8_000_000)throw Error('SCREENSHOT_COVERAGE_LIMIT');target.push(frame);bytes+=frame.base64.length;}
}
export function visibleQuestionEqual(a:string|null|undefined,b:string){
 const normalize=(text:string)=>text.replace(/\u00a0/g,' ').replace(/(?<=[\p{Script=Han}])\s+(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])\s+(?=[\p{Script=Han}])/gu,'').replace(/\s+/g,' ').trim();
 return a!==null&&a!==undefined&&normalize(a)===normalize(b);
}
function scrollConversation(y:number){let e=document.querySelector<HTMLElement>('[data-testid="message-list"]');while(e){if(e.scrollHeight>e.clientHeight+10&&/auto|scroll/.test(getComputedStyle(e).overflowY)){e.scrollTop=y;return;}e=e.parentElement;}window.scrollTo(0,y);}
export function evidenceVisible(kind:'ANSWER'|'SOURCES'){
 const selector=kind==='ANSWER'?'[data-testid="receive_message"] [data-testid="message_text_content"]':'[data-testid="receive_message"] a[href]';
 return [...document.querySelectorAll<HTMLElement>(selector)].filter(e=>kind==='ANSWER'||!e.closest('[data-testid="message_text_content"]')).some(e=>{const r=e.getBoundingClientRect(),top=Math.max(40,r.top),bottom=Math.min(innerHeight-40,r.bottom),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right);if(bottom<=top||right<=left)return false;const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);return !!hit&&e.contains(hit);});
}
/** DOM-only observation of one fresh conversation; never reads application state, cookies or network APIs. */
export function observeDoubao(){
 const messages=[...document.querySelectorAll<HTMLElement>('[data-testid="receive_message"]')];
 const sent=[...document.querySelectorAll<HTMLElement>('[data-testid="send_message"]')];
 const message=messages.length===1?messages[0]:null,body=message?.querySelector<HTMLElement>('[data-testid="message_text_content"]');
 const links=[...(message?.querySelectorAll<HTMLAnchorElement>('a[href]')??[])].filter(e=>e.getClientRects().length>0).map(e=>({href:e.getAttribute('data-copy-href')??e.href,title:e.innerText,body:!!e.closest('[data-testid="message_text_content"]')}));
 const copy=message?.querySelector('[data-testid="message_action_copy"]'),bar=copy?.closest('[data-testid="message_action_bar"]');
 const source=[...(message?.querySelectorAll<HTMLElement>('[data-copy-ignore]')??[])].map(e=>e.innerText).find(t=>/^搜索\s*\d+\s*个关键词[，,]\s*参考\s*\d+\s*篇资料$/.test(t));
 return {question:sent.length===1?sent[0].querySelector<HTMLElement>('[data-testid="message_text_content"]')?.innerText??sent[0].innerText:null,
  answer:body?.innerText??'',messageCount:messages.length,userCount:sent.length,mode:document.querySelector<HTMLElement>('[data-testid="chat_input_action_model"]')?.innerText??'',
  completed:!!bar&&Number(getComputedStyle(bar).opacity)>0,
  sourceText:source??null,links,markerCount:body?.querySelectorAll('span.container-sWvQla').length??0,
  unrecognizedCitationControls:[...(body?.querySelectorAll<HTMLElement>('button,[role="button"],a:not([title="autolink"]),span')??[])].filter(e=>e.innerText.trim()&&!e.matches('span.container-sWvQla')&&!e.closest('a[title="autolink"]')).length};
}
function safeUrl(value:string){try{let u=new URL(value);if(u.hostname==='link.wtturl.cn'&&u.searchParams.has('target'))u=new URL(u.searchParams.get('target')!);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.href.length>2000)return null;return u.href;}catch{return null;}}
const delay=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{signal.throwIfAborted();const done=()=>{signal.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,ms);const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason??Error('ABORTED'));};signal.addEventListener('abort',abort,{once:true});});
export class DoubaoBrowser implements CollectionDriver {
 private context?:BrowserContext;private page?:Page;
 private citation?:{resolve:(url:string|null)=>void;url?:string;page?:Page};
 private opening?:Promise<Page>;private generation=0;
 constructor(private directory:string,private createContext?:()=>Promise<BrowserContext>){}
 private async prepare(signal:AbortSignal){
  signal.throwIfAborted();if(this.context&&this.page&&!this.page.isClosed())return this.page;
  if(this.opening)return this.opening;
  const generation=this.generation,pending=this.launch(signal,generation);this.opening=pending;
  try{return await pending;}finally{if(this.opening===pending)this.opening=undefined;}
 }
 private async launch(signal:AbortSignal,generation:number){
  await mkdir(this.directory,{recursive:true,mode:0o700});
  // The release build copies the pinned official runtime beside this bundle. No personal Chrome profile is read.
  if(this.createContext)this.context=await this.createContext();
  else{const runtime=await import(new URL('./runtime/playwright-1.64.1/index.mjs',import.meta.url).href) as typeof import('playwright-core');this.context=await runtime.chromium.launchPersistentContext(this.directory,{channel:'chrome',headless:false,viewport:{width:1280,height:900},locale:'zh-CN',acceptDownloads:false});}
  const context=this.context;this.page=context.pages()[0]??await context.newPage();
  if(signal.aborted||generation!==this.generation){await context.close();signal.throwIfAborted();throw Error('EXECUTION_INTERRUPTED');}
  context.on('page',popup=>{const pending=this.citation;void (async()=>{
   if(!pending||await popup.opener()!==this.page||this.citation!==pending)return;
   if(pending.page&&pending.page!==popup){pending.resolve(null);return;}
   pending.page=popup;if(pending.url){pending.resolve(pending.url);await popup.close().catch(()=>{});}
  })().catch(()=>pending?.resolve(null));});
  await context.route('**/*',async route=>{try{
   const request=route.request();
   if(request.isNavigationRequest()){
    const u=new URL(request.url());
    if(u.origin!=='https://www.doubao.com'){
     // Initial popup navigation may have no Frame yet. Bind its target to the
     // ensuing Page/opener event; never infer ownership from a missing Frame.
     let frame;try{frame=request.frame();}catch{/* popup before Frame creation */}
     if(frame?.parentFrame()){await route.fallback();return;}
     const pending=this.citation,value=safeUrl(u.href);
     if(pending&&value&&(!frame||frame.page()!==this.page)){
      pending.url=value;if(pending.page&&(!frame||frame.page()===pending.page)){pending.resolve(value);void pending.page.close().catch(()=>{});}
     }
     await route.abort().catch(()=>{});return;
    }
   }
   await route.fallback();
  }catch{await route.abort().catch(()=>{});}});
  signal.throwIfAborted();return this.page;
 }
 async open(signal:AbortSignal){const page=await this.prepare(signal);if(!page.url().startsWith(rootUrl))await page.goto(rootUrl,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('div[contenteditable="true"]').waitFor({state:'visible',timeout:20000}).catch(()=>{});signal.throwIfAborted();
  const mode=await page.getByTestId('chat_input_action_model').innerText({timeout:3000}).catch(()=>'');
  const captcha=await page.locator('iframe[src*="captcha"]').count(),account=await page.getByTestId('sidebar_footer_setting_entry').count();
  return {state:captcha?'CAPTCHA':mode&&account?'READY':'NEEDS_LOGIN',mode:mode||null,message:mode&&account?'豆包窗口已打开；采集时会新建对话。':'请在专用豆包窗口自行完成登录，再执行原任务。'};
 }
 private async screenshots(page:Page,role:'ANSWER'|'SOURCES',signal:AbortSignal){
  const frames:{role:typeof role;base64:string}[]=[];
  const range=await page.evaluate(kind=>{let e=document.querySelector<HTMLElement>('[data-testid="message-list"]');while(e&&!(e.scrollHeight>e.clientHeight+10&&/auto|scroll/.test(getComputedStyle(e).overflowY)))e=e.parentElement;const viewport=e?.clientHeight??innerHeight,height=e?.scrollHeight??document.documentElement.scrollHeight;
   if(kind==='SOURCES'){const links=[...document.querySelectorAll<HTMLAnchorElement>('[data-testid="receive_message"] a[href]')].filter(a=>!a.closest('[data-testid="message_text_content"]')&&a.getClientRects().length);if(links.length){const origin=e?.getBoundingClientRect().top??0,scroll=e?.scrollTop??scrollY;return {start:Math.max(0,links[0].getBoundingClientRect().top-origin+scroll-60),height:Math.min(height,links[links.length-1].getBoundingClientRect().bottom-origin+scroll+30),viewport};}}
   return {start:0,height,viewport};},role);
  if(!range.viewport||Math.ceil((range.height-range.start)/Math.max(100,range.viewport-120))>12)throw Error('SCREENSHOT_COVERAGE_LIMIT');
  for(let offset=range.start;offset<range.height;offset+=Math.max(100,range.viewport-120)){
   signal.throwIfAborted();await page.evaluate(scrollConversation,offset);
   if(!await page.evaluate(evidenceVisible,role))throw Error('EVIDENCE_OBSCURED');
   const clip=await page.evaluate(()=>{const sidebar=document.querySelector<HTMLElement>('[data-testid="flow_chat_sidebar"]');if(!sidebar)return null;const x=Math.ceil(Math.max(0,sidebar.getBoundingClientRect().right));if(innerWidth-x<400)return null;return {x,y:0,width:innerWidth-x,height:innerHeight};});if(!clip)throw Error('SCREENSHOT_LAYOUT_UNKNOWN');
   // Preserve the actual rendered viewport. No DOM hiding, image resizing or silent clipping of long answers.
   const bytes=await page.screenshot({type:'png',clip,animations:'disabled'});if(bytes.length>524288)throw Error('SCREENSHOT_LIMIT');frames.push({role,base64:bytes.toString('base64')});
   if(offset+range.viewport>=range.height)break;
  }return frames;
 }
 async collect(job:CollectionJob,beforeSubmit:()=>Promise<void>,signal:AbortSignal){
  let submitted=false;const screenshots:{role:'ANSWER'|'SOURCES';base64:string}[]=[];
  const result:Record<string,unknown>={state:'UNKNOWN',question:job.question,mode:job.conditions.mode,language:'zh-CN',memoryState:'UNKNOWN',sourceUrl:rootUrl,observedAt:new Date().toISOString(),answer:'',answerComplete:false,searchState:'UNKNOWN',citationState:'UNKNOWN',sources:[],adapterVersion:'doubao-web-v1'};
  try{
   const ready=await this.open(signal);if(ready.state!=='READY')return {...result,state:ready.state,errorCode:ready.state};
   const page=this.page!;await page.getByRole('button',{name:/^新对话/}).click({timeout:20000});await page.locator('div[contenteditable="true"]').waitFor({state:'visible',timeout:20000});await page.getByTestId('send_message').waitFor({state:'hidden',timeout:20000});await page.getByTestId('receive_message').waitFor({state:'hidden',timeout:20000});await page.getByTestId('chat_input_action_model').waitFor({state:'visible',timeout:30000});
   const start=await page.evaluate(observeDoubao);if(start.userCount||start.messageCount)throw Error('NEW_CONVERSATION_NOT_VERIFIED');
   if(start.mode!==job.conditions.mode)throw Error('MODE_NOT_VERIFIED');
   await page.locator('div[contenteditable="true"]').fill(job.question);const send=page.getByTestId('chat_input_send_button');await send.waitFor({state:'visible',timeout:10000});if(!await send.isEnabled())throw Error('SEND_NOT_READY');await beforeSubmit();signal.throwIfAborted();submitted=true;await send.click({timeout:10000});
   const until=Date.now()+240000;let last='',stable=0,observation,seenQuestion=false;
   while(Date.now()<until){signal.throwIfAborted();observation=await page.evaluate(observeDoubao);
    const echo=observation.question;
    if(visibleQuestionEqual(echo,job.question))seenQuestion=true;
    if(observation.userCount>1||observation.messageCount>1||seenQuestion&&echo&&!visibleQuestionEqual(echo,job.question))throw Error('CONVERSATION_CHANGED');
    if(observation.mode&&observation.mode!==job.conditions.mode)throw Error('MODE_CHANGED');
    stable=observation.answer&&observation.answer===last&&observation.completed?stable+1:0;last=observation.answer;
    if(stable>=3)break;await delay(1500,signal);
   }
   if(!observation||stable<3||!/^https:\/\/www\.doubao\.com\/chat\/\d+$/.test(page.url()))throw Error('ANSWER_INCOMPLETE');
   await page.evaluate(scrollConversation,0);await page.getByTestId('send_message').waitFor({state:'visible',timeout:10000});const confirmed=await page.evaluate(observeDoubao);
   if(!visibleQuestionEqual(confirmed.question,job.question))throw Error('CONVERSATION_CHANGED');
   if(confirmed.question!.length>4000)throw Error('QUESTION_ECHO_LIMIT');result.questionEcho=confirmed.question;
   if(observation.answer.length>100000)throw Error('ANSWER_LIMIT');
   Object.assign(result,{answer:observation.answer,sourceUrl:page.url(),observedAt:new Date().toISOString()});
   appendEvidenceScreenshots(screenshots,await this.screenshots(page,'ANSWER',signal));
   let sourcesExpanded=false;
   if(observation.sourceText){await page.getByText(observation.sourceText,{exact:true}).click({timeout:5000});sourcesExpanded=true;observation=await page.evaluate(observeDoubao);}
   const sources:Source[]=observation.links.flatMap(link=>{const url=safeUrl(link.href);return url?[{role:link.body?'TEXT_URL' as const:'RETRIEVED' as const,url,title:link.title.slice(0,1000),marker:null}]:[];});
   const declared=Number(observation.sourceText?.match(/参考\s*(\d+)/)?.[1]??0),retrieved=sources.filter(s=>s.role==='RETRIEVED').length;
   if(sourcesExpanded)appendEvidenceScreenshots(screenshots,await this.screenshots(page,'SOURCES',signal));
   let mapped=0;
   if(observation.markerCount>30)throw Error('CITATION_LIMIT');
   for(let i=0;i<observation.markerCount;i++){
    signal.throwIfAborted();let resolve!:(url:string|null)=>void;const target=new Promise<string|null>(r=>{resolve=r;});
    const timer=setTimeout(()=>resolve(null),3500);this.citation={resolve};
    try{const marker=page.locator(markerSelector).nth(i),title=await marker.innerText();await marker.click({timeout:5000});const url=await target;if(url){mapped++;sources.push({role:'CITED',url,title:title.slice(0,1000),marker:'native-'+(i+1)});}}
    finally{clearTimeout(timer);const popup=this.citation?.page;this.citation=undefined;await popup?.close().catch(()=>{});}
   }
   const finish=await page.evaluate(observeDoubao);if(finish.question&&!visibleQuestionEqual(finish.question,job.question)||finish.answer!==result.answer||finish.mode!==job.conditions.mode)throw Error('CONVERSATION_CHANGED');
   const noneVisible=observation.markerCount===0&&observation.unrecognizedCitationControls===0;
   const mappedAll=observation.markerCount>0&&mapped===observation.markerCount&&observation.unrecognizedCitationControls===0&&sourcesExpanded&&retrieved===declared;
   if(noneVisible&&!screenshots.some(s=>s.role==='SOURCES')&&screenshots[0])appendEvidenceScreenshots(screenshots,[{...screenshots[0],role:'SOURCES'}]);
   if(sources.length>100)throw Error('SOURCE_LIMIT');
   Object.assign(result,{state:'SUCCEEDED',answerComplete:true,searchState:declared>0?'ENABLED':'UNKNOWN',citationState:noneVisible||mappedAll?'COMPLETE':'UNKNOWN',citationObservation:noneVisible?'NONE_VISIBLE':mappedAll?'NATIVE_MARKERS_MAPPED':'UNRESOLVED',sources,screenshots});return result;
   }catch(error){const code=error instanceof Error&&/^[A-Z_]{3,80}$/.test(error.message)?error.message:signal.aborted?'EXECUTION_INTERRUPTED':'BROWSER_UNAVAILABLE';
   const observed=this.page?.url();if(observed&&/^https:\/\/www\.doubao\.com\/chat\/(?:\d+)?$/.test(observed))result.sourceUrl=observed;
   return {...result,state:submitted?'UNKNOWN':'FAILED',answerComplete:false,citationState:'UNKNOWN',screenshots,errorCode:code};
  }
 }
 async close(){this.generation++;const context=this.context;this.context=undefined;this.page=undefined;await context?.close().catch(()=>{});}
}
