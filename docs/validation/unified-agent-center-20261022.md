# 统一智能体中心

状态：2026-10-22 统一中心源码、最终构建、344 项模块回归及当前安装版验收完成。实机目录为 40 项，系统助手 13 项、通用助手 27 项；项目经理已完成卸载、重新安装、开始原生会话及正常无调试重启验收，最终保留一个已安装项。32 条缺 Platform 本地执行材料的限制继续保留，不表示全 40 条已完成本地适配。

## 用户确认的产品规则

移除“发布包管理”独立入口，统一在智能体中心浏览、安装、更新及卸载。平台人才模板与已发布智能体共享分类、搜索和安装状态筛选；内部继续使用各自 Host 契约。只有本机已安装项可进入新会话，平台已有授权名单不作为未安装时的兜底，旧会话和工程保留。

分类为“全部助手／系统助手／通用助手”，管理筛选为“全部／已安装／可更新”。“全部助手”浏览及搜索所有来源；选定系统助手或通用助手后，搜索与分类取交集，不把另一分类的匹配项挂在当前分类下。“已安装”是安装状态筛选，不是第三种助手分类。

继续复用现有 FutureStaff 浅色、深色 token、语义按钮、卡片及窄屏布局。设置内嵌入口保留全页设置布局及开始对话前关闭设置的行为。本轮不引入新组件库，不重新设计品牌或应用框架。

## 分类依据与能力边界

分类只取模板或发布记录明确的业务系统关联，不依赖当前账号应用数量、名称关键词、描述或兼容性原因。办公、营销、软件开发和交易研究类别本身不代表业务系统助手。

| 权威来源 | 分类依据 |
| --- | --- |
| Platform `backend/app/api/agents.py` 的 `SYSTEM_TEMPLATE_CATEGORY_MODULES` | `erp-system → erp`、`vietnam-visa-system → vietnam_immigration` 归系统助手 |
| Platform `backend/agent_templates/website-designer/meta.yaml` | 精确的 `Web Agent 网站设计师` 与 `software-development` 组合，明确配置 `default_autonomy_policy.business_systems: ["web"]`，归系统助手 |
| Platform `backend/agent_templates/product-selection-specialist/meta.yaml` | 精确的 `Product Selection Specialist` 与 `marketing` 组合，明确配置 `default_autonomy_policy.call_product_hub_api: "L2"`，是货源集市选品助手，归系统助手 |
| Platform `backend/agent_templates/agent-admin/meta.yaml` 与同目录 `soul.md` | 精确的 `Agent管理员` 与 `my-talent` 组合，角色材料明确调用 `call_agent_admin_api` 管理平台数字员工，归系统助手 |
| 当前 Host 安全投影的 `businessSystems`／`module` | 已知业务域明确关联时归系统助手；不据此增加权限 |
| 其他模板或没有明确关联的发布记录 | 归通用助手；未知系统值不扩大分类映射 |

原 desktop recipe 不投影完整自治策略及工具关联，不能擅改 recipe 字段及摘要契约。网站设计师、选品顾问和 Agent 管理员使用上述已核实的 canonical name 与 category 精确兼容映射，并在模型源码中注明来源；相同名称但不同分类、其他网站、营销或软件开发角色不会被关键词推断为系统助手。`business_systems` 不是识别系统关联的唯一来源，权威模板中明确的业务 API 关联同样有效。服装电商上新助手明确配置 `business_systems: []`，仍属于通用助手。

分类是展示信息，不是授权。普通本地模板继续使用当前账号获准的模型和空业务范围，发布智能体保留现有模型、业务范围和版本契约。当前平台目录的 40 条模板中，仅 8 条具备本地安装材料，另外 32 条仍缺 Platform 本地工具、Skills 或连接器材料，继续显示具体原因并禁用安装。本轮未完成“全 40 条均可本地安装”，也未修改或部署 Platform 服务。

## 统一列表与安装生命周期

模板按 `template:<templateId>`、发布智能体按 `published:<agentId>` 保留稳定来源身份。没有平台提供的明确 lineage 映射时，同名记录保留为不同项，不能按名称去重或把旧会话改绑到另一来源。

目录和安装状态属于同一当前成员快照。模板安装数取本机启用项，发布安装数取有效 `installedVersion`；历史保留版本不重复计数。可更新数取“已安装且当前兼容、目录版本变化”的模板，加上“当前可用且 `updateAvailable`”的发布智能体。管理筛选计数先按当前分类和搜索收敛，再计算，保证数字和可见列表口径一致。不同来源独立加载，某一目录失败时保留其他来源结果并显示局部错误。

模板继续使用 `agent-market` 的安装、精确会话打开及软卸载接口；发布智能体继续使用 `agents` 的分发、安装、回滚和卸载协议。发布版本新增能力时保留 Host 的确认流程，未确认不更新；保留版本仍可按既有确认机制回滚。发布权限撤销时，已安装项保持可见但禁用开始对话，不以模板通用聊天绕过权限。

两种来源的成功安装、更新、回滚和卸载均广播安装状态变更，使已挂载的新会话选择器重新读取，而不依赖重挂载。模板开始对话打开 Host 返回的精确 `sessionId`；发布智能体保留原发布版本的会话选择流程。卸载停用新会话入口，保留工程、版本材料及历史会话。

## 回归证据

已完成的源码及隔离浏览器回归包括：

- 先复现旧独立入口、旧分类与安装状态同步问题，再验证一个中心和统一筛选。
- 分类模型 RED 三项失败后 GREEN 三项通过，覆盖显式业务关联、网站设计师精确映射、未知关联回退、应用数量无关和分类内搜索。
- 实机分类核对发现选品顾问与 Agent 管理员漏项后，新增回归先得到一项 RED，再补两条权威材料精确映射，分类模型最终四项 GREEN；服装上新助手及相同名称不同分类继续归通用。
- 模板浏览器生命周期通过：失败不伪装安装成功、安装／更新后计数一致、只有已安装项进入新会话、精确打开 Host 会话、卸载与重装、账号变化取消迟到响应。
- 发布智能体浏览器生命周期通过：安装、能力确认后更新、回滚、卸载与重装、已挂载选择器即时刷新、撤权禁用、旧工程字节保留及设置内开始对话。
- React StrictMode 的 effect 重挂载曾复用已取消的操作控制器；新增浏览器回归先失败再修复，避免后续操作静默失效。卸载后重装曾恢复已完成的卸载确认，亦先以回归复现，再按安装身份变化清理确认状态。
- 浅色、深色及窄屏截图继续由浏览器回归生成，窄屏无横向溢出。

Host 系统元数据投影与三条精确模板映射已合并，最终构建及类型检查通过。`final-classification-tests.log` 的结果为 344 项、343 项通过、0 失败、1 项既有跳过；`final-classification-build.log` 记录对应最终构建。此前 340 项候选日志保留为历史，不作为最终计数。

较早的并发全量运行曾因遗留 headless 测试资源发生超时。核对孤儿进程所用的测试临时 Profile 后，清理了 347 个测试进程及 174 个测试 Profile，没有操作用户浏览器；本轮两条浏览器夹具增加 `Browser.close` 清理，限制并行后最终全量通过。该记录不能替换或掩盖前次失败日志。

## 当前安装版验收

本轮使用实际安装版核对以下流程，截图与 UIA 文本来自原生窗口：

1. 只有统一智能体中心入口，无独立“发布包管理”。真实目录 40 项分为系统助手 13 项、通用助手 27 项；选品顾问、Agent 管理员、Web 网站设计师归系统助手，服装上新助手归通用助手。
2. 在统一中心卸载原有项目经理，“已安装”列表变为 0，新会话候选变为 0。原有对话保留完整，仍可打开。
3. 搜索项目经理并直接下载重装，从卡片“开始对话”直接进入 Host 创建的原生新会话；新会话选择区域只有这一个已安装项目经理。
4. 再次正常退出，以无调试参数启动；启动完成、渲染器健康、调试端口关闭，已安装数保持 1，唯一新会话候选仍为项目经理。设置返回及此前全页布局继续保留。

本轮验收新增的是空会话，没有为验收发起新的 LLM 请求。上一轮 [本机安装验收](talent-local-install-20261022.md) 中的真实角色模型回复作为历史证据保留；本轮验证的是统一管理、精确原生会话打开及数据保留。

实机“可更新”为 0，没有伪造生产新版本。已发布智能体的版本升级、新增能力确认及回滚由隔离浏览器中的完整 Host 生命周期回归证明，不能表述为实机完成了一次生产发布升级。

## 产物与持久数据保留

最终资源应用回执位于 `output/unified-agent-center-20261022/final-classification/installed-resource-receipt.json`，主输出目录的同名旧回执只保留为前次历史。最终资源目录、alpha Profile 与当前成员 Profile 的 236 个平台插件文件及 150 个 GEO 文件逐一一致，待升级工作区数为 0；本轮 ASAR 未改动，壳入口及 ASAR／unpacked 完整性检查通过，全页设置实现保留，GEO 代码未改动。

本轮更新前基线为 1,465 个原文件。只替换资源后，基线文件 0 变化、0 缺失。完成实际操作后，349 个原工程与绑定文件字节不变，63 个原历史文件的原有字节完整保留；其中一个原空会话的 metadata 追加 80 字节，活动会话投影缓存及工作区索引正常更新，共 3 个原业务文件变化。`businessChangesOnlyExpectedSessionMetadata: true` 已通过，不将这些正常变化写成“所有文件字节完全不变”。

记住密码的加密封装、成员选择不变，只有当前会话密文随正常授权刷新；`secretChangesOnlyCurrentSession: true` 通过。5 个缺失项均为浏览器缓存，不涉及业务数据。验收所需的本机安装与空会话正常新增，原工程和历史没有被删除或改绑。

## 证据索引

- [统一界面 RED](../../output/unified-agent-center-20261022/ui-red.log)、[StrictMode RED](../../output/unified-agent-center-20261022/strict-effects-red.log)、[卸载确认残留 RED](../../output/unified-agent-center-20261022/uninstall-confirm-red.log)。
- [模板生命周期定向 GREEN](../../output/unified-agent-center-20261022/templates-focused-final.log)、[最终全量 344 项日志](../../output/unified-agent-center-20261022/final-classification-tests.log)、[最终构建](../../output/unified-agent-center-20261022/final-classification-build.log)。
- 隔离浏览器截图：`output/local-talents-20261022/` 的浅色／深色／窄屏模板截图，以及 `output/agent-distribution/center-*.png` 的发布智能体截图；这些是测试夹具，不是当前安装版截图。
- 实机分类：[系统助手](../../output/unified-agent-center-20261022/system-assistants.png)、[对应 UIA 文本](../../output/unified-agent-center-20261022/system-category-uia.txt)、[通用助手](../../output/unified-agent-center-20261022/general-assistants.png)、[对应 UIA 文本](../../output/unified-agent-center-20261022/general-category-uia.txt)。
- 实机生命周期：[卸载后列表](../../output/unified-agent-center-20261022/uninstalled-list.png)、[卸载后新会话](../../output/unified-agent-center-20261022/uninstalled-choices.png)、[原对话保留](../../output/unified-agent-center-20261022/old-conversation-preserved.png)、[统一中心重装](../../output/unified-agent-center-20261022/reinstalled-in-unified-center.png)、[开始原生会话](../../output/unified-agent-center-20261022/started-conversation.png)、[唯一已安装候选](../../output/unified-agent-center-20261022/installed-only-choices.png)。
- 正常重启：[启动回执](../../output/unified-agent-center-20261022/normal-startup-result.json)、[重启后唯一已安装候选](../../output/unified-agent-center-20261022/normal-restart-installed-choices.png)、[最终统一中心](../../output/unified-agent-center-20261022/final-unified-center.png)。
- 产物与数据：[最终资源应用回执](../../output/unified-agent-center-20261022/final-classification/installed-resource-receipt.json)、[三层资源及 ASAR 核对](../../output/unified-agent-center-20261022/final-artifacts.json)、[资源更新后基线不变](../../output/unified-agent-center-20261022/preservation-after-resource.json)、[最终数据保留汇总](../../output/unified-agent-center-20261022/data-preservation-summary.json)。

任务：[统一智能体中心](../../tasks/unified-agent-center-20261022.md)。本轮源码和本机验收不表示已发布正式安装包、公开更新源或部署 Platform。
