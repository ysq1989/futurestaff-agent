import test from 'node:test'
import assert from 'node:assert/strict'
import {AigcLauncher} from '../src/aigc-launch.ts'

const callback=state=>'https://aigc.fsstory.net/oauth/callback/futurestaff?code='+('c'.repeat(43))+'&state='+state
const challenge=(state='s'.repeat(43))=>({appId:'aigc',clientId:'futurestaff-aigc-prod',redirectUri:'https://aigc.fsstory.net/oauth/callback/futurestaff',state,codeChallenge:'h'.repeat(43),codeChallengeMethod:'S256',successPath:'/create'})
function fixture(native=false){
 let identity={tenantId:'tenant-a',memberId:'member-a',epoch:1},clock=1000,resolve,reply
 const sent=[],calls=[],navigation=[],statuses=[],child={closed:false,postMessage:(data,origin)=>sent.push({data,origin})}
 const launcher=new AigcLauncher({identity:()=>identity,native:()=>native,open:(url,isNative)=>{navigation.push({url,native:isNative});return isNative?undefined:child},sendNative:data=>sent.push({data,native:true}),authorize:async(body,signal)=>{calls.push({body,signal});if(resolve==='delayed')return await new Promise(r=>resolve=r);if(reply instanceof Error)throw reply;return reply??{callbackUrl:callback(body.state)}},status:(state,message)=>statuses.push({state,message}),now:()=>clock})
 const start=()=>launcher.start(),browser=data=>launcher.receiveBrowser({origin:'https://aigc.fsstory.net',source:child,data})
 return{launcher,child,sent,calls,navigation,statuses,start,browser,setIdentity:value=>identity=value,setClock:value=>clock=value,setReply:value=>reply=value,delay:()=>resolve='delayed',release:()=>resolve({callbackUrl:callback('s'.repeat(43))})}
}

test('browser opens the full AIGC handoff and only its exact child can authorize once',async()=>{
 const f=fixture(),id=f.start(),message={type:'fs:aigc-sso-challenge',version:1,launchId:id,challenge:challenge()}
 assert.equal(new URL(f.navigation[0].url).origin+new URL(f.navigation[0].url).pathname,'https://aigc.fsstory.net/auth/agent-entry')
 assert.equal(new URLSearchParams(new URL(f.navigation[0].url).hash.slice(1)).get('launchId'),id)
 assert.equal(await f.launcher.receiveBrowser({origin:'https://evil.test',source:f.child,data:message}),false)
 assert.equal(await f.launcher.receiveBrowser({origin:'https://aigc.fsstory.net',source:{},data:message}),false)
 assert.equal(await f.browser({...message,launchId:'another'}),false)
 assert.equal(await f.browser(message),true);assert.equal(await f.browser(message),false)
 assert.equal(f.calls.length,1);assert.deepEqual(Object.keys(f.calls[0].body).sort(),['codeChallenge','launchId','memberId','state','tenantId'])
 assert.equal(f.sent[0].origin,'https://aigc.fsstory.net');assert.equal(f.sent[0].data.callbackUrl,callback(message.challenge.state))
})

test('closing a child or changing identity drops late authorization without delivering its code',async()=>{
 for(const changed of ['closed','identity']){
  const f=fixture();f.delay();const id=f.start(),pending=f.browser({type:'fs:aigc-sso-challenge',version:1,launchId:id,challenge:challenge()})
  if(changed==='closed')f.child.closed=true;else f.setIdentity({tenantId:'tenant-b',memberId:'member-b',epoch:2})
  f.release();await pending;assert.equal(f.sent.filter(x=>x.data.callbackUrl).length,0)
 }
})

test('native challenges stay on the private launch channel and cancellation rejects late replies',async()=>{
 const f=fixture(true),id=f.start();f.delay()
 assert.equal(await f.browser({type:'fs:aigc-sso-challenge',version:1,launchId:id,challenge:challenge()}),false)
 const pending=f.launcher.receiveNative({launchId:id,challenge:challenge()});f.launcher.cancel();f.release();await pending
 assert.equal(f.sent.filter(x=>x.data.callbackUrl).length,0);assert(f.calls[0].signal.aborted)
})

test('a closed native window retires only its matching launch and drops an admitted late code',async()=>{
 const f=fixture(true),id=f.start();f.delay()
 f.launcher.nativeClosed('another-window')
 const pending=f.launcher.receiveNative({launchId:id,challenge:challenge()})
 assert.equal(f.calls.length,1);f.launcher.nativeClosed(id);f.release();await pending
 assert(f.calls[0].signal.aborted);assert.equal(f.sent.filter(x=>x.data.callbackUrl).length,0)
})

test('reconnection requires a new challenge and is limited to once per minute',async()=>{
 const f=fixture(),id=f.start(),message=state=>({type:'fs:aigc-sso-challenge',version:1,launchId:id,challenge:challenge(state)})
 await f.browser(message('s'.repeat(43)))
 assert.equal(await f.browser(message('t'.repeat(43))),false);assert.equal(f.calls.length,1)
 f.setClock(62000);await f.browser(message('u'.repeat(43)));assert.equal(f.calls.length,2)
})

test('a forged callback or invalid challenge never redirects the child',async()=>{
 const f=fixture(),id=f.start(),msg={type:'fs:aigc-sso-challenge',version:1,launchId:id,challenge:{...challenge(),redirectUri:'https://evil.test/callback'}}
 assert.equal(await f.browser(msg),false);assert.equal(f.calls.length,0)
 const valid={...msg,challenge:challenge()};f.setReply({callbackUrl:'https://evil.test/callback?code=secret'})
 await f.browser(valid);assert.equal(f.sent.filter(x=>x.data.callbackUrl).length,0);assert.equal(f.sent.at(-1).data.status,'error')
})

test('concurrent challenge duplicates mint once and a denial cannot loop into another authorization',async()=>{
 const f=fixture();f.delay();const id=f.start(),msg={type:'fs:aigc-sso-challenge',version:1,launchId:id,challenge:challenge()}
 const first=f.browser(msg);assert.equal(await f.browser(msg),false);assert.equal(f.calls.length,1);f.release();await first
 const denied=fixture();denied.setReply(Error('当前无AIGC访问权限'));const launchId=denied.start()
 await denied.browser({...msg,launchId});denied.setClock(120000)
 assert.equal(await denied.browser({...msg,launchId,challenge:challenge('x'.repeat(43))}),false)
 assert.equal(denied.calls.length,1);assert.equal(denied.sent.at(-1).data.status,'error')
})
