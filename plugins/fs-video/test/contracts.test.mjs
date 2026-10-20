import test from 'node:test'
import assert from 'node:assert/strict'
import {parseCreate,parseRevise,parseRender} from '../lib/contracts.js'
const scene={id:'hero',title:'春日咖啡',narration:'今天来一杯。',lines:['示例活动'],visual:'hero',durationSeconds:3}
const input={requestId:'create-001',title:'社区咖啡店',brief:'新品活动示例，未经证实不写价格。',scenes:[scene]}
test('strict defaults preserve V2 voice and original music choice',()=>{const value=parseCreate(input);assert.equal(value.voice.name,'zh-CN-XiaoxiaoNeural');assert.equal(value.voice.rate,'+8%');assert.equal(value.voice.pitch,'+2Hz');assert.equal(value.music,'upbeat')})
test('rejects model supplied ownership, executable code and unknown fields',()=>{for(const patch of [{tenantId:'foreign'},{workspaceRoot:'C:/'},{script:'process.exit()'},{ffmpegArgs:['-f']},{scenes:[{...scene,html:'<script>'}]}])assert.throws(()=>parseCreate({...input,...patch}),{code:'VIDEO_INPUT_INVALID'})})
test('rejects excessive duration, scenes, narration and duplicate ids',()=>{for(const patch of [{scenes:Array(13).fill(scene)},{scenes:[scene,scene]},{scenes:[{...scene,durationSeconds:31}]},{scenes:[{...scene,narration:'字'.repeat(1201)}]}])assert.throws(()=>parseCreate({...input,...patch}),{code:'VIDEO_INPUT_INVALID'})})
test('rejects SSML and unbounded voice configuration',()=>{for(const voice of [{name:'<voice>'},{rate:'+99%'},{pitch:'+99Hz'},{provider:'paid'}])assert.throws(()=>parseCreate({...input,voice}),{code:'VIDEO_INPUT_INVALID'})})
test('revision and render references must be local UUIDs',()=>{assert.throws(()=>parseRevise({requestId:'revise-001',projectId:'../x',baseRevisionId:'x',changes:{title:'new'}}));assert.throws(()=>parseRender({requestId:'render-001',projectId:'x',revisionId:'x',command:'ffmpeg'}))})
