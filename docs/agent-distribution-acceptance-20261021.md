# 智能体发布与安装改造：本地验收及发布门禁

日期：2026-10-21。候选版本：客户端 3.2.0；分发契约 2.0.0；平台迁移 `202610211000_agent_releases`。

**状态：两端源码与本地隔离业务闭环完成，尚未提交、部署或交付新安装版。完整上线验收未完成。**

## 已实现

- 平台沿用现有 Agent ID、成员/主体与 manage/use 权限，增加不可变版本、草稿摘要校验、幂等发布、停用、审计、授权目录和下载。发布前检查主模型仍在当前主体可用模型池。
- 客户端 Host 校验来源、主体、摘要、大小、资源路径及能力兼容；安装准备完成后原子切换指针，增加能力需确认，支持回滚、卸载和重装。界面使用“智能体中心”，移除旧市场和本地预设入口。
- 新会话固定已安装发布；更新与回滚仅影响后续新会话。聊天、图片、视频、Website、ERP 传递固定版本；ERP 委托签发与消费保留发布版本，当前模型池、业务范围与成员权限继续在线校验。
- 既有目录、会话绑定、工程和记忆不移动、不批量覆盖、不自动发布。已有旧协议会话仍遵循原来的版本检查规则，不伪称自动迁移为发布版本。

## 本地证据

| 检查 | 结果与边界 |
| --- | --- |
| 平台后端受影响回归 | 157 passed、1 skipped；包含桌面身份/发现/模型/聊天/图片/Website/ERP 委托、分发与迁移。跳过项为既有 Windows symlink 创建权限限制。随后新增主模型发布前校验与业务版本测试，相关分发及跨仓闭环 5 passed。 |
| 平台前端 | TypeScript 通过；254 tests passed；Vite 构建通过。 |
| 客户端业务模块 | 最终整套 321 tests passed，包含候选版本兼容检查及两端浏览器用例；根级回归 73 passed；所有工作区 TypeScript 通过。 |
| 迁移 | Alembic 单一 head 正确；生成 PostgreSQL 前向 SQL，无在线数据库连接；在隔离 SQLite 执行本次 upgrade/downgrade，既有哨兵会话数据保留。未在真实 PostgreSQL/DEV 执行迁移。 |
| 跨仓真实 HTTP + SQL + Host | `test_agent_distribution_journey.py` 调用客户端 `scripts/acceptance/agent-distribution-journey.mjs`，实际存储/权限规则、平台接口、Host HTTP 路由与本机文件系统联通。 |
| 浏览器 | Chromium 实际点击平台发布/停用；客户端安装、能力确认、更新、回滚、卸载重装、停用及退出。明暗主题和 520px 宽度无横向溢出。 |
| 候选 Profile | `npm run release:profile` 成功；额外 `verifyReleaseProfile` 验证 355 项资源，`dist/desktop-profile/profiles/futurestaff-alpha/release-manifest.json` 含文件摘要。清单自身 SHA-256 为 `83a4345de4bb003a6f6f48f5ed88c21de58580c54458946d453152bc054b3a64`，回执在 `output/agent-distribution/candidate-receipt.json`。它是待审资源，不是 Windows 安装包，也未覆盖当前运行的 Profile。 |
| 桌面外壳 | 完整检查到稳定版测试：1143 passed、13 skipped、2 failed；其中候选版本断言已同步 3.2.0，单独 package 套件 38 passed。剩余旧测试 `futurestaff-profile.spec.ts` 的 linked-child 在创建文件 symlink 时被 Windows EPERM 阻止，未跳过或削弱断言。完整桌面门禁仍未通过，后续 beta/closure 门禁不可视为已完成。 |

跨仓闭环逐项验证：管理者发布 V1 → 成员安装 → 建立旧会话/工程文件 → 修改草稿但目录仍为 V1 → 发布 V2 → 更新 → 新会话 V2、旧会话 V1 → 回滚不改已有绑定 → 卸载不能创建新会话但旧数据保留 → 重装恢复 → 跨主体拒绝 → use 权限不能发布 → 停用拒绝旧发布 → 重新发布后撤权继续拒绝。工程文件逐字节读回一致。

失败与恢复覆盖：篡改包、外国 Agent、越界资源、版本不兼容、未知能力、取消、准备文件路径被占用、并发更新、跨版本重绑定。旧激活指针不改变，准备失败可重试。没有实际断电试验，不把文件原子替换测试当作物理断电恢复证据。

浏览器截图在本地忽略目录 `output/agent-distribution/`；测试日志为该目录相邻的 `agent-distribution-*.log`。隔离测试使用测试身份、测试模型和临时数据库，没有真实供应商推理或业务系统写操作，不能替代真实环境验收。

## 数据保留与限制

原有 `agents/{id}/workspace` 不迁移。新发布在 `agents/{id}/releases/{hash}/workspace` 使用独立工程，防止新 Skills 改变仍在运行的旧会话；用户从原会话进入旧项目，新版不自动复制旧项目。同版本重装复用原工程。卸载只写安装状态，历史版本、会话及文件都保留。

V1 使用主动检查和显式更新，不做静默自动激活。单个 Host 串行安装；多个独立 Host 同时写同一成员目录不在 V1 支持范围。发布停用阻止分发协议的所有历史版本；旧 1.0/1.1 调用仍遵循既有 Agent 权限与生命周期，不能把“停用发布”误认为撤销 Agent 的全部平台权限。

## 尚需完成的真实验收

1. 授权提交/推送两仓变更，并部署 Platform DEV（含增量表迁移）；保留既有发布根、其他系统资源及会话数据，验证实际 PostgreSQL 权限和迁移。
2. 在可创建文件 symlink 的 Windows 开发/CI 环境补跑桌面门禁；不通过修改产品或跳过断言掩盖权限失败。检查和审阅干净提交后构建 3.2.0 候选安装包，记录 SHA-256。
3. 在 DEV 专用 Agent 上用管理员与成员真实登录，完成创建、配置、发布、安装和真实模型对话；修改与再次发布后，分别验证旧/新会话模型及知识版本。按已授权模块验证图片/视频和业务工具，保留真实请求回执。
4. 安装前后记录当前电脑真实会话与工程清单和摘要；安装候选版后执行旧会话续用、项目打开、回滚、卸载重装、停用/撤权、两主体/两成员隔离。无数据丢失才允许通过。
5. DEV 与安装版全部通过后再申请正式发布；保留 3.1.1 回滚包。回滚应用保留新增表和历史记录，不自动 downgrade，不覆盖共享静态根或删用户数据。

正式安装器脚本 `scripts/stage-desktop-release.mjs` 要求 main 工作树干净；本轮未获提交授权，因此未绕过门禁生成正式安装包。Platform `AGENTS.md` 明确要求提交、推送、部署及迁移执行获显式授权，当前仅完成本地隔离迁移验证。

## 复现入口

- 客户端：`npm run typecheck`；`npm run test -w @futurestaff/fs-platform-access`；`node --test test/*.test.js`；`npm run release:profile`。
- 平台：受影响 `test_desktop*.py`、`test_auth_service_tokens.py`、`test_agent_business_scope_contract.py`、`test_agent_distribution*.py`、`test_erp_agent.py`、`test_erp_desktop_binding.py`；使用独立 `--basetemp`。
- 跨仓：在 Platform 设置 `AGENT_CLIENT_WORKSPACE` 为客户端绝对路径，再运行 `backend/tests/test_agent_distribution_journey.py`。
- 平台 UI：在客户端设置 `AGENT_PLATFORM_WORKSPACE` 为平台绝对路径，再运行 `plugins/fs-platform-access/test/platform-publication-browser.test.js`。不设置另一仓路径时仅该跨仓 UI 用例会明确跳过。
