# 桌面候选补充契约：第五片验收

已在 YSQ-MI 原工作区完成，不变更安装版、Host 窗口安全策略或生产服务。真实 HTTP 保持 not_connected；当前任务事件采集继续默认关闭。有限确定性规则是保守基线，不是通用 AI 语义识别；结构化输出接收契约仍独立，未调用模型。

## 完成与验证

- typecheck 与 build：插件自带 npm workspace 脚本均 exit 0。
- 完整相关非浏览器回归：84 份测试文件，560 项通过，失败/取消/跳过均为 0。
- 既有本地候选与当前任务建议浏览器回归：2 项通过，失败/跳过均为 0；均 fetchCalls=0。包括未确认内容不持久化、分域权限、账号/租户/任务切换、重放/去重、修改后重确认、未知结果只原键恢复、仅本次、390px 深色与键盘操作。
- 本片新增绑定、响应及兼容检查先 RED 后 GREEN。独立审阅 45 项探针通过，Critical=0、Required=0；nullable receipt IDs 与迟到 pending 覆盖已 received 两项问题已复现并修复。
- 两域的 bound payload/target/完整 preview 以及 canonical UTF8/SHA 向量通过；27 组实际后端函数合成向量均对照。来源版本原序/唯一 source_id、selected_fields 改序参与哈希、普通文本证据及原始 excerpt hash 误用均覆盖。
- 后端与 Web 的空 tool/空复现步骤/Unicode 长度差异分层处理，不修改内容去迎合旧 hash。PrepareDesktop 的 opaque 来源版本业务门禁另按实际服务端代码校验。
- 回执按实际 dict builder 闭形解析，只接受匹配目标的 HTTP 200 JSON；非 JSON、未知错误/HTTP、额外字段、不完整或不一致回执保持 unknown。receipt.status=revoked，ID 可为 UUID 或 null。原 request/取消操作号和取消意图保留，状态及回执 revision 不回退。
- 现有草稿与本地队列卡已接入可展开的兼容说明；不生成 wire payload、不伪造 UUID、时间、权利/来源、身份、策略或服务端 task/facts，不自动迁移、提交或增加持续监听。

仓库没有独立 lint 脚本，未声称运行 lint。新增/修改文件的尾空白与末尾换行已检查；浏览器测试最后一次仅规范化空白后，另补跑该项交互 1/1 通过，未变业务源码。

## 确认范围

| 层面 | 本片状态 |
|---|---|
| 客户端纯函数、严格响应边界、隔离依赖注入 | 合成验证通过；默认不发送 |
| 现有 React 候选草稿/队列卡 | 本地浏览器合成交互通过，浅色/390px 深色截图已检查 |
| 真实 Platform HTTP / Web 本人确认 | 未接通、未上传真实内容 |
| Electron 原生 opener、MessageChannel、COOP、普通 Web 登录 | 仅源码审计与专用窗口设计，未原生运行验收 |
| 真实 HTTPS / PG / Redis / 安装版 | 未测、未部署、未安装更新 |

## 保护与证据

HEAD 仍为 c664e505ed7a5d29912b632828f23fc8ec5f34ab。149 个既有改动及 290 个生成文件已备份；143 个非本片改动文件哈希未变，6 个计划内修改保留修改前哈希/备份。前四片 1764 个证据文件保持不变。最终准确交付哈希、Git 状态与格式检查见 preservation-final.json。

任务证据根目录：C:/Users/10089/Documents/Codex/2026-10-25/task/evidence/governance-fifth-20261026。

- package-byte-verification.json / embedded-file-verification.json：22 段总包及 38 内嵌文件核验。
- reception-audit.json：中断/被拒损坏草稿的非执行记录及逐段原文恢复，无不确定写入。损坏 scratch 未重用。
- checks/results.json 与各 log：本片最终 typecheck/build/560+2 回归。
- ui/first-slice-regression/ 与 ui/task-suggestions/：交互结果及截图；browser-format-receipt.json 与 checks/governance-browser-format-final.log：格式后补跑。
- review/verdict.json：独立审阅、源文件哈希、已修问题及 45 探针。
- host-feasibility-review.md：精确 Host 行号、专用窗口最小代码/权限/平台 allowlist 决策表。

## 下一门禁

建议下一片只批准默认关闭的专用确认窗口代码与无凭据/合成内容的 Electron 原生验证：由独立 local opener 真实 window.open 创建固定受信 HTTPS origin/UUID 路径的单次子窗口，主窗口通用 deny 和现有隔离不变。远程子页无 preload、无 Node、全拒权限、独立非持久会话；先证明原生 source/origin/opener 与隔离条件成立。

需要新增 desktop-consent-window.ts、document.ts、contract.ts 和专用原生测试，runtime/index 仅加关闭的 Host capability/固定路由，electron-shell-generation 仅构造与销毁独立控制器。若需独立资源再改 electron-runtime/tsdown；不改变全局窗口政策或持久访问。平台精确 origin allowlist 另行审核，默认空；端口 fallback 则该候选确认保持未连接，不放开所有 localhost。真实 HTTPS/COOP/同本人 Web 登录另验，任何不成立均 fail-closed。若改用外部浏览器传正文，则须另订两端安全协议，不能借 cookie、改 COOP、伪造 Origin/CSRF 或预先上传正文。

另有第二个条件设计供下一步决策：由 Platform 新增固定 HTTPS origin 下仅 UUID 的 bootstrap opener 路由，再由其真实 window.open 打开同源确认页，可避开动态 localhost origin。Host 仅为登记的 bootstrap webContents/mainFrame/精确 URL/导航 epoch/一次性 capability/当前主体任务信号提供内存字节通道，不暴露通用 IPC、令牌或文件路径；确认子页必须实际无 preload。bootstrap 与子页共享专用非持久 Web session，由本人正常登录，绝不拷贝本地或系统 cookie/SSO。该方案增加远程 bootstrap 文档与最小专用 preload/IPC 的信任面，需单独批准代码和审阅 CSP/依赖/XSS 边界。Platform 改 bootstrap 路由及精确 handoff origin，现有 confirm 原子入箱/首次正文 POST 可保持，无需新增上传端点。它仍须 Electron 原生证明 same-origin COOP、opener/source、会话隔离与 preload 不继承；不成立立即关闭。

两方案均仅设计，详细两端文件/权限变更表位于 host-feasibility-review.md（SHA-256 0652d951d5028b61f7a9c680d133e815db7e280f3dd367541bb57f1cbfa38b0f）。本片没有实施或启用任何一项。
