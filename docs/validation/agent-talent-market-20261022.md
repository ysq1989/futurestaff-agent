# Agent 3.3.0 人才市场目录修复

> 后续纠正：用户明确要求直接下载安装到本机、安装后才能用于对话。本页保留上一轮历史验收；“平台聘用跳转”和平台既有人才自动进入对话目录不再是当前规则。后续实施以 [本机安装验收记录](talent-local-install-20261022.md) 为准。

本次为客户端源码与本机 `D:\FutureStaff Agent` 的安装资源修复。用户要求智能体中心与平台人才市场一致；不要求先发布桌面版本才能浏览人才模板或使用原有授权智能体。Platform、GEO 服务与业务数据没有修改；没有发布新安装包、提交或推送代码。

## 根因与界面行为

此前智能体中心只读取桌面版本分发目录，并默认筛选本机已安装版本。本次实机读取到平台人才模板 40 个、既有授权智能体 9 个、已发布桌面版本 0 个；用最后一个目录替代前两个目录，造成了“中心为空”的回退。

中心现在默认进入“人才市场”，按平台已有规则展示热门推荐、我的人才、已授权的 ERP 系统及越南签证分类、通用分类。搜索跨模板分类匹配原始和中文名称、描述、能力与分类；与平台保持一致，搜索期间展示模板匹配，“我的人才”中的既有智能体在清空搜索后展示。

“我的人才”包含平台模板及当前成员有使用权限的既有智能体。可用智能体的“前往新会话”先返回工作台，再打开现有智能体选择流程，不暗中创建或绑定智能体。安装、更新、能力变更确认、回滚和卸载仍在次级“本机版本”页面，保留原版本和工程保护行为。

## 接口与权限边界

| 内容 | 客户端 Host 接口 | Platform 来源 |
| --- | --- | --- |
| 人才模板 | `GET /_futurestaff/agent-market/catalog` | `GET /desktop/v1/agent-templates`；与平台人才市场读取同一 `AgentTemplate` 数据，限内置模板并按主体模块过滤 |
| 已有人才 | `GET /_futurestaff/agents/catalog` | `GET /desktop/v1/agents`；平台重新核验当前主体和 Agent 使用权限 |
| 本机版本状态 | `GET /_futurestaff/agents/distribution` | `GET /desktop/v1/agent-distribution`；仅补充已发布版本及本机安装状态 |
| 平台入口 | `GET /_futurestaff/platform-dev/environment` | Host 当前环境的固定平台根地址 |

Renderer 只接收模板卡片字段，不接收角色指令、Skills 内容或桌面令牌；所有目录读取继续由 Host 授权。没有把桌面令牌复制到平台浏览器 API。

代码审查补充了分发状态边界：没有发布记录的既有授权智能体继续走已有 `/select` 流程；存在发布记录但尚未安装、已经卸载或被平台停用时，保留卡片并提示其状态，不能退回旧路径绕过发布状态。分发接口失败或格式不兼容时，保留目录显示并暂时禁用选择；已安装版本仍须同时满足平台目录和发布状态的可用性。

“前往平台聘用”和“在平台创建”只打开经过精确允许名单校验的 `https://platform.fsstory.net` 或 `https://dev.fsstory.net` 根地址，通过用户现有平台流程完成操作。链接不携带令牌或业务参数，并设置 `noopener noreferrer`。本次没有执行智能体聘用、创建、安装、卸载、发布或收费模型调用，也没有完成内嵌聘用流程。旧 `/agent-market/install` 仅安装本地预设，本次不将它当作平台聘用使用。

## 中文内容来源

中文显示沿用平台 `frontend/src/i18n/templateTranslations.ts` 的完整快照，复制为客户端 `src/client/template-translations.ts`；匹配不到译文时保留平台原字段。分类及热门名单与平台 `TalentMarketModal.tsx` 对齐。

- Platform 核对基线：`f1342900a5d6d09786f3789768f1b2c92f660ae2`。
- 平台原文件与客户端快照 SHA256 均为 `8e61062e25753f782956feaa28076062f108ddc1834799cf894ec6a38834d850`。
- 本机核对记录：`output/talent-market-20261022/translation-source.sha256`。

后续平台更新中文表时需要显式同步快照并重新验证；客户端不会自行编造平台人才名称或能力。

## 验证与当前安装版状态

类型检查、产品构建通过。最终相关模块测试 326 项：325 通过、1 项既有发布 UI 测试跳过、0 失败；根测试 73 项全部通过。代码审查通过；设计检查只有旧版本页面中既有颜色常量的一项信息提示，新人才页面没有新增发现。

回归测试先复现“分发目录为 0 时人才模板不可见”，修复后覆盖同源模板、中文跨分类搜索、我的人才、未发布既有智能体的旧选择流程、发布及卸载状态边界、账号切换和请求取消、安全平台链接及恶意相似域名拒绝。原安装、更新、确认、回滚、卸载与工程保留浏览器流程继续通过。隔离浏览器夹具覆盖浅色、深色 1440px 和 520px 窄窗口，没有横向溢出；这些截图不替代安装版业务验收。

本机安装资源及当前成员 Profile 已更新为同一候选的 227 项平台代码。代码更新后、启动本轮运行验收前，1447 项原持久文件没有变化或缺失；256 项无关安装资源及 ASAR 保持原字节。实际安装版账号恢复为 `ready`，8 个应用、2 个模型；模板、既有智能体及分发接口均返回 200，数量分别为 40、9、0。

实际安装版验收已经完成：

- 默认热门推荐显示 12 个角色；ERP 系统 9 个、越南签证 1 个、通用 29 个、我的人才模板 1 个及既有智能体 9 个。四个模板分类合并后为 40 个，ID 与 Host 返回的 40 个模板全部匹配。
- 在越南签证分类输入中文“项目经理”，仍能跨分类找到 1 个角色；列表滚动正常，不可用智能体的原因可读，对应按钮禁用。本机版本单独显示 0 项，没有影响人才目录。
- 关闭中心返回系统工作台，设置返回后恢复用户菜单焦点。全页设置继续保留三个分类，嵌入的“Agent 市场”同样显示 12 个热门角色，没有页面错误提示。
- 正常退出后不带调试参数重启，`rendererStatus=healthy`，9338 验收端口关闭；重新打开中心仍默认显示 12 个热门角色。最终截图为 `output/talent-market-20261022/normal-restart-talent-market.png`。

最终资源校验确认安装资源、alpha Profile 与当前成员 Profile 三层的 227 项平台代码及 150 项 GEO 资源逐件摘要一致，桌面 main 与构建及 ASAR/unpacked 校验一致，待处理工作区升级为 0。

最终运行后数据核对使用本轮新的 1447 文件基线：465 项业务文件没有变化，其中 342 项工程及绑定文件保持原字节，61 个原聊天记录文件全部保留原字节且没有追加。记住密码的保护信封及成员选择保持不变；仅 1 个当前成员会话保护信封随正常身份恢复刷新。缺失的 5 项及检查时被占用的 4 项仅属于 Chromium 运行缓存，不能据此宣称运行中全部缓存逐字节保持不变。本轮没有新增业务数据。

## 证据与回退

本机忽略目录 `output/talent-market-20261022/` 保存：

- `platform-tests-combined.log`、`root-tests.log`、`typecheck.log`：最终检查。
- `installed-resource-receipt.json`、`preservation-before.json`、`preservation-after-install.json`：资源摘要与持久文件保护。
- `installed-popular.json`、`installed-popular.png`：安装版只读接口数量、热门页面和截图。
- `catalog-acceptance.json`、`installed-erp.json`、`installed-visa.json`、`installed-general.json`、`installed-my-talent.json` 及同名 PNG：分类数量、模板 ID 集合与既有人才。
- `installed-search.json`、`installed-scrolled.json`、`installed-versions.json` 及同名 PNG：中文搜索、滚动、不可用状态及独立版本目录。
- `installed-returned.json`、`installed-settings.json`、`installed-settings-market.json` 及同名 PNG：返回与设置页兼容性。
- `normal-restart-result.json`、`normal-restart-talent-market.png`：无调试参数的正常重启与最终安装版截图。
- `final-artifacts.json`、`data-preservation-summary.json`：三层资源一致性、无待处理升级及最终业务数据保留汇总。
- `light-1440.png`、`dark-1440.png`、`light-520.png`：隔离浏览器夹具截图。

更新前的完整代码备份保留于 `%USERPROFILE%\.dsh\futurestaff-upgrade-backups\talent-market-*`，精确路径和候选摘要见资源回执。回退前必须正常退出客户端，核对当前树与回执后恢复代码；不得覆盖账号、秘密存储、会话、工程或 GEO 数据。此前设置页修复及其独立回退证据见 [设置页验收记录](settings-3.3.0-repair-20261021.md)。
