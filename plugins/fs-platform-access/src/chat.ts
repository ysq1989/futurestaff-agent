import type { PlatformModel } from './contracts.js'
import { assertPlatformOrigin } from './environment.js'
import { createHash, randomUUID } from 'node:crypto'
import { LlmAdapter, LlmError, ProviderRequestId, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { PlatformProtectedSecrets } from './session-vault.js'
import {businessToolAllowed,decodeBusinessSystems,templateToolAllowed,type BusinessSystem} from './business-scope.js'
import {shopSelectionInstructions,shopSelectionTurnContext} from './shop-selection.js'
import {shopThemeInstructions,normalizeThemeCatalogHistory,shopThemeCompletion,shopImageRecovery} from './shop-theme-guidance.js'
import type { AgentModelPolicy } from './agents.js'
import type {DiagnosticInput} from './diagnostics.js'
import {markDiagnosticRequestReported} from './diagnostics-observers.js'

export interface ChatCredentials {
  readonly accessToken: string
  readonly userId: string
  readonly tenantId: string
  readonly modelId: string
  readonly signal: AbortSignal
}
export type ChatIdentity = Pick<ChatCredentials,'userId'|'tenantId'|'signal'>
export interface ChatAgentBinding {
  releaseVersion?:string
  agentId:string
  version:string
  businessSystems?:BusinessSystem[]
  modelPolicy?:AgentModelPolicy
  identity?:Pick<ChatIdentity,'userId'|'tenantId'>
  signal?:AbortSignal
}
/** Host-verified installed template session; it is never a Platform Agent identity. */
export interface ChatTemplateBinding {
  kind:'local-template'
  templateId:string
  version:string
  businessSystems:readonly BusinessSystem[]
  tools?:readonly string[]
  identity:Pick<ChatIdentity,'userId'|'tenantId'>
  signal:AbortSignal
}
export type ChatBinding = ChatAgentBinding | ChatTemplateBinding

function isTemplateBinding(binding:ChatBinding):binding is ChatTemplateBinding {
  return 'kind' in binding && binding.kind==='local-template'
}

function validateTemplateBinding(binding:ChatTemplateBinding):void {
  let invalidScope=false
  try{decodeBusinessSystems(binding.businessSystems)}catch{invalidScope=true}
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(binding.templateId)
    || !/^[a-f0-9]{64}$/.test(binding.version) || invalidScope
    || (binding.tools!==undefined&&(!Array.isArray(binding.tools)||binding.tools.length>512||new Set(binding.tools).size!==binding.tools.length
      || binding.tools.some(name=>typeof name!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(name))))
    || !binding.identity || typeof binding.identity.userId!=='string' || !binding.identity.userId
    || typeof binding.identity.tenantId!=='string' || !binding.identity.tenantId
    || !binding.signal || typeof binding.signal.throwIfAborted!=='function'
    || 'agentId' in binding || 'modelPolicy' in binding || 'releaseVersion' in binding) {
    throw new LlmError('本地人才会话归属无法确认，请从已安装人才新建会话。','FUTURESTAFF_AGENT_BINDING')
  }
}

const unavailable = () => new LlmError('平台聊天服务暂时不可用，请检查登录状态或联系管理员。', 'FUTURESTAFF_CHAT')
const invalid = () => new LlmError('平台聊天响应不完整或版本不兼容。', 'FUTURESTAFF_CONTRACT')
const messageCardInstructions = '交互消息卡片：需要展示信息、让用户选择或补全简单字段时，使用 agent_message_card 提供结构化数据，由客户端绘制卡片；不要输出 HTML、脚本或伪造按钮。用户点击或提交后，其真实响应会返回原会话，请据此继续处理。卡片按钮不授予任何业务写入权限；商品推荐、ERP 确认和图片成果优先使用对应的专用工具与既有授权、预览及确认流程，通用卡片不能替代业务确认。'
const textOnly = (blocks: readonly ContentBlock[]): string => blocks.map(block => {
  if (block.type !== 'text') throw new LlmError('当前平台聊天仅支持文字，请移除图片或其他附件。', 'FUTURESTAFF_TEXT_ONLY')
  return block.text
}).join('\n')

export function chatOwnerKey(origin: string, sessionId: string): string {
  assertPlatformOrigin(origin)
  // Keep legacy DEV keys; hash the complete scoped identity once to fit the native 128-character limit.
  const legacy = origin === 'https://dev.fsstory.net'
  const digest = createHash('sha256').update(legacy ? sessionId : JSON.stringify([origin, sessionId])).digest('hex')
  return `futurestaff.chat.owner.${legacy ? '' : 'scoped.'}${digest}`
}

export type ChatImageReader = (ref: Extract<ContentBlock,{type:'image'}>['attachment'], sessionId:string, signal:AbortSignal) => Promise<{dataUrl:string;path:string}>

async function content(blocks:readonly ContentBlock[],options:GenerateOptions,readImage:ChatImageReader|undefined,signal:AbortSignal,seen:Set<string>){
 const images:string[]=[],text:ContentBlock[]=[]
 for(const block of blocks){
  if(block.type!=='image'){text.push(block);continue}
  if(!readImage||images.length>=2)throw new LlmError('图片输入不可用或超过每条两张的限制。','FUTURESTAFF_IMAGES')
  try{
   const image=await readImage(block.attachment,options.sessionId!,signal)
   text.push({type:'text',text:`附件图片文件：${image.path}。服装图片工具使用此相对路径。需要重新看图时只使用 read_image；不要用文本读取工具（Read、read、read_file、cat）打开 PNG/JPEG，也不要对已知图片路径反复 Glob/Grep。规格检查使用 fashion_image_process。`})
   if(!(block as ContentBlock & {offloaded?:boolean}).offloaded){
    const digest=createHash('sha256').update(image.dataUrl).digest('hex')
    if(!seen.has(digest)){images.push(image.dataUrl);seen.add(digest)}
    else text.push({type:'text',text:'这张图片已在本次请求的历史中提供，当前是同一图片的工具观察结果，不是用户新增图片或新任务。'})
   }
  }catch{throw new LlmError('无法读取此会话图片，请重新上传图片。','FUTURESTAFF_IMAGES')}
 }
 return {content:textOnly(text),...(images.length?{images}:{})}
}

async function messages(options: GenerateOptions, readImage: ChatImageReader | undefined, signal:AbortSignal): Promise<unknown[]> {
  const result: unknown[] = options.system ? [{ role: 'system', content: options.system }] : []
  const themeCatalogCalls=new Set<string>()
  for (const message of options.messages) {
    const seen=new Set<string>()
    if (message.content.some(block => block.type === 'tool-result')) {
      if (message.role !== 'user' || message.content.length !== 1 || message.content[0]?.type !== 'tool-result') throw invalid()
      const block = message.content[0]
      const blocks=themeCatalogCalls.has(block.toolCallId)&&message.source?.kind==='tool'?block.content.map(b=>b.type==='text'?{...b,text:normalizeThemeCatalogHistory(b.text)}:b):block.content
      result.push({ role: 'tool', ...await content(blocks,options,readImage,signal,seen), toolCallId: block.toolCallId })
      continue
    }
    if(message.role!=='user'&&message.content.some(block=>block.type==='image'))throw invalid()
    for(const block of message.content)if(message.role==='assistant'&&block.type==='tool-call'&&block.name==='shop_theme_tools')themeCatalogCalls.add(block.id)
    const encoded=await content(message.content.filter(block=>block.type!=='tool-call'),options,readImage,signal,seen)
    const toolCalls = message.content.filter(block => block.type === 'tool-call').map(block => ({
      id: block.id, name: block.name, arguments: block.arguments,
    }))
    result.push({ role: message.role, ...encoded, ...(toolCalls.length ? { toolCalls } : {}) })
  }
  // Model input is a rolling visual window, not a cap on durable session history.
  const seen=new Set<string>();let count=0,bytes=0
  for(const item of [...result].reverse()){
    const message=item as {images?:string[];content:string}
    if(!message.images)continue
    const retained:string[]=[]
    for(const image of [...message.images].reverse()){
      const digest=createHash('sha256').update(image).digest('hex')
      if(!seen.has(digest)&&count<4&&bytes+image.length<=8_000_000){retained.unshift(image);count++;bytes+=image.length}
      seen.add(digest)
    }
    if(retained.length!==message.images.length)message.content+='\n部分历史图片像素未加入本次视觉窗口，文件和观察记录仍保留。需要比较或重新查看时，用 read_image 读取上述路径；不要将未提供的像素当成已观察。'
    if(retained.length)message.images=retained;else delete message.images
  }
  return result
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Host-only platform transport. No renderer route exposes the bearer credential. */
export class FutureStaffChatAdapter extends LlmAdapter {
  #bindingQueue: Promise<void> = Promise.resolve()
  #callQueue: Promise<void> = Promise.resolve()
  readonly #lifetime = new AbortController()

  constructor(
    private readonly authorize: (modelId?: string) => Promise<ChatCredentials>,
    private readonly secrets: Pick<PlatformProtectedSecrets, 'read' | 'write'>,
    private readonly fetcher: typeof fetch = fetch,
    private readonly origin: string = 'https://dev.fsstory.net',
    private readonly catalog: () => Promise<readonly PlatformModel[]> = async () => [],
    private readonly agentBinding?: (sessionId: string) => Promise<ChatBinding | undefined>,
    private readonly readImage?: ChatImageReader,
    private readonly identitySnapshot?: () => Promise<ChatIdentity>,
    private readonly reportDiagnostic?: (input:DiagnosticInput)=>void,
  ) { super(); assertPlatformOrigin(origin) }

  dispose(): void { this.#lifetime.abort() }
  override providerInfo() { return { id: 'futurestaff', name: 'FutureStaff 平台' } }
  override providerRetryPolicy() {
    return { mode: 'normal' as const, maxRetries: 0, retryableCodes: [], initialDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 }
  }
  override async listModels() {
    const models=await this.catalog()
    const modalities=(vision:boolean)=>vision?['text','image'] as const:['text'] as const
    // The alias is resolved only after a real Session is known. Its capability envelope must not copy the tenant default.
    return [{ provider: 'futurestaff', id: 'default', name: '智能体默认模型', inputModalities: modalities(models.some(x=>x.supportsVision===true)) },
      ...models.map(model => ({ provider: 'futurestaff', id: model.modelId, name: model.displayName, inputModalities: modalities(model.supportsVision) }))]
  }
  override async resolveModel(provider: string, model: string) {
    if (provider !== 'futurestaff') throw unavailable()
    const selected = (await this.listModels()).find(item => item.id === model)
    if (!selected) throw unavailable()
    return { ...selected, defaultMaxTokens: 4096 }
  }
  override async prepareCall(provider: string, model: string, signal?: AbortSignal) {
    const metadata = await this.resolveModel(provider, model)
    signal?.throwIfAborted()
    const identity = await this.#captureIdentity()
    return { model: metadata, stream: (options: GenerateOptions) => {
      if(options.provider!==provider||options.model!==model)throw new LlmError('模型调用配置已变化，请重新发起请求。','FUTURESTAFF_MODEL_BINDING')
      const signals=[...(signal?[signal]:[]),...(options.signal?[options.signal]:[]),...(identity?[identity.signal]:[])]
      return this.#stream({...options,...(signals.length?{signal:AbortSignal.any(signals)}:{})},identity)
    } }
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const identity=await this.#captureIdentity()
    await this.resolveModel(options.provider, options.model)
    yield* this.#stream({...options,...(identity?{signal:AbortSignal.any([identity.signal,...(options.signal?[options.signal]:[])])}:{})},identity)
  }

  async #captureIdentity():Promise<ChatIdentity|undefined>{
    if(!this.identitySnapshot)return undefined
    try{const value=await this.identitySnapshot();value.signal.throwIfAborted();return {userId:value.userId,tenantId:value.tenantId,signal:value.signal}}
    catch{throw new LlmError('请在设置 → FutureStaff 检查登录与当前租户的可用模型；需要更换租户时，请退出并重新选择租户登录。','FUTURESTAFF_AUTH')}
  }

  async #credentials(model: string): Promise<ChatCredentials> {
    try {
      const credentials = await this.authorize(model === 'default' ? undefined : model)
      if (model !== 'default' && credentials.modelId !== model) throw unavailable()
      return credentials
    } catch {
      throw new LlmError('请在设置 → FutureStaff 检查登录与当前租户的可用模型；需要更换租户时，请退出并重新选择租户登录。', 'FUTURESTAFF_AUTH')
    }
  }

  async #bind(options: GenerateOptions, credentials: ChatCredentials): Promise<void> {
    const sessionId = options.sessionId
    if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 256) {
      throw new LlmError('请在新建会话中使用平台聊天。', 'FUTURESTAFF_SESSION')
    }
    const key = chatOwnerKey(this.origin, sessionId)
    const owner = JSON.stringify({ userId: credentials.userId, tenantId: credentials.tenantId })
    const bind = async () => {
      credentials.signal.throwIfAborted()
      const existing = await this.secrets.read(key)
      if (existing !== undefined && existing !== owner) {
        throw new LlmError('此会话不属于当前账号或租户，请新建会话。', 'FUTURESTAFF_TENANT')
      }
      if (existing === undefined) {
        if (options.messages.some(message => message.role === 'assistant'
          || message.content.some(block => block.type === 'tool-result'))
          || options.messages.filter(message => message.source.kind === 'user').length > 1) {
          throw new LlmError('旧会话没有平台归属记录，请新建会话。', 'FUTURESTAFF_SESSION')
        }
        await this.secrets.write(key, owner)
      }
    }
    const pending = this.#bindingQueue.then(bind, bind)
    this.#bindingQueue = pending.catch(() => {})
    await pending
  }

  async *#stream(options: GenerateOptions, identity?:ChatIdentity): AsyncIterable<StreamChunk> {
    const previous=this.#callQueue
    let release!:()=>void
    const ticket=new Promise<void>(resolve=>{release=resolve})
    this.#callQueue=previous.then(()=>ticket,()=>ticket)
    try {
      await previous
      identity?.signal.throwIfAborted();options.signal?.throwIfAborted();this.#lifetime.signal.throwIfAborted()
      yield* this.#run(options,identity)
    } finally {release()}
  }

  async *#run(options: GenerateOptions, identity?:ChatIdentity): AsyncIterable<StreamChunk> {
    if(typeof options.sessionId!=='string'||!options.sessionId||options.sessionId.length>256)throw new LlmError('请在新建会话中使用平台聊天。','FUTURESTAFF_SESSION')
    let binding:ChatBinding|undefined
    try {
      binding = this.agentBinding && options.sessionId ? await this.agentBinding(options.sessionId) : undefined
    } catch (error) {
      identity?.signal.throwIfAborted()
      if(error instanceof Error&&error.message==='AGENT_MODEL_VERSION_CHANGED')throw new LlmError('智能体配置已更新，请重新选择智能体并新建会话。原会话记录仍保留。','FUTURESTAFF_AGENT_VERSION')
      throw new LlmError('智能体会话归属无法确认，请重新选择智能体并新建会话。', 'FUTURESTAFF_AGENT_BINDING')
    }
    if (this.agentBinding && !binding) throw new LlmError('请先选择智能体，再创建会话；历史会话保留在旧工作区。', 'FUTURESTAFF_AGENT_REQUIRED')
    const template=binding&&isTemplateBinding(binding)?binding:undefined
    const agent=binding&&!isTemplateBinding(binding)?binding:undefined
    if(template)validateTemplateBinding(template)
    if(agent&&!agent.modelPolicy)throw new LlmError('此会话尚未绑定智能体模型配置，请重新选择智能体并新建会话。','FUTURESTAFF_AGENT_VERSION')
    const selected=options.model==='default'&&agent?agent.modelPolicy!.primaryModelId:options.model
    if(!selected)throw new LlmError('智能体尚未配置可用主模型，请联系管理员；不会自动切换到其他模型。','FUTURESTAFF_AGENT_MODEL')
    identity?.signal.throwIfAborted();binding?.signal?.throwIfAborted();options.signal?.throwIfAborted()
    const currentIdentity=await this.#captureIdentity()
    if(template&&(!identity||!currentIdentity))throw new LlmError('本地人才聊天需要确认当前账号与主体，请重新登录。','FUTURESTAFF_AUTH')
    if(identity&&((currentIdentity&&(currentIdentity.userId!==identity.userId||currentIdentity.tenantId!==identity.tenantId))
      ||(binding?.identity&&(binding.identity.userId!==identity.userId||binding.identity.tenantId!==identity.tenantId))))throw new LlmError('此会话的账号或租户已变化，请重新选择智能体并新建会话。','FUTURESTAFF_TENANT')
    // Model authorization comes after the trusted Session and policy, never from the tenant default for a bound Agent.
    const credentials=await this.#credentials(selected)
    if((identity&&(credentials.userId!==identity.userId||credentials.tenantId!==identity.tenantId))
      ||(binding?.identity&&(credentials.userId!==binding.identity.userId||credentials.tenantId!==binding.identity.tenantId)))throw new LlmError('此会话的账号或租户已变化，请重新选择智能体并新建会话。','FUTURESTAFF_TENANT')
    if(template&&!(await this.catalog()).some(model=>model.modelId===credentials.modelId))throw new LlmError('当前账号已无权使用所选模型，请刷新平台模型后重试。','FUTURESTAFF_AUTH')
    identity?.signal.throwIfAborted();binding?.signal?.throwIfAborted();credentials.signal.throwIfAborted();options.signal?.throwIfAborted()
    try { await this.#bind(options, credentials) } catch (error) {
      credentials.signal.throwIfAborted()
      if (error instanceof LlmError) throw error
      throw new LlmError('无法保存此会话的账号归属，请检查本机受保护存储。', 'FUTURESTAFF_STORAGE')
    }
    if(options.tools)options={...options,tools:options.tools.filter(tool=>template
      ?templateToolAllowed(tool.name,template.tools,template.businessSystems)
      :businessToolAllowed(tool.name,binding?.businessSystems))}
    let themeRecovery:ReturnType<typeof shopImageRecovery>
    if(agent?.businessSystems?.includes('shop')&&!options.purpose){
      const recovery=shopImageRecovery(options.messages)
      themeRecovery=recovery
      const completion=recovery?.stop?recovery.notice:shopThemeCompletion(options.messages,this.origin)
      if(completion){
        credentials.signal.throwIfAborted();options.signal?.throwIfAborted();this.#lifetime.signal.throwIfAborted()
        yield {type:'block-start',index:0,blockType:'text'}
        yield {type:'text-delta',index:0,text:completion}
        yield {type:'block-end',index:0,block:{type:'text',text:completion}}
        yield {type:'finish',reason:{kind:'stop'}}
        return
      }
      if(recovery&&options.tools)options={...options,tools:options.tools.filter(tool=>!['agent_image_generate','fashion_image_generate','website_image_generate'].includes(tool.name))}
      const selection=shopSelectionTurnContext(options.messages)
      options={...options,system:[options.system,shopSelectionInstructions,shopThemeInstructions,selection,recovery?recovery.notice+' 本会话有待恢复图片，agent_image_generate暂不可用。先agent_image_status查询上述原请求，成功才继续上传；失败/unknown明确停止。':undefined].filter(Boolean).join('\n\n'),
        ...(selection&&options.tools?{tools:options.tools.filter(tool=>!['shop_call','ask_user_question'].includes(tool.name))}:{})}
    }
    if(!options.purpose&&options.tools?.some(tool=>tool.name==='agent_message_card')){
      options={...options,system:[options.system,messageCardInstructions].filter(Boolean).join('\n\n')}
    }
    if(options.messages.some(m=>m.content.some(b=>(b.type==='tool-result'?b.content:[b]).some(image=>image.type==='image'&&!(image as ContentBlock & {offloaded?:boolean}).offloaded)))){
      const selected=(await this.catalog()).find(m=>m.modelId===credentials.modelId)
      if(!selected?.supportsVision)throw new LlmError('当前模型不支持图片，请选择支持图片的模型。','FUTURESTAFF_IMAGES')
    }
    const wireMessages=await messages(options,this.readImage,credentials.signal)
    const requestId = randomUUID()
    const requestStarted=Date.now()
    let httpStatus:number|undefined
    const body = JSON.stringify({ requestId, modelId: credentials.modelId,
      ...(agent ? { agentId: agent.agentId, agentVersion: agent.version,agentContractVersion:'1.1.0',...(agent.releaseVersion?{agentReleaseVersion:agent.releaseVersion}:{}),
        modelSelection:options.model==='default'?'agent-default':'session-explicit' } : {}),
      messages: wireMessages, tools: options.tools ?? [], maxTokens: Math.min(options.purpose==='session-title'?Math.max(options.maxTokens??32,512):options.maxTokens??4096, 8192) })
    if (Buffer.byteLength(body) > 9 * 1024 * 1024) throw new LlmError('会话内容过长，请新建会话。', 'FUTURESTAFF_LIMIT')
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 130_000)
    timeout.unref()
    const signal = AbortSignal.any([credentials.signal, abort.signal, this.#lifetime.signal,...(binding?.signal?[binding.signal]:[]),
      ...(options.signal ? [options.signal] : [])])
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      signal.throwIfAborted()
      let response: Response
      try {
        response = await this.fetcher(`${this.origin}/desktop/v1/chat`, { method: 'POST', redirect: 'error', cache: 'no-store', signal,
          headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json', accept: 'application/x-ndjson', 'x-futurestaff-chat-heartbeat':'1' }, body })
      } catch { signal.throwIfAborted(); throw unavailable() }
      httpStatus=response.status
      if (!response.ok) {
        await response.body?.cancel()
        if (response.status === 401) throw new LlmError('平台登录已失效，请在设置 → FutureStaff 重新登录。', 'FUTURESTAFF_AUTH')
        if (response.status === 403) throw new LlmError(agent ? '当前主体无权使用所选智能体或模型，请检查平台授权。' : '当前租户无权使用所选模型，请联系管理员，或退出后重新选择租户登录。', 'FUTURESTAFF_MODEL_ACCESS')
        if (response.status === 413 && agent) throw new LlmError('智能体知识或会话超过当前上下文限制，请减少知识文件或新建会话。', 'FUTURESTAFF_AGENT_LIMIT')
        if (response.status === 429) throw new LlmError('平台聊天请求过于频繁或额度已用尽，请稍后重试。', 'FUTURESTAFF_CHAT_LIMIT')
        if (response.status === 409 && agent) throw new LlmError('智能体配置已更新，请重新选择智能体并新建会话。原会话记录仍保留。', 'FUTURESTAFF_AGENT_VERSION')
        throw unavailable()
      }
      if (response.headers.get('x-futurestaff-chat-contract') !== '0.1.0'
        || !response.headers.get('content-type')?.startsWith('application/x-ndjson') || !response.body) {
        await response.body?.cancel(); throw invalid()
      }
      reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8', { fatal: true })
      let buffer = '', total = 0, index = 0
      let started = false
      while (true) {
        signal.throwIfAborted()
        const read = await reader.read()
        if (read.done) break
        total += read.value.byteLength
        if (total > 3 * 1024 * 1024) throw invalid()
        buffer += decoder.decode(read.value, { stream: true })
        if (buffer.length > 2 * 1024 * 1024) throw invalid()
        let newline: number
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          if(!line.trim())continue
          let event: unknown
          try { event = JSON.parse(line) } catch { throw invalid() }
          if (!record(event)) throw invalid()
          if (event.type === 'text') {
            if (Object.keys(event).sort().join(',') !== 'text,type' || typeof event.text !== 'string') throw invalid()
            // Pending image work cannot stream an unverified success claim, even on a later user turn.
            if(themeRecovery)continue
            if (!started) { started = true; yield { type: 'block-start', index, blockType: 'text' } }
            yield { type: 'text-delta', index, text: event.text }
          } else if (event.type === 'error') {
            if (Object.keys(event).sort().join(',') !== 'code,type' || event.code !== 'PROVIDER_UNAVAILABLE') throw invalid()
            throw new LlmError(`本次模型请求失败，请联系平台管理员并提供请求编号：${requestId}。`, 'FUTURESTAFF_PROVIDER', { requestId: ProviderRequestId(requestId) })
          } else if (event.type === 'result') {
            if (Object.keys(event).sort().join(',') !== 'content,finishReason,toolCalls,type'
              || typeof event.content !== 'string' || !Array.isArray(event.toolCalls)
              || event.toolCalls.length > 64
              || !['stop', 'tool-calls', 'max-tokens'].includes(String(event.finishReason))) throw invalid()
            const offered = new Set(options.tools?.map(tool => tool.name))
            const ids = new Set<string>()
            for (const call of event.toolCalls) {
              if (!record(call) || Object.keys(call).sort().join(',') !== 'arguments,id,name'
                || typeof call.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/u.test(call.id)
                || ids.has(call.id) || typeof call.name !== 'string' || !offered.has(call.name)
                || typeof call.arguments !== 'string' || call.arguments.length > 65536) throw invalid()
              try { if (!record(JSON.parse(call.arguments))) throw invalid() } catch { throw invalid() }
              ids.add(call.id)
            }
            if ((event.toolCalls.length > 0) !== (event.finishReason === 'tool-calls')) throw invalid()
            const resultText=themeRecovery?(event.toolCalls.length?'正在按原图片请求恢复装修。':themeRecovery.notice):event.content
            if (started || resultText) {
              if (!started) {
                yield { type: 'block-start', index, blockType: 'text' }
                yield { type: 'text-delta', index, text: resultText }
              }
              yield { type: 'block-end', index: index++, block: { type: 'text', text: resultText } }
            }
            for (const call of event.toolCalls as { id: string; name: string; arguments: string }[]) {
              const id = ToolCallId(call.id)
              yield { type: 'block-start', index, blockType: 'tool-call' }
              yield { type: 'tool-call-delta', index, id, name: call.name, argumentsDelta: call.arguments }
              yield { type: 'block-end', index: index++, block: { type: 'tool-call', id, name: call.name, arguments: call.arguments } }
            }
            yield { type: 'finish', reason: { kind: event.finishReason as 'stop' | 'tool-calls' | 'max-tokens' } }
            return
          } else { throw invalid() }
        }
      }
      throw invalid() // EOF without an explicit terminal result is never success.
    } catch (error) {
      // Keep bounded transport facts, without copying bodies or user text.
      const failure=error instanceof LlmError?error:invalid()
      if(!credentials.signal.aborted&&!this.#lifetime.signal.aborted&&!binding?.signal?.aborted&&!options.signal?.aborted){
        try{
          this.reportDiagnostic?.({category:'llm',operation:'chat',code:failure.code,
            sessionId:options.sessionId,requestId,durationMs:Math.min(Date.now()-requestStarted,3600000),requestBytes:Buffer.byteLength(body),
            ...(httpStatus!==undefined?{httpStatus}:{})})
          if(this.reportDiagnostic)markDiagnosticRequestReported(requestId)
        }catch{/* Reporting never alters a model request. */}
      }
      signal.throwIfAborted()
      throw new LlmError(failure.message,failure.code,{...failure.failure,requestId:ProviderRequestId(requestId),...(httpStatus!==undefined?{status:httpStatus}:{})})
    } finally {
      clearTimeout(timeout)
      await reader?.cancel().catch(() => {})
      reader?.releaseLock()
    }
  }
}
