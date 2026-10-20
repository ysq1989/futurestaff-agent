import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { videoProvisionPayload } from '../scripts/provision-video-agent.mjs'
import { buildFocusPython, focusVideoAgent, FOCUS_AGENT_ID, FOCUS_SKILL_ID, INHERITED_FILES, VIDEO_SOUL } from '../scripts/focus-video-agent.mjs'

test('focus targets the existing video Agent and preserves standard tenant/access/file-history services', async () => {
  const payload = await videoProvisionPayload(), code = buildFocusPython(payload, 'apply')
  assert.equal(FOCUS_AGENT_ID, '5ae5429f-5652-40d7-890b-665c9c8c4e4d')
  assert.equal(FOCUS_SKILL_ID, '49d24f8b-5eba-4b47-8f9c-04f5b61103a6')
  assert.equal(Object.keys(INHERITED_FILES).length, 20)
  for (const [file, hash] of Object.entries(INHERITED_FILES)) {
    assert.match(file, /^skills\/(complex-task-executor|fashion-launch|mcp-installer|skill-creator|vercel-full-stack-deploy|website-design)\//)
    assert.match(hash, /^[a-f0-9]{64}$/)
  }
  assert.match(code, /FOCUS_EXISTING_TARGET_REQUIRED/)
  assert.match(code, /FOCUS_INHERITED_FILE_CHANGED/)
  assert.match(code, /expected_version_token=current.version_token/)
  assert.match(code, /await delete_file\(/)
  assert.match(code, /await update_agent\(/)
  assert.match(code, /await update_skill\(/)
  assert.match(code, /temporaryDesktopSessionRevoked/)
  assert.doesNotMatch(code, /db\.add\(/)
  assert.match(VIDEO_SOUL, /唯一身份|专注短视频/)
  assert.match(payload.skill.files[0].content, /你的唯一角色是“通用视频制作”/)
})

test('focus cannot change owner, run an unsupported mode, or silently bypass upstream contract drift', async () => {
  const payload = await videoProvisionPayload()
  assert.throws(() => buildFocusPython({ ...payload, owner: { ...payload.owner, userId: 'other' } }, 'apply'), /PROVISION_SCOPE_INVALID/)
  assert.throws(() => buildFocusPython(payload, 'delete'), /FOCUS_MODE_INVALID/)
})

test('unknown and completed focus operations become verify-only on subsequent invocation', async t => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'futurestaff-focus-'))
  t.after(() => rm(output, { recursive: true, force: true }))
  const modes = [], runRemote = async (_code, { mode }) => {
    modes.push(mode)
    if (mode === 'apply') throw Error('interrupted')
    return { ok: true, status: 'verified', verified: true, agentId: FOCUS_AGENT_ID }
  }
  await assert.rejects(focusVideoAgent(output, { apply: true, runRemote }), /FOCUS_RESULT_UNKNOWN_VERIFY_ONLY/)
  await focusVideoAgent(output, { apply: true, runRemote })
  await focusVideoAgent(output, { apply: true, runRemote })
  assert.deepEqual(modes, ['apply', 'verify', 'verify'])
  const receipt = JSON.parse(await readFile(path.join(output, 'focus-receipt.json'), 'utf8'))
  assert.equal(receipt.history.length, 3)
})

test('focus defaults to inspection and never mutates on rejected inspection', async t => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'futurestaff-focus-'))
  t.after(() => rm(output, { recursive: true, force: true }))
  const modes = []
  await assert.rejects(focusVideoAgent(output, { runRemote: async (_code, { mode }) => {
    modes.push(mode); return { ok: false, code: 'FOCUS_SOUL_CONFLICT' }
  } }), /FOCUS_SOUL_CONFLICT/)
  assert.deepEqual(modes, ['inspect'])
})
