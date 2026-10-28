# Automatic error diagnostics — local acceptance

2026-10-28. Implemented in Agent client and FutureStaff-platform working trees.
Not deployed, not installed into the running client, no public release or DB
migration executed. Existing unrelated changes, accounts and histories preserved.

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
local candidate. Enablement still requires the authorized server schema/release,
isolated PG/Redis acceptance and a preservation-checked installed-client update.
