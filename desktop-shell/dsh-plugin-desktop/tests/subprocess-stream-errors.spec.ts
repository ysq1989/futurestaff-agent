import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url))
let directory: string
let runtimeFile: string
let pwshRuntimeFile: string

beforeAll(() => {
  // Exercise exactly the vendored npm artifact plus the release patch. The
  // upstream checkout and live node_modules stay untouched during RED/GREEN.
  directory = mkdtempSync(join(packageRoot, 'tests/.subprocess-errors-'))
  mkdirSync(join(directory, 'lib'))
  runtimeFile = join(directory, 'lib/index.js')
  const archive = join(workspaceRoot, 'vendor/dsh-runtime/0.1.2-rc.1/deepseek-ai-dsh-subprocess-local-0.1.2-rc.1.tgz')
  const unpacked = spawnSync('tar', ['-xOf', archive, 'package/lib/index.js'], { encoding: 'utf8', windowsHide: true })
  expect(unpacked.status, unpacked.stderr).toBe(0)
  writeFileSync(runtimeFile, unpacked.stdout)
  const patched = spawnSync('git', ['apply', '--no-index', '--unsafe-paths', `--directory=${directory.replaceAll('\\', '/')}`,
    join(workspaceRoot, 'patches/dsh-subprocess-local@0.1.2-rc.1.patch')], {
    cwd: tmpdir(), encoding: 'utf8', windowsHide: true,
  })
  expect(patched.status, patched.stderr).toBe(0)
  expect(readFileSync(runtimeFile, 'utf8')).toContain('windowsHide: true')
  pwshRuntimeFile = join(directory, 'lib/pwsh-local.js')
  const pwshArchive = join(workspaceRoot, 'vendor/dsh-runtime/0.1.2-rc.1/deepseek-ai-dsh-pwsh-local-0.1.2-rc.1.tgz')
  const pwshBase = spawnSync('tar', ['-xOf', pwshArchive, 'package/lib/index.js'], { encoding: 'utf8', windowsHide: true })
  expect(pwshBase.status, pwshBase.stderr).toBe(0)
  writeFileSync(pwshRuntimeFile, pwshBase.stdout)
  const pwshPatch = join(workspaceRoot, 'patches/dsh-pwsh-local@0.1.2-rc.1.patch')
  if (existsSync(pwshPatch)) {
    const staged = join(directory, 'pwsh-stage'); mkdirSync(join(staged, 'lib'), { recursive: true })
    writeFileSync(join(staged, 'lib/index.js'), pwshBase.stdout)
    const result = spawnSync('git', ['apply', '--no-index', '--unsafe-paths', `--directory=${staged.replaceAll('\\', '/')}`, pwshPatch], { cwd: tmpdir(), encoding: 'utf8', windowsHide: true })
    expect(result.status, result.stderr).toBe(0)
    writeFileSync(pwshRuntimeFile, readFileSync(join(staged, 'lib/index.js')))
  }
}, 30_000)

afterAll(() => {
  // The directory is generated beneath this test's own package, never a
  // profile, installation, project, or pre-existing evidence directory.
  if (directory) rmSync(directory, { recursive: true, force: true })
})

function probe(scenario: string, mode = 'collect') {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./fixtures/subprocess-errors.mjs', import.meta.url)), runtimeFile, scenario, mode,
  ], { cwd: packageRoot, encoding: 'utf8', windowsHide: true, timeout: 15_000 })
  expect(result.error, result.stderr).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout.trim()) as { ok: boolean; code?: string; kills?: number; cases?: string[] }
}

describe('RC1 local subprocess release patch error containment', () => {
  for (const scenario of ['long', '258', '259', '260', 'short', 'non-windows']) {
    it.skipIf(process.platform !== 'win32')(`preserves real executable and relative-path behavior with ${scenario} cwd`, () => {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./fixtures/subprocess-long-cwd.mjs', import.meta.url)), runtimeFile, scenario, pwshRuntimeFile], {
        cwd: packageRoot, encoding: 'utf8', windowsHide: true, timeout: 20_000,
      })
      expect(result.error, result.stderr).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      const value = JSON.parse(result.stdout.trim())
      expect(value.ok).toBe(true)
      if (scenario === 'long') expect(value.cwdLength).toBeGreaterThan(260)
      if (scenario !== 'non-windows') expect(value.cases).toEqual(['glob', 'grep', 'grep-empty', 'pwsh-success', 'pwsh-exit7'])
    }, 25_000)
  }

  for (const stream of ['stdout', 'stderr']) {
    for (const mode of ['collect', 'pipe']) {
      it(`rejects ${stream} ENOTCONN in ${mode} mode and reaps the task without killing its host`, () => {
        expect(probe(stream, mode)).toMatchObject({ ok: true, code: 'ENOTCONN', kills: 1 })
      })
      it(`contains a real ${stream} Socket read error in ${mode} mode`, () => {
        expect(probe(`${stream}-socket`, mode)).toMatchObject({ ok: true, code: 'ENOTCONN', kills: 1 })
      })
    }
  }

  it('preserves synchronous spawn errors without killing the host', () => {
    probe('spawn-sync')
  })

  it('rejects asynchronous spawn errors, closes streams, and retains captured output', () => {
    expect(probe('spawn-error')).toMatchObject({ ok: true, code: 'ENOENT', kills: 0 })
  })

  it('rejects pipe stdin I/O failure instead of leaking an unhandled stream error', () => {
    expect(probe('stdin')).toMatchObject({ ok: true, code: 'ENOTCONN', kills: 1 })
  })

  it('rejects non-EPIPE batch stdin failure', () => {
    expect(probe('stdin-batch')).toMatchObject({ ok: true, code: 'ENOTCONN', kills: 1 })
  })

  it('keeps a child that closes batch stdin early as an ordinary exit', () => {
    expect(probe('stdin-batch-epipe')).toMatchObject({ ok: true, kills: 0 })
  })

  it('contains late stream errors after a normal close without changing the recorded exit', () => {
    expect(probe('late-error')).toMatchObject({ ok: true, kills: 0 })
  })

  it('rejects an I/O failure during exit drain without signalling an exited process', () => {
    expect(probe('after-exit')).toMatchObject({ ok: true, code: 'ENOTCONN', kills: 0 })
  })

  it('reports both errors if process-tree termination also fails', () => {
    expect(probe('termination-error')).toMatchObject({ ok: true, code: 'ENOTCONN', kills: 1 })
  })

  it('runs actual ripgrep glob/grep and Shell and preserves nonzero process exit', () => {
    expect(probe('real').cases).toEqual(['glob-ripgrep', 'grep-ripgrep', 'shell', 'nonzero-exit'])
  }, 20_000)

  it('keeps all three existing hidden Windows console spawns in the release artifact', () => {
    expect(readFileSync(runtimeFile, 'utf8').match(/windowsHide: true/gu)).toHaveLength(3)
  })
})
