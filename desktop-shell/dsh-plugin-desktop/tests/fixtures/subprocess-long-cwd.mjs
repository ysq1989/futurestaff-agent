import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'

const [runtimeFile, scenario, pwshRuntimeFile] = process.argv.slice(2)
const require = createRequire(new URL('../../package.json', import.meta.url))
const realSpawn = childProcess.spawn
let captured
if (scenario === 'non-windows') {
  childProcess.spawn = (_program, _args, options) => {
    captured = options.cwd
    const child = Object.assign(new EventEmitter(), { pid: undefined, exitCode: 0, signalCode: null,
      stdin: null, stdout: new PassThrough(), stderr: new PassThrough() })
    queueMicrotask(() => child.emit('close', 0, null))
    return child
  }
  syncBuiltinESMExports()
}
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
const { default: LocalSubprocessRuntime } = await import(pathToFileURL(runtimeFile).href)
const ctx = new Context(), fiber = await ctx.plugin(LocalSubprocessRuntime)
const temporary = mkdtempSync(path.join(tmpdir(), 'dsh-long-cwd-fixture-'))
const stdio = { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } }
let shellFiber

try {
  if (scenario === 'non-windows') {
    ctx.subprocess.internals = { platform: 'linux' }
    const cwd = path.join(temporary, 'ordinary-directory')
    const handle = ctx.subprocess.spawn({ argv: ['fixture'], cwd, stdio, graceMs: 50 })
    assert.equal((await handle.done).exitCode, 0)
    assert.equal(captured, cwd, 'non-Windows must preserve the caller cwd exactly')
    assert.equal(await handle.waitForExit(), true)
    process.stdout.write(JSON.stringify({ ok: true, scenario }) + '\n')
  } else {
    let cwd = temporary
    if (scenario === 'long') while (cwd.length <= 280) cwd = path.join(cwd, "long directory's 商品")
    if (/^25[89]$|^260$/.test(scenario)) cwd = path.join(temporary, 'x'.repeat(Number(scenario) - temporary.length - 1))
    mkdirSync(cwd, { recursive: true })
    writeFileSync(path.join(cwd, 'FixtureSHOP.txt'), 'FS_LONG_CWD_NEEDLE\n')
    const installed = 'D:/FutureStaff Agent/resources/app.asar.unpacked/node_modules/@vscode/ripgrep-win32-x64/bin/rg.exe'
    const searchRequire = createRequire(require.resolve('@deepseek-ai/dsh-tool-fs-search/package.json'))
    const rg = existsSync(installed) ? installed : searchRequire('@vscode/ripgrep').rgPath
    const powershell = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
    const { default: PwshLocalExecutor, ENCODING_PREAMBLE } = await import(pathToFileURL(pwshRuntimeFile).href)
    shellFiber = await ctx.plugin(PwshLocalExecutor, { pwshPath: powershell, graceMs: 100 })
    const command = "Get-Content -LiteralPath '.\\FixtureSHOP.txt'; exit 0"
    if (cwd.length < 259) assert.equal(ctx.shell.argv(ctx.shell.resolve({ command, workdir: cwd })).at(-1), ENCODING_PREAMBLE + command,
      'ordinary short working directories keep their original PowerShell argv bytes')
    const commands = [
      { name: 'glob', argv: [rg, '--no-config', '--files', '--glob', '**/*SHOP*', '--', '.'], exit: 0, stdout: 'FixtureSHOP.txt' },
      { name: 'grep', argv: [rg, '--no-config', '--line-number', 'FS_LONG_CWD_NEEDLE', '--', '.'], exit: 0, stdout: 'FS_LONG_CWD_NEEDLE' },
      { name: 'grep-empty', argv: [rg, '--no-config', 'FS_LONG_CWD_NO_MATCH', '--', '.'], exit: 1, stdout: '' },
      { name: 'pwsh-success', command, exit: 0, stdout: 'FS_LONG_CWD_NEEDLE' },
      { name: 'pwsh-exit7', command: "[Console]::Error.WriteLine('FS_LONG_CWD_EXPECTED_7'); exit 7", exit: 7, stderr: 'FS_LONG_CWD_EXPECTED_7' },
    ]
    for (const command of commands) {
      const handle = command.argv ? ctx.subprocess.spawn({ argv: command.argv, cwd, stdio, graceMs: 100 }) : undefined
      const result = handle ? await handle.done : await ctx.shell.run(ctx.shell.resolve({ command: command.command, workdir: cwd, stdoutMaxBytes: 8192, timeoutMs: 10_000 }))
      assert.equal(result.exitCode, command.exit, command.name)
      if (command.stdout) assert.ok((handle ? handle.collected.stdout.readFrom(0).text : result.stdout.text).includes(command.stdout), command.name)
      if (command.stderr) assert.ok((handle ? handle.collected.stderr.readFrom(0).text : result.stderr.text).includes(command.stderr), command.name)
      if (handle) assert.equal(await handle.waitForExit(), true)
    }
    process.stdout.write(JSON.stringify({ ok: true, scenario, cwdLength: cwd.length,
      cases: commands.map(command => command.name), installedRipgrep: rg === installed }) + '\n')
  }
} finally {
  await shellFiber?.dispose()
  await fiber.dispose()
  childProcess.spawn = realSpawn
  syncBuiltinESMExports()
  assert.equal(path.dirname(temporary), tmpdir())
  assert.ok(path.basename(temporary).startsWith('dsh-long-cwd-fixture-'))
  rmSync(temporary, { recursive: true, force: true })
}
