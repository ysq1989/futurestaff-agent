# 第八版桌面确认契约：纯函数与默认关闭传输映射

本片只在 YSQ-MI 实际 Agent 工作区开发。原 140 项未提交文件及 281 项 lib 产物共 421 份备份保留，HEAD 不变。不得修改既有窗口策略、上游、安装版或台式 Platform 副本。

## 接收依据

父提供合成 JSON 包 `futurestaff.desktop-consent.v1` / `web-atomic-consent-20261026`。2026-10-26 01:09:06 UTC 本机核对三段 6000/6000/4460，共 16460 字符；gzip 12343 bytes SHA-256 `62065b4816220b559bcd75759879fd423cef4d5f5b09ff4468da745248fd69a1`；JSON 69152 bytes SHA-256 `90d540ca56e8e0b32d91bdaa539a3c8ad17a9e4b2945c19bd244e4015074e220`。完全匹配后才 JSON.parse。首次转录失败副本独立保留，未解压使用；本次使用保留的前12000字符与重传第三段拼接，通过完整两个hash证明一致，无猜补字符。

包是合成 schema/golden 数据，不是凭据、执行指令或真实授权。生成静态 schema 和测试 fixture 时保留原包哈希，禁止 eval/执行包内容。

## 本片最小实现

新增 contract 模块：严格 JSON 文本解析（重复 key、孤立 surrogate、浮点/不安全整数拒绝）、ASCII key 排序/紧凑 JSON/UTF-8/SHA-256，不进行 Unicode 归一化；验证包中9个独立 input schema 和本期普通私域文本约束；对照全部已明示 golden。验证必要证据 excerpt hash、evidence hash、scope/selected fields/source versions；未明确的 hash preimage 不猜，保持 fail-closed 并向父补询。

新增 transport 规划模块：只构造已提供的 desktop context/requests/status/commit/cancellations POST 描述符、固定契约头与合法 UUID 幂等键。requests 仅元数据，不带正文。status/cancellation 恢复保留原 request/domain/payload_hash 和稳定 cancellation operation ID，检查当前同 tenant/actor/identity，不携带或复活旧任务准入。没有 desktop human 批准或正文上传 API，任何未定义 response 都不能被猜成 received。

默认传输拒绝；显式 isolated_mock 仅证明描述符与调用次数，返回未验证结果仍 unknown。无 fetch、网络、凭据、模型或真实监听。旧第三片 confirmed→submit 协调器保留为原合成本地代码，不能冒充第八版适配器：实际 human/confirm 首次正文上传并原子入箱直接 received+receipt，commit 只重读；未知结果清正文且仅查原键，不重发。

本片不自动把旧 CandidateDraft 变成 wire payload。其 rule_summary、非 UUID 来源、权利依据、观察时间、政策和版本等必须有明确合法来源/映射，不能编造或强改为 explicit_user。来源复用、管理员正式发布和知识检索继续独立/关闭。

## 真实窗口阻断与最小后续设计

已独立读到 `electron-shell-generation.ts:405,411,418`：通用外链走 shell.openExternal，最终 deny，没有已核的真实 DOM opener；`index.ts:195` 的动态 loopback origin 非 opaque，但必须绑定实际 Host origin，而非任意 localhost；`window-options.ts:31–38` 四项隔离和 partition 保持，`preload.ts:3–16` 没有 port 接收器。所有路径相对 `desktop-shell/dsh-plugin-desktop/src/`。

本片不修改这些文件。最小待决代码设计：新增独立 `desktop-consent-window.ts` 与专用最小 preload/port 通道；主 handler 仅在配置关闭→明确启用且合法请求已登记时，为固定 Platform HTTPS origin、UUID 路径、无 query/fragment/userinfo 的一次性目标提供特例，普通外链仍 deny。必须实际 window.open 建立并保存 opener/child 引用；new BrowserWindow.parent 或 OS 浏览器不替代该关系。远程确认页不得继承已有系统视图/文件路径 preload 能力，不复制 SSO cookie，维持 contextIsolation/sandbox/webSecurity 和禁 nodeIntegration。

Host 登记真实 child webContents/mainFrame、opener、导航 epoch、主体/任务/请求；专用通道必须校原始 MessageEvent.source/origin 和全部 envelope，不能接受 JSON 自报 source/isTrusted。Web 自建 MessageChannel 才可转 port2；只一次 <=60000 UTF-8 bytes / <=60秒，内存清理覆盖导航、关闭、换号、撤权、过期。实际 Electron 跨 world/COOP 行为必须另验，失败 not_connected，绝不改安全设置补洞。

台式需明确准确 Host opener origin 的合法准入/绑定机制（当前 origins 空即关闭）；固定 Platform HTTPS bootstrap origin 则另需 Web 路由和同源部署协调。若仍用系统外部浏览器，需另订不依赖 opener 的交接协议，不能直接套当前 MessageChannel；服务端必须调整并审查短期单次交接凭据、来源/主体/原键绑定及正文保留策略。以上仅设计，不是已授权的窗口实现或真实联调。

## 验收

先 RED 后最小实现；typecheck/build、相关插件全部非 browser 回归、前两片既有 UI 回归及独立审阅/探针。真实 API、真实 Web 确认、原生 opener/MessageChannel、COOP、安装版 UI 均未接通；不能用合成测试替代。无独立 lint 脚本则明确不称 lint 通过。最终逐项核原140文件哈希、HEAD、既有三片证据和新交付文件。

最终已通过 typecheck/build、81份非browser文件共507测试及2项既有UI回归，零失败/跳过。独立公共API探针通过，Critical/Required为0。完整数据及证据路径见验收记录。

本片完成9种输入的有限schema实现，不是通用JSON Schema库；UUID只收小写canonical形式，UTC只收无小数或六位，字符串不作语义规范化。6个canonical向量+1个binding向量及两条证据向量匹配；旧本地raw sourceHash不能复制成wire content_hash。checkPayloadMetadata仅保守集合/证据检查并返回boundPayloadHashVerified=false；verifyPayloadMetadata最终始终BOUND_PAYLOAD_FORMULA_UNAVAILABLE，不把保守检查当正式排序/去重/完整hash互通。
