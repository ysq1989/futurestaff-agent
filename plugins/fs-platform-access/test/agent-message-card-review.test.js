import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {Readable} from 'node:stream'
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const built=await build({entryPoints:[fileURLToPath(new URL('../src/agent-message-card-host.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'})
const {mountAgentMessageCards}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const desktopRequire=createRequire(new URL('../../../desktop-shell/dsh-plugin-desktop/package.json',import.meta.url))
const runtime=name=>import(pathToFileURL(desktopRequire.resolve(name)).href)

function host() {
 let route,definition,calls=0,owner='tenant:user',policy='policy-a',authorizeHook
 const signal=new AbortController().signal,received=[],agent={id:'review-session',followup:input=>received.push(input)},active=new Map([[agent.id,agent]])
 const ctx={on(){},effect:fn=>fn(),get:key=>key==='agents'?active:undefined,
  webServer:{register:value=>{route=value}},inject:(_deps,fn)=>fn({effect:ctx.effect,tools:{register:value=>{definition=value}}})}
 mountAgentMessageCards(ctx,async()=>{calls++;if(authorizeHook)await authorizeHook(calls);return{owner,policy,signal}})
 async function post(body,chunks) {
  const request=Readable.from(chunks??[Buffer.from(JSON.stringify(body))]);request.method='POST';request.headers={'x-futurestaff-card':'1'};request.socket={remoteAddress:'127.0.0.1'}
  let data;const response={statusCode:0,setHeader(){},end:raw=>{data=JSON.parse(raw)}}
  await route.handler(request,response);return{status:response.statusCode,data}
 }
 return{agent,definition,received,post,active,calls:()=>calls,setOwner:value=>{owner=value},setPolicy:value=>{policy=value},setAuthorizeHook:fn=>{authorizeHook=fn}}
}

test('independent review: UTF8 request chunks preserve the exact Chinese answer',async()=>{
 const b=host(),v=await b.definition.execute({title:'补充说明',fields:[{id:'note',label:'要求',type:'text'}],actions:[{id:'send',label:'提交'}]},{agent:b.agent,signal:new AbortController().signal})
 const body={action:'respond',sessionId:v.sessionId,viewId:v.viewId,actionId:'send',values:{note:'蓝色礼盒，保留中文与🙂'}}
 const bytes=Buffer.from(JSON.stringify(body)),at=bytes.indexOf(Buffer.from('蓝'))+1
 const result=await b.post(body,[bytes.subarray(0,at),bytes.subarray(at)])
 assert.equal(result.status,200)
 assert.equal(result.data.response.values.note,body.values.note)
 assert.equal(JSON.parse(b.received[0].content[0].text).values.note,body.values.note)
})

test('independent review: an identity switch during delivery cannot message the Agent or replace the first answer',async()=>{
 const b=host(),v=await b.definition.execute({title:'选择',actions:[{id:'one',label:'方案一'},{id:'two',label:'方案二'}]},{agent:b.agent,signal:new AbortController().signal})
 const base={sessionId:v.sessionId,viewId:v.viewId}
 let entered,release
 const blocked=new Promise(resolve=>{entered=resolve}),gate=new Promise(resolve=>{release=resolve}),hold=b.calls()+3
 b.setAuthorizeHook(async call=>{if(call===hold){entered();await gate}})
 const pending=b.post({action:'respond',...base,actionId:'one',values:{}})
 await blocked;b.setOwner('tenant:other');release()
 assert.equal((await pending).status,403)
 assert.equal(b.received.length,0)
 b.setOwner('tenant:user');b.setAuthorizeHook(undefined)
 const saved=await b.post({action:'view',...base})
 assert.equal(saved.data.response.actionId,'one')
 assert.equal((await b.post({action:'respond',...base,actionId:'two',values:{}})).status,409)
 const retry=await b.post({action:'retry',...base})
 assert.equal(retry.data.conversationUpdated,true)
 assert.equal(retry.data.response.eventId,saved.data.response.eventId)
 assert.equal(b.received.length,1)
})

test('independent review: real DSH newly copied custom presets inherit the global card tool and retain explicit restrictions',async t=>{
 const [{Context},{default:Loader},{default:Include},{default:Group},{default:LlmRuntime},{default:SessionStore},{default:SystemPrompt},{default:ToolRuntime},{default:AgentRegistry},{default:SessionProjectionRegistry},{default:AgentLoop},{default:AgentPresets}]=await Promise.all([
  runtime('@deepseek-ai/cordis'),runtime('@deepseek-ai/cordis-plugin-loader'),runtime('@deepseek-ai/cordis-plugin-include'),runtime('@deepseek-ai/cordis-plugin-group'),runtime('@deepseek-ai/dsh-llm'),runtime('@deepseek-ai/dsh-session'),runtime('@deepseek-ai/dsh-system-prompt'),runtime('@deepseek-ai/dsh-tools'),runtime('@deepseek-ai/dsh-agent'),runtime('@deepseek-ai/dsh-session-projection'),runtime('@deepseek-ai/dsh-agent-loop'),runtime('@deepseek-ai/dsh-agent-presets'),
 ])
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-card-preset-review-')),baseline=path.join(root,'standard')
 await mkdir(baseline);await writeFile(path.join(baseline,'agent.cordis.yml'),'[]\n')
 const ctx=new Context()
 ctx.baseUrl=pathToFileURL(root).href+'/'
 const fibers=[]
 const mount=async(plugin,config)=>{const fiber=ctx.plugin(plugin,config);fibers.push(fiber);await fiber}
 const handles=[]
 t.after(async()=>{for(const handle of handles.reverse())await handle.dispose();for(const fiber of fibers.reverse())await Promise.resolve(fiber.dispose());await rm(root,{recursive:true,force:true})})
 await mount(Loader);ctx.loader.builtins.include=Include;ctx.loader.builtins.group=Group
 for(const plugin of [LlmRuntime,SessionStore,SystemPrompt,ToolRuntime,AgentRegistry,SessionProjectionRegistry])await mount(plugin)
 await mount(AgentLoop,{agents:[]})
 await mount(AgentPresets,{default:'standard',roots:[{path:root,trust:'user'}],includeShippedRoot:false,includeUserRoot:false})
 ctx.tools.register(host().definition)
 async function create(id,preset){const handle=await ctx.agents.create({sessionId:id,setup:async agentCtx=>{await ctx.agentPresets.mount(agentCtx,preset)}});handles.push(handle);return handle.agent}
 const standard=await create('review-standard','standard')
 assert.ok(ctx.tools.schemas(standard).some(tool=>tool.name==='agent_message_card'))
 await ctx.agentPresets.copy('standard','custom-card-copy','新建卡片助手')
 const custom=await create('review-custom-copy','custom-card-copy')
 assert.ok(ctx.tools.schemas(custom).some(tool=>tool.name==='agent_message_card'))
 custom.ctx.tools.restrict({allow:[]})
 assert.equal(ctx.tools.schemas(custom).some(tool=>tool.name==='agent_message_card'),false)
 assert.ok(ctx.tools.schemas(standard).some(tool=>tool.name==='agent_message_card'))
})
