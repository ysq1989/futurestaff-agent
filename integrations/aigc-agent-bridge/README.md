# AIGC Agent bridge compatibility

2026-11-22，用户明确要求把原 `yingceagent.test.exe` 对应代码迁入 FutureStaff Agent。Agent 拥有这里的兼容服务器及跨仓联调测试；AIGC 仅保留 HTTP 消费适配器和业务侧模型、工具、权限与费用检查。迁移不更改现有 Cloud、桌面、移动端运行入口，不部署新服务或重放模型调用。

## 契约与边界

- 保留现有 v1 HTTP/NDJSON 契约：`GET /healthz`、带服务令牌的 `POST /v1/runs`、`PUT /v1/limit`。原环境名和令牌约束兼容；请求不自动重发，也不回退执行第二份 runtime。
- 服务端代码源于固定上游 `ddcat-ai/open-ai-canvas@39b0ee1736f975627ee85b53c7de78dbb4518be4`（MIT），集中在本目录维护。没有新增客户端可自行指定的租户、模型凭据或业务数据库访问。
- AIGC 的请求内桥接地址/令牌由服务端创建，模型和业务工具仍在 AIGC 授权边界执行。此兼容服务没有因为迁移而获得任何新的 Platform 授权。
- 本次只迁移代码与技术验收的归属；没有注册到已部署 Agent Cloud 或桌面运行器。未来实际启用必须单独完成身份、资源、审批、计费与发布验收。

## 联合验收

`check.py` 从指定 AIGC Git 对象读取两份未改写的消费端源码，或从已固定摘要的发行 manifest 验证它们。测试临时目录和 `futurestaff-agent-contract.test.exe` 均位于本 Agent 仓 `output/`，完成后清理。Go 标准库模块使用原消费端模块名，不添加 Go/Node 依赖；这不是另一份业务源码或 Git worktree。

```powershell
python integrations/aigc-agent-bridge/check.py --aigc-repo '../FutureStaff AIGC' --source-ref <40位Git提交或树> --go <Go路径> --receipt output/aigc-agent-contract.json
```

保留原始令牌拒绝、真实 Node 启动、Go 业务桥工具调用、并发额度更新与健康查询断言。Node 缺失会明确失败。运行时使用合成 runtime，不调用真实模型。AIGC 消费端适配器或 Agent 服务器变更后，交付前必须重跑本联合验收，不能以 AIGC 单仓 `go test ./...` 替代。

跨仓迁移由本次 AIGC 会话按用户明确授权执行。Agent 本机保留副本现有工作不覆盖；新增模块基于已核实的远端 main 独立审查交付。桌面/移动端/Cloud 的既有未提交改动及发布状态不纳入本次提交。
