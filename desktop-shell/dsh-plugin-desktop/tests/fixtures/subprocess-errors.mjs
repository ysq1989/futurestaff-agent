// Run each injected Node error in a separate host. An unhandled stream error
// must fail that host, rather than being hidden by Vitest's own error handler.
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import { fstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { Socket } from 'node:net'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'

const [runtimeFile, scenario, mode = 'collect'] = process.argv.slice(2)
const realSpawn = childProcess.spawn
const child = Object.assign(new EventEmitter(), {
  pid: scenario === 'spawn-error' ? undefined : 43210,
  exitCode: null,
  signalCode: null,
  stdin: new PassThrough(),
  stdout: new PassThrough(),
  stderr: new PassThrough(),
})
if (scenario.endsWith('-socket')) child[scenario.split('-')[0]] = new Socket()
const spillDirectory = mkdtempSync(join(tmpdir(), 'dsh-subprocess-error-fixture-'))
let kills = 0
const terminationFailure = new Error('test process-tree termination failed')
const closeChild = (exitCode = 1) => {
  if (child.exitCode !== null) return
  child.exitCode = exitCode
  child.emit('exit', exitCode, null)
  child.emit('close', exitCode, null)
}
const failure = Object.assign(new Error(scenario === 'spawn-sync' ? 'spawn EACCES' : 'read ENOTCONN'), {
  code: scenario.startsWith('spawn') ? (scenario === 'spawn-sync' ? 'EACCES' : 'ENOENT') : 'ENOTCONN',
  syscall: scenario.startsWith('spawn') ? 'spawn' : 'read',
})

if (scenario !== 'real') {
  childProcess.spawn = () => {
    if (scenario === 'spawn-sync') throw failure
    return child
  }
  syncBuiltinESMExports()
}

const workspaceRequire = createRequire(new URL('../../package.json', import.meta.url))
const { Context } = await import(pathToFileURL(workspaceRequire.resolve('@deepseek-ai/cordis')).href)
const { default: LocalSubprocessRuntime } = await import(pathToFileURL(runtimeFile).href)
const ctx = new Context()
const fiber = await ctx.plugin(LocalSubprocessRuntime)
ctx.subprocess.internals = {
  spillDir: spillDirectory,
  platform: 'win32',
  taskkill() {
    kills++
    if (scenario === 'termination-error') throw terminationFailure
    closeChild()
  },
}

const collect = { maxBytes: 4, spill: { maxBytes: 4096 } }
const spec = {
  argv: [process.execPath, '-e', 'console.log("normal-child")'],
  cwd: process.cwd(),
  stdio: {
    stdin: scenario === 'stdin-batch-epipe' || scenario === 'stdin-batch' ? { data: 'input' } : 'pipe',
    stdout: mode === 'pipe' ? 'pipe' : collect,
    stderr: mode === 'pipe' ? 'pipe' : collect,
  },
  graceMs: scenario === 'real' ? 50 : 60_000,
}

try {
  if (scenario === 'spawn-sync') {
    assert.throws(() => ctx.subprocess.spawn(spec), error => error === failure)
    process.stdout.write(JSON.stringify({ ok: true, scenario, code: failure.code }) + '\n')
  } else if (scenario === 'real') {
    ctx.subprocess.internals = {}
    const directory = mkdtempSync(join(tmpdir(), 'dsh-subprocess-real-'))
    try {
      writeFileSync(join(directory, 'FixtureSHOP.txt'), 'fixture needle\n')
      const searchRequire = createRequire(workspaceRequire.resolve('@deepseek-ai/dsh-tool-fs-search/package.json'))
      const { rgPath } = searchRequire('@vscode/ripgrep')
      const cases = [
        { argv: [rgPath, '--files', '--glob', '**/*SHOP*', '.'], expected: 'FixtureSHOP.txt' },
        { argv: [rgPath, '--line-number', 'needle', '.'], expected: 'fixture needle' },
        { argv: process.platform === 'win32'
          ? ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "Write-Output 'normal-shell'"]
          : ['/bin/sh', '-c', 'printf normal-shell'], expected: 'normal-shell' },
        { argv: [process.execPath, '-e', 'process.stderr.write("expected-failure");process.exit(7)'], expected: '', exitCode: 7 },
      ]
      for (const item of cases) {
        const handle = ctx.subprocess.spawn({ ...spec, argv: item.argv, cwd: directory,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } } })
        const outcome = await handle.done
        assert.equal(outcome.exitCode, item.exitCode ?? 0)
        assert.match(handle.collected.stdout.readFrom(0).text, new RegExp(item.expected))
        assert.equal(await handle.waitForExit(), true)
      }
      process.stdout.write(JSON.stringify({ ok: true, cases: ['glob-ripgrep', 'grep-ripgrep', 'shell', 'nonzero-exit'] }) + '\n')
    } finally {
      // This fixture owns only its newly allocated temp directory.
      rmSync(directory, { recursive: true, force: true })
    }
  } else {
    const handle = ctx.subprocess.spawn(spec)
    const completion = handle.done.then(value => ({ value }), error => ({ error }))
    if (mode === 'collect') {
      child.stdout.emit('data', Buffer.from('stdout-before-error'))
      child.stderr.emit('data', Buffer.from('stderr-before-error'))
    }
    const spillDescriptors = Object.values(handle.collected).map(collector => collector.spillFd)
    if (scenario === 'spawn-error') {
      child.emit('error', failure)
      closeChild(-2)
    } else if (scenario === 'stdin-batch-epipe') {
      child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
      closeChild(0)
    } else if (scenario === 'late-error') {
      closeChild(0)
      await completion
      child.stdout.emit('error', failure)
      child.stderr.emit('error', failure)
    } else {
      if (scenario === 'after-exit') {
        child.exitCode = 0
        child.emit('exit', 0, null)
      }
      child[scenario === 'termination-error' || scenario === 'after-exit' ? 'stdout' : scenario.split('-')[0]].destroy(failure)
    }
    const result = await completion
    if (scenario === 'stdin-batch-epipe' || scenario === 'late-error') {
      assert.equal(result.value.exitCode, 0)
      assert.equal(kills, 0)
    } else {
      if (scenario === 'termination-error') {
        assert.equal(result.error instanceof AggregateError, true)
        assert.equal(result.error.cause, failure)
        assert.deepEqual(result.error.errors, [failure, terminationFailure])
        closeChild()
      } else {
        assert.equal(result.error, failure, 'the original I/O/spawn failure must reject done')
      }
      assert.equal(kills, scenario === 'spawn-error' || scenario === 'after-exit' ? 0 : 1,
        'a live failed task must terminate its tree')
      assert.equal(child.stdin.destroyed, true)
      assert.equal(child.stdout.destroyed, true)
      assert.equal(child.stderr.destroyed, true)
      // Duplicate error/close notifications must not replace the first failure.
      child.emit('error', Object.assign(new Error('late spawn error'), { code: 'EIO' }))
      child.stdout.emit('error', failure)
      closeChild(0)
    }
    assert.equal(await handle.waitForExit(), true)
    if (mode === 'collect') {
      for (const [name, expected] of [['stdout', 'stdout-before-error'], ['stderr', 'stderr-before-error']]) {
        const output = handle.collected[name].readFrom(0)
        assert.equal(readFileSync(output.spillPath, 'utf8'), expected)
        // seal() closes the spill descriptor without losing captured bytes.
        assert.equal(output.text, expected.slice(-4))
      }
      for (const descriptor of spillDescriptors) assert.throws(() => fstatSync(descriptor), { code: 'EBADF' })
    }
    if (scenario !== 'real') process.stdout.write(JSON.stringify({ ok: true, scenario, mode,
      code: result.error?.code ?? result.error?.cause?.code, kills }) + '\n')
  }
} finally {
  await fiber.dispose()
  assert.equal(spillDirectory.startsWith(join(tmpdir(), 'dsh-subprocess-error-fixture-')), true)
  rmSync(spillDirectory, { recursive: true, force: true })
  childProcess.spawn = realSpawn
  syncBuiltinESMExports()
}
