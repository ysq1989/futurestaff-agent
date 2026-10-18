# Acquisition failure diagnostics

User screenshot shows ACQUISITION_FAILED during read-only automatic acquisition.
The old catch discarded provider/model/schema causes, so the actual historical
failure cannot be reconstructed from that screenshot or its generic log code.
Do not claim a particular provider or browser cause as confirmed.

Implemented fixed stage diagnostics for keyword generation, page search and
business result selection; translate trusted provider error codes without raw
messages/model text/paths. Preserve known format/evidence/identity codes. Whole
JSON code fences are accepted, while surrounding instructions and empty/extra-
field/fabricated-evidence decisions remain rejected. UI/logs show actionable
causes instead of the generic failure. This fixes confirmed diagnostic and
JSON-envelope handling defects; actual live task success still requires retry.

Logs use run-log-diagnostics, reading earlier automation/legacy histories without
changing them, preserving rollback. No schema, credentials or manual data edits.
Validation: 78 Node module + 18 React + 43 core tests, typecheck/build, installed
Electron candidate import. No live inference, searches or private sends executed.

Local fix deployed/restarted under the standing acceptance deployment request;
only Douyin lib replaced, prior code fully backed up and hashes checked. Existing
main-area tabs/platform Host untouched. Receipt/backup:
D:/项目/.codex-build/acquisition-error-fix-20261010.
User must retry to obtain the previously hidden specific failure, if still present.
No commit, push, installer/feed/server deployment.

## User correction: independent FutureStaff.AI

2026-10-10 retry reports KEYWORDS_FAILED. This still does not identify the raw
cause; do not claim JSON repair or provider migration has passed live acceptance.
User explicitly requires AI-system models rather than Platform's old model pool.
Confirmed current wiring: DouyinService -> platformInference -> Platform
`/desktop/v1/models` and `/desktop/v1/chat`.

Read independent `ysq1989/futurestaff-ai` default-ref `codex/tenant-statistics`
README, SYSTEM_AI_CONTRACT_V1 and ADR-0001 using read-only GitHub connector.
Public entry documented as https://ai.erplucky.com. AI model IDs are actual model
names, not old Platform UUIDs. Contract distinguishes employee DSH Keys from
system runtime gateway. System runtime requires backend-only service credential
plus current Platform bearer; no service/system Key may be embedded in desktop.
Member Keys remain a separate explicit allocation by AI administrator.

Pending user's choice of system-funded or employee-Key integration before
dependent implementation. Do not silently reuse Platform model UUIDs, redirect
desktop bearer to an arbitrary URL, or auto-fallback to the old model pool.
No code/config/credential/deployment changes in this investigation.
