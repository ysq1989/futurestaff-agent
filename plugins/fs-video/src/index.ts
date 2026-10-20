export * from './contracts.js'
export * from './engine.js'
export type {VideoRuntime,ResolvedRuntime} from './runtime.js'
export * from './host.js'

import type { Context } from '@deepseek-ai/cordis'
import path from 'node:path'
import os from 'node:os'
import { VideoEngine } from './engine.js'
import { mountVideoTools } from './host.js'
import { ensureVideoRuntime } from './bootstrap.js'

export const name = 'futurestaff-video'
export const inject = ['tools', 'webServer']
export interface Config { deviceId?: string }

/** Product-owned native tools; the platform service supplies the signed-in session's real workspace. */
export function apply(ctx: Context, config: Config = {}): void {
  const deviceId = config.deviceId?.trim() || os.hostname()
  // The login Profile has no member identity. Keep its Loader entry active;
  // mount capabilities only inside an authorized member Profile generation.
  ctx.inject(['futurestaffVideoWorkspace'], videoCtx => {
    mountVideoTools(videoCtx, {
      workspace: videoCtx.futurestaffVideoWorkspace,
      deviceId,
      engineFactory: options => new VideoEngine(options),
      prepareRuntime: (identity, signal) => ensureVideoRuntime(path.join(identity.workspacePath, '.futurestaff-video-runtime'), signal),
    })
  })
}
