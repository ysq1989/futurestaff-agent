# 行政六工具：Agent消费端接收回执

2026-11-13；system_id: agent。状态：**已提交推送并生产发布，公网与独立复核通过；员工实机业务待配置后验收，无真实模型调用**。

## 授权与所属

已通过`read_thread`核对来源会话`01a1cf22-18c2-7963-a316-78340a14526e`中真实用户回复“允许协调 Agent 接入（推荐）”，问题点名本会话，由当前Agent唯一写入协调者接行政系统及只读/预览工具。来源[交接](../../../FutureStaff-administration/tasks/collaboration/PROPOSED-administration-20261112-agent-consumer.md)。后续直接读取Platform会话`01a1cead-c568-7183-85c7-21f813c86086`的真人指令（turn `01a1d021-191d-7b30-8226-5d3075e0d634`）：“把行政请假相关改动提交推送并发布上线。”本任务据此扩展到必要消费者源码提交推送与独立Cloud发布，不含真实员工请假、余额或模型付费测试。

root负责消费端接口与总验收；子任务按SDK/Cloud与Mobile测试文件明确分工。Platform及Administration由来源维护者各自唯一写入，本仓不改其源码/数据库。原APP034发行已完成；本任务随后独立更新Cloud后端至a52，保持034前端10项逐字相同，不改原已冻结发行包。

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

消费者源码提交`5e185d8507d122c63f0ed294dc30b60b774e37b2`。行政0.1.0/g1与Platform1.15.1/g130/Schema16明确READY后，13日00:19:40正式切换`0.1.0-a52cf521b9b4`/image`sha256:1e673759bb2a2c5be72b2f46acc280c88165a19bb74cf5571fb3cb0fc97771ef`。27文件实际备份恢复、10加密记录解密及公网精确版本/10静态SHA/实际首页/权限边界和独立复核通过。未重发APK或改Website，无员工/模型操作。源码、166项验证、镜像和使用条件见[正式发布回执](../../docs/releases/administration-agent-consumer-20261112.md)；尚未选用专用Agent或未开通行政的成员不会自动可用。原目录无关提交/其他工作保留，中央索引待Platform维护者关联。
