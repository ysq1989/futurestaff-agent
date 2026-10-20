# 开发文档导航

整理日期：2026-10-16。本仓库是 FutureStaff Agent 桌面客户端；Python 后端/Web 历史快照另存于私有仓库 `ysq1989/FutureStaff-Agent-web`，不能在两份检出之间直接 pull。

| 目的 | 入口 |
| --- | --- |
| 新电脑开始 | [换机开发交接](development-handoff.md)、[项目 README](../README.md) |
| 开发约束 | [开发规范](development.md)、[架构](architecture.md) |
| 桌面底座与子模块 | [桌面基础](desktop-foundation.md) |
| 持久智能体 3.0 | [规格](specs/persistent-agents-v3.md)、[验收边界](specs/persistent-agents-v3-acceptance.md) |
| 业务系统与页面交互 | [交互契约](specs/agent-interaction-v1.md) |
| GEO 云端与本地发布 | [规格](specs/geo-cloud-local-publishing.md)、[插件说明](../plugins/fs-geo/README.md) |
| SHOP 装修工具 | [工具说明](shop-theme-tools.md) |
| 通用视频制作 Agent | [契约](specs/video-production-agent-v1.md)、[制作模块](../plugins/fs-video/README.md) |
| 发布与运行 | [部署说明](deployment.md)、[交接](development-handoff.md)中的验收限制 |
| ADR | [架构决策目录](adr/) |
| 当前与历史开发记录 | [CURRENT](../tasks/CURRENT.md)、[DONE](../tasks/DONE.md)、[分项任务目录](../tasks/) |

`docs/specs/` 保存功能与契约；`docs/adr/` 保存长期架构决策；`tasks/` 保存实施与验收证据。历史任务中的“未授权提交/推送”仅描述当时范围；2026-10-16 用户已授权两仓换机提交与推送，此授权不延伸到部署、发布或真实业务操作。

源码迁移、已安装客户端验收、服务器发布是不同状态。不要根据某次本地测试或历史版本号推断当前安装包、DEV/PROD 已更新。
