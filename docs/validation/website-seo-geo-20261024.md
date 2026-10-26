# Website SEO/GEO 客户端对接验证

日期：2026-10-24（Asia/Shanghai）。状态：**客户端兼容修复与隔离验证完成；用户已选定 default 的 Web Agent 网站设计师。内容更新、发布及真实安装版业务验收等待用户手动恢复登录，尚未完成。**

## 基线与范围

- 当前 `main` 已 fetch；HEAD 与 origin/main 均为 `c664e505ed7a5d29912b632828f23fc8ec5f34ab`。没有 reset、stash、切分支或覆盖既有工作树修改。
- 仓库根及祖先目录未找到 `AGENTS.md`。本轮遵守 `docs/development.md` 与现有 main 工作流；未改 DSH Core、桌面壳或无关模块。
- 读取了 [服务端交接](https://github.com/ysq1989/futurestaff-website/blob/main/docs/handoffs/WEBSITE_AGENT_CLIENT_20261024.md)、Website 方法文档、Platform 对接文档及实际技能来源 `backend/agent_template/skills/website-design`。
- 服务端交接所述 Platform 1.13.9、seoGeo 1.0.0、registry 1.1.0 是上游发布状态，不是本轮选定 Agent 的实际内容版本。Website 仓库技能、Platform registry、Agent 草稿与不可变内容发布分开核对。

## 动态桥判断与最小修复

已发布 Agent 路径已有 `website_tools` → `website_call` 动态转发。新增十三个内容、来源观察、Demo 比对和反馈工具及其 schema 可原样透传；`website_capabilities.seoGeo`、方法、readiness 无需在客户端硬编码。

发现一个实际协议缺口：服务端 `409 {"detail":"AGENT_VERSION_CHANGED"}` 被丢失成通用 `WEBSITE_REQUEST_DENIED: 409`。本轮仅在 `website.ts` 增加有界错误读取，保留此确切错误码，其他响应保持原拒绝行为：

- 仅识别 HTTP 409 与精确 detail 值，避免把任意服务端正文当作可信错误或泄露给模型。
- 最多读取 4 KiB，沿用本次 90 秒请求信号；异常、大包、非法 JSON 和不完整响应失败关闭。
- 保留已有本地 member 路径及其他未提交工作。没有为方法升级加入全套客户端方法或绕过 Platform 白名单。

本地 Web 系统助手是另一条 `website-member.ts` 路径，有独立允许列表；本轮尚未获选此类型，不扩大其范围。不能用已发布 Agent 的透传结果宣称该路径也支持新增十三工具。

## 测试结果

| 验证 | 实际结果 |
| --- | --- |
| 首轮新增回归 | 8 通过、1 失败，复现错误码丢失 |
| 修复后聚焦测试 | 49/49 通过 |
| 插件 typecheck / build | 均 exit 0 |
| 插件全量 `node --test --test-concurrency=1` | 403 通过、1 项既有跳过、0 失败，exit 0 |
| 六场景技能规则静态推演 | 完成；没有调用外部模型或真实写入 |
| 上游 Skill frontmatter 校验 | UTF-8 模式下 quick_validate.py 通过；首次默认 GBK 读取失败，未改原文件或系统配置 |

新增 `test/website-seo-geo.test.js` 覆盖：动态十三工具与远端 schema、seoGeo/recordsReady=false 及旧服务缺字段透传、GET query 与写 body 的 agentReleaseVersion、业务 legacyVersion、缺工具与未 ready、超时后保持原 requestId/revision 并查原操作、旧发布/新安装/Host 恢复、未绑定旧会话的版本变化、撤权及跨主体失败关闭。错误体额外覆盖不可信正文、非法 JSON、大包、错误流与挂起后取消。

这些是隔离身份与临时工程测试，不能代替真实线上主体、安装版与模型执行验收。尚未运行全仓 `npm run check`，也没有 commit/push 或公开发包。

## 技能与内容准备

本机证据目录 `output/website-seo-geo-20261024/` 保存上游官方技能快照及 blob SHA、消费者候选规则、测试日志与脱敏运行发现。候选规则明确：

- 从实时目录读取 capabilities、schema 与 readiness；缺字段如实降级。
- 普通局部任务只改目标页及必要共享依赖，不自动整页设计或生图。
- 旧 GEO 报告仅历史线索；源码、初始 HTML、DOM、响应头、收录及 AI 引用分别取证，缺证据为未测。
- `recordsReady=false` 不进行需求记录/比对写入；无合适回存工具交付文件并说明未回存。
- 写入保留 requestId 与版本字段；结果未知先查原操作，无法查询则保持未知，不换 ID 盲目重试。
- 官网发布由用户在 Website 确认指定 Demo，不调用收费模型或未开放的发布/回滚、主动采集、咨询答案。

选定后仅比较并备份该 Agent 的网站技能，保留自定义内容、其他 Skills、soul 和记忆。通过 `/api/agents/{agentId}/files/content` 的 `expected_version_token` 更新并读回；再通过 desktop-publication 预览的 `expectedDraftVersion` 校验发布。不能用不带版本校验的 agent-admin 文件写入接口替代。

## 当前真实运行限制

安装目录为 `D:\FutureStaff Agent`，壳版本 3.3.0。真实窗口观察为登录页，账号及记住密码提示仍在；未输入、提取或改写凭据，未自动登录、切主体或撤销权限。

只读保护基线记录 1738 个原文件，其中 76 份权威会话历史、62 份绑定、295 个 Agent 材料/工程文件；59 个凭据文件只记摘要。600 份 GEO 代码匹配原 manifest，ASAR 已记录；5 个浏览器 Cookie/LOCK 文件因 EBUSY 不可读，未声称这些文件已验证字节不变。资源、alpha 和两个既有成员的受管平台 lib 各 251 文件匹配当前安装库存，全部非平台受管资源匹配。候选仅 website.js 与 website.js.map 改变，保留 16 份兼容库存和 68 项旧文件规则，没有实际安装。后续使用 `managed-website-update-plan-v2.json`，不使用早期 v1 计划。

最初在原有主体下只读检查目标 Web Agent，发现该主体尚不具备相应业务管理权限。用户随后选定另一验收主体的目标网站助手；真实主体名称与 Agent 标识仅存本机私有选择记录。此后 Platform 自动返回登录页，未对其他 Agent 写入、授权或发布，目标选择保留于私有 `target-selection.json`。Platform 与安装版登录均等待用户手动完成，没有自动操作认证对话框。

**本轮尚无新 Agent 内容发布版本。** 没有修改任何 Agent 草稿、发布内容、安装状态或既有会话绑定，没有操作正式官网。未在真实安装版验证实时 `website_capabilities.seoGeo`、当前 default 的十三工具、真实新旧内容会话恢复或真实业务写入；本机软件修复也尚未安装。后续须在选定主体/Agent、有效登录和现有权限下完成这些步骤，不把本轮隔离测试记为线上验收。
