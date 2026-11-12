import test from 'node:test'
import assert from 'node:assert/strict'
import {acceptSessionVersion, reconcileSend, subscribeSessionResume, conversationKey, isCurrentConversation} from '../src/recovery.ts'

const attempt = {requestId:'accepted-request',text:'原始工作请求',draft:'原始工作请求',attachmentIds:['original-image']}
const session = (updatedAt, status='idle', messages=[]) => ({id:'session-a',title:'工作请求',agentName:'资料助理',updatedAt,status,messages})
const accepted = time => session(time,'running',[{id:attempt.requestId,role:'user',text:attempt.text,time:100}])

test('an acknowledged message read after a lost POST response clears only the submitted composer', () => {
  const result = reconcileSend(accepted(200),attempt,'原始工作请求',['original-image'])
  assert.equal(result.confirmed,true)
  assert.equal(result.clearComposer,true)
  assert.deepEqual(attempt,{requestId:'accepted-request',text:'原始工作请求',draft:'原始工作请求',attachmentIds:['original-image']})
})

test('recovered acknowledgement preserves a subsequently edited draft or attachment selection', () => {
  for (const [draft,files] of [['补充的新工作',['original-image']],['原始工作请求',['new-image']],['原始工作请求 ',['original-image']]]) {
    const result=reconcileSend(accepted(200),attempt,draft,files)
    assert.equal(result.confirmed,true)
    assert.equal(result.clearComposer,false)
  }
})

test('matching text, assistant output, and unrelated user messages cannot acknowledge an input request', () => {
  for (const messages of [[],[{id:'other-request',role:'user',text:attempt.text,time:100}],[{id:attempt.requestId,role:'assistant',text:attempt.text,time:100}]]) {
    assert.deepEqual(reconcileSend(session(200,'idle',messages),attempt,attempt.draft,attempt.attachmentIds),{confirmed:false,clearComposer:false})
  }
})

test('a delayed pre-send GET cannot replace a newer POST or poll response', async () => {
  const seen=new Map(),values=[]
  let finishOldRead
  const oldRead=new Promise(resolve=>finishOldRead=resolve).then(value=>{if(acceptSessionVersion(seen,value,1))values.push(value.status)})
  const post=accepted(200)
  assert.equal(acceptSessionVersion(seen,post,2),true);values.push(post.status)
  finishOldRead(session(100,'idle'))
  await oldRead
  assert.deepEqual(values,['running'])
  assert.equal(seen.get('session-a').updatedAt,200)
  assert.equal(acceptSessionVersion(seen,session(300,'waiting'),3),true)
  assert.equal(acceptSessionVersion(seen,session(200,'running'),4),false)
})

test('equal millisecond timestamps use request order; each session has its own version', () => {
  const seen=new Map()
  assert.equal(acceptSessionVersion(seen,accepted(200),3),true)
  assert.equal(acceptSessionVersion(seen,session(200,'idle'),2),false)
  assert.equal(acceptSessionVersion(seen,session(200,'waiting'),4),true)
  assert.equal(acceptSessionVersion(seen,{id:'session-b',updatedAt:100},1),true)
  assert.equal(acceptSessionVersion(seen,{id:'session-a'},5),false)
  assert.equal(acceptSessionVersion(seen,{id:'session-a',updatedAt:'1970-01-01T00:00:00.250Z'},2),true)
})

test('online and foreground events recover an idle conversation by GET without replaying its POST', () => {
  const browser=new EventTarget(),page=new EventTarget()
  page.visibilityState='visible'
  let online=false,reads=0,posts=1
  const seen=new Map(),pending=new Map([['session-a',attempt]])
  acceptSessionVersion(seen,session(100),1)
  const stop=subscribeSessionResume(browser,page,()=>online,()=>{
    reads++
    const value=accepted(200)
    if(acceptSessionVersion(seen,value,reads+1)&&reconcileSend(value,pending.get(value.id),attempt.draft,attempt.attachmentIds).confirmed)pending.delete(value.id)
  })
  browser.dispatchEvent(new Event('online'));assert.equal(reads,0)
  online=true;browser.dispatchEvent(new Event('online'))
  assert.equal(reads,1);assert.equal(pending.size,0);assert.equal(posts,1)
  page.visibilityState='hidden';page.dispatchEvent(new Event('visibilitychange'));assert.equal(reads,1)
  page.visibilityState='visible';page.dispatchEvent(new Event('visibilitychange'));assert.equal(reads,2)
  browser.dispatchEvent(new Event('pageshow'));assert.equal(reads,3)
  stop();browser.dispatchEvent(new Event('online'));page.dispatchEvent(new Event('visibilitychange'));assert.equal(reads,3)
})

test('private composer and recovery keys distinguish systems even with equal conversation IDs', () => {
  const drafts=new Map([[conversationKey('aigc','same-id'),'项目A的私有草稿']])
  assert.equal(drafts.get(conversationKey('erp','same-id')),undefined)
  assert.notEqual(conversationKey('a/b','c'),conversationKey('a','b/c'))
})

test('a late or unscoped conversation cannot be accepted into the currently selected system', () => {
  assert.equal(isCurrentConversation({id:'same-id',systemId:'aigc'},'erp','same-id'),false)
  assert.equal(isCurrentConversation({id:'same-id'},'erp','same-id'),false)
  assert.equal(isCurrentConversation({id:'same-id',systemId:'erp'},'erp','other-id'),false)
  assert.equal(isCurrentConversation({id:'same-id',systemId:'erp'},'erp','same-id'),true)
})
