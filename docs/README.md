# 开发文档导航

整理日期：2026-10-21。当前正式版 **3.2.0**（签名更新源已同步 **3.2.0**，回滚版 **3.1.1**），后续 Agent 开发转到笔记本，台式机负责其他系统。本仓库是桌面客户端；Python 后端/Web 历史快照另存于私有仓库 `ysq1989/FutureStaff-Agent-web`，不能在两份检出之间直接 pull。

| 目的 | 入口 |
| --- | --- |
| 新电脑开始 | [换机开发交接](development-handoff.md)、[项目 README](../README.md) |
| 当前发布及验收 | [3.1.1 交付与笔记本接手](../tasks/agent-laptop-handoff-20261021.md)、[原生视频验收](../tasks/video-native-chat-20261021.md) |
| 开发约束 | [开发规范](development.md)、[架构](architecture.md) |
| 桌面底座与子模块 | [桌面基础](desktop-foundation.md) |
| 持久智能体 3.0 | [规格](specs/persistent-agents-v3.md)、[验收边界](specs/persistent-agents-v3-acceptance.md) |
| 智能体发布与安装中心 | [规格](specs/agent-distribution-v1.md)、[阶段任务](../tasks/agent-distribution-20261021.md)、[本地验收与发布门禁](agent-distribution-acceptance-20261021.md) |
| 业务系统与页面交互 | [交互契约](specs/agent-interaction-v1.md) |
| GEO 云端与本地发布 | [规格](specs/geo-cloud-local-publishing.md)、[插件说明](../plugins/fs-geo/README.md) |
| SHOP 装修工具 | [工具说明](shop-theme-tools.md) |
| 通用视频制作 Agent | [契约](specs/video-production-agent-v1.md)、[制作模块](../plugins/fs-video/README.md) |
| Windows 发布 | [软件内升级](specs/desktop-in-app-updates.md)、[发布契约](specs/desktop-update-publication.md)、[最新交付](../tasks/agent-laptop-handoff-20261021.md) |
| 早期服务端部署 | [Docker 部署说明](deployment.md)，不作为桌面安装包升级指引 |
| 旧换机记录 | [截至 2026-10-17 的交接](development-handoff-20261017.md) |
| ADR | [架构决策目录](adr/) |
| 当前与历史开发记录 | [CURRENT](../tasks/CURRENT.md)、[DONE](../tasks/DONE.md)、[分项任务目录](../tasks/) |

`docs/specs/` 保存功能与契约；`docs/adr/` 保存长期架构决策；`tasks/` 保存实施与验收证据。历史任务中的版本、授权限制和未完成状态只描述当时范围。当前视频交付已获授权并完成发布，具体结果见最新记录；其他系统任务仍按各自记录判断。

源码迁移、已安装客户端验收、服务器发布是不同状态。不要根据某次本地测试或历史版本号推断当前安装包、DEV/PROD 已更新。
