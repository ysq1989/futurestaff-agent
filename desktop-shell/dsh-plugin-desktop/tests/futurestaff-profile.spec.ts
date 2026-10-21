import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyBundledFutureStaffBootstrapIdentity,
  bundledFutureStaffAutomaticSetup,
  installBundledFutureStaffProfile,
  planBundledFutureStaffProfile,
  MAX_PROFILE_FILES,
  validateBundledFutureStaffProfile,
} from '../src/futurestaff-profile.ts'
import { readDesktopProfileState } from '../src/profile-manager.ts'

function fixture(fileCount = 0) {
  const root = mkdtempSync(join(tmpdir(), 'futurestaff-bundled-profile-'))
  const resourcesPath = join(root, 'resources')
  const source = join(resourcesPath, 'futurestaff-profile', 'profiles', 'futurestaff-alpha')
  const homeDir = join(root, 'home')
  const selectionStatePath = join(root, 'user-data', 'profile-selection', 'state.json')
  mkdirSync(source, { recursive: true })
  mkdirSync(join(source, 'node_modules'), { recursive: true })
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      name: '@futurestaff/profile-alpha',
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }) + '\n',
    'cordis.patch.yml': '- insert: []\n',
    'pnpm-workspace.yaml': 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\nvirtualStoreDirMaxLength: 60\n',
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: false\n",
    'node_modules/.modules.yaml': 'nodeLinker: hoisted\npackageManager: pnpm@11.8.0\nvirtualStoreDirMaxLength: 60\n',
  }
  const hashes: Record<string, string> = {}
  for (let index = Object.keys(files).length; index < fileCount; index++) {
    files[`module-${index}.js`] = `export const value = ${index}\n`
  }
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(source, name), contents)
    hashes[name] = createHash('sha256').update(contents).digest('hex')
  }
  writeFileSync(join(source, 'release-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    profile: 'futurestaff-alpha',
    productVersion: '0.1.0',
    dshVersion: '0.1.2-rc.1',
    files: hashes,
  }) + '\n')
  return { root, resourcesPath, source, homeDir, selectionStatePath }
}

describe('bundled FutureStaff Profile', () => {
  it('preserves a dangling bundled Profile link instead of treating it as a first installation', () => {
    const value = fixture()
    try {
      mkdirSync(join(value.homeDir, 'profiles'), { recursive: true })
      const target = join(value.homeDir, 'profiles/futurestaff-alpha')
      const missing = join(value.root, 'missing-external-profile')
      symlinkSync(missing, target, process.platform === 'win32' ? 'junction' : 'dir')
      expect(planBundledFutureStaffProfile(value)).toEqual({ bundled: 'preserved', workspaces: [] })
      expect(installBundledFutureStaffProfile(value)).toBe('preserved')
      expect(lstatSync(target).isSymbolicLink()).toBe(true)
      expect(existsSync(missing)).toBe(false)
      expect(existsSync(value.selectionStatePath)).toBe(false)
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  })

  it.each(['first-install', 'repair', 'upgrade'] as const)(
    'preserves a linked profiles parent without writing outside the requested home: %s', mode => {
      const value = fixture()
      try {
        const external = join(value.root, 'external-profiles')
        mkdirSync(external)
        const target = join(external, 'futurestaff-alpha')
        if (mode !== 'first-install') {
          cpSync(value.source, target, { recursive: true })
          if (mode === 'upgrade') {
            const oldFile = join(target, 'release-manifest.json')
            const old = JSON.parse(readFileSync(oldFile, 'utf8'))
            writeFileSync(join(target, 'package.json'), '{"name":"old-stock-profile"}')
            old.files['package.json'] = createHash('sha256').update('{"name":"old-stock-profile"}').digest('hex')
            writeFileSync(oldFile, JSON.stringify(old))
            const currentFile = join(value.source, 'release-manifest.json')
            const current = JSON.parse(readFileSync(currentFile, 'utf8'))
            current.supersedes = [createHash('sha256').update(readFileSync(oldFile)).digest('hex')]
            writeFileSync(currentFile, JSON.stringify(current))
          }
        }
        mkdirSync(value.homeDir, { recursive: true })
        const profiles = join(value.homeDir, 'profiles')
        symlinkSync(external, profiles, process.platform === 'win32' ? 'junction' : 'dir')
        writeFileSync(join(external, 'outside-sentinel.txt'), 'unchanged')
        const previous = mode === 'first-install' ? undefined : readFileSync(join(target, 'release-manifest.json'), 'utf8')
        expect(planBundledFutureStaffProfile(value)).toEqual({ bundled: 'preserved', workspaces: [] })
        expect(installBundledFutureStaffProfile(value)).toBe('preserved')
        expect(lstatSync(profiles).isSymbolicLink()).toBe(true)
        expect(readFileSync(join(external, 'outside-sentinel.txt'), 'utf8')).toBe('unchanged')
        if (previous === undefined) expect(existsSync(target)).toBe(false)
        else expect(readFileSync(join(target, 'release-manifest.json'), 'utf8')).toBe(previous)
        expect(existsSync(value.selectionStatePath)).toBe(false)
      } finally { rmSync(value.root, { recursive: true, force: true }) }
    })

  it('rejects a linked ancestor above a missing profiles directory', () => {
    const value = fixture()
    try {
      const external = join(value.root, 'external-home')
      mkdirSync(external)
      symlinkSync(external, value.homeDir, process.platform === 'win32' ? 'junction' : 'dir')
      expect(planBundledFutureStaffProfile(value)).toEqual({ bundled: 'preserved', workspaces: [] })
      expect(installBundledFutureStaffProfile(value)).toBe('preserved')
      expect(existsSync(join(external, 'profiles'))).toBe(false)
      expect(existsSync(value.selectionStatePath)).toBe(false)
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  })

  it.each(['repair', 'upgrade'] as const)('preserves a linked bundled Profile root even with exact stock bytes: %s', mode => {
    const value = fixture()
    try {
      const external = join(value.root, 'external-stock-profile')
      cpSync(value.source, external, { recursive: true })
      if (mode === 'upgrade') {
        const oldFile = join(external, 'release-manifest.json')
        const old = JSON.parse(readFileSync(oldFile, 'utf8'))
        writeFileSync(join(external, 'package.json'), '{"name":"old-stock-profile"}')
        old.files['package.json'] = createHash('sha256').update('{"name":"old-stock-profile"}').digest('hex')
        writeFileSync(oldFile, JSON.stringify(old))
        const currentFile = join(value.source, 'release-manifest.json')
        const current = JSON.parse(readFileSync(currentFile, 'utf8'))
        current.supersedes = [createHash('sha256').update(readFileSync(oldFile)).digest('hex')]
        writeFileSync(currentFile, JSON.stringify(current))
      }
      mkdirSync(join(value.homeDir, 'profiles'), { recursive: true })
      const target = join(value.homeDir, 'profiles/futurestaff-alpha')
      symlinkSync(external, target, process.platform === 'win32' ? 'junction' : 'dir')
      const previous = readFileSync(join(external, 'release-manifest.json'), 'utf8')
      expect(planBundledFutureStaffProfile(value).bundled).toBe('preserved')
      expect(installBundledFutureStaffProfile(value)).toBe('preserved')
      expect(lstatSync(target).isSymbolicLink()).toBe(true)
      expect(readFileSync(join(external, 'release-manifest.json'), 'utf8')).toBe(previous)
      expect(existsSync(value.selectionStatePath)).toBe(false)
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  })

  it.each(['valid', 'custom-code', 'custom-package', 'extra-file', 'wrong-identity', 'linked-package', 'linked-child'] as const)(
    'reconciles only the complete audited video package: %s', mode => {
      const value = fixture()
      try {
        const prefix = 'node_modules/@futurestaff/fs-video/'
        const manifest = JSON.parse(readFileSync(join(value.source, 'release-manifest.json'), 'utf8'))
        manifest.workspacePreviousVideoFiles = {}
        const previous = { 'package.json': '{"name":"@futurestaff/fs-video","version":"0.1.0"}', 'lib/index.js': 'old workspace cache' }
        const current = { ...previous, 'lib/index.js': 'new short owner cache', 'lib/cache.js': 'new cache helper' }
        for (const [file, contents] of Object.entries(current)) {
          mkdirSync(join(value.source, prefix, file, '..'), { recursive: true })
          writeFileSync(join(value.source, prefix, file), contents)
          manifest.files[prefix + file] = createHash('sha256').update(contents).digest('hex')
        }
        for (const [file, contents] of Object.entries(previous)) {
          manifest.workspacePreviousVideoFiles[prefix + file] = createHash('sha256').update(contents).digest('hex')
        }
        writeFileSync(join(value.source, 'release-manifest.json'), JSON.stringify(manifest))
        const identity = { environment: 'production', tenantId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000001' }
        const name = 'fs-production-' + createHash('sha256').update(JSON.stringify(identity)).digest('hex')
        const target = join(value.homeDir, 'profiles', name)
        const module = join(target, prefix)
        const actual = mode === 'linked-package' ? join(value.root, 'outside-module') : module
        mkdirSync(join(actual, 'lib'), { recursive: true })
        if (mode === 'linked-package') {
          mkdirSync(join(target, 'node_modules/@futurestaff'), { recursive: true })
          symlinkSync(actual, module, process.platform === 'win32' ? 'junction' : 'dir')
        }
        const marker = JSON.stringify(mode === 'wrong-identity' ? { ...identity, environment: 'dev' } : identity)
        writeFileSync(join(target, 'futurestaff-workspace.json'), marker)
        writeFileSync(join(target, 'private-history.json'), 'unchanged private history')
        for (const [file, contents] of Object.entries(previous)) writeFileSync(join(actual, file), contents)
        if (mode === 'custom-code') writeFileSync(join(actual, 'lib/index.js'), 'custom code')
        if (mode === 'custom-package') writeFileSync(join(actual, 'package.json'), 'custom package metadata')
        if (mode === 'extra-file') writeFileSync(join(actual, 'lib/custom.js'), 'custom helper')
        if (mode === 'linked-child') symlinkSync(join(actual, 'package.json'), join(actual, 'lib/linked.json'), 'file')
        const before = readFileSync(join(actual, 'lib/index.js'), 'utf8')
        expect(planBundledFutureStaffProfile(value).workspaces).toEqual(mode === 'valid' ? [{ profile: name, package: 'fs-video' }] : [])
        expect(readFileSync(join(actual, 'lib/index.js'), 'utf8')).toBe(before)
        expect(existsSync(join(value.homeDir, 'profiles/futurestaff-alpha'))).toBe(false)
        installBundledFutureStaffProfile(value)
        expect(readFileSync(join(actual, 'lib/index.js'), 'utf8')).toBe(mode === 'valid' ? current['lib/index.js'] : before)
        expect(existsSync(join(actual, 'lib/cache.js'))).toBe(mode === 'valid')
        expect(readFileSync(join(target, 'futurestaff-workspace.json'), 'utf8')).toBe(marker)
        expect(readFileSync(join(target, 'private-history.json'), 'utf8')).toBe('unchanged private history')
        expect(planBundledFutureStaffProfile(value).workspaces).toEqual([])
        installBundledFutureStaffProfile(value)
        expect(readFileSync(join(actual, 'lib/index.js'), 'utf8')).toBe(mode === 'valid' ? current['lib/index.js'] : before)
      } finally { rmSync(value.root, { recursive: true, force: true }) }
    })

  it.each(['node_modules/@futurestaff/another-package/lib/index.js', 'node_modules/@futurestaff/fs-video/node_modules/untrusted.js', 'node_modules/@futurestaff/fs-video/lib/../outside.js'])(
    'rejects video inventories outside the fixed package namespace: %s', name => {
      const value = fixture()
      try {
        const file = join(value.source, 'release-manifest.json')
        const manifest = JSON.parse(readFileSync(file, 'utf8'))
        manifest.workspacePreviousVideoFiles = { [name]: 'a'.repeat(64) }
        writeFileSync(file, JSON.stringify(manifest))
        expect(() => planBundledFutureStaffProfile(value)).toThrow('video workspace upgrade inventory is invalid')
        expect(existsSync(value.homeDir)).toBe(false)
      } finally { rmSync(value.root, { recursive: true, force: true }) }
    })

  it('installs the 301-file Profile size shipped by 3.0.6 without touching existing session data', () => {
    const value = fixture(301)
    try {
      mkdirSync(join(value.homeDir, 'sessions'), { recursive: true })
      const session = join(value.homeDir, 'sessions', 'keep.jsonl')
      writeFileSync(session, 'private session sentinel')
      expect(validateBundledFutureStaffProfile(value.source)).toBe(301)
      expect(installBundledFutureStaffProfile(value)).toBe('installed')
      expect(readFileSync(session, 'utf8')).toBe('private session sentinel')
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  })

  it('still rejects inventory overflow before any user state is written', () => {
    const value = fixture()
    try {
      const file = join(value.source, 'release-manifest.json')
      const manifest = JSON.parse(readFileSync(file, 'utf8'))
      manifest.files = Object.fromEntries(Array.from({ length: MAX_PROFILE_FILES + 1 }, (_, index) => [`module-${index}.js`, 'a'.repeat(64)]))
      writeFileSync(file, JSON.stringify(manifest))
      expect(() => installBundledFutureStaffProfile(value)).toThrow('file inventory is invalid')
      expect(existsSync(value.homeDir)).toBe(false)
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  })

  it.each(['../outside.js', '/outside.js', 'module.js'])('rejects invalid inventory path or digest: %s', name => {
    const value = fixture()
    try {
      const file = join(value.source, 'release-manifest.json')
      const manifest = JSON.parse(readFileSync(file, 'utf8'))
      manifest.files[name] = name === 'module.js' ? 'invalid digest' : 'a'.repeat(64)
      writeFileSync(file, JSON.stringify(manifest))
      expect(() => validateBundledFutureStaffProfile(value.source)).toThrow('file inventory is invalid')
      expect(existsSync(value.homeDir)).toBe(false)
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  })

  it.each(['valid', 'custom', 'previous-release'] as const)('upgrades audited workspace Host and browser code together: %s', mode => {
    const value = fixture()
    try {
      const prefix = 'node_modules/@futurestaff/fs-platform-access/lib/'
      const manifest = JSON.parse(readFileSync(join(value.source, 'release-manifest.json'), 'utf8'))
      manifest.workspacePreviousFiles = {}
      mkdirSync(join(value.source, prefix), { recursive: true })
      for (const file of ['index.js', 'client.js']) {
        writeFileSync(join(value.source, prefix, file), 'new ' + file)
        manifest.files[prefix + file] = createHash('sha256').update('new ' + file).digest('hex')
        manifest.workspacePreviousFiles[prefix + file] = createHash('sha256').update('old ' + file).digest('hex')
      }
      writeFileSync(join(value.source, prefix, 'role.js'), 'new role')
      manifest.files[prefix + 'role.js'] = createHash('sha256').update('new role').digest('hex')
      if (mode === 'previous-release') {
        manifest.workspacePreviousInventories = [{ ...manifest.workspacePreviousFiles }]
        manifest.workspacePreviousFiles[prefix + 'index.js'] = 'a'.repeat(64)
      }
      writeFileSync(join(value.source, 'release-manifest.json'), JSON.stringify(manifest))
      const identity = { environment: 'production', tenantId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000001' }
      const name = 'fs-production-' + createHash('sha256').update(JSON.stringify(identity)).digest('hex')
      const target = join(value.homeDir, 'profiles', name)
      mkdirSync(join(target, prefix), { recursive: true })
      writeFileSync(join(target, 'futurestaff-workspace.json'), JSON.stringify(identity))
      writeFileSync(join(target, 'private-history.json'), 'history')
      for (const file of ['index.js', 'client.js']) writeFileSync(join(target, prefix, file), 'old ' + file)
      if (mode === 'custom') writeFileSync(join(target, prefix, 'index.js'), 'custom Host')
      installBundledFutureStaffProfile(value)
      expect(readFileSync(join(target, prefix, 'index.js'), 'utf8')).toBe(mode === 'custom' ? 'custom Host' : 'new index.js')
      expect(readFileSync(join(target, prefix, 'client.js'), 'utf8')).toBe(mode === 'custom' ? 'old client.js' : 'new client.js')
      expect(readFileSync(join(target, 'private-history.json'), 'utf8')).toBe('history')
      installBundledFutureStaffProfile(value)
      expect(readFileSync(join(target, prefix, 'index.js'), 'utf8')).toBe(mode === 'custom' ? 'custom Host' : 'new index.js')
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  })
  it.each(['valid', 'wrong-identity', 'linked-code'] as const)('refreshes only owned workspace client code: %s', mode => {
    const value = fixture()
    try {
      const relative = 'node_modules/@futurestaff/fs-platform-access/lib/client.js'
      mkdirSync(join(value.source, 'node_modules/@futurestaff/fs-platform-access/lib'), { recursive: true })
      writeFileSync(join(value.source, relative), 'new bundled browser code')
      const manifest = JSON.parse(readFileSync(join(value.source, 'release-manifest.json'), 'utf8'))
      manifest.files[relative] = createHash('sha256').update('new bundled browser code').digest('hex')
      writeFileSync(join(value.source, 'release-manifest.json'), JSON.stringify(manifest))
      const identity = { environment: 'production', tenantId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000001' }
      const name = 'fs-production-' + createHash('sha256').update(JSON.stringify(identity)).digest('hex')
      const target = join(value.homeDir, 'profiles', name)
      mkdirSync(join(target, 'node_modules/@futurestaff'), { recursive: true })
      const module = join(target, 'node_modules/@futurestaff/fs-platform-access')
      const actual = mode === 'linked-code' ? join(value.root, 'external-module') : module
      mkdirSync(join(actual, 'lib'), { recursive: true })
      if (mode === 'linked-code') symlinkSync(actual, module, process.platform === 'win32' ? 'junction' : 'dir')
      writeFileSync(join(actual, 'lib/client.js'), 'old browser code')
      writeFileSync(join(actual, 'lib/index.js'), 'original Host code')
      const marker = JSON.stringify(mode === 'wrong-identity' ? { ...identity, userId: '20000000-0000-4000-8000-000000000002' } : identity)
      writeFileSync(join(target, 'futurestaff-workspace.json'), marker)
      writeFileSync(join(target, 'private-history.json'), 'original private data')
      writeFileSync(join(target, 'cordis.patch.yml'), 'original identity composition')
      installBundledFutureStaffProfile(value)
      expect(readFileSync(join(actual, 'lib/client.js'), 'utf8')).toBe(mode === 'valid' ? 'new bundled browser code' : 'old browser code')
      expect(readFileSync(join(actual, 'lib/index.js'), 'utf8')).toBe('original Host code')
      expect(readFileSync(join(target, 'private-history.json'), 'utf8')).toBe('original private data')
      expect(readFileSync(join(target, 'futurestaff-workspace.json'), 'utf8')).toBe(marker)
      expect(readFileSync(join(target, 'cordis.patch.yml'), 'utf8')).toBe('original identity composition')
      installBundledFutureStaffProfile(value)
      expect(readFileSync(join(actual, 'lib/client.js'), 'utf8')).toBe(mode === 'valid' ? 'new bundled browser code' : 'old browser code')
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  })
  it('automatically applies the locked-down product defaults without opening Setup', () => {
    expect(bundledFutureStaffAutomaticSetup('futurestaff-alpha')).toEqual({
      mode: 'compatibility',
      macosMaterial: 'transparent',
      windowsMaterial: 'off',
      openBrowser: false,
      networkExposure: 'loopback',
      market: 'disabled',
      notifications: {
        enabled: true,
        notifyOnTurnCompletion: true,
        notifyOnTurnFailure: true,
        notifyOnJobCompletion: true,
        notifyOnJobFailure: true,
      },
    })
    expect(bundledFutureStaffAutomaticSetup('desktop')).toBeUndefined()
  })

  it('owns an explicit non-authoritative bootstrap identity for the product Profile', () => {
    const environment: NodeJS.ProcessEnv = {
      FUTURESTAFF_IDENTITY_MODE: 'request-scoped',
      FUTURESTAFF_TENANT_ID: 'caller-controlled-tenant',
      FUTURESTAFF_USER_ID: 'caller-controlled-user',
    }
    expect(applyBundledFutureStaffBootstrapIdentity('futurestaff-alpha', environment)).toBe(true)
    expect(environment).toMatchObject({
      FUTURESTAFF_IDENTITY_MODE: 'single-subject',
      FUTURESTAFF_TENANT_ID: 'futurestaff-desktop-bootstrap-tenant',
      FUTURESTAFF_USER_ID: 'futurestaff-desktop-bootstrap-user',
    })

    const unrelated = { FUTURESTAFF_IDENTITY_MODE: 'request-scoped' }
    expect(applyBundledFutureStaffBootstrapIdentity('desktop', unrelated)).toBe(false)
    expect(unrelated.FUTURESTAFF_IDENTITY_MODE).toBe('request-scoped')
  })

  it('atomically installs and selects a verified Profile on first launch', () => {
    const value = fixture()
    expect(installBundledFutureStaffProfile(value)).toBe('installed')
    expect(readFileSync(join(value.homeDir, 'profiles', 'futurestaff-alpha', 'cordis.patch.yml'), 'utf8'))
      .toBe('- insert: []\n')
    expect(readDesktopProfileState(value.selectionStatePath)).toEqual({
      version: 2,
      active: 'futurestaff-alpha',
    })
  })

  it('preserves an existing Profile and selection state', () => {
    const value = fixture()
    const target = join(value.homeDir, 'profiles', 'futurestaff-alpha')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'keep.txt'), 'user-owned\n')
    expect(installBundledFutureStaffProfile(value)).toBe('preserved')
    expect(readFileSync(join(target, 'keep.txt'), 'utf8')).toBe('user-owned\n')
  })

  it('repairs the verified legacy bundled Profile left by the first-launch packaging defect', () => {
    const value = fixture()
    expect(installBundledFutureStaffProfile(value)).toBe('installed')
    const target = join(value.homeDir, 'profiles', 'futurestaff-alpha')
    const manifestPath = join(target, 'release-manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: Record<string, string> }
    for (const relative of ['pnpm-workspace.yaml', 'pnpm-lock.yaml', 'node_modules/.modules.yaml']) {
      rmSync(join(target, relative), { force: true })
      delete manifest.files[relative]
    }
    writeFileSync(manifestPath, JSON.stringify(manifest) + '\n')
    writeFileSync(join(target, 'cordis.yml'), '[]\n')
    writeFileSync(join(target, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')

    expect(installBundledFutureStaffProfile(value)).toBe('repaired')
    expect(readFileSync(join(target, 'node_modules', '.modules.yaml'), 'utf8'))
      .toContain('packageManager: pnpm@11.8.0')
  })

  it('preserves a legacy bundled Profile when a managed file was changed', () => {
    const value = fixture()
    expect(installBundledFutureStaffProfile(value)).toBe('installed')
    const target = join(value.homeDir, 'profiles', 'futurestaff-alpha')
    writeFileSync(join(target, 'cordis.patch.yml'), '- user-change: true\n')

    expect(installBundledFutureStaffProfile(value)).toBe('preserved')
    expect(readFileSync(join(target, 'cordis.patch.yml'), 'utf8')).toBe('- user-change: true\n')
  })

  it('upgrades only an explicitly superseded, hash-matched bundled Profile', () => {
    const value = fixture()
    expect(installBundledFutureStaffProfile(value)).toBe('installed')
    const target = join(value.homeDir, 'profiles', 'futurestaff-alpha')
    const oldManifest = readFileSync(join(target, 'release-manifest.json'))
    const oldDigest = createHash('sha256').update(oldManifest).digest('hex')
    const sourceManifestPath = join(value.source, 'release-manifest.json')
    const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8')) as {
      supersedes?: string[]
      files: Record<string, string>
    }
    const replacement = '- insert: [client-bundle-fix]\n'
    writeFileSync(join(value.source, 'cordis.patch.yml'), replacement)
    sourceManifest.files['cordis.patch.yml'] = createHash('sha256').update(replacement).digest('hex')
    sourceManifest.supersedes = [oldDigest]
    writeFileSync(sourceManifestPath, JSON.stringify(sourceManifest) + '\n')
    writeFileSync(join(target, 'cordis.yml'), '[]\n')

    expect(installBundledFutureStaffProfile(value)).toBe('upgraded')
    expect(readFileSync(join(target, 'cordis.patch.yml'), 'utf8')).toBe(replacement)
  })

  it('preserves a superseded bundled Profile when a managed file was changed', () => {
    const value = fixture()
    expect(installBundledFutureStaffProfile(value)).toBe('installed')
    const target = join(value.homeDir, 'profiles', 'futurestaff-alpha')
    const oldDigest = createHash('sha256')
      .update(readFileSync(join(target, 'release-manifest.json'))).digest('hex')
    const sourceManifestPath = join(value.source, 'release-manifest.json')
    const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8')) as {
      supersedes?: string[]
    }
    sourceManifest.supersedes = [oldDigest]
    writeFileSync(sourceManifestPath, JSON.stringify(sourceManifest) + '\n')
    writeFileSync(join(target, 'cordis.patch.yml'), '- user-change: true\n')

    expect(installBundledFutureStaffProfile(value)).toBe('preserved')
    expect(readFileSync(join(target, 'cordis.patch.yml'), 'utf8')).toBe('- user-change: true\n')
  })

  it('rejects a modified bundled file before writing user data', () => {
    const value = fixture()
    writeFileSync(join(value.source, 'cordis.patch.yml'), '- changed: true\n')
    expect(() => installBundledFutureStaffProfile(value)).toThrow('digest mismatch')
  })

  it('is inactive when no product Profile resource is packaged', () => {
    const root = mkdtempSync(join(tmpdir(), 'futurestaff-no-profile-'))
    expect(installBundledFutureStaffProfile({
      resourcesPath: join(root, 'resources'),
      homeDir: join(root, 'home'),
      selectionStatePath: join(root, 'state.json'),
    })).toBe('absent')
  })
})
