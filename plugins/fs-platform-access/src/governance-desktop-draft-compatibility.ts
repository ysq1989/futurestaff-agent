import {decodeCandidateDraft} from './governance-candidates.js'

export type DraftCompatibilityRequirement =
  | 'trusted_task_identity' | 'trusted_policy' | 'complete_source_provenance'
  | 'wire_hash_rebind' | 'web_confirmation' | 'domain_payload_fields' | 'local_summary_review'
export type DraftCompatibilityIssue =
  | 'invalid_local_draft' | 'noncanonical_source_id' | 'duplicate_source_id'
  | 'expired_local_scope' | 'missing_content' | 'missing_feedback_fields'
export interface DraftCompatibilityReview {
  status: 'invalid_local_draft' | 'local_only'
  canSubmit: false
  desktopConfirmation: 'not_connected'
  requirements: DraftCompatibilityRequirement[]
  localIssues: DraftCompatibilityIssue[]
}

/**
 * Review the existing local-only format without manufacturing a wire payload.
 * UUID-looking local fields, editable versions and local consent are not server
 * identity, provenance, policy or a human Web approval. No draft is migrated or
 * queued by this inspection; canonical wire hashes must be bound separately.
 */
export function inspectCandidateDraftCompatibility(value: unknown, now = Date.now()): DraftCompatibilityReview {
  const requirements: DraftCompatibilityRequirement[] = ['trusted_task_identity', 'trusted_policy', 'complete_source_provenance', 'wire_hash_rebind', 'web_confirmation', 'domain_payload_fields']
  const result: DraftCompatibilityReview = {status: 'local_only', canSubmit: false, desktopConfirmation: 'not_connected', requirements, localIssues: []}
  try {
    if (!Number.isSafeInteger(now) || now <= 0) throw Error('INVALID_CLOCK')
    const draft = decodeCandidateDraft(value)
    if (draft.basis === 'rule_summary') requirements.push('local_summary_review')
    if (!draft.content.trim() || !draft.title.trim()) result.localIssues.push('missing_content')
    if (draft.scope.validUntil <= now) result.localIssues.push('expired_local_scope')
    const sourceIds = draft.evidence.map(item => item.sourceId)
    if (sourceIds.some(id => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(id))) result.localIssues.push('noncanonical_source_id')
    if (new Set(sourceIds.map(id => id.toLowerCase())).size !== sourceIds.length) result.localIssues.push('duplicate_source_id')
    if (draft.domain === 'platform_product_feedback' && [draft.goal, draft.expected, draft.actual, draft.entrypoint, draft.versions.application, draft.versions.client, draft.versions.agent].some(field => !field.trim())) result.localIssues.push('missing_feedback_fields')
    return result
  } catch {
    return {...result, status: 'invalid_local_draft', localIssues: ['invalid_local_draft']}
  }
}
