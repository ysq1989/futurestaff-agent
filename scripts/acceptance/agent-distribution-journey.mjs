import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {writeFile,readFile} from 'node:fs/promises'
import path from 'node:path'
import {mountAgents} from '../../plugins/fs-platform-access/lib/agent-host.js'
import {distributionCatalog,downloadAgentRelease} from '../../plugins/fs-platform-access/lib/agent-distribution.js'

const [base,root,tenantId,userId,agentId]=process.argv.slice(2)
assert.ok(base?.startsWith('http://127.0.0.1:'))
const passed=[],identity={environment:'dev',tenantId,userId},credentials={tenantId,userId,accessToken:'member',signal:new AbortController().signal}
const routes=[],sessions=new Map()
const ctx={effect:register=>register(),webServer:{register:route=>{routes.push(route);return()=>{}}},get:name=>name==='sessions'?{get:id=>sessions.get(id)}:name==='workspaceRegistry'?{create:async()=>{}}:undefined}
// Production origin checks remain enabled; only the fixture transport is redirected.
const transport=(url,options)=>fetch(new URL(new URL(url).pathname+new URL(url).search,base),options)
const agents=mountAgents(ctx,'https://dev.fsstory.net',identity,root,async()=>credentials,transport)
const server=createServer((req,res)=>{const route=routes.find(r=>r.path===req.url);if(!route){res.statusCode=404;return res.end()}void route.handler(req,res)})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const local='http://127.0.0.1:'+server.address().port
async function platform(suffix,method='GET',body,actor='manager'){
 return fetch(base+suffix,{method,headers:{authorization:'Bearer '+actor,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
}
const management='/api/agents/'+agentId+'/desktop-publication'
async function publish(notes){const preview=await (await platform(management)).json();const res=await platform(management,'POST',{expectedDraftVersion:preview.draftVersion,notes,capabilities:['local.files']});assert.equal(res.status,200);return res.json()}
async function call(route,body){const res=await fetch(local+'/_futurestaff/agents/'+route,{method:body?'POST':'GET',headers:{'x-futurestaff-agent':'1','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()}}
try{
 const first=await publish('第一版');passed.push('publish')
 await distributionCatalog('https://dev.fsstory.net',credentials,transport)
 await downloadAgentRelease('https://dev.fsstory.net',credentials,agentId,first.version,transport)
 const installed=await call('install',{agentId,version:first.version});assert.equal(installed.status,200,JSON.stringify(installed.body));passed.push('install')
 const old=(await call('open-installed',{agentId})).body;sessions.set('old-session',{header:{cwd:old.path}})
 const bound=await agents.resolvePolicyBinding('old-session');assert.equal(bound.releaseVersion,first.version)
 const project=path.join(old.path,'project.txt');await writeFile(project,'原工程与产物')
 await platform('/fixture/draft','POST',{})
 assert.equal((await call('distribution')).body.items[0].version,first.version)
 assert.equal((await agents.resolvePolicyBinding('old-session')).releaseVersion,first.version);passed.push('draft-isolation')
 const second=await publish('第二版');assert.notEqual(second.version,first.version)
 assert.equal((await call('distribution')).body.items[0].updateAvailable,true)
 assert.equal((await call('install',{agentId,version:second.version})).status,200);passed.push('update')
 const newer=(await call('open-installed',{agentId})).body;sessions.set('new-session',{header:{cwd:newer.path}})
 assert.equal((await agents.resolvePolicyBinding('new-session')).releaseVersion,second.version)
 assert.equal((await agents.resolvePolicyBinding('old-session')).releaseVersion,first.version)
 assert.equal(await readFile(project,'utf8'),'原工程与产物');passed.push('pin-sessions')
 assert.equal((await call('rollback',{agentId,version:first.version})).status,200)
 assert.equal((await agents.resolvePolicyBinding('new-session')).releaseVersion,second.version);passed.push('rollback')
 assert.equal((await call('uninstall',{agentId})).status,200)
 assert.equal((await call('open-installed',{agentId})).status,409)
 assert.equal((await agents.resolvePolicyBinding('old-session')).releaseVersion,first.version)
 assert.equal((await call('install',{agentId,version:second.version})).status,200)
 assert.equal(await readFile(project,'utf8'),'原工程与产物');passed.push('uninstall-reinstall')
 assert.equal((await platform('/desktop/v1/agents/'+agentId+'/releases/'+first.version,'GET',undefined,'foreign')).status,403);passed.push('cross-tenant')
 const preview=await (await platform(management)).json()
 assert.equal((await platform(management,'POST',{expectedDraftVersion:preview.draftVersion},'member')).status,403);passed.push('use-only')
 assert.equal((await platform(management,'DELETE')).status,200)
 await assert.rejects(agents.resolvePolicyBinding('old-session'))
 assert.equal((await call('open-installed',{agentId})).status,409);passed.push('stop')
 await publish('恢复发布');await platform('/fixture/revoke','POST',{})
 assert.equal((await call('distribution')).body.items[0].available,false)
 await assert.rejects(agents.resolvePolicyBinding('old-session'));passed.push('revoke')
 assert.equal(await readFile(project,'utf8'),'原工程与产物')
 process.stdout.write(JSON.stringify({passed}))
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
