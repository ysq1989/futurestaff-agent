# Automatic error diagnostics — local acceptance

2026-10-28. Implemented and directly released with explicit user authorization.
Platform API 1.13.18 is enabled in DEV and PROD; Agent 3.3.3 is published and
installed locally. The initial local acceptance below predates release; the final
release evidence and remaining acceptance limits are recorded at the end.

## Delivered

- Owner-scoped metadata-only outbox, fixed code/tool vocabulary, 200 events /
  256 KiB / 7-day cap, pending-repeat count merge, immutable event IDs, bounded
  batch/ack sizes, retries and cancellation. No model or tool operation is replayed.
- Model HTTP/status/size/duration/request ID; generic LLM and tool/Agent failures;
  auth/discovery decode failures; renderer exception/component/connection events;
  own talent request helpers and embedded system failures; native renderer
  gone/load/boot events and abnormal prior-run metadata.
- Existing public Host/runtime hooks, no upstream edits. Renderer has no platform
  bearer; anonymous first-login errors do not have an authenticated workspace upload.
- Authenticated Platform ingestion, real server-derived member/tenant ownership,
  immutable duplicate receipts, three-scope Redis admission, admin-only list/summary,
  disabled-by-default server flag, additive migration drafts, bounded 30-day cleanup.
- Operational contract: `docs/specs/automatic-error-diagnostics-v1.md`. Platform
  contract/ADR-0085/runbook document exact migration and release prerequisites.

## Verification

Reproduction tests preceded implementations, including disabled Node fatal semantics,
native session-prefix loss, ignored cancellation, duplicate model observations,
decoded HTTP-success contract errors and temporary client error snapshots.
Independent reviews found and then verified fixes for these defects and retention
throughput. No remaining confirmed P1/P2 was reported in the reviewed feature.

Local cross-process acceptance: built Node collector → real loopback HTTP → actual
FastAPI router/service/model → isolated SQLite Event table. 15 assertions passed:
offline disk queue, restart recovery, duplicate receipt, private sentinel rejection,
3 committed events / 4 occurrences / 3 groups, admin success and member403.
Evidence: `output/automatic-error-diagnostics-20261028/local-e2e.sanitized.json`.
Authentication membership and Redis are synthetic test doubles. This is not a TLS,
real PostgreSQL/Redis, real account, installed-client or PROD acceptance claim.

Recorded checks:

- Agent plugin final complete suite: 721 passed / 0 failed / 1 existing skip
  (722 total), after the final decoder/owner-state regression fixes.
- Product workspace typechecks passed; root tests 92/92 passed.
- Desktop native affected suites 111/111 passed; native source/tests typechecks and
  desktop production build passed.
- Desktop full suite: 1245 passed / 13 skipped / 1 failure. The failure is unchanged
  `futurestaff-profile.spec.ts:180` creating a Windows symlink (`EPERM`), not a
  diagnostic assertion. No test was disabled to bypass it.
- Platform diagnostic+DDL suite 25/25 passed, affected desktop/auth/admin suite
  116 passed / 1 optional cross-repository skip; explicitly enabling its built-client
  path ran that skipped test successfully (1/1). Ruff passed on new feature files.
- Alembic graph inspection succeeds with the three deliberate diagnostics leaves;
  PostgreSQL DDL is compiled offline. No PostgreSQL/Redis service is available on
  this machine, so real transaction/TTL/concurrency checks remain a release gate.

Logs are ignored under `output/automatic-diagnostics-*`. The code is a reviewable
local acceptance evidence. The authorized release is recorded below.

## Authorized release and installed acceptance

- Feature commits: Agent `2988754d77`, version `c2064c87bc`; Platform
  `cbea61d6`, release tools `d5d9d92d`. Both main branches pushed while preserving
  unrelated dirty source. Public Agent built from the clean committed source.
- Platform API 1.13.18: DEV generation79/schema17; PROD generation83/schema11.
  Exact diagnostics-only live migration leaves, verified backups, phase-specific
  runtime CAS and rollback images retained. Non-target containers preserved.
  Isolated actual PostgreSQL/Redis concurrency, conflict, rate limit and TTL checks
  passed in both environments. Actual HTTPS membership/receipt/duplicate/private
  field rejection/revoked-session checks passed; synthetic rows and leases cleaned.
- Signed stable feed publishes 3.3.3, with 3.3.2 rollback. Actual external HTTPS
  retrieval verified the Ed25519 feed signature and fully streamed both installers,
  checking size and SHA256. New installer: 142085117 bytes,
  `6216177bacdcab75bb72bd4264becd536a42f0ebe273367d95ef6859d13b1e07`.
  Evidence: ignored `output/automatic-error-diagnostics-20261028/` receipts
  `public-publication.json` and `public-https-verification.json`.
- Installed app exited normally; code backup retained; silent installation exited0.
  Before first launch, all2509 original data files matched their prior hashes and
  all91 session-history prefixes matched. Original account, profile, credentials
  and workspaces were retained. Existing private Website preview/cloner code was
  preserved in a separately recorded local variant; public installer stayed clean.
  Local ASAR integrity was recomputed for that local variant.
- Actual installed window shows version3.3.3, original administrator login/current
  subject, model/application discovery and original failed conversation/history.
  Host started normally. The owner-scoped diagnostics outbox exists, empty with
  zero failed attempts/rejected events. Opening the account/settings UI verified
  real authenticated discovery without a model call or business tool execution.
- No artificial renderer crash or model failure was induced in the running user
  session. A real installed-client error-to-PROD receipt, installed offline recovery
  and account-switch cancellation remain unexercised end-to-end; these paths have
  focused tests/local cross-process coverage. Empty outbox alone does not prove an
  uploaded event. Post-launch full-file hashing hits Chromium locked files; the
  complete hash preservation claim is specifically the pre-launch check above.

## Original request failure

Exact request `0b0847d9-7c74-4b62-8076-1c04a79e4e0d`: Portal ledger model
`futurestaff`, `AI_RESULT_UNKNOWN`; exact failure event `transport_unknown`, no
upstream HTTP status or engine request ID. About100.9 seconds elapsed against a
live100-second HTTP timeout. This supports an upstream transport/timeout diagnosis,
but the logged HTTPError superclass cannot prove a specific ReadTimeout or model
defect. Evidence: `output/request-failure-20261028/server-trace.sanitized.json`.
Paid inference remains without automatic replay because the result is unknown;
the model engine might have processed/billed the request. Diagnostics delivery
retries are separate. This release does not repair that timeout or the separate
tool missing-argument errors. Collection remains bounded and best effort.
