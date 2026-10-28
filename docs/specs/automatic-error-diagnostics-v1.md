# Automatic error diagnostics v1

User request, 2026-10-28: automatically collect errors encountered in FutureStaff
Agent and submit diagnostics to the server so recurring defects can be optimized.

## Scope and ownership

The desktop owns collection, an owner-scoped bounded outbox and delivery. Platform
owns authenticated ingestion, deduplication, 30-day retention and platform-admin
queries. This is product diagnostics, separate from employee feedback and knowledge
candidate consent. It grants no tool or business authority. Existing history and
unrelated working changes are preserved. Implementation and local verification are
authorized; live deployment, migration, installed updates and publishing are separate
release actions under the Platform repository rules.

Collect model/request failures (including HTTP status, request size and correlation
ID), tool validation/execution errors, authentication/discovery failures, renderer
exceptions and component boundaries, Host exceptions and abnormal-run metadata.
There is no promise to observe a powered-off machine or a crash before collection
starts; offline/previous-run events are delivered after the same owner signs in.
Do not upload crash dumps, messages, prompts, model output, tool arguments/results,
credentials, raw exception messages/stacks, file paths, page URLs or screenshots.
Collection is allowlisted before persistence and again at the server.

## Contract 1.0.0

`POST /desktop/v1/diagnostics/events` with Host-only desktop bearer:

```json
{"contractVersion":"1.0.0","events":[{"eventId":"<uuid>","occurredAt":"<UTC ISO date>","category":"llm","code":"FUTURESTAFF_PROVIDER","operation":"chat","severity":"error","appVersion":"3.3.2","platform":"win32","count":1,"requestId":"<optional uuid>","httpStatus":503,"durationMs":100900}]}
```

Every event requires the fields preceding requestId. Optional fields: UUID
`sessionId`, `requestId`; integers `httpStatus` (100..599), `durationMs`
(0..3600000), `requestBytes` (0..100000000), `turn`, `step` (0..1000000);
`toolName` (public registered identifier, <=100 characters), `exceptionType`
(Error/TypeError/RangeError/SyntaxError/ReferenceError/AbortError/TimeoutError/other),
and `stackHash` (64 lowercase hex characters; no raw stack). `code` is a known
public error code or UNCLASSIFIED. Browser errors use fixed codes. Unknown strings
are not copied from Error.message. Codes use `[A-Z][A-Z0-9_]{0,79}`; operations are
chat/tool/login/refresh/discovery/system/runtime/render/bootstrap/unknown.
Categories are llm/tool/network/auth/renderer/host/crash/system; severity error/fatal;
platform win32/darwin/linux/unknown. appVersion is a bounded semver or `0.0.0`.
Count is 1..1000. All objects forbid extra fields. No client identity/environment
fields. Platform derives tenant/user from a live bearer membership; environment is
the independently deployed DB/Redis/origin. Maximum 20 events, 32 KiB per batch.
Response: `{contractVersion:"1.0.0",acceptedEventIds:[],duplicateEventIds:[]}`.
Only committed records are acknowledged. The immutable event ID and payload make
delivery idempotent; conflicting reuse returns 409. The client never replays a
model/tool operation when retrying a diagnostic upload.

## Collection and delivery

Host service `futurestaffDiagnostics.capture(input)` is synchronous and nonthrowing;
it sanitizes and schedules disk work. `flush()` is asynchronous, `dispose()` cancels
timers and requests. Input is a partial event without eventId/time/version/platform/
count; these are host assigned. The module exports types and a sanitizer for shared
collector/renderer hooks. Queue maximum 200 events / 256 KiB / 7 days. Merge repeated
pending fingerprints for 60 seconds, capped at 1000 occurrences; an in-flight event
is immutable and new occurrences get another ID. Atomic owner-private files refuse
symlink traversal. Only the matching environment/tenant/user can send the queue.
Upload is outside the login/controller operation queue, 5-second timeout, bounded
backoff, Retry-After and cancellation. Reporting failures never report themselves.
No unbounded timer, retry, queue or synchronous network work is allowed.

Diagnostic authorization only snapshots an already valid Host session. It never
initiates token refresh, application/model discovery or business I/O. Existing
foreground/profile refresh owns renewal; login-ready actions and a 60-second
readiness probe resume a paused outbox. Network failures back off to a 5-minute
probe after eight attempts, bounded by the 7-day event TTL. Server 401/403 pauses
automatic delivery; malformed/conflicting batches are discarded with a local
counter. A response reader enforces a 64 KiB acknowledgment limit. Renderer
temporary error/loading snapshots do not replace the last verified owner;
explicit logout/expiry and verified owner changes cancel pending delivery.

Native Host-only observations cover abnormal previous runs, renderer process exit,
main-frame load failure and renderer boot failure. A fixed-field channel buffers
at most 16 early observations for its first subscriber, then never replays them
into another Profile. An abnormal-run marker is not proof of a particular crash
cause. Before a verified workspace exists there is no authenticated Host upload;
anonymous first-login failures and sudden power loss are explicit coverage limits.

Platform enforces bounded batches and per-member Redis rate limiting, uses an
independent additive diagnostics table with owner/event uniqueness and timestamp
indexes. Platform-admin list/summary APIs support time/category/code/version filters,
bounded pagination and affected user/tenant counts. Ordinary members and org admins
cannot query other reports. Retention deletes only diagnostics older than 30 days,
in bounded batches; document its scheduler/runbook and prevent expired rows appearing
in queries. Rollback disables ingestion/collection while preserving diagnostic data.

The server defaults `DESKTOP_DIAGNOSTICS_ENABLED=false` until the exact additive
schema is installed. Agent defaults collection on for verified member workspaces;
`diagnosticsEnabled:false` disables it in the platform-access profile. Redis admits
at most 10 member / 50 tenant / 100 deployment batches per minute atomically;
rejected requests do not consume another bucket. Retention does at most 10,000
deletes per cycle, rescheduling after 5 seconds while a full batch remains, otherwise
hourly. Client/server code vocabularies are mirrored and must be released server
first; the exported client DIAGNOSTIC_CODES and server desktop_diagnostic_codes.py
are the reviewed 1.0.0 vocabulary.

## Verification and implementation plan

1. Reproduce queue/privacy/identity and server contract failures with focused tests.
2. Implement collector, public error hooks, authenticated ingestion and admin queries.
3. Wire Host, renderer, API errors and chat HTTP metadata without editing upstream.
4. Validate migration SQL and guards, identity/deduplication, retention, component
   errors, cancellation, offline restart and a local full client-to-server flow.
5. Run affected test suites, typechecks, builds and independent review. Record exact
   coverage and release prerequisites; do not claim that every catchable exception
   or an unreleased client is already covered on users' machines.

Client: `npm run build -w @futurestaff/fs-platform-access`,
`node --test --test-concurrency=1 plugins/fs-platform-access/test/diagnostics*.test.js`,
`npm test -w @futurestaff/fs-platform-access`, `npm run typecheck` and root tests.
Platform: `.venv/Scripts/python.exe -m pytest tests/test_desktop_diagnostics*.py`,
affected desktop/auth suites and Ruff. Real PG/Redis checks use an isolated local
test database only. No live business or model request is needed for acceptance.
