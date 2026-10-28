# Chat request capacity and compaction repair — 2026-10-28

## Cause and behavior

Agent3.3.3 diagnostics recorded actual HTTP413 requests of537684 and537748 bytes
on the same conversation. Platform text requests are limited to524288 bytes.
Authenticated discovery remained healthy. The adapter omitted context capacity,
so the already-composed BasicCompactionEngine could not run pressure checks. It
also classified a local-template413 as FUTURESTAFF_CHAT, a misleading login/outage
message. These are separate from the older unknown-result engine timeout.

The FutureStaff adapter now declares a conservative effective transport capacity
of32768 tokens for exact model IDs and the Session default alias. This is a local
transport budget, not the engine's advertised native maximum or a tenant-default
model fallback. The existing runtime applies its0.8 pressure threshold,0.16
retained-tail policy and transactional checkpoint replacement. Human history stays
in the append-only log. No upstream submodule source was changed.

Actual serialized UTF-8 text request bytes, including system/tools/JSON escaping,
are checked against the same512KiB server budget before dispatch. This yields the
runtime's canonical CONTEXT_WINDOW_EXCEEDED code, enabling its existing bounded
compaction recovery. Recognized contract0.1.0 REQUEST_TOO_LARGE413 responses do the
same. AGENT_CONTEXT_TOO_LARGE is an explicit Agent-reference error; unrelated,
unrecognized or proxy413 responses receive a fixed length error without replay.
Rejection metadata is limited to2KiB/1second and is never echoed. Requests with
images retain the existing9MiB total budget. Provider unknown-result retries stay0.
Diagnostics map canonical overflow to the existing FUTURESTAFF_LIMIT allowlist.

## Verification

Initial eight reproduction tests: six failed against the previous built adapter,
two guard/control cases already passed. Final capacity tests additionally cover
exact512KiB/one-byte-over boundaries, UTF-8/JSON escaping, unknown/oversized/stalled
error metadata, local templates and platform Agents, runtime metadata and no
automatic provider retry.

Integration uses the shipped desktop BasicCompactionEngine, TokenMeter, Session
surface, real pre-step event and the managed adapter, with a synthetic HTTP/model
response. A537KiB conversation compacts, resumes below the byte limit and retains
each original durable event unchanged, for both default and exact model routes.

Read-only offline replay of the actual failing Session passed: estimated122455
tokens before,23316 after; the summary request522509 bytes. Model output was a
fixed synthetic checkpoint. No real network/model call or persistence write was
performed. Original events were checked individually. Ignored receipt:
output/automatic-error-diagnostics-20261028/real-session-capacity-replay.json.
This proves envelope/replay behavior; it does not measure actual model summary
quality or latency. A single huge input, excessive static schemas/references or
an unsuccessful summary can still require reducing input; no content is silently
removed by the adapter and the runtime bounds recovery.

The first complete plugin check found an existing release-version mismatch:
Agent distribution still advertised3.3.2 although the desktop was3.3.3. The3.3.4
candidate updates that compatibility version alongside the desktop version.

Release3.3.4 checks and installation/publication receipts are recorded below after
completion. Existing private local Website changes are preserved separately from
the clean public installer; unrelated working-tree source is excluded.

Full plugin check:734 passed/1 existing skip (735 tests). Product workspace types
and root92/92 passed. The added release-lineage check passed separately. Native
profile checks:67 passed/1 unchanged Windows file-symlink EPERM; no test disabled.
Native type checks passed. Code review covered cancellation, bounded rejection
reads, pre-inference-only recovery, tenant binding, provider retry isolation and
history-preserving checkpoint semantics.

The exact published3.3.3 installer was independently extracted and its entire
Profile inventory verified before freezing profile/workspace-upgrade-3.3.3.json
(338 Platform code files). The next release retains all previous complete upgrade
inventories, including this baseline. Their growth needs a bounded2MiB manifest
budget; path/hash validation,32-history and file-count limits remain enforced.
Regression verifies acceptance between1–2MiB and rejection above2MiB. The former
1MiB limit would prevent preserving complete audited upgrade history.
