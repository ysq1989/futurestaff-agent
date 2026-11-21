# 已接收：AIGC Agent bridge 代码与联调归属迁移

2026-11-22，用户明确授权本会话跨仓迁移。当前会话是本迁移新增切片的唯一写入方；既有桌面、移动及Cloud变更保留。

Agent接收 `integrations/aigc-agent-bridge/` 内的兼容服务器和跨仓验收，AIGC保留业务消费适配器、权限与费用执行。原v1 HTTP/NDJSON及令牌合同兼容，没有schema、凭据、模型供应商或生产运行入口变化。消费者源仅以Git对象或固定manifest核验后放入Agent所属临时测试目录，不作为第二份生产源码维护。

Windows实际Go/Node联合验收通过，原始鉴权、工具桥接、额度与健康断言保留；临时程序和目录已清理，真实模型调用0。详见[模块契约与运行方法](../../integrations/aigc-agent-bridge/README.md)及AIGC [迁移提案](../../../FutureStaff%20AIGC/tasks/collaboration/PROPOSED-aigc-20261122-agent-bridge-ownership.md)。

本机main/d6e2728969是保留副本，远端main/4687325d83已核实为新基线；新增切片基于远端main交付，现有本机工作树不更新或覆盖。当前Cloud/桌面/移动包不发布，不冒称笔记本已接收。中央INDEX登记与最终发行的Linux联合证据由所属发布回执接续。
