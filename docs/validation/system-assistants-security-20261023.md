# 系统助手、本机交付与执行安全验证 — 2026-10-23

后续更新：用户已明确货源系统助手只按主体开通与成员权限授权，不额外要求团队套餐。Hub 1.13.6、Platform 1.13.7 已按 DEV→PROD 发布，实际安装版新会话商品查询成功。以下套餐拒绝及旧版本内容保留为本轮早期历史记录；当前结果以[后续验收记录](../../output/hub-system-entitlement-20261023/README.md)为准。

状态：服务器 DEV→PROD、当前实际安装版、最终普通重启及原数据保留验收完成。五个系统助手已安装，原项目经理版本保留；新会话仅显示这六个本机角色。本文区分服务器临时成员测试租约与用户实际登录客户端验收。没有修改订阅、关闭杀软或通过静态密钥替代成员授权。

## 已完成的边界

智能体中心保持单一入口和系统／通用分类。系统助手按当前主体的权威应用授权显示，执行时继续校验当前成员、主体、模板、已安装版本、所需系统及工具；不能仅依赖页面隐藏。只有本机已安装的助手进入新会话选择，原工程、绑定和历史继续保留。设置页的整页布局、独立滚动和返回焦点修复继续保留。

新的 0.3 目录材料包含受管 Skills、工具及系统关联。安装本地角色不创建影子用户或平台 backing Agent，不给普通角色附加业务系统权限。系统工具通过当前桌面成员的短期授权调用各系统自己的服务，业务所有权、套餐、审核和人工确认仍由所属系统执行。

| 层面 | 已验证结果 | 实际边界 |
| --- | --- | --- |
| Platform 授权 | DEV／PROD 1.13.5 的真实数据库成员 HTTP 探测通过：0.3 目录、短期授权、错误 audience 拒绝、管理只读查询及撤销后拒绝 | 不是用户本人正常登录或安装客户端全流程验收 |
| Platform 执行隔离 | DEV generation 74／schema 16、PROD generation 70／schema 10 均为 1.13.6；Docker API／worker 与既有 legacy 的真实隔离验证通过 | Docker 服务身份 `1000:1000` 与既有 legacy 的 `0:0` 分开记录，不能概括为所有服务均非 root |
| Product Hub | DEV／PROD 已按各自实际 API 镜像发布 1.13.5，原容器保留用于回滚；DEV 真实只读成功 | PROD 按原套餐准入条件拒绝，不能声称受限商品读取成功或绕过套餐 |
| Agent 界面与说明 | 最终 picker 版插件 383 项测试：382 通过、0 失败、1 项既有跳过；类型检查、构建与独立评审通过。最终普通启动、六角色原生截图及真实套餐中文提示均通过 | 未重新发布公开 Windows 安装器或更新 feed；当前安装目录的受管资源已更新 |
| ERP 实际安装版 | 安装成功，实际会话执行 `erp_query` 3 次并返回真实业务视图 | 不扩大为 ERP 写操作或全部业务流程验收；早先只有已安装 2 个角色的证据属于额外安装前状态 |

## Product Hub：真实执行与套餐边界

Hub 保留旧 RS256 DesktopContext 与既有 Agent Key 消费方式。新增成员凭证每次请求都向固定 Platform 来源重新核验当前会话、成员、主体、应用和权限，校验环境、audience、模板及最长 60 秒有效期；不缓存授权，不伪造 Agent Key，不放宽现有 team-tier Agent API 条件。

两个环境的候选分别从各自实际运行镜像派生。完整 `/app` 差异只有四个授权／业务文件与一个已批准的版本元数据文件；入口文件从各环境自己的基线应用最小版本改动，保留 DEV 原路由和 PROD Website 路由。精确候选完整测试为 DEV 300 项通过、PROD 310 项通过及 2 项既有 opt-in PostgreSQL 跳过；独立评审中的同步数据库阻塞问题已修复。环境、同级 Hub 容器和 Schema 保持，未执行迁移，原 API 容器停止后保留用于回滚。

DEV 使用真实数据库中的现有成员签发临时桌面测试租约，凭据仅在 Platform API 进程内存中使用，最终撤销。真实 HTTPS 链路验证了成员／主体／模板一致，并完成商品、当前成员货池和模板的授权只读访问；Streamable HTTP 初始化、通知及 UUID 请求 ID 正常。不支持的模板写能力在业务服务前被拒绝，没有创建货池、草稿或发布数据。自然等待授权过期后返回 401；重新签发有效授权可访问，撤销本次桌面租约后下一请求立即返回 401。原用户会话未受影响。

PROD 的真实 Platform 成员核验通过，但 Hub 返回 `403 / MEMBERSHIP_TIER_REQUIRED / requiredTier: team`。只读验收确认当前测试主体不满足原有套餐准入条件，因此没有将受限读取计作成功。具体主体及订阅状态仅存私有验收记录。未修改或伪造订阅。真实验收证明：有效授权受到原套餐规则拒绝，60 秒授权自然过期后为 401，新的有效授权仍为准确的套餐 403，撤销本次临时桌面租约后下一请求为 401，finally 清理完成。`businessReadSucceeded: false` 已写入生产回执。

实际 API 的内部 `/api/version`、health 和 OpenAPI 为 1.13.5。公开 `/api/product-hub/mcp` 可达并拒绝无凭据请求；公开根路径 `/api/version` 不在既有 Web 代理范围内，仍返回 404，本轮没有为此修改 Web 路由。成员工具仅提供真实可支持的商品／本人货池／模板读取及受控私有选品草稿；未建模的模板生成、自动 H5 审核和发布仍不开放。

证据位于独立 Hub 仓的 [发布清单](../../../futurestaff-product-hub/output/desktop-member-grant-20261022/release-ready.md)、[DEV HTTP 回执](../../../futurestaff-product-hub/output/desktop-member-grant-20261022/dev-member-http-acceptance.json)、[PROD HTTP 回执](../../../futurestaff-product-hub/output/desktop-member-grant-20261022/prod-member-http-acceptance.json) 和两环境 activation receipt。回执不含凭据或业务对象明细。

## 实际安装版的系统工具与设置页

以下来自上轮已正常启动的实际安装客户端及当前已登录成员，使用独立验收会话；不是服务器临时成员租约或 mock 工具。详见 [安装版 Host 回执](../../output/system-assistants-final-install-20261023/installed-host-acceptance.json)。没有请求业务写入，也没有删除原会话或工程。

| 系统角色 | 实际原生工具 | 调用与结果 |
| --- | --- | --- |
| ERP | `erp_query` | 3 次，客户、销售订单及库存查询返回真实业务视图 |
| 货源集市 | `call_product_hub_api` 的 `products_search` | 1 次，准确返回套餐限制与固定中文，未重试，商品读取未成功 |
| Agent 管理 | `call_agent_admin_api` 的 `GET /templates` | 1 次成功，返回当前可见 32 项模板 |
| 网站 | `website_tools` | 1 次，连接 `connected`，返回 39 项真实注册工具；没有发布网站 |
| 越南签证 | `visa_query` 的 `permissions` | 1 次成功，未创建、提交或支付案件 |

5 个系统助手和原项目经理共 6 个角色均已安装。系统助手可更新数为 0；项目经理显示 1 项可更新，但本轮保留其已有版本，没有自动更新。早先 [仅已安装两角色的选择器证明](../../output/system-assistants-security-20261023/screenshots/installed-only-selector.txt) 发生在后续四个系统角色安装前，不能当作最终六角色截图。

真实截图：[Hub 套餐中文说明](../../output/system-assistants-final-install-20261023/screenshots/hub-membership-limit.png)、[网站工具连接](../../output/system-assistants-final-install-20261023/screenshots/web-read-capabilities.png)、[签证权限读取](../../output/system-assistants-final-install-20261023/screenshots/visa-read-permissions.png)。这些只读入口的成功不等于全部工具或写入流程已验收。

设置页也已在该安装版真实交互验证：标题栏下方整页布局、无背景遮罩，分类保留 FutureStaff／Agent 市场／通用设置，隐藏 Agent 预设；切换分类正常，右侧独立滚动时左栏和工具栏固定。返回保留管理助手只读会话，恢复入口后按 Enter 可重新打开。证据：[交互回执](../../output/system-assistants-final-install-20261023/settings-interaction.json)、[整页设置](../../output/system-assistants-final-install-20261023/screenshots/settings-full-page.png)、[独立滚动](../../output/system-assistants-final-install-20261023/screenshots/settings-independent-scroll.png)、[通用设置](../../output/system-assistants-final-install-20261023/screenshots/settings-general.png)。

## 越南签证独立服务发布

独立 Visa API／worker 的 DEV-new 和 PROD 均已发布 2.1.5，版本与健康接口实证通过。两环境现有成员短租约经真实 Platform 授权后，权限、案件列表、实际案件、进度、事件及材料选项／默认值 7 个 GET 均为 200；未授权操作被 403 拒绝，生产真实跨主体案件为 404，错误 audience／跨环境与撤销后下一请求为 401。两环境 34 张领域表的摘要／计数保持，没有修改业务记录、Schema、静态密钥或相邻服务。

服务器探测凭据只留进程内存，finally 撤销测试租约；没有伪造本地岗位或 owned-scope 数据。DEV 缺少普通本地岗位成员／跨主体案件的现存 fixture，生产现有授权均为 all scope，相关 owned 过滤由定向回归补充，不能把未存在的真实 fixture 写成已验。该服务器发布验收与上面实际安装版 `visa_query permissions` 是两份独立证据。详见独立仓 [最终验收报告](../../../futurestaff-vietnam-visa/output/desktop-member-visa-20261023/FINAL_ACCEPTANCE.md) 与 [发布汇总](../../../futurestaff-vietnam-visa/output/desktop-member-visa-20261023/final-release-summary.json)。

## 客户端错误可理解性与界面

旧客户端在 HTTP 非成功响应时丢弃错误正文，统一变成 `SYSTEM_ASSISTANT_REQUEST_DENIED`；MCP 的工具失败也只剩笼统错误，因此无法解释生产 Hub 的真实套餐条件。

本轮仅修改成员 MCP 消费与系统工具桥接的两个源码文件。错误读取上限为 16 KiB，只有货源集市请求中明确的 `403 + MEMBERSHIP_TIER_REQUIRED + requiredTier=team` 被映射为固定中文：

> 当前主体的货源集市套餐尚未开通智能体 API（需团队套餐），请在货源集市检查套餐。 [MEMBERSHIP_TIER_REQUIRED]

错误继续保留本地固定的 code 与 requiredTier。服务端任意 message、token 或其他正文不回显；未知错误、错误套餐值、错误状态和非 Hub 系统继续使用通用拒绝。MCP HTTP 200 的 `isError` 同样受严格白名单约束；不重试、不放宽授权、不改变套餐。

回归先复现三条提示丢失路径，再修复通过；另先复现签证错误冒领 Hub 套餐提示，再限定系统修复。该版完整插件测试 381 通过、1 项既有跳过，类型检查与构建通过，独立只读评审无阻断。实际安装版已出现正确套餐中文和错误码，见上方原生截图。先前分类／筛选选中态、主要按钮 disabled／hover／focus 的可见性修复继续保留。

随后实际 UI 又发现新会话卡片仍引用安装材料中的旧系统 description，而中心使用的能力列表已经正确。最终修复只作用于 `client/agents.tsx` 的显示分支：本地角色的 tools 非空且 requiredApplications 非空时，固定显示“使用已适配的本机工具处理系统业务；能力以当前成员授权、系统套餐和人工确认为准。”名称沿用译名，通用项目经理、旧无 tools 路径、发布包描述与禁用原因保持；没有改 recipe、preset、版本、后端或运行授权。

该展示修复先在真实浏览器 Home 复现旧 H5／全员管理／网签支付承诺，再于 Home 与 modal picker 同时验证通过，测试还确认没有 POST 或原角色对象变化。最终完整插件为 383 项、382 通过、0 失败、1 项既有跳过，类型检查、构建及独立评审通过。相对上一冻结版仅四个 client JavaScript／map 产物变化，所有 Host、工具与授权库同字节。[最终重启后的原生六角色截图](../../output/system-assistants-delivery-20261023/screenshots/installed-only-six-after-restart.png)确认新文案已在实际安装版生效。

中心卡片的 `compatible` 证明材料与客户端能力匹配，当前应用开通状态也不等于 Hub team 套餐。本文不把“可下载安装”写成商业套餐已开通；若后续增加动态套餐提示或禁用状态，必须来自 Hub 权威结果，不能根据 Platform 应用列表猜测。

证据：错误说明版的 [冻结清单](../../output/system-assistant-entitlement-final-20261023/manifest.json) 与 [独立评审](../../output/system-assistant-entitlement-final-20261023/review.json)；最终选择卡片版的 [冻结清单](../../output/system-assistant-picker-final-20261023/manifest.json) 与 [完整插件测试](../../output/system-assistant-picker-final-20261023/full-plugin-tests.log)。冻结库共 248 项，源码子任务没有自行安装或修改 Profile，实际替换由根任务执行。

## 安装资源、GEO 与数据保留

上轮安装 manifest `ed1ed0cea94aff1fc87b4df3596ba20ce2f98b172d96934e7d281676a0c7e79a` 已完成普通启动 healthy 和上述真实工具／设置页验收，248 项平台库三处一致，256 项无关资源、ASAR 与 150 项 GEO 保持。

最终 manifest 为 `7587111a6e16a7a4ea05302a89b35c20cf23826eb3ff4686498fffb2084a7dc0`，已实际安装并完成独立普通重启。renderer healthy，调试端口关闭，六个角色安装状态保持；[启动回执](../../output/system-assistants-delivery-20261023/normal-startup-result.json)保存本轮原始 lifecycle 快照摘要。启动后 [产物校验](../../output/system-assistants-delivery-20261023/artifact-verification.json)确认 248 项库在安装资源、alpha、当前成员三处一致，150 项 GEO 未变、ASAR 完整、工作区升级待处理为零。系统分类全部 5／已安装 5／可更新 0；原项目经理保留旧版本，因此全目录仍有 1 项可更新。

最终[原 1480 项数据保留检查](../../output/system-assistants-delivery-20261023/original-data-preservation.json)通过：354 个原工程／绑定文件保持原字节，64 份原历史的消息内容完整，记住密码加密文件、身份、主体选择和原项目经理安装文件保持。一个旧 Web 会话在首次正常重载时追加了 82 字节的空 `session/end-seed` 标记，其原压缩前缀、665 条业务事件和全部非该标记事件摘要相同；对应 projection 只移动游标，未修改内容。因此报告如实记录历史整文件并非全部字节相同，没有使用通用 prefix 豁免。[逐项最终审计](../../output/system-assistants-final-install-20261023/final-original1480-metadata-audit.json)还证明工作区索引仅增加五个本次只读验收会话的工作区，移除这些明确新增记录后精确恢复原摘要。只允许当前登录会话凭据正常刷新；没有重置账号或保存密码。

证据：上轮 [候选回执](../../output/system-assistants-final-install-20261023/candidate-receipt.json) 与 [安装资源回执](../../output/system-assistants-final-install-20261023/installed-resource-receipt.json)；最终 [候选回执](../../output/system-assistants-delivery-20261023/candidate-receipt.json) 与 [实际资源回执](../../output/system-assistants-delivery-20261023/installed-resource-receipt.json)。本轮没有 commit、push 或公开安装器／feed 发布；服务器和当前安装目录的实际交付边界均已验证。

## Platform 执行隔离与杀软结论

Platform 的执行器修复与杀软样本裁决是两件事。根任务最终确认 DEV generation 74／schema 16、PROD generation 70／schema 10 的 1.13.6 发布完成。Docker 实际 API／worker 以 `1000:1000` 运行，脱敏回执记录冷启动离线 venv、pip 与 wrapper 保留、服务环境缺失、宿主 witness 不可见、独立网络命名空间和脚本清理均通过；每个被测角色的安全回归为 44 项通过。Docker 回执明确 `nodeAvailable: false`，不能声称其镜像已包含 Node 正常执行能力。Schema 与非目标容器保持。

两环境既有 legacy 服务随后完成真实 post-deployment 验证，Python、Bash、Node 与冷启动 pip／wrapper 均通过，同样确认执行环境不继承服务环境、宿主 witness 不可见、网络命名空间独立和脚本清理。legacy 回执中的服务身份为原配置 `0:0`，没有在本轮变更为 `1000:1000`；其隔离结果不能用服务 UID 的概括替代。

初次 guard 的子进程调用了父 class 入口，未自动执行新增的 legacy probe。根任务已修正未来 runner 的本地入口，并以独立 `verify-live` 补齐两份实际 legacy 验收回执；本报告以补验 JSON 为证据，未把最初 guard 当作 legacy 实证，也未为补验重启或修改运行态。此前首次下载时尚未生成的 legacy 文件现已补齐，仅下载原白名单 JSON。

原告警针对 Python 编译缓存，检测名为 `Trojan/Python.ShellLoader.am`。只读核查确认了源码 Git 来源和导入测试可重新生成缓存的链路；缓存头匹配不是安全签名。更强的缓存正文与源码内存编译比对未完成，在缓存读取错误后已停止，没有执行缓存代码、反序列化缓存或写出样本。没有发现限定审查范围内的恶意加载链，不等于排除全部恶意或供应链风险。

本轮未恢复样本、禁用杀软、添加排除或上传源码／缓存。原截图不能写成“已确认误报”，未取得厂商裁决。后续执行隔离修复通过也不改变这一结论。历史审计见 [只读告警报告](../../output/security-agent-tools-20261022/read-only-audit.md)，其中时间相关的“尚未发布”是 2026-10-22 当时状态，由本报告及根任务最终服务器回执补充。

## 已收集的脱敏服务器证据

仅下载以下明确允许的 JSON 到 [server-evidence](../../output/system-assistants-final-install-20261023/server-evidence)，没有下载 private state、凭据或发布 manifest：

- `dev-seed-1.13.6-r5-acceptance.json`、`dev-seed-1.13.6-r5-verification.json`。
- `prod-seed-1.13.6-r5-acceptance.json`、`prod-seed-1.13.6-r5-verification.json`。
- `dev-desktop-1.13.5-r3-current-db-http-probe.json`、`prod-desktop-1.13.5-r3-current-db-http-probe.json`。
- `dev-seed-1.13.6-r5-legacy-live-acceptance.json`、`prod-seed-1.13.6-r5-legacy-live-acceptance.json`；首次未生成，根任务补验后现已取得，没有扩大读取范围。

## 最终回执索引

- [x] Platform 1.13.6 最终版本／Schema／同级服务保持结论及两环境实际 legacy 回执已取得；DEV 74／16、PROD 70／10。
- [x] ERP 3 次真实业务视图、Hub 套餐中文拒绝、Admin 32 模板、Web 39 工具与 Visa 权限的实际安装版 Host 回执已收录，没有请求业务写入。
- [x] 设置页整页／分类／独立滚动／返回后 Enter 重开已实机验证并收录截图。
- [x] 上轮 manifest 正常启动及资源保持已验证；第三轮 `758711…` 选择卡片版已安装，实际资源回执已收录。
- [x] 最终普通无调试启动 healthy、六角色持久化与资源校验通过，独立回执位于 delivery 目录。
- [x] [仅已安装六角色与新说明](../../output/system-assistants-delivery-20261023/screenshots/installed-only-six-after-restart.png)、[重启后系统分类与已安装按钮](../../output/system-assistants-delivery-20261023/screenshots/system-center-after-restart.png)已实机截图；仅两个角色的早期证明保留为历史。
- [x] 原 1480 项基线的最终审计及正常启动后 preservation 通过，历史空标记与新增验收工作区均有精确摘要和明确许可。
