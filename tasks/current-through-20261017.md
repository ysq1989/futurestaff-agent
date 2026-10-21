# 历史任务入口：截至 2026-10-17

本页为旧版本的任务状态与授权记录。当前接手入口见 [CURRENT](CURRENT.md)，不要把这里的旧版本号或当时授权限制当成当前状态。

## 3.0.7 安装版启动修复（2026-10-17）

已完成，见 [修复记录](profile-startup-hotfix-307.md)。3.0.6 内置 301 个文件超出启动上限 256，已修复并将同一启动校验纳入打包门禁。3.0.7 安装版实际首启、旧 Profile 数据保留及公网签名、完整下载校验通过；现有升级源现为 3.0.7，保留 3.0.5 回退包。当前源码版本为 3.0.7，后续开发继续使用新目录。以下保留历史发布记录。

## 软件内升级源 3.0.6（2026-10-16）

已完成：2026-10-17 使用找到的原 Ed25519 私钥发布签名 feed，软件内升级源为 3.0.6、回退为 3.0.5。外部签名、两个安装包完整下载摘要与缓存策略通过；未执行本机安装。见 [发布记录](in-app-update-306-20261016.md)。

## 测试与 CI 修复、Agent PROD 交付（2026-10-16）

当前任务见 [记录](ci-prod-release-20261016.md)。用户已授权验证后提交、推送并直接部署 Agent PROD；保留以下历史任务与验收边界。

本任务已完成：完整 check 与 Web CI 通过，3.0.6 手动安装包已上线 PROD，完整下载与摘要核验通过，3.0.5 回退包保留。签名 feed 未切换，没有更新本机运行中的用户安装版。无新增活动实现任务。

## 2026-10-16 换机源码交接

用户已授权保存后端/Web 与桌面客户端到独立 GitHub 仓库，并提交、推送现有开发成果。本仓库继续使用 `ysq1989/futurestaff-agent` 的 main；后端/Web 使用独立私有仓库 `ysq1989/FutureStaff-Agent-web`。本次不执行部署、发布、安装版更新、真实业务操作或数据迁移。范围、排除项和验证见 `docs/development-handoff.md`。

换机文档、源码检查与快照整理已完成；验证记录见 `tasks/DONE.md`。完整检查仍有已记录失败，本次不将历史功能任务重新标记为全部验收完成。推送结果以远端 main 提交核对为准。

下列任务上下文原样保留，其旧提交/推送限制由本次换机授权替代；功能发布与业务验收限制仍然有效。

Agent 3.0 persistent-agent upgrade: see [task](persistent-agents-v3.md),
[specification](../docs/specs/persistent-agents-v3.md), and
[acceptance](../docs/specs/persistent-agents-v3-acceptance.md). Source implementation
and local feature checks are complete; Stable/Beta checks and the source variant
gate now pass. Publication and real-account acceptance remain separate. No commit, push, deployment, installed-app update or real-data migration
is authorized.

## Preserved GEO task context

GEO local desktop migration: see tasks/geo-local-desktop.md and
docs/specs/geo-local-desktop-migration.md. User confirmed DSH login/models and
a peer System entry beside Douyin acquisition. Implementation and isolated checks
are complete for review; no installed app update, release, commit or push authorized.

## Preserved prior task context

System main-area tabs and a DSH-controllable embedded browser are active.
See tasks/system-browser-tabs.md. Prior automatic Douyin acquisition pilot is
deployed, with real-site receiver/receipt acceptance still pending in its own task.
Profile-path repair is applied (tasks/douyin-profile-path-fix.md); system/launcher
repair remains in tasks/system-tab-douyin-launch-fix.md.
Previous blue/white 2.0.21 is published; see tasks/update-sidebar-ui-polish.md.
