import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createVideoWorkspaceResolver } from '../lib/video-workspace.js'

const identity={environment:'production',tenantId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000001'}
const agentId='30000000-0000-4000-8000-000000000001',version='a'.repeat(64)
function fixture(overrides={}) {
  const abort=new AbortController()
  const options={identity,authorize:async()=>({...identity,signal:abort.signal}),resolveBinding:async()=>({agentId,version}),
    snapshot:async()=>({agentId,version,files:[{path:'skills/video-production/SKILL.md',content:'Video'}]}),
    workspacePath:async()=>path.resolve('fixtures/member/agents',agentId,'workspace'),...overrides}
  return {resolver:createVideoWorkspaceResolver(options),abort}
}
test('video workspace uses Host binding and authorized platform definition',async()=>{
  const {resolver}=fixture()
  const result=await resolver.authorize('session-1')
  assert.equal(result.agentId,agentId);assert.equal(result.agentVersion,version)
  assert.equal(result.tenantId,identity.tenantId);assert.ok(path.isAbsolute(result.workspacePath))
})
test('video tools reject unbound sessions, foreign identity and changed snapshots',async()=>{
  for(const options of [
    {resolveBinding:async()=>undefined},
    {authorize:async()=>({...identity,userId:'40000000-0000-4000-8000-000000000001',signal:new AbortController().signal})},
    {snapshot:async()=>({agentId,version:'b'.repeat(64),files:[{path:'skills/video-production/SKILL.md',content:'Video'}]})},
    {snapshot:async()=>({agentId,version,files:[]})},
  ]) await assert.rejects(fixture(options).resolver.authorize('session-1'))
})
test('video workspace signals track logout and tool cancellation',async()=>{
  const {resolver,abort}=fixture(),cancel=new AbortController()
  const owner=await resolver.authorize('session-1',cancel.signal)
  abort.abort();assert.equal(owner.signal.aborted,true)
  await assert.rejects(resolver.authorize('session-1'))
  const second=fixture();cancel.abort()
  await assert.rejects(second.resolver.authorize('session-2',cancel.signal))
})

test('version-isolated sessions resolve assets in their authorized snapshot workspace',async()=>{
  const snapshotVersion='c'.repeat(64)
  const isolated=path.resolve('fixtures/member/agents',agentId,'snapshots',snapshotVersion,'workspace')
  const {resolver}=fixture({
    resolveBinding:async()=>({agentId,version,snapshotVersion}),
    workspacePath:async(id,release,currentSnapshot)=>currentSnapshot===snapshotVersion
      ?isolated:path.resolve('fixtures/member/agents',id,'workspace'),
  })
  const result=await resolver.authorize('snapshot-session')
  assert.equal(result.workspacePath,isolated)
})
