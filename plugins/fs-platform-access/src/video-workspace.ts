import path from 'node:path'
import type { WorkspaceIdentity } from './workspace.js'

export interface VideoWorkspaceAuthority extends WorkspaceIdentity {
  agentId: string
  agentVersion: string
  workspacePath: string
  signal: AbortSignal
}
export interface VideoWorkspaceResolver {
  authorize(sessionId: string, signal?: AbortSignal): Promise<VideoWorkspaceAuthority>
}
/** Text skills express intent; current platform access and native local-tool approval remain mandatory. */
export function createVideoWorkspaceResolver(options: {
  identity: WorkspaceIdentity
  authorize(): Promise<{tenantId:string;userId:string;signal:AbortSignal}>
  resolveBinding(sessionId:string): Promise<{agentId:string;version:string;releaseVersion?:string;snapshotVersion?:string}|undefined>
  snapshot(agentId:string,releaseVersion?:string,snapshotVersion?:string): Promise<{agentId:string;version:string;files:{path:string;content:string}[]}>
  workspacePath(agentId:string,releaseVersion?:string,snapshotVersion?:string): Promise<string>
}): VideoWorkspaceResolver {
  return Object.freeze({async authorize(sessionId:string,signal?:AbortSignal) {
    if(typeof sessionId!=='string'||!sessionId||sessionId.length>256)throw Error('VIDEO_SESSION_REQUIRED')
    signal?.throwIfAborted()
    const credentials=await options.authorize()
    credentials.signal.throwIfAborted()
    if(credentials.tenantId!==options.identity.tenantId||credentials.userId!==options.identity.userId)throw Error('VIDEO_IDENTITY_CHANGED')
    const binding=await options.resolveBinding(sessionId)
    if(!binding)throw Error('VIDEO_AGENT_BINDING_REQUIRED')
    const snapshot=await options.snapshot(binding.agentId,binding.releaseVersion,binding.snapshotVersion)
    if(snapshot.agentId!==binding.agentId||snapshot.version!==binding.version)throw Error('VIDEO_AGENT_VERSION_CHANGED')
    if(!snapshot.files.some(file=>file.path==='skills/video-production/SKILL.md'))throw Error('VIDEO_AGENT_CAPABILITY_REQUIRED')
    const workspacePath=await options.workspacePath(binding.agentId,binding.releaseVersion,binding.snapshotVersion)
    if(!path.isAbsolute(workspacePath))throw Error('VIDEO_WORKSPACE_INVALID')
    const combined=signal?AbortSignal.any([credentials.signal,signal]):credentials.signal
    combined.throwIfAborted()
    return {...options.identity,agentId:binding.agentId,agentVersion:binding.version,workspacePath,signal:credentials.signal}
  }})
}
