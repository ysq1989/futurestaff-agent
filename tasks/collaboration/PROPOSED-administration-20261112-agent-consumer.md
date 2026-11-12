# 行政六工具：Agent消费端接收回执

2026-11-12；system_id: agent。状态：**本地验证通过，已获提交推送/生产发布授权，等待所属服务就绪；尚未部署、未真实模型调用**。

## 授权与所属

已通过`read_thread`核对来源会话`01a1cf22-18c2-7963-a316-78340a14526e`中真实用户回复“允许协调 Agent 接入（推荐）”，问题点名本会话，由当前Agent唯一写入协调者接行政系统及只读/预览工具。来源[交接](../../../FutureStaff-administration/tasks/collaboration/PROPOSED-administration-20261112-agent-consumer.md)。后续直接读取Platform会话`01a1cead-c568-7183-85c7-21f813c86086`的真人指令（turn `01a1d021-191d-7b30-8226-5d3075e0d634`）：“把行政请假相关改动提交推送并发布上线。”本任务据此扩展到必要消费者源码提交推送与独立Cloud发布，不含真实员工请假、余额或模型付费测试。

root负责消费端接口与总验收；子任务按SDK/Cloud与Mobile测试文件明确分工。Platform及Administration由来源维护者各自唯一写入，本仓不改其源码/数据库。当前APP034发行已完成，其生产后端bundle逐字沿用033；本任务新增行政代码不会进入该已冻结/已发布产物。

## 接收契约

- 唯一业务正文：[ADMINISTRATION_PLATFORM_V1](../../../FutureStaff-platform/docs/contracts/ADMINISTRATION_PLATFORM_V1.md)。生产者/真实专用snapshot及原modelPolicy：[ADMINISTRATION_AGENT_PRODUCER_V1](../../../FutureStaff-platform/docs/contracts/ADMINISTRATION_AGENT_PRODUCER_V1.md)。
- 精确六工具：[机器清单](../../../FutureStaff-platform/docs/contracts/ADMINISTRATION_AGENT_TOOLS_V1.json)。所有desktop路径从Platform origin根`/desktop/v1/administration`开始，不加`/api`；普通真人/内部服务另属`/api/administration/v1`，不能混用channel。
- 准入每次读当前员工context，独立`administration`会话/快照，不能依赖旧apps目录、重标general/混合snapshot，或混入其他系统正文/附件/工具/恢复记录。
- 只读本人context/requests/ledger/policies/operation及确定性preview；无submit/withdraw/decide/manage。仅投影本人绑定结果，模型不得拿confirmation_hash/服务proof/平台凭据。
- 固定Platform `human_confirmation_url`由人主动在普通浏览器打开；不自动提交，不把desktop身份当human。岗位/级别只作上下文；相对日期需员工确认明确日期和时区，当前中国大陆+08内核不扩新时钟协议。

## 进度与依赖

外置设计已读最新来源并形成[实施计划](../../work/mobile-toolbar-sso-20261112/administration-consumer-plan.md)。原计划观察的Platform scope缺口已由所属维护方本地配套，154 passed/1既有skip，尚非生产注册或消费端已完成。

Mobile确认可沿现有动态目录及Markdown外链，无需改生产源码/034壳。新增3项组件行为回归、全套31/31及受控真实bundle浏览器通过：原确认URL初始不跳转/不提交，用户点击精确外链且无Agent凭据，切ERP后旧链接消失。[Mobile回执](../../work/mobile-toolbar-sso-20261112/administration-mobile-qa.md)。这不代替SDK/服务端权限或整条联合验收。

SDK/业务分类/Cloud装配已本地验证。供应商函数名使用[Platform唯一冻结映射](../../../FutureStaff-platform/docs/contracts/ADMINISTRATION_TOOL_WIRE_NAMES_V1.md)，保留canonical六工具和原模型策略，覆盖出入站/历史/未知拒绝及原作用域门禁。Cloud41/41、SDK相关94/94、Mobile31/31通过；无付费供应商调用。生产顺序由来源维护方协调：行政服务与固定双向桥接、Platform迁移/模板/权限就绪后再切换本消费者，App034前端保持。

最终客户端装配、权限/隔离/未知恢复、受控模型及本地联合结果另记[实施任务](../administration-agent-consumer-20261112.md)。本仓通过、两服务通过、本地联合、生产和用户实机均分开记录。中央索引由Platform当前维护者串行关联，本仓不争写。

消费者已按新增授权提交推送`5e185d8507d122c63f0ed294dc30b60b774e37b2`，候选`0.1.0-a52cf521b9b4`在服务器受限断网smoke通过；现网未切换，继续等行政服务与Platform明确ready。新候选保持034前端10项静态资产逐字相同，未重发APK或改Website。源码提交、166项验证、镜像及最终门禁见[消费者发布回执](../../docs/releases/administration-agent-consumer-20261112.md)。原工作目录的无关本地提交和其他工作未推送或清除。
