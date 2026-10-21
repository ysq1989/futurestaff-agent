## 视频 Agent 3.1.1 与笔记本交接 — 2026-10-21

已完成：Agent 发行源码 `1a7450cf51` 和 Platform 配套模型策略 `85cb673` 已推送并发布。正式更新源为 3.1.1、回滚包 3.1.0；真实客户端签名及两包完整 HTTPS 下载校验通过。原生聊天咖啡案例完成制作和一次修改，27.733 / 19.667 秒两版完整播放，正式安装版冷启动保留登录与工程，免费制作调用和新会话默认模型账单核验通过。原版、失败历史及定制旧 Profile 保留。

当前文档、视频模块说明和任务索引已整理；旧交接归档。后续 Agent 开发、验证和打包在笔记本进行，台式机负责其他系统。交接范围、SHA、证据与限制见 [交付记录](agent-laptop-handoff-20261021.md) 和 [笔记本指南](../docs/development-handoff.md)。其他历史业务待验收项目不随本次交付改为完成。

## Agent 3.0 本地实现切片 — 2026-10-11（历史未发布切片）

平台已有智能体目录/知识快照、桌面智能体入口、原生工作区命名、多会话持久归属及服务端上下文接入完成。新 Windows 数据根统一 shell/Profile/成员工作数据，旧目录和显式配置保留。开发版本 3.0.0-rc.1，无 Schema 变更，无提交/推送/部署/真实迁移。相关客户端 176、平台 79、发行 Profile 64 项通过，真实浏览器与类型/构建通过。继续开发后，Stable 1116、Beta 1032 项通过，各 13 项原有条件跳过；差异/Unicode 工具门禁 7 项、完整布局与运行检查通过。本地开发切片完成，整包发行和线上验收尚未执行；详见 docs/specs/persistent-agents-v3-acceptance.md。

## Blue/white sidebar and update dialog 2.0.21 — published 2026-10-09

New Session belongs to the Session tab and is hidden on Menu; blue/white sidebar and branded update-ready modal. Primary action styling separated from safe Later focus/cancel; existing signed feed/cache recheck preserved. Source 8ca21cc61010cfbced14f0733bf25c123cafed86. Clean access 139 and desktop 1097 tests passed (13 existing skips), all build/type/closure and two Profile checks passed. Native assets/CSP, New Session placement, packaged Electron imports and 59 references verified. Signed live feed/full HTTPS installer: 130857106 bytes; SHA-256 08315a7c51147b30a9053ad787420ef8b43b5332c545d9b5badc94970ba5a972. Rollback 2.0.20. Local four UI files backed up/updated with custom Host preserved. User restart/update acceptance pending; new prompt appears after installation. Details: tasks/update-sidebar-ui-polish.md.

## Sidebar native-load acceptance fix 2.0.20 — published 2026-10-08

Fixed declaration-before-occupant timing with registration subscriptions and renderer version invalidation; fixed settings trigger visibility under native data-slot wrappers. Source ae3e0138d0f22ef5c68ee5a15f641c3dfa9cd968. Actual native renderer browser fixture verified both delayed native registration and product decoration after old UI was already mounted; account/tab/title/mode UI and initially hidden settings passed. Primary access 144 tests, clean access 139 tests, desktop 1095 tests (13 original skips), build/typecheck/closure and two staging tests passed. Packaged Electron imports/59 references and full public signature/download verified: 130856151 bytes, SHA-256 ff5985ea149516dad5514566847c2fae7680c547986e4dbb6ebdab1eab179c5b. Rollback 2.0.19. Local four UI files backed up/updated; custom Host and verified view dependency preserved. No real login, credential reads, installer execution or server restart. User restart/real acceptance pending. Details: tasks/sidebar-account-navigation.md.

## Subject sidebar and simplified modes/login 2.0.19 — published 2026-10-08

Subject logo/name header, Session/Menu tabs, account/version footer with expandable settings/logout, Normal/Task modes, compact 380px login without return, and corrected welcome branding. Source 3261684a64f2a0c6f6dd185a4e8351e20b2e0c13. Clean access 137 tests, primary access 142 tests, desktop 1095 tests (13 original skips), build/typecheck/closure, actual SlotCore and two Profile tests passed. Packaged Electron imports and 58 local dependencies verified. Signed live feed and full HTTPS installer verified: 130851077 bytes, SHA-256 e3f74ef498690851828a2c3488905c4b330c4792df301e8f2e40b11e7d7e82f4. Rollback 2.0.18. Local custom Profile four UI files backed up/updated with verified view dependency and Host preserved. User restart/update and real UI acceptance pending; no installer executed or credentials read. Details: tasks/sidebar-account-navigation.md.

## Branding and protected-password follow-up 2.0.18 — published 2026-10-08

Official blue/white f across hero, browser identity, recovery-window icon and installer artwork; retryable password-capability probe and clear errors. Missing local overlay brand.js repaired with custom Host integration preserved. Source 7f1eb3c832af6831db99e04ae44ff06953429dc4. Access 128 tests and desktop 1095 tests (13 existing skips), build/typecheck/runtime closure and two staging tests passed; actual packaged Electron imported both Host entrypoints and resolved 56 module references. Signed live feed and complete HTTPS download verified: 130847518 bytes, SHA-256 74c2685d0e8d6874b334f13db507376110da0b117ca4050b7a26260740cf5dcf. Rollback 2.0.17. User installation/restart and real encrypted-password acceptance remain pending; no installer executed or credentials read. Evidence: tasks/branding-remember-fix.md.

## Login UI and protected remember-password 2.0.17 — published 2026-10-08

Both login flows centered, concise titles, one-row subject buttons and opt-in OS-protected password remembering. No Renderer password export or plaintext preference persistence. 125 access tests, 1095 desktop tests (13 skips), two staging tests, browser centering checks and actual packaged fixture passed. Signed feed and complete HTTPS installer verified; rollback 2.0.16. Source 26d8eceddf; user restart/acceptance pending. Evidence: tasks/login-ux.md.

## Agent market recovery fix 2.0.16 — published 2026-10-08

Fixed required native preset default and one-time v1 workspace migration, plus ASAR preset asset copying. Repaired and backed up local market-owned files. 119 access tests, 1095 desktop tests (13 skips), real installed-schema and final bundled ASAR fixture passed. Signed live feed and complete installer bytes verified; rollback 2.0.14. Packaged source 19a7e074f2; user restart/acceptance pending. Evidence: tasks/agent-market.md.

## Agent market 2.0.15 — deployed 2026-10-08

Platform builtin templates run through local DSH presets. Platform source baaa9a45; packaged desktop 7b8267faac. DEV/PROD guarded deployment, signed stable feed and complete HTTPS installer verified. Local custom inference preserved through task-only code overlay. No database migration or installer execution; user restart and acceptance pending. Validation and rollback: tasks/agent-market.md.

## B11 — Website Logo, blue-white access and remembered login released 2.0.14 (2026-10-08)

- User authorized commit, push and publication. Source: 05b35f334e8571694bc2ecac826eebf70e8cc443 (UI source 0ce52bebee and existing workspace fix 05b35f334e).
- Original public website SVG is bundled offline in login/sidebar and app/tray icons; no visible platform endpoint label. Includes B10's blue-white palette and harmless account/subject hints, with offered-subject confirmation still authenticated by Platform.
- Required access/workspace/managed-settings composition reviewed; no business API/schema migration, production data change or service restart. Pending Douyin/window changes excluded, inference service not registered/exported, and original staged changes preserved. Existing identity workspaces receive only verified browser code; Host code, credentials, profile identity and history remain in place.
- Validation: affected access suite 110 passed; focused login/workspace checks 28 passed; fixed-profile refresh checks 13 passed; stable desktop 1092 passed, Beta 1029 passed, root 64 passed. Full npm check encountered one unchanged Beta test's Windows ephemeral-port EACCES; complete Beta retry and remaining root suite passed without modifying the test. Typechecks, builds, package preflight and Windows installer verification passed. Actual ASAR/profile confirms Logo, skin, hints, fixed-workspace client refresh, pinned update source and confirmed silent installation/relaunch.
- Live HTTPS download verified by the real client signature parser and complete size/SHA-256: 130937325 bytes; a5ddf84d165a51bd92ab372dc6d410fe5c80eb993b3d3b2ae56fb0e0da3f6b3d. Signed feed manifest: 0c927d07cf9010f115c9fd72699a05385ece22cefa5ffc5ec022dabb169b8764. Rollback 2.0.13 matches the previous signed live artifact.
- Published https://fsstory.net/desktop-updates/stable.json and the versioned 2.0.14 installer. Update server, Platform API and Product Hub API remain healthy at unchanged start times; trust.json and READY remain private (404). Real interactive installation/restart remains user acceptance; no installer executed on the user's desktop.
- Build hygiene follow-up: reused access lib contains three inactive inference helper outputs (inference.js/.d.ts/.js.map) from an earlier local build. They are not exported or loaded and do not activate inference. Before the next installer, clean generated product-package outputs and verify the staged inventory against fresh compilation; do not replace the already published immutable 2.0.14 artifact.

# Completed Atomic Tasks

## B10: Blue-white access UI and login hints (local implementation)

- Removed production endpoint label from login gate and access section.
- Successful account identifier is prefilled after logout/expiration; authenticated
  existing sessions seed first-use email hints. Subject defaults are stored by
  server user UUID and select only currently offered authorized subjects.
- No password, token, permission or role is cached; normal login and subject
  confirmation still validate on the server. Storage failure/corruption is optional.
- Public theme override adopts light once and uses blue/white desktop/access
  tokens. Subsequent explicit theme choices remain effective; upstream unchanged.
- Module build/typecheck, 113 module tests and scoped diff check passed. Actual
  browser screenshots verified login and subject views; AA token checks passed.
- Changes apply to the current working module, preserving pending production
  login/workspace implementation. No installer publication or production change.


## B09: Confirmed in-app software updates

- Completed 2026-10-08; source main `b8679b4377`, live version 2.0.13; ADR-018.
- Background download and verified private cache; ready notification/tray action;
  Restart and Update / Later. Later reuses cached bytes across process restarts.
  Confirmation rechecks signed current feed, confined cache path and exact bytes;
  NSIS receives /S --updated --force-run, then the app shuts down after spawn.
  Existing Authenticode-required delivery and all managed defaults remain intact.
- Verification: clean main full npm run check; stable 1,089, Beta 1,029, root 64
  tests; builds/typechecks/runtime/loader/operations gates and diff checks passed.
  Cache, junction/path, tamper, cancellation, background/later, changed-feed and
  failed-spawn regressions passed. Windows preflight 190 tests, installer check
  and actual ASAR source/trust/handoff inspection passed.
- Installer: `outputs/FutureStaff-Agent-2.0.13-x64-Setup.exe`, 132734849 bytes,
  SHA-256 `d61bfa114cb1d5e841025d833c30ea257cf2ff7016cc0f216e7753f2e6c77ba1`.
- Existing HTTPS update feed now advertises 2.0.13 and rollback 2.0.12. Actual
  client signature parser and external full download verified size/hash. Feed
  switched atomically; update container and business services were not restarted.
- Old 2.0.11/2.0.12 clients require one bridge install. No installer executed by
  agent; installed end-to-end upgrade/relaunch remains manual acceptance.

## B08: Managed FutureStaff desktop defaults

- Completed 2026-10-08; source main `f7d22242a1`, live version 2.0.12.
- Result: all profiles inherit enhanced mode, Mica with existing OS fallback,
  disabled market/browser access, loopback networking and all notifications.
  First-run/upgrade Setup is completed automatically. Desktop settings, frame
  mode picker and tray toggle are removed; Host validators and Market callback
  reject conflicting writes. Isolated Recovery Safe Mode remains available.
- Validation: clean main full `npm run check` passed; stable 1,073, Beta 1,029,
  root 63 tests, workspace/type/build/runtime/loader/operations checks. Windows
  package preflight passed 190 tests and installer verification. Actual ASAR
  inspection verified product identity, policy, launcher/UI guards and updater trust.
- Installer: `outputs/FutureStaff-Agent-2.0.12-x64-Setup.exe`, 132731801 bytes,
  SHA-256 `7552883adf0ff1dc3577bf0b879b0ee5f9981de7458676aca4dc2a73ac07e140`.
- Publication: `https://fsstory.net/desktop-updates/stable.json` verified by
  the actual client parser; external HTTPS full download matched size/hash.
  Rollback 2.0.11 preserved; existing update container serves the atomic feed/file
  change without restarts or business configuration changes.
- Installer not executed by agent; first installed-client UI acceptance remains manual.

## B05: Restore FutureStaff Agent DEV login on the existing Desktop shell

- Status: Completed locally as source commit `f890bce061` and release record `7042cc118d`; the user screenshot of installed 2.0.9 shows an authenticated chat workspace.
- Result: the packaged Profile safely upgrades the exact intact older login client, preserving modified Profiles; bounded account guidance distinguishes password, verification, membership, and Agent access failures.
- Verification: real DEV account login through API, client controller, Host route, and installed Electron form; full `npm run check`, Platform desktop-auth 20 tests, temporary Profile upgrade/preservation, installer verification and independent SHA-256 comparison passed.
- Artifact: unsigned private `outputs/FutureStaff-Agent-2.0.9-x64-Setup.exe`, SHA-256 `0e7be4cfc9afbfc49e1ade43c710925cffa434512dd7872d3fc1e0657af723f3`. Chat model access belongs to B06.

## B01a: Connect the desktop product to the pinned local platform Mock

- Status: Completed and pushed as `71174081fbbcd377f61c0abf4fb1874de84199ce`.
- Contract: `0.1.0`, platform commit `93ca162566225894a8cd317b7bc51b096d16a0ec`, bundle SHA-256 `5ae4e07157b5c7c1b8007f514d47cc0bb05734841341f59c44c37a978b7f9fe9`.
- Result: login, refresh, logout, tenant discovery/switching, authorized applications, explicit state rendering, and tenant-change isolation run against the loopback-only Mock.
- Verification: 11 focused plugin tests, full product check, local Mock smoke, visible browser flow, Profile installation, and exact diff review passed.
- Known follow-up: the pinned DSH `0.1.1-rc.2` `pnpm dlx` launcher could not resolve its declared `dsh-app-boot` dependency on this Windows host.

## B01b: Make the FutureStaff Profile release-loadable

- Status: Completed and pushed as `570fa30af6723005b8d9a8498d9a9056094dd00a`.
- Result: repository-pinned DSH `0.1.2-rc.1`, successful development/release Profile composition, and a relocatable built-only Profile tree without absolute paths or links.
- Verification: release Profile tests, full product checks, exact file inspection, and `profile:dump:release` passed.

## B01c: Integrate the release Profile with the controlled desktop shell

- Status: Completed and pushed as `ab7f5f11a6b8eac2bed6bb2b52040760ebf6c763`; controlled-shell support was pushed as `3e3b3fd822d1510f82d7831f10ea4618701f07f5`.
- Result: verified first-launch Profile installation, preservation of existing user data, packaged-resource gates, and exact cross-repository staging.
- Verification: desktop focused and Windows package gates plus the product full check passed; known unrelated Windows environment failures remain recorded in the completed task history.

## B01d: Export a self-contained private Windows Mock installer

- Status: Completed in the B01d close commit. Desktop artifact-name verification was pushed as `8f7dbd6ce960daa1e80a96010488b982932381bd`.
- Result: the packaged Host runs the pinned B01a contract through an in-process Mock, while retaining the loopback bridge, explicit simulated metadata, all session states, and tenant-change cleanup. No Python service, real account, credential, signing, publishing, or cloud deployment is required.
- Artifact: ignored private Alpha `FutureStaff-Agent-2.0.5-x64-Setup.exe`, 134,257,457 bytes, SHA-256 `22fdb50439094ae3ae434c587a90b009cb3db9e353a1a7dd9c69d084b21e83c1`.
- Verification: product full check, embedded Mock integration tests, release Profile checks, 188 Windows package tests, 228-node runtime closure, NSIS build, installer/application PE verification, independent SHA-256 comparison, and unsigned Authenticode status check passed.

## B01e: Enforce the pinned A01 response contract at the client boundary

- Status: Completed.
- Contract: A01 `0.1.0`, platform commit `93ca162566225894a8cd317b7bc51b096d16a0ec`, bundle SHA-256 `5ae4e07157b5c7c1b8007f514d47cc0bb05734841341f59c44c37a978b7f9fe9`.
- Result: success and error payloads now fail closed on invalid/extra fields, UUIDs, integer TTL limits, roles, user fields, HTTP(S) URLs, application IDs, deep links, duplicate or malformed capabilities, metadata, logout revocation limits, and unknown error codes. All decoder failures become a bounded local `CONTRACT_MISMATCH` without reflecting payloads or credentials.
- TDD: five new negative cases first failed against the permissive decoder, then passed after strict boundary validation.
- Verification: platform-access tests 18 passed; focused TypeScript check passed; original A01 Python Mock smoke completed login, refresh, tenant list/switch, application discovery, and logout; full `npm run check` passed, including every workspace typecheck/test/build and 50 top-level tests; `git diff --check` passed with only line-ending conversion warnings.
- Boundaries: no A02 endpoints or fields were guessed; no platform or controlled-desktop repository files changed; no real identity, credential, service, signing, publishing, deployment, or external write was used.

## B01f: Polish the local Mock access center

- Status: Completed and committed locally on `main`; not pushed.
- Result: the Settings access panel now presents polished signed-out, loading, expired, error, empty, and ready states; tenant selection, active role, application count, and capability labels remain explicit.
- Accessibility: labelled regions and tenant control, live loading and alert semantics, button types, visible keyboard focus, responsive single-column layouts, and reduced-motion handling were added.
- Safety: all account, tenant, application, and capability strings remain HTML-escaped; no credentials are rendered or logged.
- Demo: the local browser demo now shares the production panel styles and uses the existing embedded A01 Mock, so it does not depend on A02 or a separate process.
- Verification: TDD regression coverage first failed against the old markup; platform-access tests passed 21/21; full `npm run check` passed; desktop and 390px browser checks passed with no horizontal overflow and a visible 3px keyboard focus outline; `git diff --check` passed with only Git line-ending conversion warnings; exact diff review passed.
- Boundaries: no A02 endpoint or field was added; no Computer A or controlled-desktop file changed; no real account, persistence, external write, deployment, commit, or push was used.

## B02a: Pin A02 and add the Platform DEV API boundary

- Status: Completed and committed as `9e7774401a1d841e746f49c499d62efea76a1112`; pushed with the B02b close.
- Contract: A02 `0.1.1`, Platform DEV source `d789faceb7971deb111fec3e4948237d21e81346`, handoff `2c31ed720d8f9ee4fd8087f758c928ea5f8c0ac2`, bundle SHA-256 `9921cc5084925ceea4e6e9d224e5434d4af294974a736a300ed34c73d2950687`.
- Result: the foundation now pins independent A01 Mock and A02 DEV inputs; `PlatformDevApi` supports the existing desktop identity routes and strict one-minute application-token exchange at the exact root-level DEV origin.
- Safety: the DEV boundary rejects `/api`, alternate origins, simulated or wrong-version metadata, unsafe application IDs, cross-tenant token responses, invalid token TTL/audience/permissions, malformed envelopes, and unbounded transport failures without reflecting credentials.
- Compatibility: the immutable `0.1.0` Mock, its six routes, proof headers, embedded implementation, and disconnected UI remain unchanged; the application-token endpoint was not added to the Mock.
- Verification: RED tests failed before the DEV export and nested contract pin existed; platform-access tests passed 27/27; focused foundation/profile tests passed 8/8; full `npm run check` passed including every workspace typecheck/test/build and 52 top-level tests; `git diff --check` passed with only Git line-ending conversion warnings; exact diff review passed.
- Boundaries: no real login, credential storage, Platform DEV call, Computer A or controlled-desktop edit, deployment, or push was performed.

## B02b: Add OS-protected desktop session storage

- Status: Desktop portion committed and pushed as `bd54da63577a5d2595ced66060999e12468f42a8`; product portion and updated desktop release pin are recorded by this B02b close commit.
- Desktop result: added the generation-scoped, Host-only `desktopProtectedSecrets` Cordis service backed by Electron `safeStorage`; keys are validated and hashed, state is atomically written with private permissions, symlink/path/state hazards fail closed, and only sealed bytes reach disk.
- Product result: added `PlatformSessionVault` for the exact A02 `0.1.1` session/user shape with OS-protection gating, local-first idempotent clear, presence-only credential-free diagnostics, and bounded failures.
- TDD: missing service/Vault tests first failed, then passed; added first-run empty operations, corruption, unavailable protection, invalid runtime input, no-diagnostic-decryption, and plaintext-at-rest checks.
- Verification: product full `npm run check` passed, including every workspace typecheck/test/build and 52 top-level tests; desktop build and typecheck passed; the focused protected-secret suite passed 5/5. Desktop full check reached 1019 passed and 12 skipped tests, with two reproducible unrelated environment failures in diagnostic-export linked-directory setup and recovery pnpm PATH selection. The edited service documents have matching bilingual blob records; the repository-wide bilingual gate remains red only because the unchanged Desktop README pair already has stale recorded hashes.
- Documentation: updated the bilingual public Desktop Host service contract and product/foundation integration boundaries.
- Boundaries: no renderer/IPC/browser storage, real account, DEV request, PKCE launch, deployment, or upstream Harness edit was performed.

## B02c: Add the desktop PKCE transaction boundary

- Status: Completed locally; not committed or pushed.
- Result: added `PlatformPkceTransaction`, which generates a 32-byte verifier and state, derives the S256 challenge, builds only the pinned A02 authorization request, and consumes only the exact loopback callback once.
- Safety: verifier remains in Host memory and is absent from the authorization URL and diagnostics; concurrent start, callback origin/path/query changes, duplicate parameters, invalid code/state, state mismatch, expiry, and replay fail with bounded messages; callback attempts destroy the pending transaction.
- TDD: the missing exports failed first, then three focused PKCE scenarios passed, including pinned URL fields, verifier secrecy, one-time success, pending collision, state mismatch, expiry, and callback rejection.
- Verification: platform-access tests passed 34/34; full `npm run check` passed including all workspace typechecks/tests/builds and 52 top-level tests; `git diff --check` passed with only line-ending conversion warnings.
- Boundaries: no listener, browser launch, DEV request, real account, code exchange, credential persistence, renderer secret, deployment, commit, or push was performed.

## B02d: Orchestrate PKCE exchange into the protected Vault

- Status: Completed locally; not committed or pushed.
- Result: added `PlatformDevLoginCoordinator` to compose one PKCE callback, the pinned `PlatformDevApi` exchange, and `PlatformSessionVault` persistence without returning the decoded session.
- Safety: only one exchange may run; API output is strictly decoded before save; protected-save failure triggers best-effort refresh-token revocation; transaction, exchange, storage, and diagnostics failures are bounded and do not reflect native errors or credentials.
- TDD: missing coordinator exports failed first, then success and protected-storage failure/revocation scenarios passed.
- Verification: platform-access tests passed 36/36 with build and TypeScript compilation; `git diff --check` passed with only line-ending conversion warnings.
- Boundaries: no listener, browser launch, real DEV request/account, renderer credential, deployment, commit, or push was performed.

## B02e: Mount the exact loopback DEV callback service

- Status: Completed locally; not committed or pushed.
- Result: Desktop Host now conditionally provides `platformDevLogin` when `desktopProtectedSecrets` exists; `begin()` owns a temporary dedicated `127.0.0.1:43821` listener because the ordinary DSH WebServer remains on its separate configured port.
- Safety: only GET, loopback socket, exact `Host: 127.0.0.1:43821`, bounded URL length, and the strict PKCE callback are accepted; fixed CSP/no-store HTML never reflects query data or credentials; the listener closes after success, failure, cancellation, runtime error, or five-minute expiry.
- Verification: integration coverage completed a fake DEV exchange through a real loopback socket and found only OS-protected persisted state; platform-access tests passed 37/37; full `npm run check` passed with every workspace typecheck/test/build and 52 top-level tests; `git diff --check` passed with line-ending warnings only.
- Boundaries: no browser launch, real DEV request/account, renderer credential, deployment, commit, or push was performed.

## B02f: Add the safe Host-to-client login trigger

- Status: Completed locally; not committed or pushed.
- Result: added a loopback-only Host POST start route and `beginPlatformDevLogin()`, which validates the exact A02 authorization URL before asking the controlled desktop window to open it externally.
- Safety: the start route requires a non-simple `X-FutureStaff-Login` header to force browser CORS preflight for cross-origin attempts; the client rejects extra response fields, alternate origins/paths, URL credentials/fragments, missing or duplicate parameters, wrong client/callback/method, and malformed state/challenge before invoking the opener.
- Verification: a real loopback start route plus dedicated callback completed the fake DEV/Vault flow; safe and malicious client URL cases passed; platform-access tests passed 38/38; full `npm run check` passed including every workspace typecheck/test/build and 52 top-level tests.
- Boundaries: the existing Mock panel remains unchanged; no real account/DEV request, session restore, deployment, commit, or push was performed.

## B02g: Restore the protected DEV session into the Settings access center

- Status: Completed locally; not committed or pushed.
- Result: added a Host-owned `PlatformDevAccessController` that restores the A02 session from the OS-protected Vault, loads the validated user/tenant/application context, persists refresh and tenant-switch sessions, and clears the protected local session before best-effort remote logout.
- Web boundary: added four loopback Host session routes guarded by `X-FutureStaff-Session`; every response is a credential-free snapshot. The Web client strictly decodes every nested field, rejects extra or credential-shaped output, ignores stale responses, opens B02f login in the system browser, and restores on desktop focus. A definite missing desktop route retains the A01 Mock workflow.
- Tenant and concurrency safety: the Host accepts a switch only for a tenant in the server-fetched membership set, serializes protected session mutations, validates active-tenant consistency, clears expired credentials and tenant resources, and maps application denial to the safe empty state.
- UI: the Settings access center distinguishes Platform DEV `0.1.1` from local Mock `0.1.0`, keeps loading/error/expired/empty states and keyboard semantics, and introduces no new UI dependency or theme system.
- Verification: RED coverage first failed on the missing DEV controller; platform-access tests passed 46/46 with TypeScript build; a fake protected-session flow completed browser start, loopback callback, Vault restore, safe Web snapshot, refresh/switch/logout boundaries, malformed response rejection, concurrent mutation serialization, and stale response rejection; full `npm run check` passed including every workspace typecheck/test/build and 52 top-level tests; `git diff --check` passed with line-ending conversion warnings only.
- Boundaries: no real account, real Platform DEV request, credential read outside fake tests, schema, deployment, controlled-desktop edit, commit, or push was performed.

## B02h: Broker the short-lived Product Hub application token

- Status: Completed locally after commit `d2b1f7c`; not committed or pushed.
- Result: the Host-owned DEV controller now mints an A02 application token only when `product_hub` is present in the current server-fetched application snapshot and the protected session still matches the active tenant. Issuance is serialized with refresh, tenant switch, restore, and logout.
- Web boundary: added one exact loopback POST route guarded by `X-FutureStaff-Application: product_hub`; its response is `no-store` and contains only the 60-second application credential contract. `getProductHubApplicationToken()` validates the exact active tenant, audience, TTL, visible-ASCII token, unique `product_hub.*` permissions, and response fields, then returns without caching or persistence.
- Safety: missing/expired sessions, unauthorized applications, cross-tenant responses, unsafe tokens, malformed permissions, missing guard headers, extra fields, and post-logout issuance fail closed with bounded errors. The platform access token and refresh token never enter the Web response.
- Verification: RED tests first failed on the missing controller method and client helper; platform-access tests passed 48/48 with TypeScript build; the real loopback fake flow covered Host minting and Web delivery; full `npm run check` passed including every workspace typecheck/test/build and 52 top-level tests; `git diff --check` passed with line-ending conversion warnings only.
- Boundaries: no Product Hub business request, real Platform DEV request, credential persistence in Web, schema, deployment, controlled-desktop edit, commit, or push was performed.

## B02i: Connect the Product Hub client to the desktop authorization boundary

- Status: Completed locally after commit `d2b1f7c`; not committed or pushed.
- Result: the live Product Hub approval page now accepts only a valid `draft` UUID, resolves the current Product Hub endpoint and tenant from the strict credential-free Host snapshot, obtains a fresh 60-second application token per business request, and sends the server-owned draft/approval contract through `ProductHubApprovalClient`.
- Tenant and permission safety: every token mint revalidates the active tenant, application authorization, and base URL; a switch or revocation fails before Product Hub is called. Only server-issued `product_hub.operator` or `product_hub.admin` enables approval, while read-only users can inspect the draft without a writable control.
- Mutation safety: approval transmits only title, allowlisted template, and a client-generated idempotency key; an identical retry reuses that key. Platform credentials and tenant IDs never enter the Product Hub request body, Web storage, or logs.
- Verification: fake loopback integration proved snapshot -> token -> business request ordering and rejected switched tenants, missing applications, and read-only approval; platform-access tests passed 49/49; Product Hub UI tests passed 15/15 and its Vite production build passed; full `npm run check` passed before the final permission-interface tightening, followed by the affected tests/build and `git diff --check` passing.
- Boundaries: no real Platform DEV account/request, Product Hub business request, external mutation, schema, controlled-desktop edit, commit, push, or server deployment was performed.

## B02j: Build and stage the private Windows client candidate

- Status: Completed locally after commit `d2b1f7c`; source changes remain uncommitted and unpushed.
- Result: staged the built-only `futurestaff-alpha` Profile into the pinned controlled desktop shell at `bd54da63577a5d2595ced66060999e12468f42a8`, built exactly one private unsigned Windows x64 installer, and exported it to `outputs/FutureStaff-Agent-2.0.5-x64-Setup.exe`.
- Artifact: 134,282,271 bytes; SHA-256 `ebac3e3fe0f052951bff105884e9bd49fef85369d8f4ed60c2c289aa7686cf77`; companion `.sha256` file exported beside it. Authenticode is intentionally absent for this private Alpha candidate.
- Verification: controlled desktop `main` and its official DSH gitlink were clean before packaging and remained clean afterward; desktop tests passed 188/188; the first-party runtime closure contained 228 reachable nodes; Electron/NSIS packaging and the installer verification gate exited 0; the staged release manifest pins A01 Mock `0.1.0`, A02 DEV `0.1.1`, exact built file hashes, and `productionEnabled: false`.
- Boundaries: the installer contains the mounted Profile packages `fs-core` and `fs-platform-access`, including B02h. The separately built Product Hub approval UI/B02i is not yet mounted as a DSH Profile navigation plugin and therefore is not claimed as installed by this artifact. No installer execution, signing, public upload, real login, server deployment, migration, Product Hub mutation, commit, or push was performed.

## B02k: Mount Product Hub UI in the DSH Profile

- Status: Completed locally after commit `d2b1f7c`; not committed, pushed, or packaged into a new installer.
- Result: `fs-product-hub-ui` is now a DSH Host/Web plugin in both developer and release Profiles. It contributes an additive Product Hub action to `sidebar.footer.action` and a dismissible `shell.overlay`, preserving the official sidebar, conversation, and details occupants.
- Static boundary: the Host serves only allowlisted built `lib/ui` assets from the fixed loopback `/_futurestaff/product-hub-ui` prefix. Responses use a restrictive CSP, no-store, no-referrer, nosniff, explicit MIME types, and reject non-loopback, unsupported methods, traversal, and unknown files.
- Client boundary: only a valid outer `productHubDraft` UUID is transferred into the isolated same-origin UI as `draft`; missing or malformed values open the safe empty state. The overlay has an accessible dialog name, focused close control, and Escape dismissal. B02i continues to revalidate tenant/application state and mint a fresh 60-second token for each business call.
- Release integration: developer install, release build, Profile manifest, staging verifier, and composition tests now include exact `@futurestaff/fs-product-hub-ui@0.1.0`. The final staged Profile contains only package metadata, compiled `lib`, hashed Vite assets, and public SVG fixtures—no source, tests, absolute source paths, sessions, or credentials.
- Verification: Product Hub package typecheck/build and 18/18 tests passed; Host route and client slot interaction tests passed; release/Profile focused tests passed 8/8; `npm run profile:dump:release` showed `futurestaff-product-hub-ui` in the final DSH tree; final `npm run check` exited 0 including all workspaces and 52/52 top-level tests; `git diff --check` passed with line-ending warnings only.
- Boundaries: no real account, Platform DEV request, Product Hub business request, installer rebuild, installer execution, desktop-shell edit, signing, public upload, server deployment, commit, or push was performed.

## B02l: Make the bundled Profile first-launch safe

- Status: Completed by product commit `644322f` and controlled desktop commit `ab7a889b9e`; included in the verified replacement installer recorded under B02n.
- Incident: the private Windows candidate copied the three built first-party packages into `node_modules` but omitted pnpm layout metadata. On a fresh installation the desktop migration detector treated that verified package tree as legacy, invoked packaged pnpm, and entered recovery mode when the private package versions could not be materialized from a registry.
- Result: release staging now emits deterministic pnpm 11 hoisted-layout workspace, modules, and lock metadata before hashing the Profile. Release verification requires the exact metadata contract, so a future installer cannot silently ship the same incomplete dependency state. On upgrade, the desktop atomically repairs only the exact hash-matched defective Profile; any changed managed file or unexpected extra file preserves the user's Profile untouched.
- Verification: the focused regression failed before the fix and then passed 2/2; the staged Profile returned `requiresDependencyMigration=false` through the real desktop preparation function on Windows; release Profile composition included all three FutureStaff plugins; full `npm run check` passed, including every workspace and 52/52 top-level tests.
- Boundaries: no existing user Profile was deleted or modified, no real account or service was contacted, and no installer was executed, signed, or publicly uploaded.

## B02m: Bootstrap the desktop Alpha identity policy

- Status: Completed in controlled desktop commit `2a0a98fac0`; included in the verified replacement installer recorded under B02n.
- Incident: after the dependency-layout repair, the packaged Profile reached Host composition but `fs-core` correctly rejected the missing `FUTURESTAFF_IDENTITY_MODE` before any plugin could start.
- Result: the desktop Host now injects the explicit `single-subject` mode plus fixed bootstrap-only tenant/user labels whenever the reserved `futurestaff-alpha` Profile is selected. It overwrites caller-controlled environment values for that Profile and leaves every unrelated Profile untouched.
- Security: the bootstrap labels are not application authorization and are never accepted as a Platform tenant choice. A02 remains the authority for authenticated user, active tenant, application grants, and short-lived Product Hub credentials.
- Verification: the regression failed before implementation; identity, Profile repair, migration, and preparation tests passed 52/52 with desktop build/typecheck; final product checks and replacement packaging passed under B02n.

## B02n: Emit DSH-compatible client plugin bundles

- Status: Completed by product commit `646ad93` and controlled desktop commit `2887e6d5c3`; replacement installer built and verified.
- Incident: both FutureStaff Web plugins exposed raw TypeScript-emitted ESM as their DSH `./client` entry. The Host concatenated those files into a classic script, whose unsupported top-level imports prevented every factory registration and surfaced as a misleading failure on the first official plugin.
- Result: each package now keeps its importable ESM under `lib/client/index.js` and emits a separate `lib/client.js` factory bundle that registers its exact package ID through `__ModuleLoader__`. Release staging parses and executes both bundle shells as a regression gate.
- Upgrade safety: the packaged manifest explicitly supersedes the exact prior candidate manifest digest. Controlled desktop commit `2887e6d5c3` atomically upgrades only that fully hash-matched bundled Profile; managed-file changes or unexpected files remain preserved.
- Artifact: `outputs/FutureStaff-Agent-2.0.5-x64-Setup.exe`, 134,344,753 bytes, SHA-256 `49dbe0733e3f4d22d31b2f725a4551629533f24748d73607fe9d6d117e668ccc`; the adjacent sidecar matches. Authenticode remains intentionally absent for this private Alpha build.
- Verification: product full `npm run check` passed, including 49 platform-access tests, 18 Product Hub tests, and 52 top-level tests; release Profile composition passed; desktop upgrade tests passed 9/9 with build/typecheck; the Windows packaging gate passed 188/188 tests and a 228-node closed runtime graph before verifying the final installer.
- Boundaries: no user Profile was modified, no installer was executed, no real Platform request was made, and no push or public distribution occurred.

## B02p: Merge the product and desktop repositories

- Status: completed locally by desktop-history merge commit `f6b685b888` and monorepo integration commit `358f194f93`.
- Result: `futurestaff-dsh` now owns the complete desktop shell under `desktop-shell/`; root commands install, build, check, stage, and package both product and desktop code without consulting the adjacent legacy checkout.
- Provenance: the imported desktop tip is `89f84fcb7856746cdbdb664989547fc835ea8179`; `deepseek-harness` remains a root-managed submodule pinned to `a66e4702047846cdaa10c66c9d3df3951f5ea70d`.
- Artifact: `outputs/FutureStaff-Agent-2.0.6-x64-Setup.exe`, 134,448,311 bytes, SHA-256 `3d1647f3c9bba99c382abbf3704b9c1a71f4bec49173792957a4cb71fdb63dc7`; the sidecar matches and Authenticode is intentionally `NotSigned`.
- Verification: embedded-foundation and release-path tests passed 9/9; product workspace checks and builds passed; stable desktop passed 109 files and 1028 tests with 13 skips; Beta passed 108 files and 1029 tests with 13 skips; the Windows packaging gate passed 190/190 with a 228-node runtime closure; bilingual documents, package variants, licenses, operation reliability, NSIS packaging, and final installer verification passed.
- Boundaries: the adjacent `futurestaff-dsh-desktop` checkout remains untouched as recoverable history. No push, deployment, signing, distribution, installer execution, legacy-repository deletion, or production mutation was performed.

## B02q: Automatically apply FutureStaff first-launch defaults

- Status: completed by product commit `abebcbd7ea17926a52c2bc3a4f25543fd85b7860`; no replacement installer has been built.
- Result: `futurestaff-alpha` no longer opens the generic DSH Setup Wizard. The launcher automatically records compatibility mode, ordinary Windows material, disabled plugin market, no browser access, loopback-only networking, enabled desktop notifications, and the completed Setup marker before continuing to the FutureStaff login gate.
- Boundary: only the reserved bundled product Profile receives the automatic policy. Generic DSH Profiles retain the complete interactive Wizard, and authentication, tenant authority, platform model ownership, and credentials are unchanged.
- Verification: focused product Profile/distribution/package tests passed 50/50 with TypeScript typecheck; the complete desktop gate passed with stable 109 files and 1029 tests plus 13 skips, Beta 108 files and 1029 tests plus 13 skips, both 228-node runtime closures, bilingual documents, variants, licenses, and operation reliability.
- Operations: the source was committed locally; no push, installer rebuild or execution, signing, distribution, deployment, or production mutation was performed.

## 抖音画像与模型分析核心（2026-10-03）

- Atomic Task：`tasks/douyin-lead-analysis.md`，契约：`docs/specs/douyin-lead-workflow-v0.2.0.md`。
- 复用 FutureStaff 授权模型，新增 Host-only 分析服务；默认越南签证画像、关键词拆解、逐字证据判定、关注与候选工作区及一次性预约核心。
- 验证：平台模型模块84项、抖音模块38项、根目录55项测试通过；相关类型检查、构建及 diff 检查通过。没有真实推理、外部消息、部署或提交。
- 完成范围仅为核心；界面、持续采集、Host运行装配、周期发送和资格撤销链待后续 Atomic Task，整体获客软件尚未完成。

## DSH 抖音界面与 SQLite（2026-10-03）

- 用户要求界面直接在DSH开发，数据存本地数据库；交付独立 `fs-douyin-ui` 插件、Alpha来源Profile和发行包装配。
- 页面覆盖模型/可编辑画像及示例、关注账号/作品、评论原文证据、候选审核/拒绝联系、一次性预约预览/确认/暂停。数据存独立SQLite、按可信主体隔离；退出或切换主体立即卸载旧页面并取消发送资格。
- 验证：工作区完整类型/测试/构建门通过；最终UI类型/构建及14项Host/数据库/浏览器/Electron、7项React检查通过；平台85项、原抖音核心38项和根目录55项通过。隔离浏览器桌面/移动布局已检查。
- 边界：持续采集/周期发送和真实DOM校准未完成；无真实推理、外部私信、安装包更新、安装或重启、部署、提交或推送。详情见 `tasks/douyin-desktop-ui.md` 与 `docs/specs/douyin-desktop-v0.3.0.md`。

## 抖音界面本机部署（2026-10-03）

- 用户授权部署后，已备份并更新本机FutureStaff Agent 2.0.10的当前Profile，仅部署平台模型和抖音UI插件；软件有序退出后重启。
- 真实桌面验收：抖音获客入口、六个标签、默认越南签证画像加载成功，独立SQLite已创建。当前主体无可用授权模型，AI分析禁用且提示明确。
- 构建产物哈希核对和 `git diff --check` 通过；备份、回滚位置及限制记录于 `tasks/douyin-local-deployment.md`。未运行真实推理/私信、创建安装包、提交或推送；持续采集及真实发送未启用。

## 客户端开发源码换电脑迁移 — 2026-10-10

- `ysq1989/futurestaff-dsh` 已重命名为 `ysq1989/futurestaff-agent`，保留客户端 Git 历史；本次保存既有未提交开发源码、测试、规格和任务文件，未把未完成的业务任务标记完成。
- 新电脑操作见 `docs/development-handoff.md`；须新建检出并拉取两个固定版本子模块，不沿用此前误拉取的平台快照。
- 工作区类型检查、测试和产品构建通过；稳定桌面构建与类型检查通过，114 个测试文件、1101 项测试通过（13 项跳过）；根目录64项测试通过，官方候选引用检查通过。
- 完整 `npm run check` 在稳定/Beta 未声明源码差异处失败，9 个路径及影响已记录于交接说明；未修改门禁以掩盖失败。
- 仅提交与推送开发源码；没有发布安装包、更新运行中的软件、修改用户数据或执行真实外部消息。
## Blue sidebar and unified System directory — locally deployed 2026-10-10

User authorized commit/push/deploy. Source 7be3d57acf99378f5fb84d67efbf7e8a907a9963
pushed to main; only active desktop profile fs-platform-access Client JS/map
replaced with clean committed-source build. 150 tests, typecheck/build, actual
desktop/narrow browser fixture and diff checks passed. Installed renderer verified
brand-blue sidebar, eight system entries and absent legacy selection center.
All 93 other platform plugin files unchanged; GEO/Host/API work excluded. Normal
restart completed with temporary CDP removed. Login confirmation required;
authenticated runtime business operations remain unperformed. Backup/hash receipt:
D:/项目/.codex-build/blue-system-directory-20261010/receipt.json.
Details: tasks/blue-system-directory.md. No public installer/feed update.
## Embedded business pages and Chinese directory — local pilot deployed 2026-10-10

User authorized deployment. Clean source candidate excludes unrelated GEO
browser-authorize/publishing work. Native build/typecheck, 19 focused native
tests, 228-node runtime closure, platform 152 clean tests and isolated Electron
acceptance passed. Full native baseline failures are recorded in the spec.
Local ASAR header/native lib and six platform files replaced; 20,096 other
package files identical. Seven Chinese system entries; internal/duplicate items
removed. User completed desktop login; actual ERP/Visa guests loaded and were
reused across tab/session switches, without external launch cards or stale loading
status. Separate module login stays inside the tab. Final normal restart, no
debug flag. No commit/push, new installer/feed or business execution. Receipt and
rollback: D:/项目/.codex-build/embedded-systems-local-20261010/.

## Shared desktop session renewal — installed 2026-10-11

User authorized backup/update/restart and future same-scope local Agent updates without routine confirmation/notices.
Host access tokens renew before authorization; protected restore refreshes persisted tokens.
Same-owner rotation preserves guest signals; logout/revocation closes them. Native views check every minute
and reload only on session recovery. No credential lifetime, server permission, schema or business operation changed.
Platform 167 tests passed; native focused 9 tests, both typechecks/builds, hidden Electron renewal smoke,
228-node closure and diff hygiene passed. Broader native suite: 1094 passed/19 failed/13 skipped and 2 update-test
unhandled rejections; details in tasks/system-session-renewal.md, not reported as fully passing.
Installed exactly 4 native and 6 platform runtime files; 20,373 other package files preserved.
Six real systems passed matching-member/tenant session checks and no-password entry; same guest IDs survived
manual Host refresh and the next minute check. Final normal restart healthy, temporary debug flag removed.
No commit/push, server deployment, public installer/feed release or business data write.
Backup/hash receipts/rollback: D:/项目/.codex-build/agent-session-renewal-20261011/.

## Neutral Agent workbench frame — locally installed 2026-10-11

User requested another UI refinement; prior same-scope local update authorization applied.
Neutral light/dark sidebar, approved mark and separate current-subject row, semantic line icons,
compact system tabs and integrated refresh reduce the top chrome by 49px. Existing module pages remain authoritative.
Reused semantic controls and tokens; 21st catalog supplied sidebar/tab inspiration, no dependency installed.
167 platform tests, typecheck/build, actual browser light/dark/narrow interactions, zero-finding scoped 21st review
and diff checks passed. Live six-system sessions and native reuse/isolation passed; 46px toolbar and overflow verified.
Only Client JS/map replaced; all 76 other plugin files preserved. Backup, visual receipts and checked rollback:
D:/项目/.codex-build/agent-ui-refinement-20261011/ and final geometry adjustment ...-r2/.
No commit/push, server deployment, business write, profile/data change or native package update.
Details: tasks/workbench-ui-refinement.md.

Same task follow-ups: collapsed navigation uses uniform 36px icon controls, maintains collapsed mode when switching
sessions/systems or opening the account popup, and keeps the version inside that popup instead of a footer row.
Windows main workbench maximizes once before first reveal; later tray reveals preserve user window state.
167 platform tests, 25 focused native startup/window/session tests, both typechecks/builds and closure passed.
Live combined UI verified default 1920px work-area width, 7 compact icons, no overflow and hidden/popup version behavior.
Final Client receipts: .../agent-ui-refinement-20261011-final/; native receipts: .../agent-ui-maximize-20261011/.

Account-popover follow-up: replace blanket guest hiding with actual overlap checks. Expanded menus leave the page
unchanged; collapsed menus reserve their overlapping left edge, restore full width when closed, and escape only
the account-open sidebar's native overflow clip. True modal dialogs retain native guest occlusion.
A coalesced timeout backs up renderer RAF when Windows occlusion suspends animation frames.
167 platform tests include suspended RAF, expanded/collapsed popovers and modal recovery. Native startup/window/session
tests (25), both typechecks/builds, runtime closure and scoped 21st review passed. Real expanded/collapsed popover
viewports and screenshots passed; all six real system sessions passed. Final normal restart removes temporary flags.
Latest Client backups/hashes: D:/项目/.codex-build/agent-ui-complete-20261011/.
Live popup receipts/screenshots: D:/项目/.codex-build/agent-account-overlay-20261011/.

## Login background local installation — 2026-10-12

Completed scoped desktop login visuals and authorized local 3.0.3 login-r2 installation, preserving active production Profile, remembered credentials and 37 session/database files. Internal Profile contract remains 0.1.0; rejected first installer quarantined after correcting its manifest-version mistake. Platform 181, Stable 1117 (13 existing skipped), Windows gate 190, release 7 and Profile 57 tests passed, plus actual Profile consumer and installed UI/data checks. Original CONTRACT_MISMATCH authentication error persists and authenticated business acceptance is not claimed. See tasks/login-background-local-install.md and D:/项目/.codex-build/agent-login-motion-20261012/ for final installer, receipts and rollback.

## Desktop login contract and duplicate title — 2026-10-13

Removed the duplicate signed-out heading and repaired strict v0.1.1 application-list decoding for the validated Website management extension. Installed a scoped plugin hotfix into the current 3.0.3 client; retained Profile contract 0.1.0, active production selection, stored login and 105 persistent files unchanged during installation. Root plugin 207 tests and isolated candidate 191 tests passed. Actual client restored ready/HTTP 200 with the original workspace member/tenant, 8 apps, 1 model, 14 authorized agents and 4 existing session rows. Temporary shape-only probe and debugging flags removed. Exact backups, verified rollback and evidence: D:/项目/.codex-build/agent-login-fix-20261013/. See tasks/login-contract-repair.md. No server changes, messages, migrations, commit or push.

## ERP draft UX, account menu/archive and blue runtime icons — 2026-10-15

Installed the explicitly authorized combined local candidate: 29 artifact hashes verified,
230 unrelated code files preserved. Full plugin regression: 251 passed; build/typecheck,
focused browser journeys and UI review passed. Actual authenticated ERP form reads returned
8 customers and 16 products with HTTP 200; missing price remains blank. Real account popup,
27 archive controls and extracted native blue window icon verified. Final startup is normal,
without debugging flags. No real order or archive operation, server release, commit or push.
Backups, receipts and inventory-retention audit: D:/项目/.codex-build/agent-erp-order-ux-20261015/.
See tasks/erp-order-assistant-ux.md and tasks/sidebar-subject-session-archive.md.

## 2026-10-15 — Local Windows blue-logo repair package

Completed local NSIS rebuild and installation from the current installed runtime,
keeping existing functionality and profile contents. EXE/runtime version aligned
at 3.0.5; live window icon verified blue-only. Installer exit 0; original signed-in
SHOP conversation restored. See `tasks/local-blue-logo-repack.md` for checks,
existing full-suite version assertion mismatch, artifact and rollback evidence.

## 2026-10-15 — SHOP selection sequence and local Host update

Completed the SHOP requirements → real recommendation → human selection → explicit
import request → native preview/confirmation sequence repair. Host rejects empty,
non-user, cancelled, substituted and non-source-ID import requests. Real existing
Shop selections stop at selection and do not offer imports. Local r3 patch installed;
268 plugin tests, typecheck/build, installed hashes and native read-only workflow
verified. Two provider errors remain recorded separately; continuations succeeded.
No real goods imported. See `tasks/shop-selection-workflow.md`.


## 2026-10-15 — SHOP visual recommendation cards and local update

Completed real-image recommendations with price/stock/reasons, native image zoom,
selection-only feedback and persistent turn-tail placement outside collapsed tools.
Host resolves bounded real product IDs and rechecks SHOP identity/permissions.
Final local r3 installed, 28 file hashes verified; pure blue EXE and unrelated code
preserved. Full plugin suite: 275 passed, no failures/skips; typecheck/build, narrow
dark browser checks and 21st review passed. Real native three-product images and
selection-only return verified. One provider error recovered; latency remains outside
this change. No goods imported/published. See `tasks/shop-recommendation-cards.md`.
# 2026-10-16 双仓换机开发交接

- 用户授权：两个目录均保存到独立 GitHub 仓库，并提交、推送现有成果。
- 客户端沿用 `ysq1989/futurestaff-agent`，保留 Git 历史与固定子模块；后端/Web 另建私有 `ysq1989/FutureStaff-Agent-web`，排除敏感历史操作脚本与本机浏览器证据。
- 补充文档导航、克隆与依赖安装步骤、数据/凭据单独迁移清单。保存现有源码、脚本、测试、品牌和分项任务，无功能重写。
- 验证：产品及 Stable 桌面构建、工作区/Stable 类型检查通过；Platform 299、GEO 12、根目录 64、嵌入页面 11 项通过。完整 check 的浏览器超时、桌面差异门禁及 package 版本断言失败均保留，详见 `docs/development-handoff.md`。
- 交付性质：开发源码快照，不是可发布安装包；不部署、不改真实数据或线上凭据。
# 2026-10-16 测试、CI 修复与 Agent 3.0.6 PROD 发布

- 源码 `ee926bbd31e50ebde8ec040d60f5745aaf53b12f` 已提交推送；修复两项真实浏览器测试收尾、过期版本夹具、4 项桌面差异摘要，并补入已核验的 3.0.5 Profile 升级清单。
- 完整 `npm run check` 退出 0：Stable 1119、Beta 1032、根目录 64 项及产品工作区检查通过；两版各 13 项原有条件跳过。Windows 打包专项 190 项及安装包验证通过。
- 3.0.6 独立安装包已公开，完整 HTTPS 下载为 139,957,432 字节，SHA-256 `e24f14d64898422cd52d94cd8b1f13ff989d25b46fd85021455f1d10ca0f0f01`；保留 3.0.5，签名 feed 不变，不修改本机 Profile 或数据库。完整证据见 `tasks/ci-prod-release-20261016.md`。

## 2026-10-17 新目录开发环境与 3.0.6 软件内升级源

- 权威客户端 main 同步至 `D:/项目/FutureStaff/FutureStaff Agent`，根 npm、GEO Web 与桌面 Yarn 依赖安装完成；旧目录仅保留历史来源。纠正最初使用旧本机 2.0.21 快照的版本判断，2.0.22 准备未发布。
- 新增 `npm run desktop:dev`，使用构建 Profile 和独立 Harness/Electron 状态。实际 3.0.6 开发窗口已到登录页。保留原业务数据目录策略，未代登录、迁移或执行业务操作。
- GEO 8 个固定源码恢复 LF 字节并通过原始哈希清单；完整类型、产品测试/构建，以及规范临时目录下的桌面检查分项通过。Stable 1119、Beta 1032、根目录 64 项通过，原平台条件跳过数量未增加。详见 `docs/development-handoff.md`。
- 原 Ed25519 密钥已匹配原信任，现有正式 3.0.6 包及 3.0.5 回退包进入签名 feed。持锁校验旧摘要、备份并原子切换后，外部客户端签名验证、两个包完整下载摘要和缓存策略通过。本机安装版未自动更新。详见 `tasks/in-app-update-306-20261016.md`。
