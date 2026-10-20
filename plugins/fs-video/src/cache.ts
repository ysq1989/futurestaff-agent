import os from 'node:os'
import path from 'node:path'
import {VideoError} from './contracts.js'

/** Native-only cache path. Full SHA-256 identity is encoded, never truncated.
 * LocalAppData inherits the OS user's private ACL; the runtime preparer rejects
 * linked ancestors and verifies every cached byte against packaged hashes.
 * Projects, revisions and outputs remain in the original member workspace.
 */
export function videoRuntimeCacheRoot(ownerKey:string,localAppData=process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData','Local')):string {
 if(!/^[a-f0-9]{64}$/.test(ownerKey))throw new VideoError('VIDEO_SCOPE_INVALID')
 if(!path.win32.isAbsolute(localAppData))throw new VideoError('VIDEO_RUNTIME_PATH_INVALID')
 // Lowercase base36 is injective even on case-insensitive Windows volumes.
 // 50 digits retain all 256 identity bits, including leading-zero hashes.
 return path.win32.join(localAppData,'FutureStaff','v',BigInt('0x'+ownerKey).toString(36).padStart(50,'0'))
}
