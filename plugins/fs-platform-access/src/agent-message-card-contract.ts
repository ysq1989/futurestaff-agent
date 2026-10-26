/** Data-only public card contract. No markup, network targets or executable handlers. */
export interface AgentCardOption { value: string; label: string }
export interface AgentCardField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select'
  required?: boolean
  options?: AgentCardOption[]
}
export interface AgentCardAction {
  id: string
  label: string
  variant?: 'primary' | 'secondary' | 'quiet'
  /** false is a choice/cancel action that sends no field values. */
  submit?: boolean
}
export interface AgentCardContent {
  title: string
  description?: string
  facts?: {label: string; value: string}[]
  fields?: AgentCardField[]
  actions?: AgentCardAction[]
}
export interface AgentCardResponse {
  eventId: string
  actionId: string
  actionLabel: string
  values: Record<string, string>
}
export interface AgentMessageCardView {
  schemaVersion: 1
  module: 'agent-card'
  kind: 'message'
  viewId: string
  sessionId: string
  title: string
  expiresAt: number
  data: AgentCardContent
  response?: AgentCardResponse
  conversationUpdated?: boolean
}

const text = (max: number) => ({type: 'string', minLength: 1, maxLength: max})
export const agentMessageCardParameters = {
  type: 'object', additionalProperties: false, required: ['title'],
  properties: {
    title: text(120), description: text(2000),
    facts: {type: 'array', maxItems: 12, items: {type: 'object', additionalProperties: false, required: ['label', 'value'], properties: {label: text(80), value: text(1000)}}},
    fields: {type: 'array', maxItems: 8, items: {type: 'object', additionalProperties: false, required: ['id', 'label', 'type'], properties: {
      id: {...text(40), pattern: '^[A-Za-z][A-Za-z0-9_-]{0,39}$'}, label: text(100), type: {type: 'string', enum: ['text', 'textarea', 'select']}, required: {type: 'boolean'},
      options: {type: 'array', minItems: 1, maxItems: 20, items: {type: 'object', additionalProperties: false, required: ['value', 'label'], properties: {value: text(100), label: text(100)}}},
    }}},
    actions: {type: 'array', maxItems: 4, items: {type: 'object', additionalProperties: false, required: ['id', 'label'], properties: {
      id: {...text(40), pattern: '^[A-Za-z][A-Za-z0-9_-]{0,39}$'}, label: text(80), variant: {type: 'string', enum: ['primary', 'secondary', 'quiet']}, submit: {type: 'boolean'},
    }}},
  },
} as const

type Row = Record<string, unknown>
const row = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
function invalid(): never { throw Error('AGENT_CARD_INPUT_INVALID') }
function keys(value: unknown, allowed: string[]): asserts value is Row {
  if (!row(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid()
}
function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid()
  return value.trim()
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(value)) invalid()
  return value
}
function items<T>(value: unknown, max: number, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) invalid()
  return value.map(parse)
}
function unique(values: string[]): void { if (new Set(values).size !== values.length) invalid() }

/** Validate again in Host; JSON schema is guidance, never an authorization boundary. */
export function parseAgentCardContent(value: unknown): AgentCardContent {
  keys(value, ['title', 'description', 'facts', 'fields', 'actions'])
  const result: AgentCardContent = {title: string(value.title, 120)}
  if (value.description !== undefined) result.description = string(value.description, 2000)
  if (value.facts !== undefined) result.facts = items(value.facts, 12, fact => {
    keys(fact, ['label', 'value']); return {label: string(fact.label, 80), value: string(fact.value, 1000)}
  })
  if (value.fields !== undefined) result.fields = items(value.fields, 8, field => {
    keys(field, ['id', 'label', 'type', 'required', 'options'])
    if (!['text', 'textarea', 'select'].includes(String(field.type)) || field.required !== undefined && typeof field.required !== 'boolean') invalid()
    const result: AgentCardField = {id: id(field.id), label: string(field.label, 100), type: field.type as AgentCardField['type']}
    if (field.required !== undefined) result.required = field.required as boolean
    if (field.type === 'select') {
      result.options = items(field.options, 20, option => { keys(option, ['value', 'label']); return {value: string(option.value, 100), label: string(option.label, 100)} })
      if (!result.options.length) invalid()
      unique(result.options.map(option => option.value))
    } else if (field.options !== undefined) invalid()
    return result
  })
  if (value.actions !== undefined) result.actions = items(value.actions, 4, action => {
    keys(action, ['id', 'label', 'variant', 'submit'])
    if (action.variant !== undefined && !['primary', 'secondary', 'quiet'].includes(String(action.variant)) || action.submit !== undefined && typeof action.submit !== 'boolean') invalid()
    return {id: id(action.id), label: string(action.label, 80), ...(action.variant !== undefined ? {variant: action.variant as NonNullable<AgentCardAction['variant']>} : {}), ...(action.submit !== undefined ? {submit: action.submit as boolean} : {})}
  })
  unique(result.fields?.map(field => field.id) ?? [])
  unique(result.actions?.map(action => action.id) ?? [])
  // Information-only cards have no form that appears editable but cannot be submitted.
  if (result.fields?.length && !result.actions?.some(action => action.submit !== false)) invalid()
  return result
}

export function parseAgentCardValues(content: AgentCardContent, actionId: unknown, value: unknown): Record<string, string> {
  const action = content.actions?.find(action => action.id === actionId)
  if (!action || !row(value)) throw Error('AGENT_CARD_RESPONSE_INVALID')
  const fields = content.fields ?? []
  if (Object.keys(value).some(key => !fields.some(field => field.id === key)) || action.submit === false && Object.keys(value).length) throw Error('AGENT_CARD_RESPONSE_INVALID')
  const result: Record<string, string> = Object.create(null)
  if (action.submit === false) return result
  for (const field of fields) {
    const raw = Object.hasOwn(value, field.id) ? value[field.id] : ''
    if (typeof raw !== 'string' || raw.length > 2000 || field.required && !raw.trim() || raw && field.type === 'select' && !field.options?.some(option => option.value === raw)) throw Error('AGENT_CARD_RESPONSE_INVALID')
    if (raw) Object.defineProperty(result, field.id, {value: raw, enumerable: true})
  }
  return result
}

/** Strict historical projection. A snapshot carries display data, never a live capability. */
export function agentMessageCardSnapshot(value: unknown): AgentMessageCardView | undefined {
  try {
    keys(value, ['schemaVersion', 'module', 'kind', 'viewId', 'sessionId', 'title', 'expiresAt', 'data', 'response', 'conversationUpdated'])
    if (value.schemaVersion !== 1 || value.module !== 'agent-card' || value.kind !== 'message'
      || typeof value.viewId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.viewId)
      || typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 128
      || !Number.isSafeInteger(value.expiresAt) || Number(value.expiresAt) < 0) return
    const data = parseAgentCardContent(value.data)
    if (data.title !== value.title) return
    const result: AgentMessageCardView = {schemaVersion: 1, module: 'agent-card', kind: 'message', viewId: value.viewId, sessionId: value.sessionId, title: data.title, expiresAt: Number(value.expiresAt), data}
    if (value.response !== undefined) {
      keys(value.response, ['eventId', 'actionId', 'actionLabel', 'values'])
      const response = value.response
      const action = data.actions?.find(action => action.id === response.actionId)
      if (!action || action.label !== value.response.actionLabel || typeof value.response.eventId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.response.eventId)) return
      result.response = {eventId: value.response.eventId, actionId: action.id, actionLabel: action.label, values: parseAgentCardValues(data, action.id, value.response.values)}
    }
    if (value.conversationUpdated !== undefined) {
      if (typeof value.conversationUpdated !== 'boolean') return
      result.conversationUpdated = value.conversationUpdated
    }
    return result
  } catch { return }
}
