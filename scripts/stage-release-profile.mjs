import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { validateBundledFutureStaffProfile } from '../desktop-shell/dsh-plugin-desktop/src/futurestaff-profile.ts'

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutput = path.join(scriptRoot, 'dist', 'desktop-profile')
const profileName = 'futurestaff-alpha'
const packages = ['fs-core', 'fs-platform-access', 'fs-product-hub-ui', 'fs-douyin-ui', 'fs-geo', 'fs-video']
const supersededReleaseManifests = [
  // Verified intact 2.0.13 release Profile; upgrades branding, hints and access composition.
  '836818df6fef5c44ef751ca3bf07885fd253fdac46e9283af5fe32eee34c9680',
  '24c260169b8cbafaec0de5fc209702d8c882243cf32bbcdb37b8e78c6afe11c9',
  // B02n Profile installed by the previous private Windows candidate.
  'f82212e5ba13adc4c4a144792aa9ef67baff3f8f7c7144f4a1f86ec7288059b8',
  // Installed 2.0.8 Profile with the old login client that loses the fetch receiver.
  '733377d44a1a7915029a172bc5da08886f66487304e72b9bfe8baa1beb0e9e38',
  // Verified intact 2.0.9 Profile; the next release updates branding and model guidance.
  '6cd4850a729b7fb1b276db94334652d8d510c1c1065c9bb6c53790494c9cb20f',
]
const pnpmVersion = '11.8.0'
const pnpmWorkspace = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
virtualStoreDirMaxLength: 60
`
const pnpmModulesState = `nodeLinker: hoisted
packageManager: pnpm@${pnpmVersion}
virtualStoreDirMaxLength: 60
`
const pnpmLockfile = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: false
`

function releasePackageManifest(source) {
  const keys = ['name', 'version', 'type', 'main', 'types', 'exports', 'dsh', 'peerDependencies']
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]))
}

async function walkFiles(root, current = root) {
  const files = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name)
    const relative = path.relative(root, absolute).replaceAll('\\', '/')
    const stats = await lstat(absolute)
    if (stats.isSymbolicLink()) throw new Error(`release Profile cannot contain a symbolic link: ${relative}`)
    if (stats.isDirectory()) files.push(...await walkFiles(root, absolute))
    else if (stats.isFile()) files.push(relative)
    else throw new Error(`release Profile contains an unsupported filesystem entry: ${relative}`)
  }
  return files.sort()
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

async function verifyClientBundle(target, packageName) {
  const relative = `node_modules/@futurestaff/${packageName}/lib/client.js`
  const source = await readFile(path.join(target, relative), 'utf8')
  const registrations = []
  new vm.Script(source, { filename: relative }).runInNewContext({
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
  })
  const expectedId = `@futurestaff/${packageName}`
  if (registrations.length !== 1
    || registrations[0]?.id !== expectedId
    || typeof registrations[0]?.factory !== 'function') {
    throw new Error(`${expectedId} client bundle does not register its DSH module factory`)
  }
}

export async function verifyReleaseProfile(outputRoot, sourceRoot = scriptRoot) {
  const target = path.join(outputRoot, 'profiles', profileName)
  const files = await walkFiles(target)
  const required = [
    'cordis.patch.yml',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'node_modules/.modules.yaml',
    'node_modules/@futurestaff/fs-core/package.json',
    'node_modules/@futurestaff/fs-platform-access/package.json',
    'node_modules/@futurestaff/fs-product-hub-ui/package.json',
    'node_modules/@futurestaff/fs-douyin-ui/package.json',
    'node_modules/@futurestaff/fs-geo/package.json',
    'node_modules/@futurestaff/fs-geo/lib/ui/index.html',
    'node_modules/@futurestaff/fs-geo/lib/005_ai_drafts.sql',
    'node_modules/@futurestaff/fs-geo/lib/assistant.js',
    'node_modules/@futurestaff/fs-geo/lib/doubao-browser.js',
    'node_modules/@futurestaff/fs-geo/lib/runtime/playwright-1.64.1/index.mjs',
    'node_modules/@futurestaff/fs-geo/lib/assistant-resources/skills/geo-assistant/SKILL.md',
    'node_modules/@futurestaff/fs-video/lib/index.js',
    'node_modules/@futurestaff/fs-video/lib/runtime-lock.json',
    'node_modules/@futurestaff/fs-video/lib/runtime-files.json',
    'node_modules/@futurestaff/fs-video/lib/assets/renderer.html',
    'node_modules/@futurestaff/fs-video/lib/assets/voice.py',
  ]
  for (const relative of required) {
    if (!files.includes(relative)) throw new Error(`release Profile is missing ${relative}`)
  }
  const [workspace, modulesState, lockfile] = await Promise.all([
    readFile(path.join(target, 'pnpm-workspace.yaml'), 'utf8'),
    readFile(path.join(target, 'node_modules', '.modules.yaml'), 'utf8'),
    readFile(path.join(target, 'pnpm-lock.yaml'), 'utf8'),
  ])
  if (workspace !== pnpmWorkspace || modulesState !== pnpmModulesState || lockfile !== pnpmLockfile) {
    throw new Error('release Profile dependency metadata is incompatible with the packaged pnpm runtime')
  }
  if (files.some(file => /\/(?:src|test)\//u.test(`/${file}/`) || file.endsWith('/tsconfig.json'))) {
    throw new Error('release Profile contains development source, tests, or TypeScript configuration')
  }
  await Promise.all([
    verifyClientBundle(target, 'fs-platform-access'),
    verifyClientBundle(target, 'fs-product-hub-ui'),
    verifyClientBundle(target, 'fs-douyin-ui'),
    verifyClientBundle(target, 'fs-geo'),
  ])
  const sourceMarkers = [path.resolve(sourceRoot), path.resolve(sourceRoot).replaceAll('\\', '/')]
  for (const relative of files.filter(file => /\.(?:json|ya?ml|js|d\.ts)$/u.test(file))) {
    const contents = await readFile(path.join(target, relative), 'utf8')
    if (sourceMarkers.some(marker => contents.includes(marker))) {
      throw new Error(`release Profile contains a source-tree absolute path in ${relative}`)
    }
  }
  return files
}

export async function stageReleaseProfile(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot ?? scriptRoot)
  const outputRoot = path.resolve(options.outputRoot ?? defaultOutput)
  const profileSource = path.join(sourceRoot, 'profile', profileName)
  const target = path.join(outputRoot, 'profiles', profileName)
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(path.join(target, 'node_modules', '@futurestaff'), { recursive: true })
  await cp(path.join(profileSource, 'cordis.patch.yml'), path.join(target, 'cordis.patch.yml'))
  await Promise.all([
    writeFile(path.join(target, 'pnpm-workspace.yaml'), pnpmWorkspace),
    writeFile(path.join(target, 'node_modules', '.modules.yaml'), pnpmModulesState),
    writeFile(path.join(target, 'pnpm-lock.yaml'), pnpmLockfile),
  ])

  const dependencyVersions = {}
  for (const packageName of packages) {
    const packageRoot = path.join(sourceRoot, 'plugins', packageName)
    const sourceManifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
    if (typeof sourceManifest.version !== 'string') throw new Error(`${packageName} has no exact version`)
    dependencyVersions[sourceManifest.name] = sourceManifest.version
    const packageTarget = path.join(target, 'node_modules', '@futurestaff', packageName)
    await mkdir(packageTarget, { recursive: true })
    await cp(path.join(packageRoot, 'lib'), path.join(packageTarget, 'lib'), { recursive: true })
    await writeFile(
      path.join(packageTarget, 'package.json'),
      `${JSON.stringify(releasePackageManifest(sourceManifest), null, 2)}\n`,
    )
  }

  const profileManifest = JSON.parse(await readFile(path.join(profileSource, 'package.json'), 'utf8'))
  profileManifest.dependencies = dependencyVersions
  await writeFile(path.join(target, 'package.json'), `${JSON.stringify(profileManifest, null, 2)}\n`)

  const files = await verifyReleaseProfile(outputRoot, sourceRoot)
  const fileHashes = {}
  for (const relative of files) fileHashes[relative] = await sha256(path.join(target, relative))
  const foundation = JSON.parse(await readFile(path.join(sourceRoot, 'desktop', 'foundation.json'), 'utf8'))
  const workspaceUpgrade = JSON.parse(await readFile(path.join(sourceRoot, 'profile', 'workspace-upgrade-2.0.14.json'), 'utf8'))
  // Exact inventories extracted from the signed/public 3.1.0 installer. Never
  // infer an upgrade baseline from the machine currently running the builder.
  const videoUpgrade = JSON.parse(await readFile(path.join(sourceRoot, 'profile', 'workspace-upgrade-3.1.0.json'), 'utf8'))
  const previousDesktop = JSON.parse(await readFile(path.join(sourceRoot, 'profile', 'workspace-upgrade-3.1.1.json'), 'utf8'))
  const geoDesktop = JSON.parse(await readFile(path.join(sourceRoot, 'profile', 'workspace-upgrade-3.2.1.json'), 'utf8'))
  // Preserve the installed GEO-assistant release before rebuilding its UI, so
  // subsequent packages can reconcile its exact stock and audited mixed trees.
  const geoAssistantDesktop = JSON.parse(await readFile(path.join(sourceRoot, 'profile', 'workspace-upgrade-3.3.0.json'), 'utf8'))
  // Frozen, independently audited local 3.3.0 repairs are an exact release
  // baseline. Never derive these hashes from the machine running this builder.
  const interactionDesktop = JSON.parse(await readFile(path.join(sourceRoot, 'profile', 'workspace-upgrade-3.3.0-interactions.json'), 'utf8'))
  const releaseManifest = {
    schemaVersion: 1,
    profile: profileName,
    productVersion: profileManifest.version,
    dshVersion: '0.1.2-rc.1',
    supersedes: [...supersededReleaseManifests, workspaceUpgrade.manifestDigest, ...(workspaceUpgrade.additionalManifestDigests ?? []), videoUpgrade.manifestDigest, previousDesktop.manifestDigest, geoDesktop.manifestDigest, geoAssistantDesktop.manifestDigest, interactionDesktop.manifestDigest],
    workspacePreviousFiles: workspaceUpgrade.files,
    workspacePreviousInventories: [...(workspaceUpgrade.inventories ?? []), videoUpgrade.platformFiles, previousDesktop.platformFiles, geoDesktop.platformFiles, geoAssistantDesktop.platformFiles, interactionDesktop.platformFiles],
    workspacePreviousPlatformPackageHashes: [interactionDesktop.platformPackageSha256, ...(interactionDesktop.additionalPlatformPackageHashes ?? [])],
    workspacePreviousGeoInventories: [geoDesktop.geoFiles, geoAssistantDesktop.geoFiles],
    workspacePreviousVideoFiles: videoUpgrade.videoFiles,
    platformContract: foundation.platformContract,
    files: fileHashes,
  }
  await writeFile(path.join(target, 'release-manifest.json'), `${JSON.stringify(releaseManifest, null, 2)}\n`)
  await verifyReleaseProfile(outputRoot, sourceRoot)
  validateBundledFutureStaffProfile(target)
  return { outputRoot, target, releaseManifest }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await stageReleaseProfile()
  console.log(`Staged relocatable ${profileName} Profile at ${result.target}`)
}
