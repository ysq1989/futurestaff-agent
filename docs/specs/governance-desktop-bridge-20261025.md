# 桌面可信任务与人类确认桥：客户端准备

本片仅在笔记本 YSQ-MI 的实际 FutureStaff-Agent-client 工作区开发。Platform 桥尚无实施契约或 golden vectors；这份文件定义本地模块边界，不声明任何新 HTTP 端点、已获治理授权或协议互通。

## 范围与来源

复用现有 LocalCandidateOutbox 和当前任务事件接收器。本片增加独立、仅内存的单候选桥协调器，不接产品 Host/Renderer、不注册真实 session/event listener、不持久化预览/确认/凭据，不新增网络请求或模型调用。普通构造器初始 not_connected 且不具备传输能力；只有显式 isolated_mock 工厂可注入合成适配器进行生命周期演练。其类型、布尔值或本地 hash 均不是可信认证证明。

Host 现有 authorizeLocal、SessionStore/Agent binding、post-commit session/event、firstLiveSeq 可作为未来桥输入来源。当前 owner/session/task 只能在合法 Host 授权与服务端绑定落地后连接；不信模型、工具或插件事件自报 tenant/actor/task/version。产品现有 UI 继续显示未连接，客户端无自行 approve 操作。

只读源码核查依据：

| 来源 | 本机代码 | 已有边界 |
| --- | --- | --- |
| 本地主体 | `plugins/fs-platform-access/src/plugin.ts:78,248`；`dev-access.ts:415` | authorizeLocal 返回 tenantId/userId/signal/namespace，不包含治理许可。 |
| 主体生命周期 | `dev-access.ts:721,728,573,320`；资料刷新 `:311` | 切换/登出/dispose 可 abort；现有 30 秒资料轮询不等于实时服务端撤权。 |
| 实际 Agent 绑定 | `agent-host.ts:56,147`；`agents.ts:188` | Host SessionStore 与已有主体命名空间/绑定核内容和模型策略版本，不能信 renderer cwd/version。仅审源码，未调用解析器或其网络。 |
| 实时事件 | `desktop-shell/deepseek-harness/packages/core/session/src/index.ts:64,707`；firstLiveSeq `:454` | commit 后事件，constructor seed 不发布；上游子模块只读。 |
| Session 与 turn | 同目录 `types.ts:266,275,281`；`index.ts:448` | 必须核 user/message.source.kind=user；本地 turn 不是治理授权，尚无服务端 task ID。 |
| 桌面版本 | `desktop-shell/dsh-plugin-desktop/src/electron-runtime.ts:95,108,174` | Host 自身包版本来源，当前源码包 3.3.0；是否获准由服务端判定。URL 版本投影不作授权。 |
| 认证 audience | `plugins/fs-platform-access/src/contracts.ts:4,14` | 现有 futurestaff-agent-pc-dev 不等于治理 app/client，不能推断生产身份。 |

当前候选 Dock 在 `src/client/governance-candidates.tsx:188` 只拿 renderer 快照/sessionId，未传 taskSource。未来主窗口调用者验证可参照 `desktop-shell/dsh-plugin-desktop/src/system-views.ts:72` 的 webContents/mainFrame/origin 核验模式，但不得复用其固定 Shop 路径的 SSO cookie 通道进行治理确认。

## 待服务端明确的固定绑定

1. 当前 tenant、actor、identity、desktop session，以及当前登录和撤权版本/期限；如何从已验签桌面授权获取并重验。
2. app ID/获准 app version、Agent ID/获准 Agent version、release snapshot，不能仅采纳客户端声明版本。
3. 服务端 task ID、任务与实际 Host agent/session/turn 的对应关系、授权版本、目的/受众/接收方/域、有效期，以及取消/任务切换语义。
4. tenant+actor+domain+request UUID 的稳定幂等键，完整候选内容、证据/版本与 hash、scope/用途/受众/接收方预览绑定。
5. 同一来源本人在真实 Web 身份下确认固定预览，确认 ID/状态/服务器期限/撤销版本；桌面只能查询/执行该确认，不能代批，也不能借管理员 cookie、伪造 Origin/CSRF。
6. 已接收/撤回/撤权/未知/未找到回执，以及取消稳定 operation ID 和墓碑；未知结果必须先查原键，不换请求号重发。
7. 服务器 canonical JSON/UTF-8/SHA-256 golden vectors；候选 basis=rule_summary 等本地字段到正式 wire 的明确映射。本地指纹不用于声称互通通过。

intake 确认只授权候选入箱；knowledge.source_reuse 与 knowledge.review.publish 继续分别由来源本人和管理员批准。反馈只进入私域待核分类，不自动成为 bug、排期或跨租户聚合。知识检索仍关闭。

## 本地状态与约束

not_connected → awaiting_confirmation → ready → submitting → received。服务器确认之前不得 submit；确认必须完整绑定上下文、request/domain 和预览，最长五分钟且重复操作不续期。未知结果进入 unknown/querying，只查原键并保留需查询状态。过期、撤权、取消是停止动作；上下文/账号/任务/版本/scope 变化使旧确认失效，AbortSignal 与 generation 阻止迟到响应复活。取消用稳定 operation ID，先立本地墓碑，再发合成取消操作。改卡导致 hash 冲突，要求新确认；不自动改号重发。

所有适配器响应为不可信输入，验证状态、字段、绑定、期限，拒绝跨域/跨用户/跨任务结果。域权限分别检查；不得借 enterprise_knowledge 扩展到 platform_product_feedback。实现与测试有界，不改持久 outbox 既有 schema。

## 验收与下一门禁

先保留 RED，再实现并验证默认拒绝、错误绑定/重放/过期、未知查询、重复点击、撤权/切上下文/取消及异步竞态、域隔离、确认不等于发布。运行 workspace typecheck/build、相关非浏览器完整回归、两片现有 UI 交互回归与独立审阅；逐项比对本片 135 个原脏文件保护基线。

真实 Host 注入、真实 Web 人类确认、真实 API 发送、Golden vectors 互通、安装版桌面业务 UI 均未验收。需服务端已实现且明确契约、合法的 app/Agent/task 授权桥、用户再次明确允许真实数据/网络联调后，才能接入。
