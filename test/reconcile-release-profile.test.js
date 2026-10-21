import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { reconcileReleaseProfile } from '../scripts/reconcile-release-profile.mjs'

test('operator reconciliation defaults to read-only and applies only through startup validation', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'futurestaff-reconcile-'))
  try {
    const resources = path.join(root, 'resources')
    const source = path.join(resources, 'futurestaff-profile/profiles/futurestaff-alpha')
    const home = path.join(root, 'home')
    const state = path.join(root, 'selection/state.json')
    mkdirSync(path.join(source, 'node_modules'), { recursive: true })
    const profile = JSON.stringify({ name: '@futurestaff/profile-alpha',
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } })
    writeFileSync(path.join(source, 'package.json'), profile)
    writeFileSync(path.join(source, 'release-manifest.json'), JSON.stringify({
      schemaVersion: 1, profile: 'futurestaff-alpha', productVersion: '0.1.0', dshVersion: '0.1.2-rc.1',
      files: { 'package.json': createHash('sha256').update(profile).digest('hex') },
    }))
    const args = ['--resources', resources, '--home', home, '--selection-state', state]
    assert.deepEqual(reconcileReleaseProfile(args), { mode: 'dry-run', before: { bundled: 'installed', workspaces: [] } })
    assert.equal(existsSync(home), false)
    assert.equal(existsSync(state), false)
    assert.equal(reconcileReleaseProfile([...args, '--apply']).result, 'installed')
    assert.equal(readFileSync(path.join(home, 'profiles/futurestaff-alpha/package.json'), 'utf8'), profile)
    assert.equal(reconcileReleaseProfile(args).before.bundled, 'repaired')
    assert.throws(() => reconcileReleaseProfile(['--home', 'relative-path']), /absolute paths|ABSOLUTE_PATH/)
    assert.throws(() => reconcileReleaseProfile([...args, '--unknown']), /ABSOLUTE_PATH/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
