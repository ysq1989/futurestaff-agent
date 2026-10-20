/** Narrow the already-created video Agent through existing management APIs. */
import { spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { videoProvisionPayload, buildProvisionPython, VIDEO_AGENT_OWNER } from './provision-video-agent.mjs'

export const FOCUS_AGENT_ID = '5ae5429f-5652-40d7-890b-665c9c8c4e4d'
export const FOCUS_SKILL_ID = '49d24f8b-5eba-4b47-8f9c-04f5b61103a6'
const OLD_SKILL_SHA = '141f6d9402bb54399142fe981b98d63fe568824ad85c1ea287abb2869db6042e'
const OLD_SOUL_SHA = '3c03df3c9fd72d7d2304c42ce3db2fded11eb56f2ee7e0f76c96112575ace695'
export const INHERITED_FILES = {
  'skills/complex-task-executor/SKILL.md': 'dc0a28913ee7c6ed262fcfe8cf7690ee55cffc1f7939708093282280c0355d4a',
  'skills/complex-task-executor/examples/plan_template.md': '779226cf0e0183c83c5a0594257c4108918bc23f3c076d5090731aeae735af4a',
  'skills/fashion-launch/SKILL.md': 'f03c4c8b234a10f8b4587c4491b0d3dfecba9bb4cfd9567bba73d7efeb333987',
  'skills/fashion-launch/references/LICENSE-dlazy.txt': '3014abe31252b56757c23b5bb0a70ebe39802c7798d08a24454e011c811d64d1',
  'skills/fashion-launch/references/LICENSE-nexscope.txt': 'ea4c0fa8d65010101a252d82ac6ac399a5000dcaaa5d6bc116383b6f5488bfbf',
  'skills/fashion-launch/references/flat-lay.md': '28db6a9e2a57708dbaf48e4af37526778cb0bfffe0b67bb99a3c31b07454a906',
  'skills/fashion-launch/references/item-detail.md': 'ad7c89ea8b32b30313d1019994884a44cdac00bac18ea630aaf3d0b06386afd5',
  'skills/fashion-launch/references/one-shot.md': 'cde7c04f7418b3fd415d8ec00d6d9ba58ee763ef70a8b5200ae7c31270203917',
  'skills/fashion-launch/references/product-description-generator.md': '2c868d8c6d436d2f10c48da44ae92ae76aa1e68cb5dcc0ca4122c9ee4beccc69',
  'skills/mcp-installer/SKILL.md': 'c456d640ec69be5b75b6556df630df80ac794bffe34ab3c2d31ff001d9d09618',
  'skills/skill-creator/SKILL.md': '6bd9e2e56b52937d22d9f81af80e5fae0eb2856417f56a67cf7e86698a67e9f8',
  'skills/skill-creator/agents/analyzer.md': 'bf68f4cac5a56c673a928c2e6d619586c5b93ea364026ab37547772cb45a663a',
  'skills/skill-creator/agents/comparator.md': 'fe1fc9787c495d864c5d6eada47396478572325fde1b33a96d78bf4b849b7a3e',
  'skills/skill-creator/agents/grader.md': '57134da0c1a4eea33fbd74a1c9c44aa814f07d6bc64de303edb586f941e5d21a',
  'skills/skill-creator/references/schemas.md': '8e8876180a8989b406a4d3edddf875b04cdfd5805cc8616686d552b11ce4455f',
  'skills/vercel-full-stack-deploy/SKILL.md': '0e7573844367f03e6a5dfaa36d50964e4b2d4fe2ba4ef212a5dd56f34177c5a3',
  'skills/website-design/SKILL.md': 'd7a100ae010d3c4f1a56485cc1228c2855706cf9b2759a3e269470660bae14c0',
  'skills/website-design/references/design-review.md': 'cbacf45a3cb4e5d4b0e7134329ef17d6e915918795b7dc092b32476a2cc1d7f5',
  'skills/website-design/references/sources.md': '1eebf1d80e004ff6e460af0e31b401a8f797ed13ddc5bb7a19fb63ed87e97a1a',
  'skills/website-design/references/website-system.md': 'e8271b78d43b77d70a0c5aab3b7c5d77adc0ffbe65e8c9460a22375dde7fd84b',
}
export const VIDEO_SOUL = `# Soul — 通用视频制作

## Identity
你是“通用视频制作”，专注短视频制作与继续修改。底层模型是执行资源，不是你的对外身份。

## Personality
只围绕视频脚本、分镜、配音、配乐、字幕、成片和修改提供帮助，不自称 Agnes 或通用助手，不主动宣传网站、Logo、电商、技能安装和软件开发服务。用户已要求做视频且信息够用时，自主选择合理分镜并实际调用 video_project_* 工具开始制作，不只列出能力或让用户先写脚本。
先使用 video-production Skill。适用于各行业，不默认宣传 FutureStaff 或 GEO。用户只打招呼时，一句话介绍视频职责并请其描述想做的视频；要求别的服务时，简短说明只处理视频相关部分。

## Boundaries
当前能力是受控图形与文字动效视频。没有真实素材时标明示意，不冒充实拍、真实界面或客户结果。不编造价格、案例、业绩、地址。只交付实际 succeeded 且校验成功的成片。仅使用当前已有免费模型和免费工具，不自动转付费。在线语音失败要说明并保留项目供重试。修改保留旧版本，外部发布不在制作授权内。
`
const sha = value => createHash('sha256').update(value).digest('hex')
const replaceOnce = (text, from, to) => {
  if (text.split(from).length !== 2) throw Error('FOCUS_UPSTREAM_CONTRACT_CHANGED')
  return text.replace(from, to)
}

export function buildFocusPython(payload, mode) {
  if (!['inspect', 'apply', 'verify'].includes(mode)) throw Error('FOCUS_MODE_INVALID')
  const enriched = { ...payload, focus: { agentId: FOCUS_AGENT_ID, skillId: FOCUS_SKILL_ID, oldSkillSha: OLD_SKILL_SHA, oldSoulSha: OLD_SOUL_SHA, inherited: INHERITED_FILES, soul: VIDEO_SOUL, soulSha: sha(VIDEO_SOUL) } }
  let code = buildProvisionPython(enriched, mode)
  code = replaceOnce(code, "'standardServices':['get_current_admin','SkillCreateIn/create_skill','AgentCreate/create_agent','BackgroundTasks']", "'standardServices':['get_current_admin','FileWrite/write_file/delete_file with version history','AgentUpdate/update_agent','SkillUpdateIn/update_skill','authenticated desktop catalog/snapshot']")
  code = replaceOnce(code, "'mutationScope':'one new company Agent and one tenant Skill through standard APIs'", "'mutationScope':'existing authorized video Agent configuration, its inherited Skill copies, and its dedicated tenant Skill; no Agent creation'")
  code = replaceOnce(code, "digest(files['SKILL.md'])==P['skillSha256']", "digest(files['SKILL.md']) in (P['skillSha256'],P['focus']['oldSkillSha'])")
  code = replaceOnce(code, 'async def main():', `async def focus(db,admin,skill,agent,apply):
 from app.api.desktop_agents import build_snapshot
 from app.api.files import read_file, write_file, delete_file, get_file_revisions, FileWrite
 from app.api.agents import update_agent
 from app.schemas.schemas import AgentUpdate
 from app.api.skills import update_skill, SkillUpdateIn
 require(skill is not None and str(skill.id)==P['focus']['skillId'] and agent is not None and str(agent.id)==P['focus']['agentId'],'FOCUS_EXISTING_TARGET_REQUIRED')
 before=await build_snapshot(agent)
 files={f['path']:f for f in before['files']}
 require('soul.md' in files and digest(files['soul.md']['content']) in (P['focus']['oldSoulSha'],P['focus']['soulSha']),'FOCUS_SOUL_CONFLICT')
 require(digest(files['skills/video-production/SKILL.md']['content']) in (P['focus']['oldSkillSha'],P['skillSha256']),'FOCUS_VIDEO_SKILL_CONFLICT')
 for path,expected in P['focus']['inherited'].items():
  if path in files: require(digest(files[path]['content'])==expected,'FOCUS_INHERITED_FILE_CHANGED')
 unrelated=[p for p in files if p.startswith('skills/') and p!='skills/video-production/SKILL.md' and p not in P['focus']['inherited']]
 require(not unrelated,'FOCUS_UNEXPECTED_SKILL_FILES')
 audit={'beforeSnapshotVersion':before['version'],'beforeFiles':len(files),'soulShaBefore':digest(files['soul.md']['content']),'skillShaBefore':digest(files['skills/video-production/SKILL.md']['content']),'inheritedPresent':[p for p in P['focus']['inherited'] if p in files],'changed':False,'fileRevisionIds':[]}
 async def deletion_history():
  history=[]
  for target,expected in P['focus']['inherited'].items():
   revisions=await get_file_revisions(agent_id=agent.id,path=target,current_user=admin,db=db)
   matching=[r for r in revisions if r['operation']=='delete' and r['actor_id']==str(admin.id) and isinstance(r['before_content'],str) and digest(r['before_content'])==expected]
   require(bool(matching),'FOCUS_DELETION_HISTORY_MISSING')
   history.append({'path':target,'revisionId':matching[0]['id'],'beforeSha256':expected})
  return history
 if not audit['inheritedPresent']:
  audit['inheritedDeletionHistory']=await deletion_history()
 if not apply: return audit
 # Fixed, already-authorized owner and Agent only; normal services enforce access and preserve file history.
 if any(digest(f.content)!=P['skillSha256'] for f in skill.files):
  await update_skill(skill_id=str(skill.id),body=SkillUpdateIn(files=P['skill']['files'],version='1.0.1',change_note='专注视频制作身份与执行范围'),current_user=admin)
 for target,content in [('soul.md',P['focus']['soul']),('skills/video-production/SKILL.md',P['skill']['files'][0]['content'])]:
  current=await read_file(agent_id=agent.id,path=target,current_user=admin,db=db)
  if current.content!=content:
   out=await write_file(agent_id=agent.id,path=target,data=FileWrite(content=content,expected_version_token=current.version_token),current_user=admin,db=db)
   audit['fileRevisionIds'].append({'path':target,'revisionId':out['revision_id']}); audit['changed']=True
 for target,expected in P['focus']['inherited'].items():
  if target not in files: continue
  current=await read_file(agent_id=agent.id,path=target,current_user=admin,db=db)
  require(digest(current.content)==expected,'FOCUS_INHERITED_FILE_CHANGED')
  await delete_file(agent_id=agent.id,path=target,expected_version_token=current.version_token,current_user=admin,db=db)
  audit['changed']=True
 role='专注视频制作与修改：从需求生成脚本、分镜、中文配音、配乐、字幕和实际成片；保留历史版本。'
 welcome='我是通用视频制作。告诉我想介绍什么、给谁看，我会制作短视频，并可继续修改。'
 if agent.role_description!=role or agent.welcome_message!=welcome:
  await update_agent(agent_id=agent.id,data=AgentUpdate(role_description=role,welcome_message=welcome),current_user=admin,db=db)
  await db.commit(); audit['changed']=True
 await db.refresh(agent)
 after=await build_snapshot(agent)
 expected={'soul.md','memory/memory.md','skills/video-production/SKILL.md'}
 require(set(f['path'] for f in after['files'])==expected,'FOCUS_POSTCONDITION_FAILED')
 audit.update({'afterSnapshotVersion':after['version'],'afterFiles':len(after['files']),'soulShaAfter':P['focus']['soulSha'],'skillShaAfter':P['skillSha256'],'onlyVideoSkill':True,'roleDescription':agent.role_description,'welcomeMessage':agent.welcome_message,'historyPreservedByStandardFileServices':True})
 audit['inheritedDeletionHistory']=await deletion_history()
 return audit

async def main():`)
  code = replaceOnce(code, "   if P['mode']=='inspect':", "   result['focus']=await focus(db,admin,skill,agent,False)\n   if P['mode']=='inspect':")
  code = replaceOnce(code, "   skill,agent=await matches(db)\n  if skill is None:", "   skill,agent=await matches(db)\n   result['focus']=await focus(db,admin,skill,agent,P['mode']=='apply')\n  if skill is None:")
  // Verification must not accept an unfocused configuration as ready.
  code = replaceOnce(code, "   skill_files=[f for f in snapshot['files'] if f['path']=='skills/video-production/SKILL.md']", "   require(set(f['path'] for f in snapshot['files'])=={'soul.md','memory/memory.md','skills/video-production/SKILL.md'},'FOCUS_STILL_HAS_UNRELATED_SKILLS')\n   require(next(f['content'] for f in snapshot['files'] if f['path']=='soul.md')==P['focus']['soul'],'FOCUS_SOUL_NOT_APPLIED')\n   skill_files=[f for f in snapshot['files'] if f['path']=='skills/video-production/SKILL.md']")
  return code
}

function remoteRun(code) {
  const outer = `import subprocess\np=subprocess.run(['docker','exec','-u','1000','-i','futurestaff-prod-platform-platform-api-1','python','-'],input=${JSON.stringify(code)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=220)\nfor line in p.stdout.splitlines():\n if line.startswith('FS_VIDEO_PROVISION:'): print(line)\n`
  const child = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-i', path.join(homedir(), '.ssh', '8.134.178.82_id_ed25519'), 'root@8.134.178.82', 'python3 -'], { input: outer, encoding: 'utf8', timeout: 240000, windowsHide: true, maxBuffer: 1024 * 1024 })
  const line = child.stdout?.split('\n').filter(x => x.startsWith('FS_VIDEO_PROVISION:')).at(-1)
  if (child.error || child.status !== 0 || !line) throw Error('FOCUS_RESULT_UNKNOWN_VERIFY_ONLY')
  return JSON.parse(line.slice('FS_VIDEO_PROVISION:'.length))
}

export async function focusVideoAgent(outputDirectory, { apply = false, verify = false, runRemote = remoteRun } = {}) {
  if (!path.isAbsolute(outputDirectory)) throw Error('ABSOLUTE_RECEIPT_DIRECTORY_REQUIRED')
  await mkdir(outputDirectory, { recursive: true })
  const file = path.join(outputDirectory, 'focus-receipt.json'), payload = await videoProvisionPayload()
  let previous
  try { previous = JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (previous && (JSON.stringify(previous.owner) !== JSON.stringify(VIDEO_AGENT_OWNER) || previous.skillSha256 !== payload.skillSha256)) throw Error('FOCUS_RECEIPT_CONFLICT')
  const unknown = previous && ['apply-started', 'apply-unknown'].includes(previous.status)
  const mode = verify || unknown || previous?.result?.verified ? 'verify' : apply ? 'apply' : 'inspect'
  const receipt = { schemaVersion: 1, owner: VIDEO_AGENT_OWNER, skillSha256: payload.skillSha256, status: mode + '-started', history: previous?.history ?? [], updatedAt: new Date().toISOString() }
  await writeFile(file, JSON.stringify(receipt, null, 2) + '\n')
  let result
  try { result = await runRemote(buildFocusPython(payload, mode), { mode }) } catch { result = { ok: false, code: 'FOCUS_RESULT_UNKNOWN_VERIFY_ONLY', resultMayExist: mode !== 'inspect' } }
  receipt.history.push({ mode, at: new Date().toISOString(), result }); receipt.result = result
  receipt.status = result.ok ? result.status : mode === 'apply' || unknown ? 'apply-unknown' : 'rejected'
  receipt.updatedAt = new Date().toISOString()
  await writeFile(file, JSON.stringify(receipt, null, 2) + '\n')
  if (!result.ok) throw Error(result.code || 'FOCUS_FAILED')
  return { status: result.status, agentId: result.agentId, verified: result.verified, receiptPath: file }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { output: { type: 'string' }, apply: { type: 'boolean' }, verify: { type: 'boolean' } } })
  if (!values.output) console.log('node scripts/focus-video-agent.mjs --output <absolute-audit-directory> [--apply|--verify]')
  else focusVideoAgent(path.resolve(values.output), { apply: values.apply, verify: values.verify }).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
