import test from 'node:test'
import assert from 'node:assert/strict'
import {ScopedVoiceCapture, createVoiceTransport, voiceMode} from '../src/voice.ts'

const fixture = () => {
  let scope = 'aigc/project-a/session-a/context-1'
  const finals = [], errors = [], states = []
  const voice = new ScopedVoiceCapture({scope:()=>scope,final:(text,key)=>finals.push([text,key]),error:value=>errors.push(value),state:value=>states.push(value)})
  let callbacks
  const transport = {start:value=>{callbacks=value},stop(){},cancel(){}}
  return {voice,transport,finals,errors,states,setScope:value=>scope=value,callbacks:()=>callbacks}
}

test('final voice text is an editable draft result for the captured scope, never an automatic send', () => {
  const f=fixture()
  f.voice.start(f.transport)
  assert.deepEqual(f.states,[true])
  f.callbacks().final('把第三个镜头改成夜景')
  assert.deepEqual(f.finals,[['把第三个镜头改成夜景','aigc/project-a/session-a/context-1']])
  f.callbacks().end()
  assert.deepEqual(f.states,[true,false])
})

test('switching a system or project discards a late transcript even when original scope is later reopened', () => {
  const f=fixture()
  f.voice.start(f.transport)
  const old=f.callbacks()
  f.setScope('erp/purchase/session-b/context-1')
  old.final('不应进入ERP')
  f.voice.cancel()
  f.setScope('aigc/project-a/session-a/context-1')
  old.final('也不应在返回后复活')
  old.error('旧识别失败')
  assert.deepEqual(f.finals,[])
  assert.deepEqual(f.errors,[])
})

test('cancel invalidates callbacks before a transport emits synchronously during cancellation', () => {
  const f=fixture()
  f.transport.cancel=()=>f.callbacks().final('取消回调中的迟到文字')
  f.voice.start(f.transport)
  f.voice.cancel()
  assert.deepEqual(f.finals,[])
  assert.deepEqual(f.states,[true,false])
})

test('a new capture rejects every callback from an earlier attempt', () => {
  const f=fixture()
  f.voice.start(f.transport)
  const old=f.callbacks()
  f.voice.cancel()
  f.voice.start(f.transport)
  old.final('旧转写')
  old.end()
  f.callbacks().final('新转写')
  assert.deepEqual(f.finals,[['新转写','aigc/project-a/session-a/context-1']])
  assert.deepEqual(f.states,[true,false,true])
})

test('recognition failures stop listening and provide a recoverable error without writing input', () => {
  const f=fixture()
  f.voice.start(f.transport)
  f.callbacks().error('未获得麦克风权限，请使用文字输入。')
  f.callbacks().final('失败后迟到')
  assert.deepEqual(f.finals,[])
  assert.deepEqual(f.errors,['未获得麦克风权限，请使用文字输入。'])
  assert.deepEqual(f.states,[true,false])
})

test('starting capture without a current conversation cannot start the microphone', () => {
  const f=fixture()
  f.setScope('')
  let started=false
  f.transport.start=()=>started=true
  f.voice.start(f.transport)
  assert.equal(started,false)
  assert.deepEqual(f.states,[])
})

test('native recognition requires the exact request and scope pair and removes listeners on cancel', () => {
  const browser=new EventTarget(),urls=[],finals=[]
  browser.__FS_NATIVE_VOICE__={version:1,onDeviceOnly:true}
  browser.location={origin:'https://agent.fsstory.net',assign:value=>urls.push(new URL(value))}
  const transport=createVoiceTransport(browser)
  assert.equal(voiceMode(browser),'native')
  transport.start({final:value=>finals.push(value),end(){},error:assert.fail})
  const params=urls[0].searchParams,detail={requestId:params.get('requestId'),scopeId:params.get('scopeId'),status:'result',text:'原系统的语音'}
  const emit=value=>browser.dispatchEvent(new CustomEvent('fs-native-voice',{detail:value}))
  emit({...detail,scopeId:'wrong-scope'})
  emit({...detail,requestId:'wrong-request'})
  assert.deepEqual(finals,[])
  transport.cancel()
  assert.equal(urls.at(-1).searchParams.get('action'),'cancel')
  emit(detail)
  assert.deepEqual(finals,[])
})

test('native mode accepts one final transcript and never falls back to a browser recognizer', () => {
  const browser=new EventTarget(),urls=[],finals=[]
  let browserStarts=0,ended=0
  browser.__FS_NATIVE_VOICE__={version:1,onDeviceOnly:true}
  browser.SpeechRecognition=class {constructor(){browserStarts++}}
  browser.location={origin:'https://agent.fsstory.net',assign:value=>urls.push(new URL(value))}
  const transport=createVoiceTransport(browser)
  transport.start({final:value=>finals.push(value),end:()=>ended++,error:assert.fail})
  const params=urls[0].searchParams,detail={requestId:params.get('requestId'),scopeId:params.get('scopeId'),status:'result',text:'检查后再发送'}
  browser.dispatchEvent(new CustomEvent('fs-native-voice',{detail}))
  browser.dispatchEvent(new CustomEvent('fs-native-voice',{detail}))
  assert.deepEqual(finals,['检查后再发送'])
  assert.equal(ended,1)
  assert.equal(browserStarts,0)
})

test('browser mode ignores interim results and repeated final events', () => {
  let recognizer
  const browser=new EventTarget(),finals=[]
  browser.SpeechRecognition=class {constructor(){recognizer=this}start(){}stop(){}abort(){}}
  const transport=createVoiceTransport(browser)
  transport.start({final:value=>finals.push(value),end(){},error:assert.fail})
  recognizer.onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'临时'}}]})
  const final={resultIndex:0,results:[{isFinal:true,0:{transcript:'最终转写'}}]}
  recognizer.onresult(final);recognizer.onresult(final)
  assert.deepEqual(finals,['最终转写'])
  transport.cancel()
  assert.equal(recognizer.onresult,null)
})
