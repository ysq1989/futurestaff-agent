/** Operator acceptance tool. Reuses the authorized subject's existing server-side AI key.
 * No key is accepted on CLI, copied to this computer, printed, or written to output.
 * No retries: an unknown inference result must be investigated by its original request ID.
 */
import {spawnSync} from 'node:child_process'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {homedir} from 'node:os'
import {createHash, randomUUID} from 'node:crypto'
import {parseArgs} from 'node:util'
import {fileURLToPath} from 'node:url'

const OWNER={tenantId:'6e7db441-c4ea-4f16-8261-9e1a5379b2ff',userId:'242ab148-8370-4d54-b6bb-da4bbee4a0f3',modelId:'08addb41-8be5-4cf4-93b8-85005db54305'}
const API_HOST='8.134.178.82',AI_HOST='47.243.121.145'
const API_CONTAINER='futurestaff-prod-platform-platform-api-1'
const VISUALS=new Set(['hero','benefits','steps','offer','cta'])
export function parseVideoDraft(raw) {
  const text=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')
  const value=JSON.parse(text)
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['title','brief','scenes'].includes(k)))throw Error('DRAFT_SCHEMA_INVALID')
  if(typeof value.title!=='string'||value.title.length>120||!value.title.trim()||typeof value.brief!=='string'||value.brief.length>3000||!Array.isArray(value.scenes)||value.scenes.length!==5)throw Error('DRAFT_SCHEMA_INVALID')
  const ids=new Set()
  for(const scene of value.scenes) {
    if(!scene||typeof scene!=='object'||Object.keys(scene).some(k=>!['id','title','narration','lines','visual'].includes(k)))throw Error('SCENE_SCHEMA_INVALID')
    if(typeof scene.id!=='string'||!/^[a-z][a-z0-9_-]{0,40}$/.test(scene.id)||ids.has(scene.id)||!VISUALS.has(scene.visual))throw Error('SCENE_SCHEMA_INVALID')
    ids.add(scene.id)
    for(const key of ['title','narration'])if(typeof scene[key]!=='string'||!scene[key].trim()||scene[key].length>(key==='title'?80:300))throw Error('SCENE_SCHEMA_INVALID')
    if(!Array.isArray(scene.lines)||scene.lines.length<1||scene.lines.length>3||scene.lines.some(x=>typeof x!=='string'||!x.trim()||x.length>30))throw Error('SCENE_SCHEMA_INVALID')
  }
  if(!JSON.stringify(value).includes('示例'))throw Error('EXAMPLE_LABEL_REQUIRED')
  return value
}

function sshJson(host, code, timeout=45000) {
  const result=spawnSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','-i',path.join(homedir(),'.ssh',`${host}_id_ed25519`),`root@${host}`,'python3 -'],{input:code,encoding:'utf8',timeout,maxBuffer:2*1024*1024,windowsHide:true})
  if(result.error||result.status!==0)throw Error('SERVER_OPERATION_FAILED_OR_UNKNOWN')
  const marker=result.stdout.trim().split('\n').filter(line=>line.startsWith('FS_VIDEO_JSON:')).at(-1)
  if(!marker)throw Error('SERVER_RESPONSE_INVALID')
  const value=JSON.parse(marker.slice('FS_VIDEO_JSON:'.length))
  if(!value.ok)throw Error(value.code??'SERVER_OPERATION_REJECTED')
  return value
}

const sqlRunner=`
import json, subprocess, datetime
def query(sql):
 p=subprocess.run(['docker','exec','new-api-hk-postgres-1','sh','-c','exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -c "$1"','query',sql],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=30)
 if p.returncode: raise RuntimeError('SAFE_METADATA_QUERY_FAILED')
 return json.loads(p.stdout)
`
function freeMetadata() {
  return sshJson(AI_HOST,sqlRunner+`
try:
 pricing=query("SELECT json_build_object('modelRatio',(SELECT value::jsonb->'futurestaff' FROM options WHERE key='ModelRatio'),'modelPrice',(SELECT value::jsonb->'futurestaff' FROM options WHERE key='ModelPrice'),'completionRatio',(SELECT value::jsonb->'futurestaff' FROM options WHERE key='CompletionRatio'));")
 routes=query("SELECT coalesce(json_agg(json_build_object('channelId',id,'status',status,'channelType',type,'modelMapping',model_mapping)), '[]'::json) FROM channels WHERE models='futurestaff' OR models LIKE 'futurestaff,%' OR models LIKE '%,futurestaff' OR models LIKE '%,futurestaff,%';")
 if pricing.get('modelRatio')!=0 or pricing.get('modelPrice') is not None: raise RuntimeError('MODEL_NOT_VERIFIED_FREE')
 if not routes or any(x['status']!=1 or x['channelType']!=58 or json.loads(x['modelMapping'] or '{}').get('futurestaff')!='agnes-3.0-flash' for x in routes): raise RuntimeError('MODEL_ROUTE_CHANGED')
 print('FS_VIDEO_JSON:'+json.dumps({'ok':True,'checkedAt':datetime.datetime.utcnow().isoformat()+'Z','model':'futurestaff','priceState':'ZERO_ENGINE_PRICE','quotaType':0,'pricing':pricing,'routes':routes}))
except Exception as e: print('FS_VIDEO_JSON:'+json.dumps({'ok':False,'code':str(e) if isinstance(e,RuntimeError) else 'FREE_METADATA_FAILED'}))
`)
}

function callFreeModel(messages) {
  const body={model:'futurestaff',messages,stream:false,max_tokens:3500,temperature:0.65}
  const inner=`
import asyncio, json, uuid, httpx, logging
from sqlalchemy import select, text
from app.database import async_session
from app.models.llm import LLMModel
from app.services.llm.utils import get_model_api_key
logging.getLogger('sqlalchemy.engine').setLevel(logging.CRITICAL)
OWNER=json.loads(${JSON.stringify(JSON.stringify(OWNER))})
BODY=json.loads(${JSON.stringify(JSON.stringify(body))})
async def main():
 try:
  async with async_session() as db:
   identity=(await db.execute(text("SELECT u.role,u.is_active,t.is_active AS tenant_active FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=:uid AND u.tenant_id=:tid"),{'uid':uuid.UUID(OWNER['userId']),'tid':uuid.UUID(OWNER['tenantId'])})).mappings().one_or_none()
   if not identity or not identity['is_active'] or not identity['tenant_active'] or identity['role'] not in ('org_admin','platform_admin'): raise ValueError('OWNER_NOT_AUTHORIZED')
   model=await db.get(LLMModel,uuid.UUID(OWNER['modelId']))
   if not model or str(model.tenant_id)!=OWNER['tenantId'] or model.model!='futurestaff' or model.source_type!='futurestaff_ai' or model.model_kind!='text' or not model.enabled or model.base_url!='https://ai.erplucky.com/v1': raise ValueError('MODEL_BINDING_CHANGED')
   key=get_model_api_key(model)
   if not key: raise ValueError('MODEL_KEY_UNAVAILABLE')
  async with httpx.AsyncClient(timeout=140,follow_redirects=False) as client:
   discovered=await client.get('https://ai.erplucky.com/v1/models',headers={'Authorization':'Bearer '+key})
   if discovered.status_code!=200 or not any(x.get('id')=='futurestaff' for x in discovered.json().get('data',[])): raise ValueError('MODEL_NOT_IN_KEY_SCOPE')
   response=await client.post('https://ai.erplucky.com/v1/chat/completions',headers={'Authorization':'Bearer '+key},json=BODY)
   key=None
   if response.status_code!=200: raise ValueError('MODEL_HTTP_'+str(response.status_code))
   data=response.json(); choice=data.get('choices',[{}])[0]
   if choice.get('finish_reason')!='stop' or not isinstance(choice.get('message',{}).get('content'),str): raise ValueError('MODEL_RESULT_INCOMPLETE')
   request_id=response.headers.get('X-Oneapi-Request-Id')
   if not request_id: raise ValueError('ENGINE_REQUEST_ID_MISSING')
   print('FS_VIDEO_JSON:'+json.dumps({'ok':True,'owner':OWNER,'model':data.get('model'),'engineRequestId':request_id,'usage':data.get('usage'),'finishReason':choice['finish_reason'],'content':choice['message']['content']},ensure_ascii=False))
 except ValueError as e: print('FS_VIDEO_JSON:'+json.dumps({'ok':False,'code':str(e) if str(e).startswith(('OWNER_','MODEL_','ENGINE_')) else 'MODEL_RESPONSE_INVALID'}))
 except Exception: print('FS_VIDEO_JSON:'+json.dumps({'ok':False,'code':'MODEL_RESULT_UNKNOWN_DO_NOT_RETRY'}))
asyncio.run(main())
`
  return sshJson(API_HOST,`import subprocess\np=subprocess.run(['docker','exec','-i',${JSON.stringify(API_CONTAINER)},'python','-'],input=${JSON.stringify(inner)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=160)\nprint(p.stdout)\n`,180000)
}

function billing(requestId) {
  if(!/^[a-zA-Z0-9_-]{8,160}$/.test(requestId))throw Error('ENGINE_REQUEST_ID_INVALID')
  return sshJson(AI_HOST,sqlRunner+`
try:
 rows=query("SELECT coalesce(json_agg(json_build_object('logId',id,'engineRequestId',request_id,'model',model_name,'quota',quota,'promptTokens',prompt_tokens,'completionTokens',completion_tokens,'channelId',channel_id,'systemTokenId',token_id,'accountId',user_id,'type',type)), '[]'::json) FROM logs WHERE request_id='${requestId}';")
 if len(rows)!=1 or rows[0]['type']!=2 or rows[0]['model']!='futurestaff' or rows[0]['quota']!=0 or rows[0]['channelId']!=9: raise RuntimeError('ZERO_BILLING_NOT_CONFIRMED')
 print('FS_VIDEO_JSON:'+json.dumps({'ok':True,'customerQuota':0,'verifiedZeroCharge':True,'logs':rows}))
except Exception as e: print('FS_VIDEO_JSON:'+json.dumps({'ok':False,'code':str(e) if isinstance(e,RuntimeError) else 'BILLING_QUERY_FAILED'}))
`)
}

const SYSTEM='你是中文短视频编导。只输出JSON对象，不要Markdown。对象严格只有title、brief、scenes。scenes恰好5场，每场严格包含id（小写英文唯一标识）、title、narration（自然口语）、lines（1至2条短屏幕文字）、visual（hero/benefits/steps/offer/cta之一）。视频约25至35秒，旁白全片110至140个汉字。所有业务事实为虚构演示，brief和至少一个画面必须显著写“示例方案”，不得编造真实价格、地址、折扣、日期、客户评价。场景要从消费者日常需求进入，说明风味/选购体验/到店了解。最后轻结尾。不要GEO、软件、平台宣传。'
const BRIEF='做一条社区咖啡店新品活动的示例视频。店名“街角咖啡”为虚构，商品“柑橘冷萃”为示例新品；轻快、亲近、温暖，首版强调午后小憩。画面文字少，收尾写“到店了解”。'
export async function generateFreeVideoCase(outputDirectory,{resume=false}={}) {
  const output=path.resolve(outputDirectory)
  await mkdir(output,{recursive:true})
  const stateFile=path.join(output,'model-evidence.json')
  let evidence
  try{evidence=JSON.parse(await readFile(stateFile,'utf8'));if(!resume)throw Error('EXISTING_REQUEST_EVIDENCE_DO_NOT_REPEAT')}catch(error){if(error.code!=='ENOENT')throw error}
  evidence??={schemaVersion:1,status:'started',createdAt:new Date().toISOString(),owner:OWNER,policy:'Existing authorized FutureStaff non-OpenAI route; no new key; no retry',calls:[]}
  if(JSON.stringify(evidence.owner)!==JSON.stringify(OWNER)||!Array.isArray(evidence.calls))throw Error('EVIDENCE_OWNER_INVALID')
  const save=()=>writeFile(stateFile,JSON.stringify(evidence,null,2)+'\n')
  evidence.freeMetadata=freeMetadata();await save()
  const messages=[{role:'system',content:SYSTEM},{role:'user',content:BRIEF}]
  for(const phase of ['initial','revised']) {
    if(phase==='revised')messages.push({role:'user',content:'保留示例身份及五场结构，修改为更舒缓温柔的表达，改强调咖啡豆风味与柑橘清香。不要新增未经给定的商品事实，不写产地/烘焙程度/健康功效；使用“示例风味设定”标明演示。每场旁白保持聊天口吻，画面更简短。'})
    let call=evidence.calls.find(x=>x.phase===phase),content
    if(call)content=await readFile(path.join(output,`${phase}.model-output.txt`),'utf8')
    else {
      if(evidence.status===`${phase}-request-started`)throw Error('MODEL_RESULT_UNKNOWN_DO_NOT_RETRY')
      evidence.status=`${phase}-request-started`;await save()
      const response=callFreeModel(messages)
      // Persist the request reference immediately, before strict decoding or invoice checks.
      call={phase,...response,receivedAt:new Date().toISOString()};delete call.content;delete call.ok
      evidence.calls.push(call);await save()
      content=response.content
      await writeFile(path.join(output,`${phase}.model-output.txt`),content+'\n')
    }
    const contentSha256=createHash('sha256').update(content.trim()).digest('hex')
    if(call.contentSha256&&call.contentSha256!==contentSha256)throw Error('SAVED_MODEL_RESULT_CHANGED')
    call.contentSha256=contentSha256
    const draft=parseVideoDraft(content)
    let existingCreate
    try{existingCreate=JSON.parse(await readFile(path.join(output,`${phase}.create.json`),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
    const create={requestId:existingCreate?.requestId??`video-${phase}-${randomUUID()}`, ...draft,aspectRatio:'9:16',music:phase==='initial'?'upbeat':'gentle',voice:{provider:'edge',name:'zh-CN-XiaoxiaoNeural',rate:'+8%',pitch:'+2Hz'}}
    await writeFile(path.join(output,`${phase}.create.json`),JSON.stringify(create,null,2)+'\n')
    call.billing=billing(call.engineRequestId)
    if(call.usage?.prompt_tokens!==call.billing.logs[0].promptTokens||call.usage?.completion_tokens!==call.billing.logs[0].completionTokens)throw Error('USAGE_LOG_MISMATCH')
    evidence.status=`${phase}-verified`;await save()
    messages.push({role:'assistant',content})
  }
  evidence.status='completed';evidence.completedAt=new Date().toISOString();await save()
  return {status:'completed',outputDirectory:output,model:'futurestaff',calls:evidence.calls.length,verifiedZeroCharge:evidence.calls.every(x=>x.billing.verifiedZeroCharge)}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {values}=parseArgs({options:{output:{type:'string'},help:{type:'boolean'},resume:{type:'boolean'}}})
  if(values.help||!values.output)console.log('node scripts/video-case-free-model.mjs --output <new-absolute-case-directory> [--resume] (recheck saved terminal responses; unknown requests are never repeated)')
  else generateFreeVideoCase(values.output,{resume:values.resume}).then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error.message);process.exitCode=1})
}
