import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react'
import {createRoot} from 'react-dom/client'
import {ApiError, request, newRequestId, attachmentLink, systemEntryLink, type Agent, type Attachment, type BusinessSystem, type Conversation, type ConversationRow, type Member, type Question} from './api.js'
import {Markdown} from './markdown.js'
import {acceptSessionVersion, reconcileSend, subscribeSessionResume, conversationKey, isCurrentConversation, type SendAttempt, type SeenSession} from './recovery.js'
import {ScopedVoiceCapture, createVoiceTransport, voiceMode} from './voice.js'
import {AigcLauncher,type AigcChild} from './aigc-launch.js'
import {WorkspaceHeader} from './workspace-header.js'
import './style.css'

const states: Record<string, string> = {idle: '就绪', running: '正在处理', waiting: '等待回答', interrupted: '任务已中断', error: '处理未完成', stopped: '已停止'}
type InstallEvent = Event & {prompt(): Promise<void>; userChoice: Promise<{outcome: string}>}
const failureText = (error: unknown) => error instanceof Error ? error.message : '请求未完成，请重试。'
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

function Brand() {return <span className="brand"><span className="brand-mark" aria-hidden="true">F</span><span>FutureStaff <span className="brand-secondary">Agent</span></span></span>}

function InstallControl() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [standalone, setStandalone] = useState(() => matchMedia('(display-mode: standalone)').matches)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const ready = (event: Event) => {event.preventDefault(); setPrompt(event as InstallEvent)}
    const complete = () => {setStandalone(true); setPrompt(null); setInstalled(true)}
    window.addEventListener('beforeinstallprompt', ready)
    window.addEventListener('appinstalled', complete)
    return () => {window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', complete)}
  }, [])
  if (standalone) return installed ? <small role="status">已添加到主屏幕</small> : null
  if (prompt) return <button className="text-button" type="button" onClick={() => void prompt.prompt().then(() => prompt.userChoice).then(() => setPrompt(null))}>安装应用</button>
  return <details className="install-help"><summary>添加到主屏幕</summary><p>在浏览器菜单中选择“安装应用”或“添加到主屏幕”。iPhone 可在 Safari 的分享菜单中添加。</p></details>
}

function Login({onLogin, busy, error, logoutPending, onLogoutRetry}: {onLogin(identifier: string, password: string): void; busy: boolean; error: string; logoutPending: boolean; onLogoutRetry(): void}) {
  const [identifier, setIdentifier] = useState(''), [password, setPassword] = useState('')
  return <main className="login-page">
    <div className="login-brand"><Brand/></div>
    <section className="login-panel" aria-labelledby="login-title">
      <h1 id="login-title">登录你的工作空间</h1>
      <p className="muted">使用 FutureStaff Platform 账号</p>
      <form onSubmit={event => {event.preventDefault(); onLogin(identifier, password)}}>
        <label>账号<input autoComplete="username" autoCapitalize="none" spellCheck={false} name="username" value={identifier} onChange={event => setIdentifier(event.target.value)} required maxLength={254}/></label>
        <label>密码<input autoComplete="current-password" name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={128}/></label>
        {error && <p role="alert" className="error-text">{error}</p>}
        {logoutPending && <button type="button" className="secondary" disabled={busy} onClick={onLogoutRetry}>重试退出</button>}
        <button type="submit" className="primary" disabled={busy || !identifier.trim() || !password}>{busy ? '正在登录…' : '登录'}</button>
      </form>
    </section>
    <div className="login-install"><InstallControl/></div>
  </main>
}

function Asset({attachment}: {attachment: Attachment}) {
  const href = attachmentLink(attachment.url)
  if (!href) return <span className="muted">附件暂不可用</span>
  return <a className="asset" href={href} target="_blank" rel="noopener noreferrer">
    {attachment.mime.startsWith('image/') && <img src={href} alt={attachment.name || '会话图片'} loading="lazy"/>}
    <span>{attachment.name || '查看附件'}</span>
  </a>
}

function QuestionCard({question, busy, onAnswer}: {question: Question; busy: boolean; onAnswer(answer: string): void}) {
  const [selected, setSelected] = useState(''), [custom, setCustom] = useState('')
  return <form className="question-card" onSubmit={event => {event.preventDefault(); onAnswer(custom.trim() || selected)}}>
    <p className="eyebrow">需要你的回答</p><h3>{question.prompt}</h3>
    {question.options?.length ? <fieldset disabled={busy}><legend className="sr-only">选择回答</legend>{question.options.map((option, index) => <label className="question-option" key={index}><input type="radio" name={'question-' + question.id} checked={selected === option && !custom} onChange={() => {setSelected(option); setCustom('')}}/>{option}</label>)}</fieldset> : null}
    <label className="sr-only" htmlFor={'answer-' + question.id}>补充回答</label>
    <textarea id={'answer-' + question.id} placeholder="输入你的回答" value={custom} disabled={busy} maxLength={6000} onChange={event => setCustom(event.target.value)} rows={2}/>
    <button type="submit" className="primary" disabled={busy || !(custom.trim() || selected)}>{busy ? '正在提交…' : '提交回答'}</button>
  </form>
}

function timeLabel(value: number | string | undefined) {
  if (value === undefined) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', {month: 'numeric', day: 'numeric'}).format(date)
}

function App() {
  const [member, setMember] = useState<Member | null>(null), [initializing, setInitializing] = useState(true)
  const [agents, setAgents] = useState<Agent[]>([]), [sessions, setSessions] = useState<ConversationRow[]>([])
  const [systems, setSystems] = useState<BusinessSystem[]>([]), [systemId, setSystemId] = useState('')
  const [directoryBusy, setDirectoryBusy] = useState(false), [directoryError, setDirectoryError] = useState('')
  const [activeId, setActiveId] = useState(''), [conversation, setConversation] = useState<Conversation | null>(null)
  const [conversationBusy, setConversationBusy] = useState(false), [conversationError, setConversationError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({}), [attachments, setAttachments] = useState<Record<string, Attachment[]>>({})
  const [sending, setSending] = useState(false), [uploading, setUploading] = useState(false), [answering, setAnswering] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false), [error, setError] = useState(''), [logoutPending, setLogoutPending] = useState(false)
  const [online, setOnline] = useState(navigator.onLine), [search, setSearch] = useState(''), [creating, setCreating] = useState('')
  const [unseen, setUnseen] = useState(false)
  const [listening, setListening] = useState(false), [voiceKind, setVoiceKind] = useState(voiceMode)
  const [aigcNotice,setAigcNotice]=useState('')
  const meRef = useRef<Member | null>(null), selectedRef = useRef(''), generation = useRef(0)
  const accountEpoch=useRef(0),aigc=useRef<AigcLauncher|null>(null)
  const systemRef = useRef(''), conversationRef = useRef<Conversation | null>(null), voiceScopeRef = useRef('')
  const requests = useRef(new Set<AbortController>()), attempts = useRef(new Map<string, SendAttempt>())
  const sessionVersions = useRef(new Map<string, SeenSession>()), responseOrder = useRef(0)
  const draftsRef = useRef(drafts), attachmentsRef = useRef(attachments)
  draftsRef.current = drafts; attachmentsRef.current = attachments
  const answerAttempts = useRef(new Map<string, {answer: string; requestId: string}>()), logoutCsrf = useRef('')
  const drawer = useRef<HTMLDialogElement>(null), chooser = useRef<HTMLDialogElement>(null), fileInput = useRef<HTMLInputElement>(null)
  const feed = useRef<HTMLDivElement>(null), bottom = useRef<HTMLDivElement>(null), nearBottom = useRef(true), workspace = useRef<HTMLDivElement>(null)
  conversationRef.current = conversation
  voiceScopeRef.current = conversation && !conversation.readOnly && conversation.systemId === systemId
    ? JSON.stringify([systemId, activeId, conversation.contextVersion, generation.current]) : ''
  const voice = useRef<ScopedVoiceCapture | null>(null)
  if (!voice.current) voice.current = new ScopedVoiceCapture({
    scope: () => voiceScopeRef.current,
    final: text => {
      const id = selectedRef.current, key = conversationKey(systemRef.current, id)
      if (id) setDrafts(current => ({...current, [key]: [current[key], text].filter(Boolean).join('\n').slice(0, 24000)}))
    },
    error: setConversationError,
    state: setListening,
  })

  if(!aigc.current)aigc.current=new AigcLauncher({
    identity:()=>meRef.current?{tenantId:meRef.current.tenantId,memberId:meRef.current.user.userId,epoch:accountEpoch.current}:undefined,
    native:()=>(window as Window&{__FS_NATIVE_AIGC_HOST__?:{version:number}}).__FS_NATIVE_AIGC_HOST__?.version===1,
    open:(url,native)=>{
      if(native){location.assign(url);return}
      return (window.open(url,'_blank') as AigcChild|null)??undefined
    },
    sendNative:value=>{
      const params=new URLSearchParams({launchId:value.launchId})
      const path=value.status==='cancelled'?'/__native/aigc-sso-cancel':'/__native/aigc-sso-result'
      if(value.status!=='cancelled')params.set('status',value.status)
      if(value.callbackUrl)params.set('callbackUrl',value.callbackUrl)
      if(value.message&&value.status!=='cancelled')params.set('message',value.message.slice(0,300))
      location.assign(location.origin+path+'?'+params)
    },
    authorize:(input,signal)=>request<{callbackUrl:string}>('/aigc/authorize',{method:'POST',body:input,csrf:meRef.current?.csrf??'',signal}),
    status:(_state,message)=>setAigcNotice(message),
  })
  useEffect(()=>{
    const browser=(event:MessageEvent)=>{void aigc.current?.receiveBrowser(event)}
    const native=(event:Event)=>{void aigc.current?.receiveNative((event as CustomEvent).detail)}
    const closed=(event:Event)=>{const id=(event as CustomEvent<{launchId?:unknown}>).detail?.launchId;if(typeof id==='string')aigc.current?.nativeClosed(id)}
    const cancel=()=>aigc.current?.cancel()
    window.addEventListener('message',browser);window.addEventListener('fs-native-aigc-sso-request',native);window.addEventListener('fs-native-aigc-sso-closed',closed);window.addEventListener('pagehide',cancel)
    return()=>{window.removeEventListener('message',browser);window.removeEventListener('fs-native-aigc-sso-request',native);window.removeEventListener('fs-native-aigc-sso-closed',closed);window.removeEventListener('pagehide',cancel);cancel()}
  },[])
  const enterAigc=()=>{
    const native=window as Window&{__FS_NATIVE_VOICE__?:{version:number};__FS_NATIVE_AIGC_HOST__?:{version:number}}
    if(native.__FS_NATIVE_VOICE__?.version===1&&native.__FS_NATIVE_AIGC_HOST__?.version!==1){setAigcNotice('请从右上角“版本”更新App后进入AIGC，使用免重复登录的完整工作台。');return}
    aigc.current?.start()
  }

  const clearPrivate = useCallback(() => {
    accountEpoch.current++;aigc.current?.cancel();setAigcNotice('')
    generation.current++
    voice.current?.cancel(); voiceScopeRef.current = ''; systemRef.current = ''
    requests.current.forEach(controller => controller.abort()); requests.current.clear()
    attempts.current.clear(); answerAttempts.current.clear(); sessionVersions.current.clear(); selectedRef.current = ''
    setSystems([]); setSystemId(''); setAgents([]); setSessions([]); setActiveId(''); setConversation(null); setDrafts({}); setAttachments({}); setSearch('')
    setConversationError(''); setDirectoryError(''); setConversationBusy(false); setDirectoryBusy(false)
    setSending(false); setUploading(false); setAnswering(false); setCreating(''); setUnseen(false)
    drawer.current?.close(); chooser.current?.close()
  }, [])

  const call = useCallback(async <T,>(path: string, options: {method?: string; body?: unknown; file?: File; csrf?: string; contextVersion?: string} = {}): Promise<T> => {
    const epoch = generation.current, abort = new AbortController()
    requests.current.add(abort)
    let timedOut = false
    const timer = setTimeout(() => {timedOut = true; abort.abort()}, options.file ? 60000 : 25000)
    try {
      const csrf = options.csrf ?? meRef.current?.csrf
      const currentSystem = path.startsWith('/sessions') ? systemRef.current : ''
      const value = await request<T>(path, {...options, ...(csrf ? {csrf} : {}), ...(currentSystem ? {systemId: currentSystem} : {}), signal: abort.signal})
      if (epoch !== generation.current) throw new DOMException('Account changed', 'AbortError')
      return value
    } catch (reason) {
      if (epoch !== generation.current) throw new DOMException('Account changed', 'AbortError')
      if (reason instanceof ApiError && reason.status === 401 && path !== '/login' && path !== '/me') {
        clearPrivate(); meRef.current = null; setMember(null); setError('登录已失效，请重新登录。')
      }
      if (timedOut) throw new ApiError('请求超时，请刷新查看实际状态后重试。')
      throw reason
    } finally {clearTimeout(timer); requests.current.delete(abort)}
  }, [clearPrivate])

  const acceptMember = useCallback((value: Member) => {meRef.current = value; setMember(value)}, [])
  const loadDirectory = useCallback(async () => {
    setDirectoryBusy(true); setDirectoryError('')
    const epoch = generation.current
    try {
      const directory = await call<{items: BusinessSystem[]}>('/systems')
      if (epoch !== generation.current) return
      setSystems(directory.items)
      const current = directory.items.find(item => item.systemId === systemRef.current)
      setAgents(current?.agents ?? [])
      if (current?.mode === 'chat' || systemRef.current === 'legacy') {
        const result = await call<{items: ConversationRow[]}>('/sessions?systemId=' + encodeURIComponent(systemRef.current))
        if (epoch === generation.current) setSessions(result.items.filter(row => row.systemId === systemRef.current))
      } else setSessions([])
    } catch (reason) {if (epoch === generation.current && !cancelled(reason)) setDirectoryError(failureText(reason))}
    finally {if (epoch === generation.current) setDirectoryBusy(false)}
  }, [call])

  useEffect(() => {
    void call<Member>('/me').then(acceptMember).catch(reason => {
      if (!cancelled(reason) && (!(reason instanceof ApiError) || reason.status !== 401)) setError(failureText(reason))
    }).finally(() => setInitializing(false))
    return () => {generation.current++; requests.current.forEach(controller => controller.abort())}
  }, [call, acceptMember])
  useEffect(() => {if (member && !accountBusy) void loadDirectory()}, [member?.tenantId, member?.user.userId, systemId, accountBusy, loadDirectory])
  useEffect(() => {
    const ready = () => setVoiceKind(voiceMode())
    const suspend = (event: Event) => {if (event.type === 'pagehide' || document.visibilityState === 'hidden') voice.current?.cancel()}
    window.addEventListener('fs-native-voice-ready', ready); window.addEventListener('pagehide', suspend); document.addEventListener('visibilitychange', suspend)
    return () => {voice.current?.cancel(); window.removeEventListener('fs-native-voice-ready', ready); window.removeEventListener('pagehide', suspend); document.removeEventListener('visibilitychange', suspend)}
  }, [])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => {window.removeEventListener('online', update); window.removeEventListener('offline', update)}
  }, [])
  useEffect(() => {workspace.current?.toggleAttribute('inert', accountBusy)}, [accountBusy])

  const acceptConversation = useCallback((value: Conversation, order: number) => {
    if (!isCurrentConversation(value, systemRef.current, selectedRef.current) || !acceptSessionVersion(sessionVersions.current, value, order)) return false
    const key = conversationKey(value.systemId, value.id), attempt = attempts.current.get(key)
    const acknowledgement = reconcileSend(value, attempt, draftsRef.current[key] ?? '', (attachmentsRef.current[key] ?? []).map(file => file.id))
    if (acknowledgement.confirmed) {
      attempts.current.delete(key)
      if (acknowledgement.clearComposer && attempt) {
        setDrafts(current => current[key] === attempt.draft ? {...current, [key]: ''} : current)
        setAttachments(current => {
          const files = current[key] ?? []
          return files.length === attempt.attachmentIds.length && files.every((file, index) => file.id === attempt.attachmentIds[index])
            ? {...current, [key]: []} : current
        })
      }
    }
    setConversation({...value, messages: Array.isArray(value.messages) ? value.messages : []})
    setSessions(rows => {
      const others = rows.filter(row => row.id !== value.id)
      return [value, ...others]
    })
    return true
  }, [])
  const readConversation = useCallback(async (id: string, quiet = false) => {
    const key = conversationKey(systemRef.current, id), epoch = generation.current
    if (!quiet) {setConversationBusy(true); if (!attempts.current.has(key)) setConversationError('')}
    const order = ++responseOrder.current
    try {
      const value = await call<{session: Conversation}>('/sessions/' + encodeURIComponent(id))
      if (value.session.id !== id) throw new ApiError('会话返回不匹配，请重新打开。')
      if (acceptConversation(value.session, order) && !attempts.current.has(key)) setConversationError('')
    } catch (reason) {
      if (!cancelled(reason) && selectedRef.current === id) setConversationError(failureText(reason))
    } finally {if (epoch === generation.current && selectedRef.current === id) setConversationBusy(false)}
  }, [call, acceptConversation])

  useEffect(() => subscribeSessionResume(window, document, () => navigator.onLine, () => {
    const id = selectedRef.current
    if (id) void readConversation(id, true)
  }), [readConversation])

  useEffect(() => {
    if (!activeId || !online || !['running', 'waiting'].includes(conversation?.status ?? '')) return
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      await readConversation(activeId, true)
      if (!stopped) timer = setTimeout(() => void tick(), 1500)
    }
    timer = setTimeout(() => void tick(), 1500)
    return () => {stopped = true; clearTimeout(timer)}
  }, [activeId, conversation?.status, online, readConversation])
  useEffect(() => {
    if (nearBottom.current) {bottom.current?.scrollIntoView({block: 'end'}); setUnseen(false)}
    else setUnseen(true)
  }, [conversation?.messages.length, conversation?.messages.at(-1)?.text, conversation?.question?.id])

  const openConversation = (id: string) => {
    generation.current++; voice.current?.cancel(); voiceScopeRef.current = ''
    requests.current.forEach(controller => controller.abort()); requests.current.clear()
    setSending(false); setUploading(false); setAnswering(false); setCreating(''); setDirectoryBusy(false)
    selectedRef.current = id; setActiveId(id); setConversation(null); setConversationError(''); nearBottom.current = true
    drawer.current?.close(); void readConversation(id)
  }
  const switchSystem = (next: string) => {
    if (next === systemRef.current || accountBusy) return
    generation.current++; voice.current?.cancel(); voiceScopeRef.current = ''
    requests.current.forEach(controller => controller.abort()); requests.current.clear()
    systemRef.current = next; selectedRef.current = ''; conversationRef.current = null
    setSystemId(next); setAgents([]); setSessions([]); setActiveId(''); setConversation(null); setSearch('')
    setConversationError(''); setDirectoryError(''); setConversationBusy(false); setDirectoryBusy(false)
    setSending(false); setUploading(false); setAnswering(false); setCreating(''); setUnseen(false)
    chooser.current?.close(); drawer.current?.close()
  }
  const login = async (identifier: string, password: string) => {
    setAccountBusy(true); setError('')
    clearPrivate()
    try {const value = await call<Member>('/login', {method: 'POST', body: {loginIdentifier: identifier.trim(), password}}); acceptMember(value); setLogoutPending(false)}
    catch (reason) {if (!cancelled(reason)) setError(failureText(reason))}
    finally {setAccountBusy(false)}
  }
  const logout = async () => {
    logoutCsrf.current = meRef.current?.csrf ?? logoutCsrf.current
    clearPrivate(); meRef.current = null; setMember(null); setAccountBusy(true); setError('')
    try {await call('/logout', {method: 'POST', csrf: logoutCsrf.current}); logoutCsrf.current = ''; setLogoutPending(false)}
    catch (reason) {if (!cancelled(reason)) {setError('退出尚未确认，请连接网络后重试。'); setLogoutPending(true)}}
    finally {setAccountBusy(false)}
  }
  const switchTenant = async (tenantId: string) => {
    if (tenantId === meRef.current?.tenantId || accountBusy) return
    clearPrivate(); setAccountBusy(true); setError('')
    try {acceptMember(await call<Member>('/tenant', {method: 'POST', body: {tenantId}}))}
    catch (reason) {
      if (!cancelled(reason)) {
        setError(failureText(reason))
        try {acceptMember(await call<Member>('/me'))} catch {meRef.current = null; setMember(null)}
      }
    } finally {setAccountBusy(false)}
  }
  const createConversation = async (agent: Agent) => {
    if (creating || !systemRef.current || systemRef.current === 'legacy') return
    voice.current?.cancel(); voiceScopeRef.current = ''
    const currentSystem = systemRef.current, epoch = generation.current
    setCreating(agent.agentId); setError('')
    const order = ++responseOrder.current
    try {
      const value = await call<{session: Conversation}>('/sessions', {method: 'POST', body: {agentId: agent.agentId, systemId: currentSystem, scope: {kind: 'system'}}})
      if (value.session.systemId !== currentSystem) throw new ApiError('会话系统返回不匹配，请重新打开。')
      selectedRef.current = value.session.id; setActiveId(value.session.id); nearBottom.current = true
      acceptConversation(value.session, order); chooser.current?.close(); drawer.current?.close()
    } catch (reason) {if (!cancelled(reason)) setError(failureText(reason))}
    finally {if (epoch === generation.current) setCreating('')}
  }
  const sendMessage = async (event: FormEvent) => {
    event.preventDefault()
    const id = activeId, key = conversationKey(systemRef.current, id), draft = drafts[key] ?? '', text = draft.trim(), files = attachments[key] ?? []
    if (!id || sending || uploading || conversation?.readOnly || (!text && !files.length) || !online) return
    voice.current?.cancel()
    const epoch = generation.current, contextVersion = conversation?.contextVersion
    const attachmentIds = files.map(file => file.id), previous = attempts.current.get(key)
    const attempt = previous && previous.text === text && JSON.stringify(previous.attachmentIds) === JSON.stringify(attachmentIds)
      ? {...previous, draft} : {requestId: newRequestId(), text, attachmentIds, draft}
    attempts.current.set(key, attempt); setSending(true); setConversationError('')
    const order = ++responseOrder.current
    try {
      const {requestId, text, attachmentIds} = attempt
      const value = await call<{session: Conversation}>('/sessions/' + encodeURIComponent(id) + '/messages', {method: 'POST', body: {requestId, text, attachmentIds, contextVersion}})
      acceptConversation(value.session, order)
    } catch (reason) {
      if (!cancelled(reason) && selectedRef.current === id) {
        setConversationError(failureText(reason) + ' 原内容已保留，重试会沿用同一请求编号。')
        if (navigator.onLine && (!(reason instanceof ApiError) || reason.status === 0 || reason.status >= 500)) void readConversation(id, true)
      }
    } finally {if (epoch === generation.current) setSending(false)}
  }
  const upload = async (files: FileList | null) => {
    if (!files || !activeId || uploading || sending || conversation?.readOnly) return
    const id = activeId, key = conversationKey(systemRef.current, id), epoch = generation.current, existing = attachments[key] ?? [], chosen = Array.from(files)
    if (chosen.length + existing.length > 2) {setConversationError('每条消息最多添加 2 张图片。'); return}
    if (chosen.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) {setConversationError('请选择不超过 8 MiB 的 JPG、PNG 或 WebP 图片。'); return}
    setUploading(true); setConversationError('')
    try {
      for (const file of chosen) {
        const value = await call<{attachment: Attachment}>('/sessions/' + encodeURIComponent(id) + '/attachments', {method: 'POST', file, contextVersion: conversation!.contextVersion})
        setAttachments(current => ({...current, [key]: [...(current[key] ?? []), value.attachment]}))
      }
    } catch (reason) {if (!cancelled(reason) && selectedRef.current === id) setConversationError(failureText(reason))}
    finally {if (epoch === generation.current) {setUploading(false); if (fileInput.current) fileInput.current.value = ''}}
  }
  const answer = async (value: string) => {
    const question = conversation?.question, id = activeId
    if (!question || answering || !online || conversation?.readOnly) return
    const epoch = generation.current, key = conversationKey(systemRef.current, id) + ':' + question.id, prior = answerAttempts.current.get(key)
    const attempt = prior?.answer === value ? prior : {answer: value, requestId: newRequestId()}
    answerAttempts.current.set(key, attempt); setAnswering(true); setConversationError('')
    const order = ++responseOrder.current
    try {
      const result = await call<{session: Conversation}>('/sessions/' + encodeURIComponent(id) + '/answer', {method: 'POST', body: {...attempt, questionId: question.id, contextVersion: conversation.contextVersion}})
      answerAttempts.current.delete(key); acceptConversation(result.session, order)
    } catch (reason) {if (!cancelled(reason) && selectedRef.current === id) setConversationError(failureText(reason))}
    finally {if (epoch === generation.current) setAnswering(false)}
  }
  const stop = async () => {
    const id = activeId
    if (conversation?.readOnly) return
    const order = ++responseOrder.current
    setConversationError('')
    try {const value = await call<{session?: Conversation}>('/sessions/' + encodeURIComponent(id) + '/stop', {method: 'POST', body: {contextVersion: conversation?.contextVersion}}); if (value.session) acceptConversation(value.session, order); else await readConversation(id)}
    catch (reason) {if (!cancelled(reason) && selectedRef.current === id) setConversationError(failureText(reason))}
  }
  const recordVoice = () => {
    if (listening) {voice.current?.stop(); return}
    try {
      const transport = createVoiceTransport()
      if (!transport) {setConversationError('当前环境不支持语音识别，请使用文字输入。'); return}
      setConversationError(''); voice.current?.start(transport)
    } catch {setConversationError('语音识别未能开始，请重试或使用文字输入。')}
  }

  const offline = !online && <div className="connection-banner" role="status">当前离线。草稿保留在此页面，重新连接后可以继续。</div>
  if (initializing) return <div className="boot-state"><Brand/><p role="status">正在连接工作空间…</p></div>
  if (!member) return <>{offline}<Login onLogin={(identifier, password) => void login(identifier, password)} busy={accountBusy} error={error} logoutPending={logoutPending} onLogoutRetry={() => void logout()}/></>
  const tenantName = member.tenants.find(item => item.tenantId === member.tenantId)?.displayName ?? '当前主体'
  const composerKey = conversationKey(systemId, activeId), currentDraft = drafts[composerKey] ?? '', currentAttachments = attachments[composerKey] ?? []
  const currentSystem = systems.find(item => item.systemId === systemId), legacy = systemId === 'legacy'
  const externalEntry = currentSystem && systemEntryLink(currentSystem)
  const canCreate = !!currentSystem && currentSystem.mode === 'chat' && currentSystem.available && !legacy
  const readOnly = conversation?.readOnly === true || legacy
  const running = ['running', 'waiting'].includes(conversation?.status ?? '')
  const rows = sessions.filter(row => (row.title + ' ' + row.agentName + ' ' + row.id).toLowerCase().includes(search.toLowerCase()))
  const navigation = <>
    <div className="sidebar-brand"><Brand/></div>
    <label className="system-selector">当前业务系统<select aria-label="当前业务系统" value={systemId} disabled={accountBusy} onChange={event => switchSystem(event.target.value)}><option value="">选择业务系统</option>{systems.map(system => <option key={system.systemId} value={system.systemId}>{system.displayName}{system.available ? '' : ' · 暂不可用'}</option>)}{!systems.some(item => item.systemId === 'legacy') && <option value="legacy">历史通用会话 · 只读</option>}</select></label>
    <button type="button" className="primary new-session" disabled={accountBusy || !canCreate} onClick={() => {drawer.current?.close(); chooser.current?.showModal()}}>＋ 新会话</button>
    <input aria-label="搜索会话" className="session-search" type="search" placeholder="搜索会话或 ID" value={search} onChange={event => setSearch(event.target.value)}/>
    <div className="session-list" aria-label="最近会话">
      {directoryBusy && !sessions.length && <p className="empty-note" role="status">正在加载会话…</p>}
      {rows.map(row => <button type="button" className="session-row" aria-current={activeId === row.id ? 'page' : undefined} key={row.id} onClick={() => openConversation(row.id)}><span>{row.title || '新会话'}</span><small>{row.agentName}<span>{timeLabel(row.updatedAt)}</span></small></button>)}
      {!directoryBusy && !rows.length && <p className="empty-note">{search ? '没有匹配的会话' : legacy ? '暂无可读取的历史资料会话。业务历史仍保留，需由所属系统复核权限。' : currentSystem?.mode === 'external' ? '会话保留在该系统的独立工作台。' : !systemId ? '选择系统后查看会话。' : currentSystem?.available === false ? currentSystem.unavailableReason || '当前系统暂不可用。' : '还没有会话，从新会话开始。'}</p>}
      {directoryError && <div className="directory-error"><p role="alert">{directoryError}</p><button type="button" className="secondary" onClick={() => void loadDirectory()}>重新加载</button></div>}
    </div>
    <div className="account-area"><label>当前主体<select aria-label="当前主体" value={member.tenantId} disabled={accountBusy || !online} onChange={event => void switchTenant(event.target.value)}>{member.tenants.map(tenant => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.displayName}</option>)}</select></label><div className="account-row"><span title={member.user.displayName}>{member.user.displayName}</span><button type="button" className="text-button" disabled={accountBusy} onClick={() => void logout()}>退出</button></div><InstallControl/></div>
  </>
  return <div className="application">
    <aside className="desktop-sidebar">{navigation}</aside>
    <dialog className="drawer" ref={drawer} aria-label="会话与账号"><div className="drawer-close"><button type="button" aria-label="关闭会话菜单" onClick={() => drawer.current?.close()}>×</button></div>{navigation}</dialog>
    <div className="workspace" ref={workspace} aria-busy={accountBusy}>
      <WorkspaceHeader systemName={currentSystem?.displayName ?? (legacy ? '历史会话' : '')} tenantName={tenantName} conversationTitle={conversation?.title} contextKey={JSON.stringify([member.tenantId, systemId, activeId])} canCreate={canCreate} refreshing={conversationBusy} directoryBusy={directoryBusy} hasConversation={!!conversation} onOpenNavigation={() => drawer.current?.showModal()} onCreate={() => chooser.current?.showModal()} onRefresh={() => void readConversation(activeId)} onRefreshDirectory={() => void loadDirectory()}/>
      {offline}
      {error && <div className="error-banner" role="alert">{error}<button type="button" className="text-button" onClick={() => setError('')}>关闭</button></div>}
      <div className="conversation-feed" ref={feed} onScroll={() => {const element = feed.current; nearBottom.current = !!element && element.scrollHeight - element.scrollTop - element.clientHeight < 140; if (nearBottom.current) setUnseen(false)}}>
        {!activeId ? <div className="start-state"><span className="start-mark" aria-hidden="true">F</span><h2>{currentSystem?.mode === 'external' ? currentSystem.displayName + '工作台' : legacy ? '历史通用会话' : systemId ? '开始本系统的工作对话' : '选择业务系统'}</h2><p>{currentSystem?.mode === 'external' ? '进入完整工作台，沿用当前账号；FS助手在工作台右侧。' : legacy ? '原有记录已保留，可以查看和导出。新工作请进入对应系统。' : systemId ? '本次对话只使用当前系统的资料和工具。' : '各系统的对话、资料和任务分别保留。'}</p>{currentSystem?.mode === 'external' ? externalEntry && currentSystem.available ? <><button type="button" className="primary system-entry" onClick={enterAigc}>进入{currentSystem.displayName}</button>{aigcNotice&&<p role="status">{aigcNotice}</p>}</> : <p className="error-text">{currentSystem.unavailableReason || '工作台入口暂不可用。'}</p> : canCreate ? <button type="button" className="primary" onClick={() => chooser.current?.showModal()}>开始新会话</button> : !systemId ? <div className="system-options">{systems.map(system => <button type="button" className="secondary" key={system.systemId} onClick={() => switchSystem(system.systemId)}>{system.displayName}</button>)}{directoryBusy && <p role="status">正在加载系统…</p>}{directoryError && <p role="alert" className="error-text">{directoryError}</p>}<button type="button" className="text-button" disabled={directoryBusy} onClick={() => void loadDirectory()}>刷新系统目录</button></div> : null}</div> : conversationBusy && !conversation ? <p className="empty-note" role="status">正在读取会话…</p> : conversation ? <div className="transcript" role="log" aria-label="聊天记录" aria-live="off">
          {!conversation.messages.length && <div className="conversation-start"><h2>FS助手</h2><p className="muted">告诉我这次需要完成什么。</p></div>}
          {conversation.messages.map(message => message.role === 'tool' ? <details className="tool-message" key={message.id}><summary>工具执行记录</summary><Markdown text={message.text || '等待工具结果'}/></details> : <article className={'message message-' + message.role} key={message.id}><span className="message-speaker">{message.role === 'user' ? '你' : message.role === 'assistant' ? 'FS助手' : '会话状态'}</span><Markdown text={message.text || (message.role === 'assistant' && running ? '正在组织回复…' : '')}/>{(message.attachments ?? []).length > 0 && <div className="asset-list">{message.attachments?.map(item => <Asset attachment={item} key={item.id}/>)}</div>}</article>)}
          {conversation.question && !readOnly && <QuestionCard key={conversation.question.id} question={conversation.question} busy={answering || !online} onAnswer={value => void answer(value)}/>}
          {conversation.attachments?.length ? <details className="session-assets"><summary>本次会话的附件 · {conversation.attachments.length}</summary><div className="asset-list">{conversation.attachments.map(item => <Asset attachment={item} key={item.id}/>)}</div></details> : null}
          {['interrupted', 'error'].includes(conversation.status) && <p className="task-note" role="status">{conversation.status === 'interrupted' ? '上次任务已中断，历史内容已保留。可以发送新消息继续。' : '这次处理未完成。请查看执行记录，发送新消息继续。'}</p>}
          <div ref={bottom}/>
        </div> : null}
      </div>
      {unseen && <button type="button" className="new-content" onClick={() => {nearBottom.current = true; bottom.current?.scrollIntoView({behavior: 'smooth', block: 'end'}); setUnseen(false)}}>查看最新回复 ↓</button>}
      {activeId && <div className="composer-zone">
        {conversationError && <div className="composer-error"><p role="alert">{conversationError}</p><button type="button" className="text-button" onClick={() => void readConversation(activeId)}>刷新状态</button></div>}
        {conversation && <div className="run-status"><span className={running && !readOnly ? 'is-running' : ''} role="status">{readOnly ? '历史会话 · 只读' : states[conversation.status] ?? '状态待更新'}</span>{running && !readOnly && <button type="button" className="text-button" onClick={() => void stop()}>停止</button>}<a className="text-button" href={'/api/v1/sessions/' + encodeURIComponent(conversation.id) + '/export?systemId=' + encodeURIComponent(systemId)} download>导出会话</a></div>}
        {!readOnly && <form className="composer" onSubmit={event => void sendMessage(event)}>
          {currentAttachments.length > 0 && <div className="staged-assets">{currentAttachments.map(item => <div key={item.id}><Asset attachment={item}/><button type="button" disabled={sending} aria-label={'移除附件 ' + item.name} onClick={() => setAttachments(current => ({...current, [composerKey]: (current[composerKey] ?? []).filter(file => file.id !== item.id)}))}>×</button></div>)}</div>}
          <label className="sr-only" htmlFor="message-draft">消息</label><textarea id="message-draft" rows={3} maxLength={24000} placeholder={conversation?.question ? '先回答上方问题…' : '输入或语音描述当前系统的工作…'} value={currentDraft} disabled={sending || !conversation} onChange={event => setDrafts(current => ({...current, [composerKey]: event.target.value}))}/>
          <div className="composer-tools"><div className="input-actions"><input className="sr-only" type="file" ref={fileInput} accept="image/jpeg,image/png,image/webp" multiple onChange={event => void upload(event.target.files)} tabIndex={-1}/><button type="button" className="text-button" disabled={!online || sending || uploading || !conversation || currentAttachments.length >= 2} onClick={() => fileInput.current?.click()}>{uploading ? '正在上传…' : '＋ 图片'}</button><button type="button" className={'text-button voice-button' + (listening ? ' recording' : '')} aria-pressed={listening} disabled={sending || uploading || !conversation || !voiceKind} title={!voiceKind ? '当前环境不支持语音，请使用文字输入' : voiceKind === 'native' ? '在设备上识别，转写后由你确认发送' : '由浏览器提供语音识别，可能使用在线服务'} onClick={recordVoice}>{listening ? '结束录音' : '语音输入'}</button></div><button className="primary" type="submit" disabled={!online || running || listening || sending || uploading || !conversation || (!currentDraft.trim() && !currentAttachments.length)}>{sending ? '正在发送…' : '发送'}</button></div>
          {listening && <p className="voice-note" role="status">正在听取…结束后可修改转写，再点击发送。</p>}
        </form>}
      </div>}
    </div>
    {accountBusy && <div className="account-changing" role="status">正在更新账号状态…</div>}
    <dialog className="agent-chooser" ref={chooser} aria-labelledby="agent-chooser-title"><header><h2 id="agent-chooser-title">选择智能体</h2><button type="button" className="icon-button" aria-label="关闭智能体选择" onClick={() => chooser.current?.close()}>×</button></header><div className="agent-options">{directoryBusy && <p role="status">正在加载智能体…</p>}{agents.map(agent => <button key={agent.agentId} type="button" disabled={!!creating || !online || agent.available === false} onClick={() => void createConversation(agent)}><strong>{agent.displayName}</strong>{agent.description && <span>{agent.description}</span>}{agent.available === false && <small>{agent.unavailableReason || '暂不可用'}</small>}{creating === agent.agentId && <small role="status">正在创建会话…</small>}</button>)}{!directoryBusy && !agents.length && <p className="empty-note">当前主体暂无获授权的智能体。可刷新目录，或联系管理员配置。</p>}{directoryError && <p className="error-text" role="alert">{directoryError}</p>}<button type="button" className="text-button" disabled={directoryBusy} onClick={() => void loadDirectory()}>刷新智能体目录</button></div></dialog>
  </div>
}

createRoot(document.getElementById('root')!).render(<App/>)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  void navigator.serviceWorker.register('/sw.js', {updateViaCache: 'none'}).catch(() => {})
}
