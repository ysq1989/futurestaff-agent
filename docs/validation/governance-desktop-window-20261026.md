# 专用确认窗口接手验收（2026-10-26，第七轮）

仅处理 Agent 本地开发和隔离测试。HEAD 为 main / c664e505ed7a5d29912b632828f23fc8ec5f34ab；保留第五、六轮未提交修改。没有 commit、push、部署、真实登录、业务内容上传或安装版更新。

## 接手基线

第六轮最新原生结果为 exit 1：窗口已加载且 opener 存在，但消息事件为空、接收正文为 0，最终超时；不能沿用第五轮 560 项或第六轮局部成功宣称窗口验收通过。用户补充的 573/574 非浏览器回归及随后路由聚焦 7/7 也分别保留。

本轮 Git 普通状态为 173 行，展开未跟踪目录为 174 个文件条目，区别于第五轮 158 个条目。相关源码、桌面构建资产和两包 lib 共 1252 份已备份。证据根目录：`C:/Users/10089/Documents/Codex/2026-10-25/task/evidence/governance-seventh-20261026`；`baseline.json` 记录接手哈希，`preservation-final.json` 记录结束比较。

## 修复和验证方法

- 专用 `createWindow` 钩子保留 Electron 提供的原始 guest WebContents/WindowProxy 关系，在首个请求前登记子窗身份和导航守卫。实际 Session 必须是该请求的非持久 Session；只与专用 opener 共用，和默认/主 renderer/系统会话分离。实际 preload、Session preload 和 Node（含子 frame、worker）、contextIsolation、sandbox、webSecurity、webview 偏好均校验，失败关闭。
- 取消、窗口销毁、身份中止、导航、崩溃、过期及迟到请求/显示/日志/加载回调不恢复终态。构造/getter 异常同步撤销请求和清理；返回原始 guest，不能返回另一个 WebContents 掩盖原生关系错误。
- 已交接后刷新候选列表保留仍在人工确认中的原窗口，只保留原信号和 prepare/server 元数据摘要，正文 grant 仍清空；绑定、信号、主体/任务或期限变化仍关闭。原 handle 不重新发送正文。
- 反馈候选的画幅文本与已验证 wire ratio 作精确表示比较。比较不改变 payload，不约分或扩展用户范围；无法表示的像素信息仍拒绝。
- 原生探针改用可见窗口和真实输入，并记录 trusted pointer/click 与用户激活。冻结旧源码和新源码均完成单候选握手，支持旧失败与输入未激活相关的判断；没有 hidden/visible 严格 A/B，不能断言唯一根因。
- 报告器对等待页面读取/截图期间的销毁使用事件与有界等待，记录诊断不完整和失败；不把异常或超时转换成成功。旧失败、RED 和后续 GREEN 均保留。

原生偏好快照与配置不是同一接口：Electron 43.3.0 的 [SaveLastPreferences 实现](https://github.com/electron/electron/blob/v43.3.0/shell/browser/web_contents_preferences.cc#L338-L356) 不序列化 worker 字段；[官方 worker 文档](https://www.electronjs.org/docs/latest/tutorial/multithreading) 明确 Node worker 与 sandbox=true 不兼容。本轮保留显式关闭及 sandbox，并拒绝实际快照中显式启用/非法 worker 值，用真实子窗 Worker 的 `require/process/Buffer` 不可用补证。内部快照缺字段不再单独导致全部窗口误拒。`preload:''` 不是有效绝对路径，已改为完全不携带 preload 参数；固定偏好不继承上游 preload，Session preload 与原生子窗探针继续检查。

`createWindow` 必须返回同一个 guest，依据 [Electron 43.3.0 guest-window-manager](https://github.com/electron/electron/blob/v43.3.0/lib/browser/guest-window-manager.ts#L64-L80)。构造异常时关闭原 guest 后返回原对象，是否引发内部二次异常另用真实故障注入验收，不能仅依赖 fake 测试。

## 验收分层

最终统计及完整命令以本轮 `checks/` 与 `native/runs/` 的结果 JSON/log 为准。当前未接通真实服务端。

- 插件最终 build/typecheck 通过；沿用第六轮同一 86 文件及 loopback guard 的非浏览器回归 579/579 通过，无失败/取消/跳过。
- 三份治理浏览器回归最终 3/3 通过，无失败/取消/跳过；原两份 fetchCalls=0。新增确认按钮改变了旧测试“首个 button”的含义，首跑两个焦点断言失败已保留；只修测试语义起点，保留单次真实 Tab/Space 并新增确认按钮键盘可达断言，产品 UI 未改。见 `checks/host-browser-focus-correction.md`。
- 桌面最终 build/typecheck 通过；窗口聚焦 33/33 通过。稳定源码快照的桌面全量为 1217 通过、13 既有跳过、1 个既有 Windows symlink EPERM（futurestaff-profile 的 linked-child，exit 1）。未改系统权限或跳过该项；全量不标全绿。完整结果见 `checks/desktop-check-results.json`，中间被撤销的微任务测试提案及其混合运行日志保留且不作为最终源码结果。
- 最终真实 Electron 43.3.0 受控回归 19/19 通过、exit 0，控制器 SHA-256 `0a79e4b80b4334cc7e28a25f8b85132516aeae8c46e83f66ff1344066da3e129`。两域真实 Worker 的 require/process/Buffer 均 undefined；COOP same-origin 实际响应与即时日志证明 opener 断开且没有正文交接；三类迟到原生响应、截图取消竞态及构造/getter 异常均覆盖。诊断报告器 10/10 通过。证书错误/外部网络尝试/残余窗口/本轮原生进程均 0，cleanupErrors 为空。精确命令、每轮源哈希和失败历史见 `native/final-results.json`；最终 run 为 `native/runs/2026-10-26T11-39-55.382Z-final-accepted-scope`。

额外破坏性实验仍有明确失败：探针在 Electron 的 `browser-window-created` 同步监听器中、C++ 构造尚未返回时主动 destroy 子窗，会引发 Electron 原生进程异常退出；checkpoint 停在控制器 catch 执行之前。该独立引擎边界没有修复，也不纳入上述 19 项受控路径通过率。Agent 源码无此同步监听器；真实构造完成后的 getter 异常以及构造代理抛错均另外原生验证正确关闭。所有崩溃和超时记录保留，不能据 19/19 宣称任意创建期外部析构都安全。

| 层面 | 可以证明的边界 |
|---|---|
| 插件非浏览器回归 | 严格契约、原键恢复、取消、Host/client 状态；不证明认证或真实网络 |
| 三份治理浏览器回归 | 本地候选卡与真实本机 metadata 路由；原生 runtime 在此层为隔离替身 |
| 真实 Electron | 19 项受控路径通过；实际控制器、权威补充包 Web receiver、真实 WindowProxy/MessageEvent/MessageChannel 和输入；内容/身份/服务端元数据均合成；另有上述独立引擎失败 |
| HTTPS protocol fixture | 专用 Session 内存路由；没有真实 TLS、Platform 登录、确认 POST、PG/Redis 或真实回执 |
| 安装版 | 未更新、未验收 |

## 台式 Platform/Web 对齐清单

真实 Host candidate provider 和生产 HTTPS origin 均未提供，所以默认保持 `not_connected`、`queryConnected=false`；`transferred` 仅表示内存交接，不表示本人确认或入箱。测试域名及本机固定端口不能进入生产白名单。

1. 台式 AI 核定确认页实际 COOP、精确 HTTPS origin 与允许的 handoff origin。跨 origin 的 `COOP: same-origin` 断开 opener 时必须关闭；不得修改全站 COOP、绕过证书、伪造 Origin/CSRF 或复制 token/cookie。
2. 若需同源 bootstrap，提供同 origin 的固定 UUID 路径及 CSP/依赖/XSS 边界说明。当前 Agent 只实现受控本地 opener；远程 bootstrap 的专用 preload/IPC 未实施，不能仅改 URL 或白名单切换。
3. 提供由真实当前身份/主体/Agent release/task 授权构成的 Host source：context/prepare 的 server binding、源版本、完整 payload/target/preview 哈希和撤销信号。不能自动把旧草稿转换成授权或伪造来源。
4. 本人 Web 确认继续是首次正文 POST；提供原 request 的状态/取消/回执能力和真实响应。Agent 仅据严格回执标记入箱，未知结果只查原键，不重新上传正文。
5. 之后另行安排受控真实 HTTPS/身份/PG/Redis 和安装版验收。当前授权不包含部署、真实登录或真实业务内容。

已尝试向“规划企业知识与需求系统”发送窄范围对齐请求，但工具返回 `invalid turn/start params: AbsolutePathBuf deserialized without a base path`；不能宣称台式 AI 已收到或已确认同源 bootstrap。

服务端补充包已核验为 607507 字节/38 文件，SHA-256 `61508d2392c1d1688070c5ff9a762cc28c7477e3def9f8cf4bafe380981450c4`。不重新猜契约，不修改 Platform 源码。
