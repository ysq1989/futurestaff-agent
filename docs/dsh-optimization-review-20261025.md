# DSH 文档与 FutureStaff Agent 优化评估

日期：2026-10-25（Asia/Shanghai）
状态：研究建议；用户于 2026-10-25 指定先存档、后续再改，本轮不推进实施；不代表安装版或服务器验收。
源码基线：本仓库 `c664e505ed` 加研究开始时已有的工作树变更。

## 结论

目前最值得投入的是补齐平台模型适配、长会话恢复、工具取消和结果表达。DSH 的压缩、计量、子智能体、Goal、工作流等基础能力已经存在；部分能力没有完整接入 FutureStaff 的业务链路，部分能力仍停留在通用运行时层面。

建议先完成 A1—A4，再做任务状态、记忆和委派试点。底座升级单独推进兼容验证，不把所有优化捆绑成一次大迁移。

现有方向应继续保留：产品层 Profile 与树外插件、Platform 权威身份和授权、成员短授权与每次调用重验、业务预览确认、幂等收据、结果未知时不重发写入、安装与历史会话版本固定。DSH 官方也以可替换插件和扩展点组织能力。[官方架构](https://deepseek-harness.github.io/deepseek-harness/reference/)

## 研究范围与证据边界

- 在线阅读官方 quickstart、架构、插件生命周期、工具执行、作用域、审批、压缩、Token 计量、会话投影/持久化/遥测、Slots、Skills、记忆 MCP、Goal、子智能体、工作流、PTC、Schedule 和发布记录。
- 对照当前桌面启动脚本、Profile、锁定上游源码、已安装开发依赖、平台聊天适配器、业务工具、长期员工和 Agent 中心源码。
- 运行了不联网、不写文件的内存探针，使用现有编译模块、stub catalog/auth/secrets 和内存 Response。未读取真实凭据，未调用真实业务或付费模型。
- 没有启动、更新或重启客户端；没有改动业务代码、上游子模块、现有 Profile 或业务数据。本报告是本轮唯一新增文件。
- 源码能力、开发依赖、安装版有效配置、真实业务成功是不同证据层级。本次未重新检查安装包内容、线上配置和原生业务旅程。

## 版本与已有能力

| 层 | 本次核实的事实 | 含义 |
| --- | --- | --- |
| 产品桌面源码 | `desktop-shell/dsh-plugin-desktop/package.json` 为 3.3.0；根 `desktop:dev` 经 `scripts/start-desktop-dev.mjs:10,24-25` 启动该目录的 `lib/main.js` | 这是当前开发启动链路，不能只看另一份 checkout |
| 主链 DSH | 根 `package.json`、桌面依赖、`futurestaff-profile.ts:24` 固定 `0.1.2-rc.1`；上游 gitlink 为 `a66e4702047846cdaa10c66c9d3df3951f5ea70d` | 当前改造首先按这个基线设计 |
| 另一份官方源码 | `official-desktop` 为 `477b4f420553e8a52c2fbccc464d7561b239c443` / `0.1.7-rc.2` | 不能据此认为当前桌面已经升级 |
| 官方发布页 | 本次列首为 2026-10-23 发布的 `0.2.1-rc.3`，标记为预发布 | 它是候选评估对象，不是已经验证可用的替换件 |
| 在线文档 | 本次读取的在线文档没有与本地 pin 绑定 | 每个新 API 都应核实所选 tag 的源码、配置和包，而不能假设发布版与文档完全一致 |

官方版本证据：[0.2.1-rc.3 发布记录](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.3)。

本地 `desktop-shell/deepseek-harness/packages/bundle/base/cordis.patch.yml` 已装配 token-meter、compaction-basic、工具结果裁剪、checkpoint policy、Goal、子智能体和工作流；Web bundle 也已有相关 UI。不能把优化描述为从零添加这些引擎。

本次还核对了开发依赖 `@deepseek-ai/dsh-tools@0.1.2-rc.1` 的类型和实现，已有 `defineTool`、规范输出、`isConcurrencySafe`、`restrict`、`guard`。这些优化不必全部等待升级，但实施前仍需核对实际安装包的对应依赖与签名。

## 建议顺序

成本为相对工程量估计，未作工期承诺；P1 表示下一轮优先，P2 表示随后试点。

| 编号 | 优先级 | 优化 | 直接收益 | 成本/依赖 |
| --- | --- | --- | --- | --- |
| A1 | P1 | 补齐模型容量、超限恢复和真实 usage 协议 | 长会话能继续；用量可诊断 | 中，需要 Platform 与客户端同步契约 |
| A2 | P1 | 贯通工具取消与结果未知状态 | 停止行为可靠，减少悬挂请求 | 小到中，逐服务修复 |
| A3 | P1 | 工具结果瘦身与 schema 对齐 | 降低上下文占用和参数猜测 | 中，可在现有基线分批做 |
| A4 | P1/P2 | 工具 scope 一致性与安全读取并发 | 岗位能力清晰，独立查询更快 | 中，需审计共享状态 |
| A5 | P1/P2 | 员工详情接入业务任务、Goal 和证据 | 用户能看清正在做什么、为何受阻 | 中，需要任务引用契约 |
| A6 | P1/P2 | 受控跨会话记忆检索 | 同一员工持续积累可追溯经验 | 中到大，需要 Platform 权威服务 |
| A7 | P2 | 业务委派与固定工作流试点 | 提升复杂任务的完成质量 | 中到大，先选一个业务案例 |
| A8 | P2 | 区分本机提醒与云端持续调度 | 定时执行状态可信 | 大，涉及 runtime 与调度归属 |
| A9 | P2 | 请求回放与诊断策略 | 更容易解释失败、费用和历史行为 | 中，分清本地证据与上报 |
| A10 | 并行评估 | 底座升级及 Slots 兼容门禁 | 降低版本漂移与后续维护成本 | 大，独立候选与数据副本验收 |

### A1：首先修好平台模型适配层

**现状与执行证据。** `plugins/fs-platform-access/src/contracts.ts:123-130` 的模型目录没有容量信息；`chat.ts:158-170` 的 `listModels/resolveModel` 没有返回 `contextWindow`。内存探针分别检查 `default` 与一个具体 stub 模型的 `resolveModel()`、`prepareCall()`，两者均没有上下文容量。

锁定 DSH 的 `packages/compaction/compaction-basic/src/index.ts:294-304` 通过 `ctx.llm.resolveModelInfo(...).context` 读取容量，缺失则抛配置错误；`:148-165` 的自动监听器记录警告后继续。由此推断，当前 FutureStaff 路由无法满足自动压力压缩的容量前提；这不等于已观察到真实用户长会话失败，也不代表手动压缩全部不可用。

另有两项协议缺口：

1. `chat.ts:358-360` 仅接受 `PROVIDER_UNAVAILABLE` 错误；`:323` 对 413 使用业务限制错误。内存 Response 返回规范上下文溢出码时，实际得到 `FUTURESTAFF_CONTRACT`。锁定 DSH 压缩恢复只处理其规范溢出码，不能将所有 413 都当成可压缩的上下文溢出。
2. `chat.ts:362-365` 的 result 精确字段集合不允许 `usage`，`:391` 直接发送 finish。内存正常响应得到 `block-start,text-delta,block-end,finish`，没有 usage；加上 usage 字段则被拒绝。因此不能由服务端单边增加字段。这里仅证明桌面 DSH 缺真实用量锚点，不说明 Platform 自身缺少账本。

**建议。** 版本化扩展 Platform 模型目录和聊天协议，传递可信上下文容量、输出上限、实际路由模型、规范错误和真实输入/输出/缓存用量。在终止 chunk 前输出 DSH usage。`default` 的容量必须对应当前 Session 实际授权的 Agent 主模型，不可拿租户默认模型或任意最大容量代替；必要时调整路由准备阶段的契约。

仅对确认的上下文溢出进行有界压缩恢复。权限、额度和版本失配继续终止，不通过自动换模型绕过。压缩生成、标题生成等辅助调用要与用户主调用区分计量。

**验收。** 两种不同容量模型分别在正确阈值触发压缩并继续同一任务；明确溢出在历史实际缩减后才重试；无可压缩范围时停止；真实 usage 与平台该请求记录能关联，缺失时标记估算。重启后保留压缩事实、工程和旧日志。

依据：[压缩](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/compaction)、[LLM 流式输出](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/llm-streaming)、[Token 计量](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/token-meter)。

### A2：让“停止”贯通到工具实际工作

**现状。** `system-assistant-tools.ts:92,97,131` 没有接收和传递 `exec.signal`，请求只绑定账号信号与 50 秒期限；`shop-host.ts:30,42-43` 仅在开始前检查调用取消，随后没有向服务传递，尽管声明了 300 秒 timeout。`erp-host.ts:56` 与 `plugins/fs-geo/src/assistant-host.ts:57` 已有传递范式。这是源码中的调用链缺口，尚未实测原生停止延迟。

**建议。** 将调用方 signal 与身份撤销、服务期限合并，传递到 fetch、响应读取、等待和子任务；等待拥有的工作真正结束后再结算。网络取消无法撤销服务端已经接受的副作用：已发出的写请求继续保留“结果待核实”，使用原幂等键/收据查询，不重新提交。

**验收。** 停止后待处理读取及时结束；无继续发起的新请求；取消、账号撤销、超时各有可辨状态；已发送写入不误报撤销或成功，也不自动重发。

依据：[工具取消与协作超时](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/tools)。

### A3：压缩业务结果体积，并让模型看到准确参数

**现状。** `erp.ts:59` 对普通查询把完整 `data` 序列化进 `summary`，`erp-host.ts:46` 又把整个 view 序列化进模型输出，相同业务数据重复出现。`shop-host.ts:29`、`system-assistant-tools.ts:131` 也主要返回全量 JSON。与此同时，`system-assistant-tools.ts:14-37` 的执行校验比 `:124` 暴露给模型的开放 `arguments` 更精确。

**建议。** 模型获得必要字段、真实状态、总数、分页、来源和稳定引用；UI 保留完整数据，详情按需读取。schema 与执行器共享定义，先将少量稳定操作做成明确参数，或使用经模型提供方验证的分支 schema。继续保留商城已有的 `shop_tools → shop_call` 按需发现，不把庞大目录塞进每轮上下文。

规范结果、模型内容和 UI 展示是不同投影；需要回放的关键事实必须进入持久内容/元数据或权威业务收据，不能假设执行期 canonical value 自动保存。

**验收。** 固定 ERP 查询只输出一份必要数据；测量改前改后的请求字节和 token 估算；业务答案、金额、总数及引用保持正确；非法字段在模型 schema 和执行阶段一致拒绝；preview、draft、completed、unknown 不混淆。

依据：[工具输入、规范输出和展示](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/tools)、[工具执行流水线](https://deepseek-harness.github.io/deepseek-harness/reference/tool-execution-pipeline)。

### A4：岗位工具范围一致，独立读取才并发

**现状。** `chat.ts:275-277` 在发送模型请求前过滤工具，各业务服务另有权限验证。这没有证明现有越权；值得完善的是展示、查找、原生调用和嵌套调用的一致性。所查业务工具没有显式声明 `isConcurrencySafe`，开发依赖默认按 exclusive 调度。

**建议。** 在 Agent scope 使用兼容版本的 `tools.restrict`，必要时以 `tools.guard` 保持不可被后续插件重新放行的业务拒绝；保留 Platform 实时授权和服务端校验。岗位允许范围应包括经批准的原生 DSH 工具，不能直接用仅包含业务工具的 recipe 列表覆盖全部工具。

先为确实无副作用、共享状态可交换的独立读取声明并发安全。写入、草稿、预览、网页采集及会更新共享视图状态的调用继续独占。随后再评估 PTC 对大批量只读聚合的价值，PTC 内部调用也必须走相同门禁、取消和审计。

**验收。** 不同岗位看到和可调用的工具一致；直接调用与嵌套调用都拒绝越界；授权撤销即时生效；并发前后结果和归属一致，并记录耗时变化，不预先承诺提速倍数。

依据：[工具限制、guard 和并发](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/tools)、[作用域](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/scope)、[PTC](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/ptc-runtime)。

### A5：长期员工应展示任务状态与完成证据

**现状。** 原生 Goal 引擎已经装配；`agent-host.ts:14-31,113-145` 主要维护真实 Session 与员工快照/授权绑定。所查 Agent 中心尚未把 Goal 状态投影为业务任务视图。员工已安装、会话空闲、模型说“完成”和业务成功是不同状态。

**建议。** 建立业务任务到 `sessionId + goalId` 的引用，显示正在执行、等待输入、等待确认、受阻、暂停、完成，以及完成条件、失败原因和证据入口。Goal 承担同会话推进；长期员工身份、跨设备任务和最终业务结果仍归 Platform 或所属业务系统。设置轮次/预算上限，受阻时不空转。

**验收。** 缺权限或供应商不可用时显示稳定原因并停止续跑；暂停生效；重启后可查看状态和历史证据；任务必须取得对应业务回执或产物才能完成。具体 Goal 字段按选定 runtime 验证。

依据：[同会话目标](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/goal)、[会话投影](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/session-projection)。

### A6：让记忆可检索、有来源、能更新

**现状。** `agents.ts:17-21,104-132` 已投影记忆、Skills 和知识文件；`docs/specs/persistent-agents-v3.md:11-15,28,37` 明确 Platform 权威及本机记忆边界。这不能等同于已实现统一的跨会话检索、冲突处理和遗忘机制。

**建议。** 由 Platform 提供按真实主体、成员、Agent 授权的记忆搜索和明确写入契约。模型遇到相关历史问题时检索，携带来源、时间、版本和适用范围；用户要求记住时形成可审计变更。原始聊天、会话摘要、长期偏好和当前业务事实应有不同来源和更新规则。

DSH 的第三方记忆 MCP 配置是默认关闭的互操作示例，不包含完整记忆产品。若引入提供方，继续使用可替换 adapter，不直接采用全局默认目录作为多租户共享记忆。

**验收。** 会话 A 写入唯一测试事实，会话 B 不复制聊天即可检索并应用；其他主体/成员/Agent 按授权隔离；更新与删除可追踪；旧快照不冒充最新事实。

依据：[记忆 MCP 的职责和验证方法](https://deepseek-harness.github.io/deepseek-harness/guide/mcp-memory)、[Skills](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/skills)。

### A7：先做一个受控委派工作流

**现状。** 当前基线已有 continuable subagent、fork 和工作流 worker-thread。`market.ts:232-236` 安装角色仍复用标准组合。原生子智能体不是另一个已获授权的 Platform 长期员工；目前也没有证据证明它绕过了业务授权。

**建议试点。** 选品主 Agent 将商品参数核查、图片/材料核查分为独立只读任务，子任务返回结构化结论、来源、未知项；主 Agent 汇总并生成草稿。固定角色映射、授权交集、模型范围、并发和委派深度。草稿之后仍使用已有人工确认和所属系统写入。

工作流固化可重复阶段及输入/输出约束，避免每次靠长提示词重新组织；先证明单一业务旅程的收益。实验性 Teams 后置，不用其任务图或提示性 writeScopes 替代业务权限、并发锁和工单权威。

**验收。** 必需分支失败则整体不完成；无证据项保留待审核；取消主任务能终止所属子任务；撤权后拒绝继续；结果质量、耗时和成本均与单 Agent 基线比较。

依据：[子智能体](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/subagent)、[工作流](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/workflow)、[实验性 Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.zh.md)。

### A8：定时提醒必须说明实际执行到哪一步

**版本差异。** 旧 Web bundle 的 `cordis.patch.yml:264-265` 有 ui-schedule；`official-desktop/packages/bundle/web-app/cordis.patch.yml:125-126` 可见 Host schedule 服务。页面存在不足以证明当前主链具备完整调度；需核对候选实际组装。

**建议。** 将到期、已投递 inbox、开始执行、业务成功/失败分开记录。本机 Host 不运行时不能承诺持续调度；全天候和跨设备任务由 Platform 调度、租约与业务幂等承担。定时触发不新增写权限，也不能将投递成功当作执行成功。

**验收。** Asia/Shanghai 规则正确；关闭/重启后的补投行为明确；重复投递不造成重复发布或扣款；失败展示业务错误，沿原任务和原收据恢复。

依据：[Schedule 指南](https://deepseek-harness.github.io/deepseek-harness/guide/schedule)、[宿主级 Schedule](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/schedule)。

### A9：模型请求可复盘，诊断信息有明确策略

**现状。** `chat.ts:95-130` 在 transport 中整理历史和图片窗口，`:275-294` 过滤工具并补充业务提示，`:257` 解析 default 的实际模型。这些模型可见变换位于 adapter 内，增加日志回放和计量一致性的验证成本；不能直接断言所有请求都无法重建。

锁定 base 的 `cordis.patch.yml:168-196` 含默认反馈遥测配置；桌面 `src/profile.ts:1087-1088` 支持环境驱动的禁用 patch。产品模板没有明确声明完整策略。本次没有检查运行态 exporter 或网络流量，不能推断已安装客户端上传过数据。

**建议。** 将业务上下文、工具范围、图片省略等逐步落到兼容的持久事件或纯投影扩展点，transport 专注编码发送。记录 requestId、会话/任务引用、实际模型、阶段、耗时、规范错误与用量；Profile 明确有效诊断模式、端点和脱敏规则。正文导出与常规运行指标分开管理，不保存 bearer 凭据。

**验收。** 日志、插件版本及可访问附件足以解释同一次请求的模型、提示词、工具和图片选择；mock exporter 验证脱敏；断网不阻塞退出；平台调用与桌面失败可用关联 ID 对照。

依据：[架构中的请求重建原则](https://deepseek-harness.github.io/deepseek-harness/reference/)、[遥测](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/session-telemetry)。

### A10：把升级作为独立、可回滚的兼容工程

**现状。** 主链、另一份 checkout 和在线文档至少存在三层版本差异。`client/slot-components.ts:19-42` 会替换已有 entry 的 component，再借临时注册触发刷新；`client/index.tsx:492-548` 多处依赖原 entry 的 locale、priority、id。当前有兼容实现和测试，不应未经候选验证就替换。

**建议。** 建立产品版本、DSH 精确版本/SHA、vendor 包、Profile 契约和插件能力矩阵。在隔离候选中对比最终组装，优先使用所选版本支持的公开 Slots、props 和注册/释放机制，减少依赖上游 entry 的内部形态。保留 pinned upstream 不改的规则，升级 pin 与产品行为改造分开审查。

会话格式迁移和 checkpoint 按目标 tag 的实际实现验证。使用脱敏历史副本做读写、压缩、工具调用后崩溃、恢复和回滚验证；不能直接拿活跃用户 Profile 试升级，也不能假设旧 runtime 能读取新格式。

**验收。** 已有账号、记住密码、主体、项目、会话归属和历史前缀保留；登录门禁、新会话目录、设置、业务窗口、取消和重启均通过安装候选的原生验证；确认更新来源、签名和回滚兼容后才进入发布流程。

依据：[Profile/桌面运行时架构](https://deepseek-harness.github.io/deepseek-harness/reference/)、[Slots](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/slots)、[会话持久化](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/persistence)。

## 实施批次与衡量方法

1. **先接通已有能力。** Platform/client 契约补模型容量、规范错误和 usage；贯通取消；删除重复结果。尽量在当前 runtime 完成，避免同时引入底座迁移。
2. **再把任务做成可验收业务。** 选择一条选品或视频旅程，接 Goal 状态、结果证据、记忆检索，再比较是否值得使用并行读取、子智能体和工作流。
3. **独立验证升级。** 从固定候选 tag 构建兼容矩阵，核对 Schedule、PTC、Slots、Session 格式等变化；未通过安装版与数据保留验证前不更换主链。

每批采用同一组脱敏案例记录：正确完成率、工具参数失败率、耗时、请求 token/字节、取消后残留工作、恢复结果及最终业务证据。建议至少覆盖长会话、真实只读查询、预览与确认、供应商故障、授权撤销、重复请求、重启恢复和跨主体拒绝。已有 `scripts/acceptance/agent-distribution-journey.mjs` 可作为发布/安装旅程基线，但不能替代模型与真实业务验收。

当前没有测得收益百分比、线上故障率或成本节省，不以估计值作为验收结果。
