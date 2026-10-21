/** OS-protected, file-backed secrets exposed only to Desktop Host plugins. */

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, readdir, unlink } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { Context } from '@deepseek-ai/cordis'

const DIRECTORY_NAME = 'protected-secrets'
const STATE_VERSION = 1
const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const MAX_PLAINTEXT_BYTES = 64 * 1024
const MAX_STATE_BYTES = 128 * 1024
const KEY_PATTERN = /^[a-z][a-z0-9._-]{2,127}$/u
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
const CHECK_POSIX_MODE = process.platform !== 'win32'

export type DesktopProtectedSecretsErrorCode =
  | 'invalid-key'
  | 'invalid-secret'
  | 'invalid-state'
  | 'protection-unavailable'

export class DesktopProtectedSecretsError extends Error {
  constructor(
    readonly code: DesktopProtectedSecretsErrorCode,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'DesktopProtectedSecretsError'
  }
}

export interface DesktopSecretProtector {
  readonly available: boolean | (() => boolean | Promise<boolean>)
  readonly seal: (plaintext: Uint8Array) => Uint8Array | Promise<Uint8Array>
  readonly open: (sealed: Uint8Array) => Uint8Array | Promise<Uint8Array>
}

export interface DesktopProtectedSecrets {
  available(): Promise<boolean>
  has(key: string): Promise<boolean>
  read(key: string): Promise<string | undefined>
  write(key: string, secret: string): Promise<void>
  delete(key: string): Promise<void>
}

interface PersistedSecretV1 {
  readonly version: 1
  readonly sealed: string
}

function secretError(
  code: DesktopProtectedSecretsErrorCode,
  message: string,
  cause?: unknown,
): DesktopProtectedSecretsError {
  return new DesktopProtectedSecretsError(
    code,
    `dsh-plugin-desktop: ${message}`,
    cause === undefined ? {} : { cause },
  )
}

function validateKey(key: string): string {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw secretError('invalid-key', 'protected secret key is invalid.')
  }
  return key
}

function statePath(userDataDir: string, key: string): string {
  if (!isAbsolute(userDataDir) || /[\0\r\n]/u.test(userDataDir)) {
    throw secretError('invalid-state', 'protected secret userData path is invalid.')
  }
  const digest = createHash('sha256').update(validateKey(key), 'utf8').digest('hex')
  return join(resolve(userDataDir), DIRECTORY_NAME, `${digest}.json`)
}

export class FileDesktopProtectedSecrets implements DesktopProtectedSecrets {
  readonly #userDataDir: string

  constructor(userDataDir: string, private readonly protector: DesktopSecretProtector) {
    if (!isAbsolute(userDataDir) || /[\0\r\n]/u.test(userDataDir)) {
      throw secretError('invalid-state', 'protected secret userData path is invalid.')
    }
    this.#userDataDir = resolve(userDataDir)
  }

  async available(): Promise<boolean> {
    try {
      const value = typeof this.protector.available === 'function'
        ? await this.protector.available()
        : this.protector.available
      return value === true
    } catch {
      return false
    }
  }

  async read(key: string): Promise<string | undefined> {
    const path = statePath(this.#userDataDir, key)
    await this.requireProtection()
    try {
      if (!await inspectDirectory(this.#userDataDir)) return undefined
      // Atomic rename commits complete ciphertext; readers must not acquire writer locks.
      const state = await readState(path)
      return state === undefined ? undefined : await this.open(state)
    } catch (cause) {
      if (cause instanceof DesktopProtectedSecretsError) throw cause
      throw secretError('invalid-state', 'protected secret could not be read safely.', cause)
    }
  }

  async has(key: string): Promise<boolean> {
    const path = statePath(this.#userDataDir, key)
    try {
      if (!await inspectDirectory(this.#userDataDir)) return false
      return await inspectState(path) !== undefined
    } catch (cause) {
      if (cause instanceof DesktopProtectedSecretsError) throw cause
      throw secretError('invalid-state', 'protected secret state could not be inspected safely.', cause)
    }
  }

  async write(key: string, secret: string): Promise<void> {
    const path = statePath(this.#userDataDir, key)
    if (typeof secret !== 'string') {
      throw secretError('invalid-secret', 'protected secret plaintext is invalid.')
    }
    const plaintext = Buffer.from(secret, 'utf8')
    if (plaintext.byteLength === 0 || plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
      plaintext.fill(0)
      throw secretError('invalid-secret', 'protected secret plaintext is invalid.')
    }
    await this.requireProtection()
    await prepareDirectory(this.#userDataDir)
    try {
      await withFileLock(path, async () => {
        const sealed = await this.seal(plaintext)
        try {
          const state: PersistedSecretV1 = Object.freeze({ version: STATE_VERSION, sealed: sealed.toString('base64') })
          await writeFileAtomic(path, `${JSON.stringify(state)}\n`, {
            mode: PRIVATE_FILE_MODE,
            dirMode: PRIVATE_DIRECTORY_MODE,
          })
          if (CHECK_POSIX_MODE) await chmod(path, PRIVATE_FILE_MODE)
        } finally {
          sealed.fill(0)
        }
      }, { waitMs: 10_000 })
    } catch (cause) {
      if (cause instanceof DesktopProtectedSecretsError) throw cause
      throw secretError('invalid-state', 'protected secret could not be persisted safely.', cause)
    } finally {
      plaintext.fill(0)
    }
  }

  async delete(key: string): Promise<void> {
    const path = statePath(this.#userDataDir, key)
    try {
      if (!await inspectDirectory(this.#userDataDir)) return
      if (await inspectState(path) === undefined) return
      await withFileLock(path, async () => {
        const info = await inspectState(path)
        if (info === undefined) return
        await unlink(path)
      }, { waitMs: 10_000 })
    } catch (cause) {
      if (cause instanceof DesktopProtectedSecretsError) throw cause
      throw secretError('invalid-state', 'protected secret could not be deleted safely.', cause)
    }
  }

  private async requireProtection(): Promise<void> {
    if (!await this.available()) {
      throw secretError('protection-unavailable', 'operating-system secret protection is unavailable.')
    }
  }

  private async seal(plaintext: Buffer): Promise<Buffer> {
    try {
      const output = await this.protector.seal(plaintext)
      if (!(output instanceof Uint8Array) || output.byteLength === 0 || output.byteLength > MAX_STATE_BYTES) {
        throw new TypeError('protector returned invalid sealed bytes')
      }
      const sealed = Buffer.from(output)
      if (sealed.equals(plaintext) || sealed.includes(plaintext)) {
        sealed.fill(0)
        throw new TypeError('protector did not conceal plaintext')
      }
      return sealed
    } catch (cause) {
      throw secretError('protection-unavailable', 'secret could not be protected by the operating system.', cause)
    }
  }

  private async open(state: PersistedSecretV1): Promise<string> {
    const sealed = Buffer.from(state.sealed, 'base64')
    let plaintext: Buffer | undefined
    try {
      const output = await this.protector.open(sealed)
      if (!(output instanceof Uint8Array) || output.byteLength === 0 || output.byteLength > MAX_PLAINTEXT_BYTES) {
        throw new TypeError('protector returned invalid plaintext')
      }
      plaintext = Buffer.from(output)
      return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
    } catch (cause) {
      throw secretError('protection-unavailable', 'secret could not be opened by the operating system.', cause)
    } finally {
      sealed.fill(0)
      plaintext?.fill(0)
    }
  }
}

/**
 * Recover interrupted secret writes only during pre-Host Electron startup.
 * The caller must already own Electron's single-instance lock for this userData
 * and must not have started secret writers. That ownership, not PID liveness or
 * file age, proves these locks belong to a previous service generation (PIDs can
 * be reused). Other processes and generic atomic-write locks are not recovered.
 */
export async function recoverDesktopProtectedSecretLocks(
  userDataDir: string, ownsExclusiveDesktop: () => boolean,
): Promise<number> {
  const requireOwnership = () => {
    if (!ownsExclusiveDesktop()) throw secretError('invalid-state', 'exclusive Desktop startup ownership is required.')
  }
  requireOwnership()
  if (!isAbsolute(userDataDir) || /[\0\r\n]/u.test(userDataDir)) {
    throw secretError('invalid-state', 'protected secret userData path is invalid.')
  }
  try { if (!await inspectDirectory(userDataDir)) return 0 }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw cause }
  const directory = join(userDataDir, DIRECTORY_NAME)
  let recovered = 0
  for (const name of await readdir(directory)) {
    if (!/^[0-9a-f]{64}\.json\.lock$/u.test(name)) continue
    const lock = join(directory, name)
    const info = await inspectState(lock)
    if (!info) continue
    if (info.size > 32) throw secretError('invalid-state', 'credential writer lock is malformed.')
    const handle = await open(lock, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const opened = await handle.stat()
      if (opened.dev !== info.dev || opened.ino !== info.ino || !opened.isFile()) {
        throw secretError('invalid-state', 'credential writer lock changed while opening.')
      }
      if (!/^[1-9][0-9]*\n$/u.test(await handle.readFile('utf8'))) {
        throw secretError('invalid-state', 'credential writer lock is malformed.')
      }
    } finally { await handle.close() }
    requireOwnership()
    const current = await inspectState(lock)
    if (!current || current.dev !== info.dev || current.ino !== info.ino) {
      throw secretError('invalid-state', 'credential writer lock changed before recovery.')
    }
    await unlink(lock)
    recovered++
  }
  return recovered
}

async function prepareDirectory(userDataDir: string): Promise<void> {
  const userDataInfo = await lstat(userDataDir)
  if (!userDataInfo.isDirectory() || userDataInfo.isSymbolicLink()) {
    throw secretError('invalid-state', 'protected secret userData must be an ordinary directory.')
  }
  const directory = join(userDataDir, DIRECTORY_NAME)
  try {
    await mkdir(directory, { mode: PRIVATE_DIRECTORY_MODE })
    await chmod(directory, PRIVATE_DIRECTORY_MODE)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause
  }
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()
    || (CHECK_POSIX_MODE && (info.mode & 0o777) !== PRIVATE_DIRECTORY_MODE)) {
    throw secretError('invalid-state', 'protected secret directory is unsafe.')
  }
}

async function inspectDirectory(userDataDir: string): Promise<boolean> {
  const userDataInfo = await lstat(userDataDir)
  if (!userDataInfo.isDirectory() || userDataInfo.isSymbolicLink()) {
    throw secretError('invalid-state', 'protected secret userData must be an ordinary directory.')
  }
  const directory = join(userDataDir, DIRECTORY_NAME)
  try {
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()
      || (CHECK_POSIX_MODE && (info.mode & 0o777) !== PRIVATE_DIRECTORY_MODE)) {
      throw secretError('invalid-state', 'protected secret directory is unsafe.')
    }
    return true
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw cause
  }
}

async function inspectState(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_STATE_BYTES
      || (CHECK_POSIX_MODE && (info.mode & 0o777) !== PRIVATE_FILE_MODE)) {
      throw secretError('invalid-state', 'protected secret state is unsafe.')
    }
    return info
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw cause
  }
}

async function readState(path: string, attempt = 0): Promise<PersistedSecretV1 | undefined> {
  const inspected = await inspectState(path)
  if (inspected === undefined) return undefined
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== inspected.dev || opened.ino !== inspected.ino) {
      if (attempt < 3) return readState(path, attempt + 1)
      throw secretError('invalid-state', 'protected secret state changed while opening.')
    }
    const bytes = Buffer.alloc(MAX_STATE_BYTES + 1)
    let bytesRead = 0
    while (bytesRead < bytes.byteLength) {
      const chunk = await handle.read(bytes, bytesRead, bytes.byteLength - bytesRead, bytesRead)
      if (chunk.bytesRead === 0) break
      bytesRead += chunk.bytesRead
    }
    if (bytesRead > MAX_STATE_BYTES) throw secretError('invalid-state', 'protected secret state is too large.')
    let value: unknown
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead))) } catch (cause) {
      throw secretError('invalid-state', 'protected secret state is malformed.', cause)
    } finally {
      bytes.fill(0)
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw secretError('invalid-state', 'protected secret state is malformed.')
    }
    const record = value as Record<string, unknown>
    if (Object.keys(record).sort().join(',') !== 'sealed,version' || record.version !== STATE_VERSION
      || typeof record.sealed !== 'string' || record.sealed.length === 0
      || record.sealed.length % 4 !== 0 || !BASE64_PATTERN.test(record.sealed)
      || Buffer.from(record.sealed, 'base64').toString('base64') !== record.sealed) {
      throw secretError('invalid-state', 'protected secret state is malformed.')
    }
    return Object.freeze({ version: STATE_VERSION, sealed: record.sealed })
  } finally {
    await handle.close()
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** OS-protected secret persistence available only inside Desktop Host. */
    desktopProtectedSecrets: DesktopProtectedSecrets
  }
}

export type DesktopProtectedSecretsContext = Context

export const desktopProtectedSecretsConstants = Object.freeze({
  directoryName: DIRECTORY_NAME,
  stateVersion: STATE_VERSION,
  directoryMode: PRIVATE_DIRECTORY_MODE,
  fileMode: PRIVATE_FILE_MODE,
  maxPlaintextBytes: MAX_PLAINTEXT_BYTES,
  maxStateBytes: MAX_STATE_BYTES,
})
