/** Authorized, owner-pinned provisioning through existing Platform API services.
 * Runs as the API container's ordinary UID. No credential crosses SSH or enters receipts.
 * An unknown apply is verification-only on subsequent runs; it never blindly creates again.
 */
import { spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

export const VIDEO_AGENT_OWNER = Object.freeze({ tenantId: '6e7db441-c4ea-4f16-8261-9e1a5379b2ff', userId: '242ab148-8370-4d54-b6bb-da4bbee4a0f3', modelId: '08addb41-8be5-4cf4-93b8-85005db54305' })
const HOST = '8.134.178.82'
const CONTAINER = 'futurestaff-prod-platform-platform-api-1'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = text => createHash('sha256').update(text).digest('hex')

export function buildVideoSkill(instructions) {
  if (typeof instructions !== 'string' || instructions.length < 500 || instructions.length > 20000) throw Error('VIDEO_INSTRUCTIONS_INVALID')
  return `---\nname: video-production\ndescription: 根据用户描述制作和修改通用行业的短视频，保存脚本分镜、中文配音、配乐、字幕和实际成片；通过 FutureStaff Agent 已注册的视频工具执行。\n---\n\n${instructions.trim()}\n\n## 收到简短需求时\n\n用户只给行业、目的或一句想法时，自主选择合理的时长、比例、五至七场分镜与视觉风格，直接保存初稿并制作。默认约30至60秒竖屏。只有缺少会改变内容真实性或交付要求的关键信息时才询问；不要求用户先写脚本、选择工具或理解安装步骤。用户授权制作已足够开始，宿主原生审批仍按其提示完成。\n\n当前版本制作受控图形与文字动效视频，支持 hero、benefits、steps、offer、cta 场景；不是任意真人拍摄或图生视频服务。没有真实素材时采用示意画面，不把示意当成真实商品、界面或客户结果。\n\n## 工具参数示例\n\n先调用 video_project_create，参数形如：\n\n\`\`\`json\n{"requestId":"coffee-intro-v1","title":"街角咖啡 · 示例方案","brief":"虚构社区咖啡店的午后新品介绍，温暖轻快；价格、地址未提供，不编写。","aspectRatio":"9:16","theme":"warm","music":"upbeat","voice":{"provider":"edge","name":"zh-CN-XiaoxiaoNeural","rate":"+8%","pitch":"+2Hz"},"scenes":[{"id":"intro","title":"午后，给自己一杯香气","narration":"忙碌的午后，留一点时间给自己。","lines":["社区咖啡店 · 示例方案"],"visual":"hero"},{"id":"taste","title":"从一口清香开始","narration":"这个示例，想用清新的风味，陪你慢下来。","lines":["示例风味设定"],"visual":"benefits"},{"id":"visit","title":"到店了解","narration":"有空来坐坐，找到你喜欢的那一杯。","lines":["到店了解"],"visual":"cta"}]}\n\`\`\`\n\n示例仅解释字段，不是固定文案。每场标题最多90字，画面短句最多4条、每条100字，旁白最多1200字；总计1至12场、旁白最多5000字、成片最多180秒。场景id须唯一。theme 可选 warm/clean/bold；music 可选 upbeat/gentle/none；voice.provider 可选 edge/none。不要填写未导入的 assetId。\n\ncreate成功后保留返回的projectId与revisionId，再用新的requestId调用video_project_render；profile用preview或final。用video_project_status的projectId/jobId查询，短暂查询间隔留给正常处理，不循环重提。修改用video_project_revise传projectId、真实baseRevisionId、新requestId和changes；例如changes={"music":"gentle","scenes":[完整的新场景列表]}。随后渲染新revisionId。\n\n只交付真实成功结果中的links.videoUrl、links.webmUrl及字幕链接；链接是当前电脑的私有临时入口，过期后重新查询原任务。若语音失败，可向用户说明后重试制作，或经其同意改为无旁白，不把失败说成完成。\n`
}

export async function videoProvisionPayload() {
  const body = await readFile(path.join(repo, 'plugins/fs-video/VIDEO-AGENT-INSTRUCTIONS.md'), 'utf8')
  const skillContent = buildVideoSkill(body)
  return {
    schemaVersion: 1, owner: VIDEO_AGENT_OWNER, agentName: '通用视频制作',
    skill: { name: '通用视频制作', description: '从用户描述生成可继续修改的短视频脚本、分镜、中文配音、配乐、字幕与实际成片。', category: 'business', icon: 'VD', folder_name: 'video-production', version: '1.0.0', files: [{ path: 'SKILL.md', content: skillContent }] },
    skillSha256: sha256(skillContent),
    roleDescription: '一句话描述需求，制作适用于各行业的动效短视频；支持脚本、中文配音、配乐、字幕和成片，并可继续修改、保留历史版本。',
    personality: '你是通用视频制作助手。先加载 video-production Skill，使用已注册的 video_project_* 工具执行真实制作。用户给出行业和目标且信息够用时自主设计脚本分镜并开始，不把工作转交给用户。不默认宣传 FutureStaff 或 GEO。',
    boundaries: '只依据真实输入和明确示例组织内容，不编造价格、客户案例、业绩或功能截图。只交付真实 succeeded 视频结果。免费模型不可用时不自动转付费；在线语音失败时保留项目并说明。外部发布不属于本次制作授权。',
  }
}

export function buildProvisionPython(payload, mode) {
  if (!['inspect', 'apply', 'verify'].includes(mode) || JSON.stringify(payload.owner) !== JSON.stringify(VIDEO_AGENT_OWNER)) throw Error('PROVISION_SCOPE_INVALID')
  const encoded = Buffer.from(JSON.stringify({ ...payload, mode })).toString('base64')
  return `
import asyncio, base64, hashlib, json, logging, os, uuid
from contextlib import suppress
logging.disable(logging.CRITICAL)
from loguru import logger
logger.remove()
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from fastapi import BackgroundTasks, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from app.database import async_session
from app.models.user import User
from app.models.tenant import Tenant
from app.models.llm import LLMModel
from app.models.agent import Agent, AgentPermission
from app.models.skill import Skill
from app.core.security import get_current_admin
from app.services.model_pool import validate_selection
from app.services.quota_guard import check_agent_creation_quota
from app.api.skills import SkillCreateIn, create_skill
from app.api.agents import create_agent
from app.schemas.schemas import AgentCreate
from app.api.desktop_agents import list_desktop_agents, desktop_agent_snapshot
from app.core.desktop_auth import issue_desktop_session, revoke_desktop_credentials
from app.core.events import get_redis, close_redis
P=json.loads(base64.b64decode('${encoded}'))
O=P['owner']
TID=uuid.UUID(O['tenantId']); UID=uuid.UUID(O['userId']); MID=uuid.UUID(O['modelId'])
def require(condition, code):
 if not condition: raise ValueError(code)
def digest(value): return hashlib.sha256(value.encode()).hexdigest()
async def matches(db):
 # Skill folder names are globally unique. A conflicting foreign owner is refused, never modified.
 skills=(await db.execute(select(Skill).where(or_(Skill.folder_name==P['skill']['folder_name'],Skill.name==P['skill']['name'])).options(selectinload(Skill.files)))).scalars().all()
 require(len(skills)<=1,'SKILL_CONFLICT')
 skill=skills[0] if skills else None
 if skill:
  require(skill.tenant_id==TID and skill.folder_name=='video-production' and skill.name==P['skill']['name'] and not skill.is_builtin,'SKILL_SCOPE_CONFLICT')
  files={f.path:f.content for f in skill.files}
  require(set(files)=={'SKILL.md'} and digest(files['SKILL.md'])==P['skillSha256'],'SKILL_CONTENT_CONFLICT')
 agents=(await db.execute(select(Agent).where(Agent.tenant_id==TID,Agent.name==P['agentName']))).scalars().all()
 require(len(agents)<=1,'AGENT_NAME_AMBIGUOUS')
 agent=agents[0] if agents else None
 if agent:
  require(agent.creator_id==UID and agent.agent_type=='native' and agent.primary_model_id==MID and agent.fallback_model_id is None and agent.access_mode=='company' and agent.company_access_level=='use','AGENT_SCOPE_CONFLICT')
 return skill,agent
async def main():
 require(os.getuid()==1000,'CONTAINER_UID_REQUIRED')
 result={'schemaVersion':1,'owner':O,'mode':P['mode'],'executionUid':os.getuid(),'createdSkill':False,'createdAgent':False,'standardServices':['get_current_admin','SkillCreateIn/create_skill','AgentCreate/create_agent','BackgroundTasks'],'verified':False}
 lock=None; redis=None; session=None
 try:
  async with async_session() as db:
   user=(await db.execute(select(User).where(User.id==UID,User.tenant_id==TID).options(selectinload(User.identity)))).scalar_one_or_none()
   tenant=await db.get(Tenant,TID)
   require(user is not None and user.is_active and tenant is not None and tenant.is_active and user.identity_id is not None,'OWNER_NOT_ACTIVE')
   admin=await get_current_admin(user)
   require(admin.id==UID and admin.tenant_id==TID,'OWNER_ADMIN_REQUIRED')
   model=await db.get(LLMModel,MID)
   require(model is not None and model.tenant_id==TID and model.enabled and model.model=='futurestaff' and model.source_type=='futurestaff_ai' and model.model_kind=='text' and model.base_url=='https://ai.erplucky.com/v1','FREE_MODEL_BINDING_CHANGED')
   await validate_selection(db,TID,MID,None)
   skill,agent=await matches(db)
   result.update({'ownerRole':user.role,'model':{'modelId':str(model.id),'model':'futurestaff','sourceType':model.source_type,'fallbackModelId':None},'skillId':str(skill.id) if skill else None,'agentId':str(agent.id) if agent else None,'agentStatus':agent.status if agent else None,'skillSha256':P['skillSha256']})
   if P['mode']=='inspect':
    if not agent: await check_agent_creation_quota(UID)
    result.update({'ok':True,'status':'inspected','quotaChecked':not bool(agent)}); return result
   require(P['mode']=='apply' or (skill is not None and agent is not None),'UNKNOWN_APPLY_NOT_REPEATED')
  redis=await get_redis()
  lock='operator:video-agent:'+str(TID)+':'+str(UID)
  lock_value=str(uuid.uuid4())
  require(await redis.set(lock,lock_value,ex=900,nx=True),'PROVISION_ALREADY_RUNNING')
  # Recheck after the distributed lock, then invoke unchanged normal API service functions.
  async with async_session() as db:
   skill,agent=await matches(db)
  if skill is None:
   require(P['mode']=='apply','SKILL_NOT_FOUND')
   created=await create_skill(body=SkillCreateIn(**P['skill']),current_user=admin)
   result['createdSkill']=True; result['skillId']=created['id']
  else: result['skillId']=str(skill.id)
  if agent is None:
   require(P['mode']=='apply','AGENT_NOT_FOUND')
   tasks=BackgroundTasks()
   data=AgentCreate(name=P['agentName'],role_description=P['roleDescription'],agent_type='native',primary_model_id=MID,fallback_model_id=None,permission_scope_type='company',permission_access_level='use',skill_ids=[uuid.UUID(result['skillId'])],personality=P['personality'],boundaries=P['boundaries'],autonomy_policy={'business_systems':[],'read_files':'L1','write_workspace_files':'L2','delete_files':'L3','execute_code':'L3','send_external_message':'L3'})
   async with async_session() as db:
    current=(await db.execute(select(User).where(User.id==UID,User.tenant_id==TID).options(selectinload(User.identity)))).scalar_one()
    await get_current_admin(current)
    created=await create_agent(data=data,background_tasks=tasks,current_user=current,db=db)
    result['agentId']=str(created.id); result['createdAgent']=True
   await tasks()
   result['backgroundSetupCompleted']=True
  else: result['agentId']=str(agent.id)
  async with async_session() as db:
   skill,agent=await matches(db)
   require(skill is not None and agent is not None and str(agent.id)==result['agentId'],'CREATED_STATE_NOT_FOUND')
   require(agent.status not in ('creating','stopped','error') and not agent.is_expired,'AGENT_NOT_READY')
   permissions=(await db.execute(select(AgentPermission).where(AgentPermission.agent_id==agent.id))).scalars().all()
   require(any(p.scope_type=='company' and p.access_level=='use' for p in permissions),'COMPANY_USE_NOT_VERIFIED')
   current=(await db.execute(select(User).where(User.id==UID,User.tenant_id==TID).options(selectinload(User.identity)))).scalar_one()
   session=await issue_desktop_session(redis,identity_id=str(current.identity_id),user_id=str(current.id),tenant_id=str(TID),role=current.role,access_lifetime_seconds=120,refresh_lifetime_seconds=120)
   credentials=HTTPAuthorizationCredentials(scheme='Bearer',credentials=session['accessToken'])
   catalog=await list_desktop_agents(credentials=credentials,redis=redis,db=db)
   require(isinstance(catalog,dict) and catalog.get('activeTenantId')==str(TID),'CATALOG_AUTH_FAILED')
   cards=[c for c in catalog['items'] if c['agentId']==str(agent.id)]
   require(len(cards)==1 and cards[0]['available'] is True,'CATALOG_AGENT_UNAVAILABLE')
   response=await desktop_agent_snapshot(agent_id=agent.id,credentials=credentials,redis=redis,db=db)
   require(isinstance(response,dict) and response.get('activeTenantId')==str(TID),'SNAPSHOT_AUTH_FAILED')
   snapshot=response['snapshot']
   skill_files=[f for f in snapshot['files'] if f['path']=='skills/video-production/SKILL.md']
   require(len(skill_files)==1 and digest(skill_files[0]['content'])==P['skillSha256'],'SNAPSHOT_SKILL_MISMATCH')
   require(len(snapshot['version'])==64 and snapshot.get('businessSystems')==[],'SNAPSHOT_VERSION_SCOPE_INVALID')
   result.update({'ok':True,'status':'verified','verified':True,'catalogAvailable':True,'snapshotVersion':snapshot['version'],'snapshotFiles':len(snapshot['files']),'snapshotSkillPath':skill_files[0]['path'],'permissionScope':'company','permissionAccess':'use','agentStatus':agent.status,'noFallbackModel':agent.fallback_model_id is None,'mutationScope':'one new company Agent and one tenant Skill through standard APIs'})
  return result
 finally:
  if redis is not None and session is not None:
   await revoke_desktop_credentials(redis,access_token=session['accessToken'],refresh_token=session['refreshToken'])
   result['temporaryDesktopSessionRevoked']=True
  if redis is not None and lock is not None:
   with suppress(Exception):
    await redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,lock,lock_value)
  await close_redis()
try:
 receipt=asyncio.run(main())
 print('FS_VIDEO_PROVISION:'+json.dumps(receipt,ensure_ascii=False))
except HTTPException as error:
 print('FS_VIDEO_PROVISION:'+json.dumps({'ok':False,'code':'STANDARD_API_REJECTED_'+str(error.status_code),'resultMayExist':True}))
except ValueError as error:
 code=str(error)
 print('FS_VIDEO_PROVISION:'+json.dumps({'ok':False,'code':code if code.replace('_','').isalnum() and code.isupper() else 'PROVISION_VALIDATION_FAILED','resultMayExist':P['mode']!='inspect'}))
except Exception:
 print('FS_VIDEO_PROVISION:'+json.dumps({'ok':False,'code':'PROVISION_RESULT_UNKNOWN_VERIFY_ONLY','resultMayExist':P['mode']!='inspect'}))
`
}

function remoteRun(code) {
  const outer = `import subprocess\np=subprocess.run(['docker','exec','-u','1000','-i','${CONTAINER}','python','-'],input=${JSON.stringify(code)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=200)\nfor line in p.stdout.splitlines():\n if line.startswith('FS_VIDEO_PROVISION:'): print(line)\n`
  const child = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-i', path.join(homedir(), '.ssh', `${HOST}_id_ed25519`), `root@${HOST}`, 'python3 -'], { input: outer, encoding: 'utf8', timeout: 220000, maxBuffer: 1024 * 1024, windowsHide: true })
  if (child.error || child.status !== 0) throw Error('PROVISION_RESULT_UNKNOWN_VERIFY_ONLY')
  const marker = child.stdout.split('\n').filter(line => line.startsWith('FS_VIDEO_PROVISION:')).at(-1)
  if (!marker) throw Error('PROVISION_RESULT_UNKNOWN_VERIFY_ONLY')
  return JSON.parse(marker.slice('FS_VIDEO_PROVISION:'.length))
}

export async function provisionVideoAgent(outputDirectory, { apply = false, verify = false, runRemote = remoteRun } = {}) {
  if (!path.isAbsolute(outputDirectory)) throw Error('ABSOLUTE_RECEIPT_DIRECTORY_REQUIRED')
  await mkdir(outputDirectory, { recursive: true })
  const file = path.join(outputDirectory, 'provision-receipt.json'), payload = await videoProvisionPayload()
  let previous
  try { previous = JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (previous && (JSON.stringify(previous.owner) !== JSON.stringify(VIDEO_AGENT_OWNER) || previous.skillSha256 !== payload.skillSha256)) throw Error('PROVISION_RECEIPT_CONFLICT')
  const unknown = previous && ['apply-started', 'apply-unknown'].includes(previous.status)
  const settled = previous?.result?.verified === true
  const mode = verify || unknown || settled ? 'verify' : apply ? 'apply' : 'inspect'
  const history = previous?.history ?? []
  const state = { schemaVersion: 1, owner: VIDEO_AGENT_OWNER, skillSha256: payload.skillSha256, status: mode === 'apply' ? 'apply-started' : mode + '-started', updatedAt: new Date().toISOString(), history }
  await writeFile(file, JSON.stringify(state, null, 2) + '\n')
  let result
  try { result = await runRemote(buildProvisionPython(payload, mode), { mode }) } catch { result = { ok: false, code: 'PROVISION_RESULT_UNKNOWN_VERIFY_ONLY', resultMayExist: mode !== 'inspect' } }
  history.push({ mode, at: new Date().toISOString(), result })
  state.status = result.ok ? result.status : mode === 'apply' || unknown ? 'apply-unknown' : 'rejected'
  state.result = result; state.updatedAt = new Date().toISOString()
  await writeFile(file, JSON.stringify(state, null, 2) + '\n')
  if (!result.ok) throw Error(result.code || 'PROVISION_FAILED')
  return { status: result.status, agentId: result.agentId, skillId: result.skillId, verified: result.verified, receiptPath: file }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { output: { type: 'string' }, apply: { type: 'boolean' }, verify: { type: 'boolean' } } })
  if (!values.output) console.log('node scripts/provision-video-agent.mjs --output <absolute-audit-directory> [--apply|--verify]')
  else provisionVideoAgent(path.resolve(values.output), { apply: values.apply, verify: values.verify }).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
