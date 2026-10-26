# 桌面可信确认桥：本地准备验收

本片在原笔记本 YSQ-MI、`D:\项目\FutureStaff-Agent-client` 完成客户端准备，不修改台式 Platform 仓库。HEAD 仍为 `c664e505ed7a5d29912b632828f23fc8ec5f34ab`。先重新读取实际工作区，逐项比较上片最终记录，未发现并行字节变化；没有沿用旧哈希假定。

新保护目录为 `C:\Users\10089\Documents\Codex\2026-10-25\task\evidence\governance-desktop-bridge-20261025`。基线记录 135 项未提交文件和 278 项原 lib 产物，共 413 份可逆副本；`baseline.json` SHA-256 为 `74f90817fa8da3c443378460e760900220b1ec182ebdda01e35c91b04d4ad28c`。没有 reset/clean/pull/commit/push 或安装、部署。

## 实现与可信边界

新增独立 `governance-desktop-bridge.ts` 和合成测试，复用完整 CandidateDraft 解码及证据校验 hash。普通 DesktopIntakeBridge 始终不连接；显式 isolated_mock 工厂才可演练。控制器仅内存、单候选、不可由客户端自行 approve，不持久化预览/确认/凭据，不注册真实事件监听，不修改既有 outbox 或前两片 UI。类型和本地指纹不证明认证，不声称与服务器 canonical JSON 互通。

绑定 tenant/actor/identity、desktop session、Host session/turn/runtime epoch/firstLiveSeq、app/Agent 版本、release、服务端 task、授权版本/期限、域 grant，以及完整候选内容、证据、用途/受众/接收方。submit 显式携带适配器返回且已验证的确认记录。已接收只代表候选，不产生 knowledge.source_reuse 或管理员发布批准。

现有 Host 的真实主体/撤销信号、Agent session 绑定、post-commit 事件与桌面包版本来源已只读核查，依据见设计稿。当前 Renderer 快照和本地 turn 没有治理准入权；现有资料轮询也不等于实时服务器撤权。无真实 Host 连接、HTTP 路由、Web 确认、cookie 借用、Origin/CSRF 伪造或知识检索。

## 验证记录

最终门禁于 2026-10-25 23:11:05–23:11:22 UTC 完成，针对冻结的实际源码重跑：

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck -w @futurestaff/fs-platform-access` | 通过 |
| `npm run build -w @futurestaff/fs-platform-access` | 通过 |
| 插件全部 79 份非 browser 测试，Node runner concurrency=4 | 484 通过，0 失败/跳过，含本片 24 项 |
| 首片 `governance-browser.test.js` | 1 通过，0 失败/跳过 |
| 第二片 `governance-task-events-browser.test.js` | 1 通过，0 失败/跳过 |
| 独立公共 API 合成探针 | 6 项通过 |
| 独立审阅 | Critical 0，Required 0 |

源码 SHA-256：`ae9b76eb0365de5132f9ba4e8d0710dd62596b3984637a66b05b3ddee11ab754`。测试 SHA-256：`adab699547130747a74dc3154a75ee34f6e92cfce1acfb9bb49ef17f277cab99`。两片 UI 均记录 fetchCalls=0；浅色及 390px 深色截图已目视核对。运行参数、时戳、退出码和日志在本片 `checks/results.json`；独立探针及其结果归档到 `review/`。初始 RED（缺实现）及后续 GREEN 日志保存在 `tdd/`。

测试仅用合成记录和 isolated_mock 适配器。Node 网络 guard 仅准 loopback，浏览器使用全新临时 profile 和 fixture fetch 拒绝器。两片既有 UI 回归输出重定向到本片证据目录，原截图/记录不覆盖。无独立 lint 脚本；类型、构建、格式/保护比较与审阅分别记录，不称为 lint 通过。未运行全桌面 check 或无关历史 browser；本片没有修改其源代码。

## 已修复边界与限制

覆盖无效上下文替换清旧授权、hash 准备期间过期/取消、确认错误绑定/超时/重放、同步订阅回调重入、发送/查询/取消迟到结果、换账号/任务/版本撤权、稳定取消墓碑及未知结果原键查询。取消意图与服务器取消确认分开；未确认取消不称为服务端已完成。

控制器是一次使用的内存协调器；不新增持久恢复队列，不接真实任务。宿主未来需从合法生命周期驱动 setContext/revoke/refresh 与 AbortSignal；本片不设置真实采集定时器。确认或授权过期后不自动续期、不换请求号重发；无法以合法原上下文查询时保留不确定性，等待正式桥契约。

真实 API、真实 Web 人类确认、安装版桌面业务 UI均未测。当前新模块未接产品界面，本片浏览器门禁证明前两片界面无回归，不代表新的人类确认界面已上线。下一门禁是服务端实际实施的身份/app/version/task/scope 桥、准入/确认/撤权/原回执/取消明确契约、golden vectors 和本地 basis 等字段映射，再进行另行授权的真实联调。

本片只新增源码、测试及三份文档，共 5 个仓库文件。最终 `preservation-final.json` 记录 135 个原脏文件全部原字节保留、HEAD 不变及所有交付哈希；`prior-evidence-final.json` 另核前两片 7 份关键保护/验收记录未变。未触碰 CURRENT、安装版 Profile 或上游源码。不存在被拒绝、待确认或不确定的本机执行动作；真实桥依赖明确契约与独立联调授权，处于未接通状态。
