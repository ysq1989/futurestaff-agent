# Agent 3.0 本地验收与发行条件

2026-10-11。开发版本 `3.0.0-rc.1`。源码在客户端 `D:/项目/FutureStaff-Agent-client` 和平台 `D:/项目/FutureStaff-platform`；当前任务目录 `D:/项目/FutureStaff Agent` 为旧平台快照，未作为客户端修改。两仓均保持 `main`，保留之前的系统嵌入/SSO、GEO、UI、商城、身份等工作；没有提交、推送、部署、安装版更新或真实数据迁移。

## 已验证的功能

平台已有智能体授权目录 → 受限知识快照 → Host 持久目录和命名原生工作区 → 桌面选择 → 多次原生会话 → 首次消息前从 Host SessionStore 校验归属 → 服务端重新授权、版本校验和上下文注入。审计仅保存 ID/版本，不保存知识内容。旧目录与未绑定旧会话保留。

真实 Edge 浏览器使用合成 Agent 和模拟平台服务，覆盖：两智能体会话独立、重选不丢本机文件、重建 Store 后恢复归属、旧工作区入口、390px 无横向溢出、选择弹窗焦点/Escape、退出登录取消未完成选择。截图在忽略的 `work/persistent-agents-v3/selector-narrow.png`。这是本地业务路径验收，不是已部署平台或安装版的验收。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| `npm run test -w @futurestaff/fs-platform-access`（含构建） | 176 通过，0 跳过；目录、Host HTTP、隔离、归属、聊天与真实浏览器 |
| `npm run typecheck -w @futurestaff/fs-platform-access` | 通过 |
| 平台 pytest：desktop_agents、desktop_chat、desktop_templates、agent_visibility、agent_permissions、desktop_auth_api | 79 通过；设置 `DSH_CONTRACT_TEST_ROOT` 执行实际 DSH 流消费测试，无跳过；包含知识与工具定义的完整额度预留检查 |
| 平台 Ruff：新增/修改 API 与测试 | 通过 |
| `node --test test/*.test.js` | 64 通过；包含发行 Profile 布局及完整性检查 |
| Stable 桌面 typecheck 与 build | 通过 |
| Stable / Beta 桌面全套测试 | 1116 / 1032 通过，各 13 项原有平台条件跳过；本轮未新增跳过 |
| `npm run check:desktop` | 最终整条命令退出码 0；Stable/Beta 的 build/typecheck/test/closure/CLI/Loader/Profile/license/operations 均通过，社区 Market 261 项通过；布局与 127 共享源码/14 产品差异检查通过 |
| 门禁与 Node 工具入口回归 | 7 通过（差异契约 5、Unicode 工具入口 2） |
| 本次外壳目录与版本/更新目标测试 | 9 通过（2 个数据根测试与 7 个版本/更新目标测试） |
| GEO build、typecheck | 通过；只调整生成声明目录及 types 入口，修复发行 Profile 将 `publisher-types/src/*.d.ts` 当开发源的阻塞 |
| 两仓 `git diff --check` | 通过；Git 的既有 LF/CRLF 提示不是检查失败 |

平台测试用现有 Python 虚拟环境运行真实平台源码；默认 pytest 临时根存在 Windows 访问拒绝，改用新随机 `--basetemp` 后通过，未调整用户目录权限。测试有 25 条既有 Pydantic/FastAPI 弃用警告。

## 2026-10-11 继续开发：已解决的扩大检查问题

上一轮 Stable 全套为 1102 通过、13 失败、13 跳过。本轮已清除这 13 个失败：3 个运行时夹具改为当前产品版本；10 个链接测试在 Windows 使用真实 junction/reparse point，Linux/macOS 仍使用 symlink，保留拒绝链接和外部目标不被改写的原断言，没有增加跳过。相同测试兼容修正同步给 Beta。

14 个 Stable/Beta 差异已逐项核对，属于 FutureStaff 更新界面、产品图标、受控模块窗口及授权系统视图。登记在 `desktop-shell/futurestaff-desktop-variants.json`，每项记录原因及两侧规范化 LF 后的 SHA-256（缺失侧必须为 null）。检查继续拒绝未声明差异；已登记文件一旦变化或 Beta 意外新增同名文件也会拒绝。5 项回归覆盖哈希变更、缺失侧变化、路径穿越/重复声明、换行兼容和过期声明。127 个共享源码对齐，14 项产品差异哈希匹配，完整布局检查通过。

扩大 CLI 冒烟时发现中文路径乱码。Windows `node`/`pnpm`/`dsh` 批处理入口现在临时采用 UTF-8，随后恢复调用前的代码页，并保留子进程退出码；公共运行时修正同时应用于 Stable/Beta。新增真实 Windows 测试覆盖中文目录/入口、命令参数、代码页恢复及失败退出码。构建工具通过受限的 Node CLI 启动器直接运行，避免包管理器 `.cmd` 包装乱码；2 项回归验证 Unicode 路径、原样参数和退出码。

最初一次 CLI 冒烟缺少 `DSH_HOME` 隔离，日志显示在 `C:/Users/10089/.dsh/profiles/desktop` 初始化了默认 Profile。本轮没有删除或覆盖该目录。随后两版冒烟改为临时 Harness home 和独立 pnpm runtime；新冒烟通过，不再使用用户默认 Profile。此问题不应被写成“所有测试从未触及用户目录”。

本轮 Stable 全套 1116 通过、Beta 全套 1032 通过，各 13 项原有平台条件跳过。最终完整 `npm run check:desktop` 以退出码 0 完成两版 build/typecheck/test/全部运行检查。首次 Beta 测试因 Electron 二进制缺失而自动下载超过测试时限，依赖就绪后完整重跑通过，未放宽测试超时或跳过该测试。最终日志在忽略目录 `work/persistent-agents-v3/desktop-final-check.log`。

## 发布和回退要求

2026-10-16 复核：既有 `electron-runtime.ts`、`electron-shell-generation.ts`、`runtime.ts` 和 `system-views.ts` 的产品差异增加了 Host 专用 Shop 会话代理与限定图片 CDN 支持。核对了固定端点/POST 限制、主进程能力归属、身份撤销及私网限制测试后，只更新这 4 项 Stable 摘要；Beta 摘要、14 项总数及未知差异拒绝规则保持。新发布基线是线上手动安装包 3.0.5，其完整摘要及 134 个代码文件清单已纳入 3.0.6 受控升级配置；真实用户自定义文件仍保留。结果见 `tasks/ci-prod-release-20261016.md`。

1. 完整 Stable/Beta 开发门禁通过后，获得提交、推送及目标环境发布授权；保留原校验强度。
2. 平台先发布新兼容接口，再验收客户端安装包；仅变更源码不算线上可用。
3. 用真实授权用户检查私有 Agent、跨主体、撤权、知识更新、新建/恢复会话和本机文件保留。实际云端专属工具没有新增执行适配，必须如实显示。
4. 本轮无 Schema 变更，无迁移；不移动旧用户数据。回退保留原安装包和原路径，新根数据保留，不让旧程序误写新归属记录。

本轮不新增共享记忆自动写回、云端会话同步、任意脚本下载执行或可点击数据迁移功能。它们需要各自受控契约和验收，不能从缓存 Skills 推定已实现。
# 2026-10-21 private video preview review

The product shell opens exact Host-issued `/_futurestaff/video/asset/<48hex>` links on its current loopback carrier in an owned native window. It reuses the authenticated Electron session and registers its renderer before loading; the existing access-header interceptor still strips credentials from other origins. External navigation, redirects, webviews and new windows are blocked. Closing the window, a failed load and shell-generation disposal remove renderer membership. The ordinary-browser access policy is unchanged. The source changes and tests were independently reviewed; native MP4 playback remains part of the coffee-case GUI acceptance recorded in `tasks/video-native-chat-20261021.md`.

