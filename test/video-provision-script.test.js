import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { VIDEO_AGENT_OWNER, buildProvisionPython, videoProvisionPayload, provisionVideoAgent } from '../scripts/provision-video-agent.mjs'

async function directory(t) {
  const value = await mkdtemp(path.join(os.tmpdir(), 'futurestaff-provision-test-'))
  t.after(() => rm(value, { recursive: true, force: true }))
  return value
}

test('provisioner fixes the authorized owner and rejects cross-tenant execution before transport', async () => {
  const payload = await videoProvisionPayload()
  assert.equal(payload.skill.folder_name, 'video-production')
  assert.match(payload.skill.files[0].content, /^---\nname: video-production\ndescription:/)
  assert.equal(payload.owner, VIDEO_AGENT_OWNER)
  assert.throws(() => buildProvisionPython({ ...payload, owner: { ...payload.owner, tenantId: 'other' } }, 'apply'), /PROVISION_SCOPE_INVALID/)
  assert.throws(() => buildProvisionPython(payload, 'delete'), /PROVISION_SCOPE_INVALID/)
})

test('an interrupted apply can only verify existing state and never submit creation a second time', async t => {
  const output = await directory(t), modes = []
  const runRemote = async (_code, { mode }) => { modes.push(mode); if (mode === 'apply') throw Error('connection interrupted'); return { ok: true, status: 'verified', verified: true, agentId: 'actual-agent', skillId: 'actual-skill' } }
  await assert.rejects(provisionVideoAgent(output, { apply: true, runRemote }), /PROVISION_RESULT_UNKNOWN_VERIFY_ONLY/)
  const result = await provisionVideoAgent(output, { apply: true, runRemote })
  assert.deepEqual(modes, ['apply', 'verify'])
  assert.equal(result.verified, true)
  const receipt = JSON.parse(await readFile(path.join(output, 'provision-receipt.json'), 'utf8'))
  assert.equal(receipt.history[0].result.resultMayExist, true)
  assert.equal(receipt.history.length, 2)
})

test('re-running a completed provisioning operation is verification-only, even with --apply', async t => {
  const output = await directory(t), modes = []
  const runRemote = async (_code, { mode }) => { modes.push(mode); return { ok: true, status: 'verified', verified: true, agentId: 'actual-agent', skillId: 'actual-skill' } }
  await provisionVideoAgent(output, { apply: true, runRemote })
  await provisionVideoAgent(output, { apply: true, runRemote })
  assert.deepEqual(modes, ['apply', 'verify'])
})

test('default invocation only inspects and rejected inspection never escalates into apply', async t => {
  const output = await directory(t), modes = []
  const runRemote = async (_code, { mode }) => { modes.push(mode); return { ok: false, code: 'OWNER_NOT_ACTIVE', resultMayExist: false } }
  await assert.rejects(provisionVideoAgent(output, { runRemote }), /OWNER_NOT_ACTIVE/)
  assert.deepEqual(modes, ['inspect'])
  const receipt = JSON.parse(await readFile(path.join(output, 'provision-receipt.json'), 'utf8'))
  assert.equal(receipt.status, 'rejected')
})
