# 专用候选确认窗口：第六片实施范围

用户已批准仅面向当前候选确认的受控窗口本地开发与合成测试。工作区为 YSQ-MI 的 D:\项目\FutureStaff-Agent-client；无真实账号登录、业务数据上传、部署、安装更新或 commit/push。主窗口通用弹窗 deny、现有 renderer 认证头范围及系统/模块 SSO 保持原边界。

新基线：HEAD c664e505ed7a5d29912b632828f23fc8ec5f34ab；158 个未提交文件与第五片终态一致，相关源文件和 lib 共 727 份备份。baseline.json SHA-256 为 27aa079b0cb2759190f4146cc9a69ec6da04b02cacbc437d6218755f33970bbb。干净的 Host 源文件另在首次修改前记录字节/哈希，9 个桌面 build 资产也另备份；已有五片证据 2343 文件记录保护哈希。初次过宽 dist 备份被路径保护中止，未作为完成基线使用；后续仅处理相关 lib，不再扫描 dist。

## 当前设计

候选卡向本机 metadata 路由发送 sessionId 和不透明 handle，不发送正文、角色、租户、URL 或服务端 task 事实。路由必须校现有启动器 renderer 专用凭据，再做当前 Host 主体/会话/Agent 绑定复核。Origin/Host/loopback 只作附加限制，不能作为原生窗口权限。没有 provider、精确 origin 策略或当前服务端绑定时默认 not_connected。

Host provider 只提供当前授权任务的冻结候选。它必须匹配本地卡与 wire 正文/证据/范围，按第五片严格 schema、canonical、bound hash 和 Web 兼容门禁校验，不伪造来源或把规则摘要改为用户明确原话。provider 服务没有 renderer 注册入口，也没有默认真实实现；shape 与依赖注入不等于认证。

DesktopRuntime 的窄方法调用专用窗口控制器。新的固定本地 opener 文档由专用 session 的内存协议处理器提供；URL 仅含请求 UUID，正文不进入 URL、文件、storage 或日志。CSP nonce、严格 JSON/script 转义、无外部脚本。用户实际点击后真实 window.open 打开固定 Platform HTTPS origin 与当前 UUID 路径；源窗口、origin、channel/request/target/binding/actor/tenant/期限/字节上限闭合校验，Web 自建 port2，一次 <=60000 UTF-8 字节传输。交接不代表 Web 本人已确认或已入箱。

实际 Electron 43 的普通 popup session/partition 覆盖未建立所要求的独立子会话；控制器曾因此严格拒绝交接。最终明确采用每请求新建一个专用非持久 Session，两个新窗共享它，与主 persist renderer、默认和既有系统/模块会话隔离。两窗全部无 preload、无 Node/subframe Node，contextIsolation/sandbox/webSecurity 均 true，权限/下载/webview/额外弹窗拒绝，不复制 token/cookie/SSO，不加入主 renderer header 注入集合。必须以真实 Session 对象及非持久状态验证该边界，不能把配置声明当证据。

主进程控制导航、页内 URL 变化、关闭、崩溃、取消、过期、身份/任务信号和 generation 销毁；终态与异步结果有 epoch 栅栏。取消先同步关闭和释放引用，再做可能阻塞的异步动作。交接阶段最多60秒，后续人工核对不能因该交接计时器提前关闭，仍受服务端绝对期限及最长5分钟窗口寿命限制。原键和已交接标记保留，未知结果不重发正文；本片没有真实 Platform 回执查询，UI 必须明示 queryConnected=false。

## 原生验证与交付门禁

使用本机已有 Electron binary 与独立临时 userData；合成 HTTPS reserved.invalid 页面通过仅测试 Session 的 protocol.handle 内存路由提供，不发生真实 TLS，也不忽略证书错误。生产运行时不提供该测试 hook。验证必须导入实际控制器和服务端包的实际 Web receiver，使用真实 WindowProxy、MessageEvent、MessageChannel 与用户输入事件；fake Electron 单测不能替代。

COOP 切断 opener 必须失败关闭。不得改全站 COOP、证书、CSRF、Origin 或借用登录凭据。若实际 Platform 需要同源 bootstrap，笔记本只提供最小页面/接口清单与原生证据，不修改台式系统。当前精确 production origin、真实 server provider/授权、同本人 Web 登录和 HTTPS/PG/Redis/安装版仍是独立真实环境门禁，不能以本地合成测试宣布项目完成。

## 第七轮接手后的实现核定

原生子窗使用正式 `createWindow` 钩子，并保留 Electron 提供的 guest `webContents`，不构造替代 WindowProxy。安全偏好在 guest 创建前通过窄覆盖配置，在构造中继续使用完整固定偏好；首次网络请求前登记实际 child ID、Session 与导航守卫。构造/getter 异常进入终态并清理，不能等待截图或错误报告后再关闭。

Node 的顶层、子 frame、worker 开关均显式 false，sandbox/contextIsolation/webSecurity 均 true。Electron 43 的内部偏好快照不序列化 worker 字段，不能用缺字段等同 Node 已启用；实际显式启用或非法值仍拒绝，省略字段按已核验的 Electron 行为处理，并用实际受控子窗的 Worker 能力探针补证。Session 身份、非持久状态和空 Session preload 检查不变。

第六轮结果和失败仍保留；第七轮的修复、精确命令、结果边界及台式对齐清单见 [专用窗口接手验收](../validation/governance-desktop-window-20261026.md)。受控本地交接不证明真实本人确认、首次正文 POST 或原请求入箱回执。
