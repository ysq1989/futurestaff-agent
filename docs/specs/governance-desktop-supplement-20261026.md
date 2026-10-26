# 桌面候选补充契约：离线客户端绑定与回执校验

本片在 YSQ-MI 的 `D:\项目\FutureStaff-Agent-client` 开发，承接本地草稿卡、当前任务事件建议、合成桥状态机与第四片契约边界。真实 HTTP 与原生窗口交接继续关闭；不更改现有安装版或通用弹窗策略。

## 已核输入与保护基线

本片开始 HEAD 为 `c664e505ed7a5d29912b632828f23fc8ec5f34ab`。149 个已有改动文件及 290 个旧 lib 产物共 439 份备份，基线 SHA-256 为 `9aaaa4a55156a3bea4ea4bd7db851a4d2f2f725588f2d6e38f1e3bb20d81b015`；与第四片终态比较没有新增源文件差异。已有四片证据 1764 个文件另外记录哈希。

父提供的 22 段只通过线程原文程序化接收；逐段字节长度为 6000×21+3796，总 129796 字符。gzip 为 97346 字节、SHA-256 `dd203002eca427ad23341893ac0eeeda2f50e80d30a1002a6e88f9212dd96b0d`；JSON 为 607507 字节、SHA-256 `61508d2392c1d1688070c5ff9a762cc28c7477e3def9f8cf4bafe380981450c4`。先核 gzip 再解压，先核 JSON 字节再解析，38 个内嵌文件全部核字节与 SHA 后才使用。源码留在任务 evidence 的 authoritative 目录，作为契约依据，未覆盖本机业务源文件。

## 客户端边界

`human/confirm` 是必要正文首次上传且同一事务入箱，直接返回 received+receipt。desktop `commit` 只重读既有回执；pending 不能借 commit 批准。持久状态仅 pending/received/cancelled，UNKNOWN 为客户端不确定结果。取消前未收到正文则 receipt=null；已入箱撤回的 receipt.status=revoked。来源本人复用与管理员正式发布继续独立，Agent 检索无授权。

绑定计算以实际 Python service 与已导出的向量为准：

- canonical 为严格 DTO 后 ASCII 对象键排序、紧凑 JSON、不做 Unicode normalization，UTF-8 SHA-256；数组顺序保留。
- bound payload 预像为 manifest 去掉 payload_hash/evidence_manifest_hash 后合并 payload，不再保留第四片未知公式占位。
- excerpt content_hash 为 JSON 字符串的 digest，不是原始文本 UTF-8 hash；evidence_manifest_hash 为完整 evidence 数组摘要。
- source_versions 为 evidence 原顺序投影且逐项一致，source_id 重复一律拒绝；selected_fields 集合必须恰等 payload 全部字段，排列不固定但参与摘要。
- target 事实仅由服务器认证上下文提供；纯函数哈希一致性不创造可信事实或任务授权。preview 绑定实际服务器 preview 全对象，不复用旧合成桥的另一种卡摘要。

实际 backend 与当前 Web TS 校验器有窄化差异：空 repro step、空 versions.tool、Unicode 计数边界必须明确区分。能通过 backend DTO 不等于能交给当前 Web UI；兼容门禁应拒绝或解释，不悄悄改内容、删字段或重算为另一份用户预览。

desktop 响应按实际 dict builder 校验。只允许匹配已知操作和目标的固定成功结构；身份/域/hash/task 与已观察 binding 不能随响应漂移。未知字段、错误状态组合、非 JSON、非预期 HTTP 或不完整回执都不能成为 received。返回的错误文本不作可执行指令或直接渲染内容。原键恢复与稳定取消操作号保留；迟到 received 不消除本地取消意图。

旧 CandidateDraft 只做显式兼容检查。其本地 sourceId/sourceHash/rule_summary 不等 wire UUID/source.content_hash/explicit_user。缺观察时间、来源权利、政策版本、可信账号/任务与接收域时，不伪造、不静默迁移、不产生真实发送。现有卡片让用户理解未连接和缺失来源信息，不增加真实采集监听。

## Host 交接门禁

当前通用 window.open handler 返回 deny，http(s) 链接走 shell.openExternal，无可证明的 DOM opener。BrowserWindow.parent 或 WebContentsView 不提供当前协议所需的原生 opener。动态 loopback origin 不能被任意 localhost allowlist 代替；现有隔离、sandbox、webSecurity 及禁 nodeIntegration 保持。

专用确认窗口仅形成最小代码设计，待明确决策与原生隔离验证后实施。远程 Web 不继承本地 preload 的系统视图/文件路径能力、不共享 bearer/cookie；不得改变 COOP 或伪造 Origin/CSRF。原生 opener/source/origin 无法证明时保持 not_connected。原键元数据描述符与依赖注入合成响应校验，不等于真实网络或 Web 人类确认。

## 验证计划

先 RED 再实现，覆盖两域及导出向量、变更/重排/重复来源、未知和错误响应、取消/迟到结果/切账号恢复及草稿兼容 UI。最终运行该插件 typecheck/build、全部相关非浏览器测试、既有及本片浏览器交互验证、独立代码审阅与原未改动内容哈希保护。仓库没有独立 lint 脚本，不宣称 lint 通过。真实 HTTPS/PG/Redis、原生 MessageChannel/COOP、真实员工内容和安装版均另行验收。
