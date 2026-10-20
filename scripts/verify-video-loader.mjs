/** Real headless Loader gate; uses no login vault, session, model call or graphical app. */
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktopRequire = createRequire(path.join(root, 'desktop-shell/dsh-plugin-desktop/package.json'))
const localRequire = createRequire(path.join(root, 'package.json'))
const load = name => import(pathToFileURL(desktopRequire.resolve(name)).href)

export async function verifyVideoLoader({ packageRoot = path.join(root, 'plugins/fs-video'), outputDirectory } = {}) {
  const { boot } = await load('@deepseek-ai/dsh-app-boot')
  const { renderToolsSdk } = await load('@deepseek-ai/dsh-tools')
  const typescript = localRequire('typescript')
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@futurestaff/fs-video')
  const entry = path.join(packageRoot, manifest.main)
  const temporary = await mkdtemp(path.join(tmpdir(), 'futurestaff-video-loader-'))
  const home = await realpath(temporary), scenarios = []
  const versions = Object.fromEntries(await Promise.all(['@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-host-webserver'].map(async name => [name, JSON.parse(await readFile(desktopRequire.resolve(name + '/package.json'), 'utf8')).version])))
  try {
    for (const member of [false, true]) {
      const label = member ? 'member-fixture' : 'signed-out', config = path.join(home, label + '.json')
      await writeFile(config, JSON.stringify([
        { id: 'system-prompt', name: pathToFileURL(desktopRequire.resolve('@deepseek-ai/dsh-system-prompt')).href },
        { id: 'tools', name: pathToFileURL(desktopRequire.resolve('@deepseek-ai/dsh-tools')).href, config: { mode: 'native' } },
        { id: 'web-server', name: pathToFileURL(desktopRequire.resolve('@deepseek-ai/dsh-host-webserver')).href, config: { host: '127.0.0.1', port: 0 } },
        { id: 'video', name: pathToFileURL(entry).href, config: { deviceId: 'headless-loader-check' } },
      ]))
      let ctx, attempts = 0
      try {
        ctx = await boot('FutureStaff-video-loader-check', config, [], host => {
          host.loader.internal = undefined
          if (member) host.provide('futurestaffVideoWorkspace', { authorize: async () => { attempts++; throw Error('HEADLESS_FIXTURE_HAS_NO_PRODUCTION_AUTH') } })
        })
        const videoEntry = [...ctx.loader.entries()].find(item => item.options.name === pathToFileURL(entry).href)
        assert.equal(videoEntry?.fiber?.state, 2, 'the enabled video Loader entry must be active even while signed out')
        const schemas = ctx.tools.schemas().filter(item => item.name.startsWith('video_project_'))
        assert.equal(schemas.length, member ? 7 : 0)
        const scenario = { mode: label, loaderActive: true, videoTools: schemas.length, noProductionAuthentication: true }
        if (member) {
          const sdkSchemas = schemas.map(schema => {
            const definition = ctx.tools.get(schema.name)
            assert.deepEqual(definition.metadata, { execution: 'local', requiresApproval: true, tenantScoped: true, deviceId: 'headless-loader-check' })
            return { ...schema, output: definition.output.schema }
          })
          const sdk = renderToolsSdk(sdkSchemas), blocks = [...sdk.matchAll(/```ts\n([\s\S]*?)```/g)]
          assert.ok(blocks.length)
          const source = blocks.at(-1)[1], sdkFile = path.join(home, 'video-sdk.ts')
          await writeFile(sdkFile, source)
          const program = typescript.createProgram([sdkFile], { noEmit: true, strict: true, skipLibCheck: true, target: typescript.ScriptTarget.ES2022, types: [], lib: ['lib.es2022.d.ts'] })
          assert.equal(typescript.getPreEmitDiagnostics(program).length, 0, 'generated video tool SDK must compile')
          const denied = await ctx.tools.execute({ name: 'video_project_list', arguments: {}, callId: 'headless-video-approval', signal: new AbortController().signal })
          assert.equal(denied.isError, true, 'no approval service must fail closed before local execution')
          assert.equal(attempts, 0, 'unapproved calls must never reach the workspace resolver')
          Object.assign(scenario, { metadataChecked: 7, sdkTypecheckPassed: true, sdkSha256: createHash('sha256').update(source).digest('hex'), unapprovedExecutionDenied: true })
        }
        scenarios.push(scenario)
      } finally { await ctx?.fiber.dispose() }
    }
    const result = { schemaVersion: 1, passed: true, checkedAt: new Date().toISOString(), packageRoot: path.resolve(packageRoot), packageVersion: manifest.version, entrySha256: createHash('sha256').update(await readFile(entry)).digest('hex'), runtimeVersions: versions, scenarios, graphicalAppStarted: false, productionSessionCreated: false }
    if (outputDirectory) { await mkdir(outputDirectory, { recursive: true }); await writeFile(path.join(outputDirectory, 'loader-receipt.json'), JSON.stringify(result, null, 2) + '\n') }
    return result
  } finally { await rm(temporary, { recursive: true, force: true }) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { profile: { type: 'string' }, output: { type: 'string' } } })
  const packageRoot = values.profile ? path.join(path.resolve(values.profile), 'node_modules/@futurestaff/fs-video') : undefined
  verifyVideoLoader({ packageRoot, outputDirectory: values.output && path.resolve(values.output) }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1 })
}
