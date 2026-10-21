import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { stageReleaseProfile, verifyReleaseProfile } from '../scripts/stage-release-profile.mjs'
import { installBundledFutureStaffProfile } from '../desktop-shell/dsh-plugin-desktop/src/futurestaff-profile.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('stages a relocatable built-only FutureStaff Profile', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'futurestaff-release-profile-'))
  try {
    const result = await stageReleaseProfile({ sourceRoot: root, outputRoot: temporary })
    const files = await verifyReleaseProfile(temporary, root)
    assert.ok(files.includes('node_modules/@futurestaff/fs-core/lib/index.js'))
    assert.ok(files.includes('node_modules/@futurestaff/fs-platform-access/lib/client/index.js'))
    assert.ok(files.includes('node_modules/@futurestaff/fs-product-hub-ui/lib/client/index.js'))
    assert.ok(!files.some(file => file.startsWith('node_modules/@futurestaff/fs-product-hub-ui/ui/')))
    assert.ok(files.includes('node_modules/@futurestaff/fs-geo/lib/ui/index.html'))
    assert.ok(files.includes('node_modules/@futurestaff/fs-geo/lib/005_ai_drafts.sql'))
    assert.ok(files.includes('node_modules/@futurestaff/fs-video/lib/index.js'))
    assert.ok(files.includes('node_modules/@futurestaff/fs-video/lib/runtime-lock.json'))
    assert.ok(files.includes('node_modules/@futurestaff/fs-video/lib/runtime-files.json'))
    assert.ok(files.includes('node_modules/@futurestaff/fs-video/lib/assets/renderer.html'))
    assert.ok(files.includes('node_modules/@futurestaff/fs-video/lib/assets/voice.py'))
    assert.ok(files.includes('node_modules/.modules.yaml'))
    assert.ok(files.includes('pnpm-lock.yaml'))
    assert.ok(files.includes('pnpm-workspace.yaml'))
    assert.ok(files.every(file => !file.includes('/src/') && !file.includes('/test/')))

    const [modulesState, lockfile, workspace] = await Promise.all([
      readFile(path.join(result.target, 'node_modules', '.modules.yaml'), 'utf8'),
      readFile(path.join(result.target, 'pnpm-lock.yaml'), 'utf8'),
      readFile(path.join(result.target, 'pnpm-workspace.yaml'), 'utf8'),
    ])
    assert.match(modulesState, /^nodeLinker: hoisted$/m)
    assert.match(modulesState, /^packageManager: pnpm@1[01]\./m)
    assert.match(modulesState, /^virtualStoreDirMaxLength: 60$/m)
    assert.match(lockfile, /^settings:\n  autoInstallPeers: false$/m)
    assert.match(workspace, /^nodeLinker: hoisted$/m)
    assert.match(workspace, /^autoInstallPeers: false$/m)
    assert.match(workspace, /^virtualStoreDirMaxLength: 60$/m)

    const profile = JSON.parse(await readFile(path.join(result.target, 'package.json'), 'utf8'))
    assert.deepEqual(profile.dependencies, {
      '@futurestaff/fs-core': '0.1.0',
      '@futurestaff/fs-platform-access': '0.1.0',
      '@futurestaff/fs-product-hub-ui': '0.1.0',
      '@futurestaff/fs-douyin-ui': '0.1.0',
      '@futurestaff/fs-geo': '0.1.0',
      '@futurestaff/fs-video': '0.1.0',
    })
    assert.ok(Object.values(profile.dependencies).every(value => !value.startsWith('file:')))
    // Exercise the packaged-only startup path on the actual staged product,
    // rather than accepting a builder-only inventory that startup rejects.
    const resourcesPath = path.join(temporary, 'startup-resources')
    const { cp, mkdir } = await import('node:fs/promises')
    await mkdir(resourcesPath, { recursive: true })
    await cp(path.join(temporary, 'profiles'), path.join(resourcesPath, 'futurestaff-profile', 'profiles'), { recursive: true })
    assert.equal(installBundledFutureStaffProfile({
      resourcesPath,
      homeDir: path.join(temporary, 'startup-home'),
      selectionStatePath: path.join(temporary, 'startup-state', 'selection.json'),
    }), 'installed')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('pins the release runtime and platform contract in the staged manifest', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'futurestaff-release-profile-'))
  try {
    const result = await stageReleaseProfile({ sourceRoot: root, outputRoot: temporary })
    assert.equal(result.releaseManifest.dshVersion, '0.1.2-rc.1')
    assert.equal(result.releaseManifest.platformContract.mock.version, '0.1.0')
    assert.equal(
      result.releaseManifest.platformContract.mock.bundleSha256,
      '5ae4e07157b5c7c1b8007f514d47cc0bb05734841341f59c44c37a978b7f9fe9',
    )
    assert.equal(result.releaseManifest.platformContract.dev.version, '0.1.1')
    assert.equal(
      result.releaseManifest.platformContract.dev.bundleSha256,
      '9921cc5084925ceea4e6e9d224e5434d4af294974a736a300ed34c73d2950687',
    )
    assert.equal(result.releaseManifest.platformContract.dev.productionEnabled, false)
    assert.ok(result.releaseManifest.supersedes.includes(
      'f82212e5ba13adc4c4a144792aa9ef67baff3f8f7c7144f4a1f86ec7288059b8',
    ))
    assert.ok(result.releaseManifest.supersedes.includes(
      '733377d44a1a7915029a172bc5da08886f66487304e72b9bfe8baa1beb0e9e38',
    ))
    assert.ok(result.releaseManifest.supersedes.includes(
      '6cd4850a729b7fb1b276db94334652d8d510c1c1065c9bb6c53790494c9cb20f',
    ))
    // The public 3.0.5 package is the rollback/upgrade baseline for 3.0.6.
    assert.ok(result.releaseManifest.supersedes.includes(
      '62c6fa2331f6079ee944bbbd26fb55b49bbde66397d3b67d0bed4fd9b4cd9480',
    ))
    assert.ok(result.releaseManifest.workspacePreviousInventories.some(files =>
      files['node_modules/@futurestaff/fs-platform-access/lib/api.js'] ===
        '6cdf5f8951ff2c4ed5631ba341f139aa49839ec641cb66b19e27ba4b5810105a'))
    const baseline = JSON.parse(await readFile(path.join(root, 'profile/workspace-upgrade-3.1.0.json'), 'utf8'))
    assert.equal(baseline.manifestDigest, 'be87221cda912fc66162ef9daa5d5a31952c7891a18d51849ad0389516bb4be7')
    assert.ok(result.releaseManifest.supersedes.includes(baseline.manifestDigest))
    assert.equal(Object.keys(baseline.platformFiles).length, 206)
    assert.equal(Object.keys(baseline.videoFiles).length, 35)
    assert.ok(result.releaseManifest.workspacePreviousInventories.some(files =>
      JSON.stringify(files) === JSON.stringify(baseline.platformFiles)))
    assert.deepEqual(result.releaseManifest.workspacePreviousVideoFiles, baseline.videoFiles)
    assert.equal(baseline.videoFiles['node_modules/@futurestaff/fs-video/lib/index.js'],
      '11c5d79f5f32dfb0a9abcbc09cb792dab3177ebdc5ad934097ad5b09cb049263')
    const previousDesktop = JSON.parse(await readFile(path.join(root, 'profile/workspace-upgrade-3.1.1.json'), 'utf8'))
    assert.equal(previousDesktop.installerSha256, '749c80826f2fea74a22459c7880354f0edf4d5129cfca4ae94d4838aabc01a4b')
    assert.equal(previousDesktop.manifestDigest, 'fab5a10f2aa4eba35e12545669c3693971734d3868fd9fa86257cbb2e27366e4')
    assert.equal(Object.keys(previousDesktop.platformFiles).length, 206)
    assert.ok(result.releaseManifest.supersedes.includes(previousDesktop.manifestDigest))
    assert.ok(result.releaseManifest.workspacePreviousInventories.some(files => JSON.stringify(files) === JSON.stringify(previousDesktop.platformFiles)))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
