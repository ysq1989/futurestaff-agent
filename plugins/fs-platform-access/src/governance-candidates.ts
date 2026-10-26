/** Local preview records only. Their hashes are not Platform wire hashes or human confirmations. */
export type CandidateDomain = 'enterprise_knowledge' | 'platform_product_feedback'
export interface CandidateOwner { tenantId: string; actorId: string }
export interface CandidateDraft {
  requestId: string
  owner: CandidateOwner
  domain: CandidateDomain
  title: string
  content: string
  /** rule_summary is local-only; Platform wire mapping is deliberately not connected. */
  basis: 'explicit_user' | 'rule_summary' | 'model_inference'
  knowledgeKind: 'new_fact' | 'correction' | 'expression' | 'resource_change'
  goal: string
  expected: string
  actual: string
  entrypoint: string
  versions: { application: string; client: string; agent: string; tool: string }
  aspectRatio: string
  pixelSize: null
  scope: { policyId: string; policyVersion: string; audiences: string[]; purpose: string; validUntil: number }
  evidence: { sourceId: string; sourceVersion: string; sourceHash: string; excerpt: string; redacted: boolean; kind: 'user_statement' }[]
  assetRefs: []
  verification: 'reported' | 'unverified'
}

/** Minimize excerpts before they enter drafts; never retain the original text in these records. */
export function sanitizeCandidateText(value: string): {text: string; redacted: boolean} {
  const text = value
    .replace(/\b([a-z][a-z\d+.-]*:\/\/)[^\s/@]+@/giu, '$1[凭据已移除]@')
    .replace(/\b((?:Set-Cookie|Cookie|Authorization)["']?\s*:\s*)[^\r\n]*/giu, '$1[凭据已移除]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/gu, '[凭据已移除]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/gu, '[凭据已移除]')
    .replace(/\bBearer\s+\S+/giu, 'Bearer [凭据已移除]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gu, 'Basic [凭据已移除]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|密码|密钥|令牌)["']?\s*[:=：]\s*["']?)[^\s,;，；"']+/giu, '$1[凭据已移除]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[邮箱已移除]')
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/gu, '[电话已移除]')
  return {text, redacted: text !== value}
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}'
  return JSON.stringify(value)
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Hash every local preview field; intentionally does not implement Platform contracts.py serialization. */
export async function candidateHash(draft: CandidateDraft): Promise<string> {
  const clean = decodeCandidateDraft(draft)
  for (const evidence of clean.evidence) if (await digest(evidence.excerpt) !== evidence.sourceHash) throw Error('EVIDENCE_HASH_CONFLICT')
  return digest(canonical(clean))
}

/** Extract from one explicitly authorized current-conversation excerpt without a model or history access. */
export async function identifyCandidates(input: {
  owner: CandidateOwner; activeConversationId: string; conversationId: string; sourceId: string
  sourceVersion: string; text: string; authorized: boolean; now?: number
}): Promise<CandidateDraft[]> {
  if (!input.authorized || !input.conversationId || input.conversationId !== input.activeConversationId) throw Error('CURRENT_CONVERSATION_AUTHORIZATION_REQUIRED')
  if (!input.owner.tenantId || !input.owner.actorId || !input.sourceId || !input.sourceVersion || input.text.length > 4000) throw Error('INVALID_CANDIDATE_SOURCE')
  const sanitized = sanitizeCandidateText(input.text.trim())
  if (!sanitized.text) return []
  const now = input.now ?? Date.now()
  const clauses = sanitized.text.split(/(?<=[。；;！？!?])|\r?\n|[,，](?=(?:目标|期望|希望|实际|入口|版本|新事实|更正|纠正|适用域)[：:])/u).map(clause => clause.trim()).filter(Boolean)
  const knowledge = /(?:新事实|规定|更正|纠正|适用|我们公司|公司(?:成立|位于|名称|属于|负责)|资源|改为|表述)/u
  const feedback = /(?:希望|期望|无法|没有|建议|反馈|选项|实际|目标|入口|版本)/u
  const selected: [CandidateDomain, string][] = [
    ['enterprise_knowledge', clauses.filter(clause => knowledge.test(clause) && !/^(?:目标|期望|希望|实际|入口|版本|建议|反馈)[：:]/u.test(clause)).join('')],
    ['platform_product_feedback', clauses.filter(clause => feedback.test(clause) && !knowledge.test(clause)).join('')],
  ]
  return Promise.all(selected.filter(([, text]) => !!text).map(async ([domain, selectedText]) => {
    const text = selectedText.slice(0, 600), sourceHash = await digest(text)
    return {
    requestId: crypto.randomUUID(), owner: {...input.owner}, domain,
    title: domain === 'enterprise_knowledge' ? '待核对的企业知识' : '待核对的产品反馈',
    content: text, basis: 'explicit_user',
    knowledgeKind: /(?:更正|纠正|改为)/u.test(text) ? 'correction' : /资源/u.test(text) ? 'resource_change' : /表述/u.test(text) ? 'expression' : 'new_fact',
    goal: section(text, '目标'), expected: section(text, '期望|希望'), actual: section(text, '实际'),
    entrypoint: section(text, '入口'), versions: {application: '', client: '', agent: '', tool: ''},
    aspectRatio: text.match(/\b\d{1,2}:\d{1,2}\b/u)?.[0] ?? '', pixelSize: null,
    scope: {policyId: 'not_connected', policyVersion: 'unverified', audiences: [domain === 'enterprise_knowledge' ? '企业知识候选接收方（待平台核验）' : '产品反馈私域接收方（待平台核验）'], purpose: domain === 'enterprise_knowledge' ? '提交知识候选，等待独立来源授权和管理员审核' : '私域产品反馈分类，不自动排期', validUntil: now + 300_000},
    evidence: [{sourceId: input.sourceId, sourceVersion: input.sourceVersion, sourceHash, excerpt: text, redacted: sanitized.redacted, kind: 'user_statement'}],
    assetRefs: [], verification: 'reported',
  } satisfies CandidateDraft
  }))
}

function section(text: string, labels: string): string { return text.match(new RegExp(`(?:${labels})[：:]([^。；\\n]+)`, 'u'))?.[1]?.trim() ?? '' }

/** Parse durable local previews, rejecting extra fields, credentials, attachments, or malformed evidence. */
export function decodeCandidateDraft(value: unknown): CandidateDraft {
  const object = (item: unknown): Record<string, unknown> => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('INVALID_CANDIDATE')
    return item as Record<string, unknown>
  }
  const exact = (item: Record<string, unknown>, keys: string): void => {
    if (Object.keys(item).sort().join(',') !== keys.split(',').sort().join(',')) throw Error('INVALID_CANDIDATE_FIELDS')
  }
  const string = (item: unknown, max = 4000): string => {
    if (typeof item !== 'string' || item.length > max || sanitizeCandidateText(item).text !== item) throw Error('INVALID_OR_SENSITIVE_CANDIDATE')
    return item
  }
  const uuid = (item: unknown): item is string => typeof item === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(item)
  // Complete technical UUIDs can contain phone-shaped decimal runs. Only these
  // identifier fields bypass prose redaction; legacy labels still use string().
  const identifier = (item: unknown): string => uuid(item) ? item : string(item, 200)
  const sourceSequence = (item: string): boolean => Number.isSafeInteger(Number(item)) && String(Number(item)) === item
  const sourceId = (item: unknown): string => {
    const task = typeof item === 'string' ? /^s:([^|\r\n]{1,40})\|t:([^|\r\n]{1,40})\|e:(0|[1-9]\d{0,15})\|h:([0-9a-f]{64})$/u.exec(item) : null
    if (task && typeof item === 'string') {
      if (task[1]!.length > 40 || task[2]!.length > 40 || !sourceSequence(task[3]!) || new TextEncoder().encode(item).byteLength > 200) throw Error('INVALID_CANDIDATE_EVIDENCE')
      // Only the typed digest/sequence are exempt; session/task labels retain
      // the same sensitive-text checks (or the complete UUID check) as before.
      identifier(task[1]); identifier(task[2])
      return item
    }
    if (typeof item === 'string' && item.startsWith('s:')) throw Error('INVALID_CANDIDATE_EVIDENCE')
    return identifier(item)
  }
  const sourceVersion = (item: unknown): string => {
    const task = typeof item === 'string' ? /^local-seq:(0|[1-9]\d{0,15});auth:([0-9a-f]{64})$/u.exec(item) : null
    if (task && typeof item === 'string') {
      if (!sourceSequence(task[1]!) || new TextEncoder().encode(item).byteLength > 200) throw Error('INVALID_CANDIDATE_EVIDENCE')
      return item
    }
    if (typeof item === 'string' && item.startsWith('local-seq:')) throw Error('INVALID_CANDIDATE_EVIDENCE')
    return identifier(item)
  }
  const d = object(value)
  exact(d, 'requestId,owner,domain,title,content,basis,knowledgeKind,goal,expected,actual,entrypoint,versions,aspectRatio,pixelSize,scope,evidence,assetRefs,verification')
  const owner = object(d.owner), versions = object(d.versions), scope = object(d.scope)
  exact(owner, 'tenantId,actorId'); exact(versions, 'application,client,agent,tool'); exact(scope, 'policyId,policyVersion,audiences,purpose,validUntil')
  if (!uuid(d.requestId) || !identifier(owner.tenantId) || !identifier(owner.actorId)) throw Error('INVALID_CANDIDATE_OWNER')
  if (!['enterprise_knowledge', 'platform_product_feedback'].includes(string(d.domain)) || !['explicit_user', 'rule_summary', 'model_inference'].includes(string(d.basis)) || !['new_fact', 'correction', 'expression', 'resource_change'].includes(string(d.knowledgeKind)) || !['reported', 'unverified'].includes(string(d.verification))) throw Error('INVALID_CANDIDATE_ENUM')
  for (const key of ['title', 'content', 'goal', 'expected', 'actual', 'entrypoint', 'aspectRatio']) string(d[key])
  for (const item of Object.values(versions)) string(item, 200)
  identifier(scope.policyId); identifier(scope.policyVersion); string(scope.purpose)
  if (!Array.isArray(scope.audiences) || scope.audiences.length > 10 || !scope.audiences.length || !Number.isSafeInteger(scope.validUntil) || Number(scope.validUntil) <= 0) throw Error('INVALID_CANDIDATE_SCOPE')
  scope.audiences.forEach(item => string(item, 200))
  if (!Array.isArray(d.evidence) || !d.evidence.length || d.evidence.length > 4 || !Array.isArray(d.assetRefs) || d.assetRefs.length || d.pixelSize !== null) throw Error('INVALID_CANDIDATE_EVIDENCE')
  for (const item of d.evidence) {
    const e = object(item); exact(e, 'sourceId,sourceVersion,sourceHash,excerpt,redacted,kind')
    if (!sourceId(e.sourceId) || !sourceVersion(e.sourceVersion) || typeof e.sourceHash !== 'string' || !/^[0-9a-f]{64}$/u.test(e.sourceHash) || typeof e.redacted !== 'boolean' || e.kind !== 'user_statement') throw Error('INVALID_CANDIDATE_EVIDENCE')
    string(e.excerpt, 600)
  }
  return structuredClone(value) as CandidateDraft
}
