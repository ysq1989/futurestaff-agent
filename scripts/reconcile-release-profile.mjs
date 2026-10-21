import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installBundledFutureStaffProfile, planBundledFutureStaffProfile } from '../desktop-shell/dsh-plugin-desktop/src/futurestaff-profile.ts'

/** Explicit paths only. Default is read-only; --apply invokes the normal startup API. */
export function reconcileReleaseProfile(args) {
  const flags = new Map()
  let apply = false
  for (let index = 0; index < args.length; index++) {
    const name = args[index]
    if (name === '--apply') { apply = true; continue }
    if (!['--resources', '--home', '--selection-state'].includes(name)
      || flags.has(name) || !args[index + 1] || !path.isAbsolute(args[index + 1])) {
      throw new Error('Use --resources ABSOLUTE_PATH --home ABSOLUTE_PATH --selection-state ABSOLUTE_PATH [--apply]')
    }
    flags.set(name, args[++index])
  }
  if (flags.size !== 3) throw new Error('All three explicit absolute paths are required')
  const options = { resourcesPath: flags.get('--resources'), homeDir: flags.get('--home'), selectionStatePath: flags.get('--selection-state') }
  const before = planBundledFutureStaffProfile(options)
  if (!apply) return { mode: 'dry-run', before }
  const result = installBundledFutureStaffProfile(options)
  return { mode: 'apply', before, result, after: planBundledFutureStaffProfile(options) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(reconcileReleaseProfile(process.argv.slice(2)), null, 2)) }
  catch { console.error('Release Profile reconciliation failed; verify the explicit paths and immutable release source.'); process.exitCode = 1 }
}
