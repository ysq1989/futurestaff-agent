# FutureStaff Agent

新电脑开发请先阅读[换机交接](docs/development-handoff.md)与[文档导航](docs/README.md)。本仓库只保存桌面客户端；后端/Web 快照另存于私有仓库 `ysq1989/FutureStaff-Agent-web`。

当前源码版本：`3.0.7`。安装版 Profile 启动修复与发布状态见[修复记录](tasks/profile-startup-hotfix-307.md)。下方 3.0 升级说明保留为历史设计背景。

2026-10-17：3.0.7 修复包已发布至现有签名升级源，实际安装版首启到登录页及公网完整下载校验通过，保留 3.0.5 回退包，见上述修复记录。本机后续开发目录为 `D:/项目/FutureStaff/FutureStaff Agent`；安装依赖后运行 `npm run desktop:dev`，开发 Profile 和桌面数据分别保存在该目录 `.dsh/desktop-development`、`.dsh/desktop-dev-user-data`。

## Agent 3.0 升级（2026-10-11）

开发版本 `3.0.0-rc.1`：从平台已授权的持久智能体开始对话，智能体下保留多次会话、知识与本机工作文件。新 Windows 安装的数据根为 `%LOCALAPPDATA%/FutureStaff Agent/`；已有数据路径保持兼容，不自动迁移。

设计与边界见 [升级规格](docs/specs/persistent-agents-v3.md)、[ADR-0019](docs/adr/0019-persistent-agents-and-local-data-root.md) 和 [本地验收及发布条件](docs/specs/persistent-agents-v3-acceptance.md)。源码实现不代表服务器或安装版已更新。

The GitHub repository was renamed from `ysq1989/futurestaff-dsh` to `ysq1989/futurestaff-agent` on 2026-10-10. For a new development computer, read [the development handoff](docs/development-handoff.md). Internal package and Profile names retain their existing identifiers.

FutureStaff's upgrade-friendly extension layer for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). This repository does **not** fork or patch DSH Core. It composes the official Web bundles in a custom Profile and mounts out-of-tree plugins beside them.

## Scope

- **M0:** boot the official DSH Web surface through `futurestaff-alpha`.
- **M1:** mount `fs-core`, expose validated FutureStaff identity context, and standardize Tool execution metadata.
- **M2:** a contract-first Selection Center MCP with four Tools and an isolated provisional HTTP adapter.
- **M2 live path:** direct authenticated Streamable HTTP MCP connection to FutureStaff Product Hub.
- **M3 baseline:** fail-closed single-subject deployment boundary pending a trusted identity gateway.
- **Local Runner foundation:** versioned protocol plus an in-memory cloud Router for trusted binding, presence, dispatch, timeout, and result collection.
- **Authenticated Runner transport:** opt-in loopback WebSocket gateway and a read-only reconnecting Node client.
- **Desktop foundation:** an embedded, security-defaulted FutureStaff desktop shell with an unmodified upstream Harness submodule.
- **Deployment:** server-first Docker image with separate test and production Compose topology.
- **Not in scope:** Vietnam visa business calls, public Runner transport or desktop client, final auth, and billing.

## Quick start

Requirements: Node.js 22+, npm, Corepack/Yarn, and pnpm (DSH uses pnpm for plugin management; `pnpm dlx` also avoids npm's slow prerelease dependency resolution).

```bash
npm install
npm run desktop:install
cp .env.example .env
npm run check
npm run profile:install
npm run profile:dump
npm run dev -- --port 3080 --no-open
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp`. The installer stages the committed Profile under `$DSH_HOME/profiles/futurestaff-alpha`; source files remain in this repository.

If Windows Application Control blocks DSH's native `sharp` module, run the Docker setup on a Docker-capable host. The Profile can still be verified with `npm run profile:dump`.

## Commands

| Command | Purpose |
|---|---|
| `npm run build` | Build the product workspaces and embedded desktop shell |
| `npm run check` | Type-check, test, and build the product and embedded desktop shell |
| `npm run desktop:install` | Install the embedded desktop Yarn workspace immutably |
| `npm run desktop:verify` | Verify the embedded desktop source, product identity, upstream gitlink, and fail-closed defaults |
| `npm run platform:mock:demo` | Open the loopback B01a login, tenant, and authorized-app panel against A's local Mock |
| `npm run platform:mock:smoke` | Exercise the pinned platform Mock without starting the graphical shell |
| `npm run release:profile` | Stage a relocatable, built-only `futurestaff-alpha` Profile for desktop packaging |
| `npm run profile:dump:release` | Compose and inspect the staged release Profile with the pinned local DSH runtime |
| `npm run desktop:stage` | Verify the monorepo and stage the release Profile into the embedded shell's ignored packaging input |
| `npm run installer:windows` | Build and export the unsigned private Windows x64 setup plus SHA-256 sidecar |
| `npm run profile:install` | Stage the custom Profile and install the local FutureStaff plugins |
| `npm run profile:dump` | Print the final composed DSH plugin tree |
| `npm run dev -- --port 3080 --no-open` | Start the FutureStaff Alpha Web Profile |
| `npm run selection:mock` | Start the loopback-only in-memory Selection Center upstream |
| `npm run runner:gateway` | Start the loopback Runner gateway from a binding file |
| `npm run runner:client` | Start the minimal Local Runner from client environment values |
| `npm run runner:enroll` | Generate a local device token and server-side digest binding |

## GEO cloud workspace and local publishing

GEO's System tab uses the current subject's authorized cloud entry. Brand data,
articles and plans stay in cloud GEO; publishing accounts use device-local browser
Profiles. Legacy local GEO data is preserved and its default writable routes are
disabled. The publication SDK is packaged, but the cloud view bridge and actual
Toutiao article driver remain unconnected. See [the GEO module](plugins/fs-geo/README.md).

## Structure

```text
profile/futurestaff-alpha/  Custom Profile source
plugins/fs-core/            Identity context and Tool metadata contract
plugins/fs-platform-access/ B01a Host bridge and Web client for the pinned local platform Mock
plugins/fs-product-hub-ui/  Authorized launcher for the existing Product Hub Web system
mcp/selection-center/       M2 MCP server, schemas, and HTTP adapter
mcp/vietnam-visa/           Future boundary placeholder
mcp/local-runner/            Fixed read-only DSH-to-Gateway MCP adapter
runner/protocol/             Transport-neutral Local Runner v1 contracts
runner/router/               Cloud Router state machine (no public transport)
runner/gateway/              Authenticated WebSocket adapter (opt-in Compose profile)
runner/client/               Minimal read-only Local Runner client
skills/jade-sourcing/       Future skill placeholder
skills/vietnam-visa/        Collector-safe Vietnam visa operating instructions
docs/                       Architecture, acceptance criteria, conventions, ADRs
desktop/                    Pinned desktop-shell and FutureStaff distribution contract
desktop-shell/              Electron host, installer UI, packaging, and read-only Harness submodule
docker/                     Server image, dev/prod Compose, and Nginx example
scripts/                    Profile staging utility
```

The formal Product Hub row is enabled when `PRODUCT_HUB_MCP_URL` and
`PRODUCT_HUB_AGENT_KEY` are configured. It takes precedence over the provisional
Selection Center row, which remains available for isolated local testing. Local
npm commands load `.env` automatically; the mock workflow is documented in
`mcp/selection-center/README.md`.

See [architecture](docs/architecture.md), [M0/M1 acceptance](docs/m0-m1-acceptance.md), [M2 acceptance](docs/m2-acceptance.md), [Runner Router acceptance](docs/runner-router-acceptance.md), and [development conventions](docs/development.md).

Server installation and upgrade commands are in [deployment](docs/deployment.md). The production Compose file never includes the Mock.

## Upgrade policy

The DSH version is pinned in scripts and Docker for reproducibility. Upgrade it deliberately, run `profile:dump`, compare the resulting tree, and run the full check. Do not copy or edit DSH Core files.
