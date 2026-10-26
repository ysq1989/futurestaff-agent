# 企业知识候选与产品反馈：本地首片验收

本任务在笔记本 `YSQ-MI` 的 `D:\项目\FutureStaff-Agent-client` 实施，保持 `main@c664e505ed7a5d29912b632828f23fc8ec5f34ab`。复用 fs-platform-access、当前身份 controller、session-scoped input dock 与既有 MessageCard；未修改 DSH Core、安装版、Profile 或会话目录。

实现范围：用户明确提供并授权当前对话的必要摘录，规则识别知识/反馈两域，分别最小化内容和依据并脱敏；草稿只在内存，域独立同意后保存当前 tenant+actor 的本地 outbox。卡片支持修改、仅本次、取消、恢复重新核对，显示接收域、当前仅本机可见、用途与“桌面提交未连接”。反馈区分用户陈述和AI推测，2:3是宽高比，缺选项不自动判bug。未调用模型。

本地状态覆盖完整预览hash、五分钟有效期、不续期重放、幂等冲突、撤权/换账号/切主体、按域取消tombstone、未知结果保持原请求号查回执、原子恢复和容量限制。导入/本地存储不是平台授权，恢复权限一律重置。隔离mock是唯一可传的适配器类别，无正式HTTP实现，默认flush返回not_connected。

## 验证结果

最终检查于 2026-10-25 14:29 UTC 完成。命令、退出码和日志存于 `C:\Users\10089\Documents\Codex\2026-10-25\task\evidence\governance-20261025\checks`。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck -w @futurestaff/fs-platform-access` | 通过 |
| `npm run build -w @futurestaff/fs-platform-access` | 通过 |
| 本插件77份非browser测试文件，Node test runner、concurrency=4 | 438通过，0失败，0跳过，含20条候选/outbox测试 |
| `node --test plugins/fs-platform-access/test/governance-browser.test.js` | 1通过，0失败，0跳过；23项UI检查，fetchCalls=0 |
| index 的 `git diff --check` 与独立代码审查 | 通过；无剩余Critical/Required |

测试进程使用 `--import file:///C:/Users/10089/Documents/Codex/2026-10-25/task/local-test-network.mjs` 禁止远程fetch；测试只使用合成记录与loopback。最终构建/测试日志分别为 `typecheck-final.log`、`build-final.log`、`non-browser-regression-final.log`、`governance-browser-final.log`。初次测试runner误用Windows绝对路径，加载器在测试执行前报错；已更正为文件URL，原日志保留，不掩盖失败。

复现测试：在仓库先执行上述build；再 `node --test plugins/fs-platform-access/test/governance-candidates.test.js plugins/fs-platform-access/test/governance-outbox.test.js plugins/fs-platform-access/test/governance-browser.test.js`。UI截图默认写入仓库 `output/governance-local-20261025/ui`，可用进程级 `FUTURESTAFF_GOVERNANCE_TEST_OUTPUT` 指定独立目录。

## 证据与保护

基线120项既有改动及266份原构建文件共386份备份，位于上述 evidence 的 `backup/`；`baseline.json` SHA-256 为 `126b652b0b894ec4d299d2285019a7b26e213f158edaa8cbedc0e766b31f2d2e`。`preservation-final.json`核对原脏文件字节与新增文件hash；119项原文件字节不变，index剔除本次导入、注册两行后与基线SHA一致，HEAD不变。构建仅更新插件的受管lib产物，新产物和原备份分别保留。没有reset/clean/pull/commit/push/PR，没有安装依赖或配置持久凭据。

合成UI截图在 evidence 的 `ui/`：`draft-preview-light.png`、`queued-light.png`、`queued-narrow-dark.png` 和 `ui-result.json`。使用独立临时Edge profile与loopback，不使用安装版账号数据，fixture fetch为0。

## 分别列明的边界

- 隔离核心/源码浏览器UI：按上述本地合成检查验证。
- 真实Platform API：未接通、未调用、未验收；服务端默认开关关闭，桌面确认桥未实现。
- 安装版桌面UI：未更新、未启动验收；浏览器源码验证不能替代安装版业务验收。
- lint：该workspace无独立lint脚本，未声称执行lint；类型/构建、diff --check与人工审查分别记录。
- 根级完整desktop check/其他历史浏览器用例：未运行。当前修改只涉及此插件；无浏览器插件回归与本次源码UI验证各自记录，不将其描述为整仓全绿。

## 下一门禁

需要受审的Agent/app/version/task/scope桌面授权与真实人类确认桥、实际contracts.py逐字段与严格hash序列化对照、接收域/可见人员/撤权策略核验、服务端部署与开关，再按新的明确授权做真实端到端测试。不得使用管理员伪会话、伪造Origin/CSRF、借用Web cookie，不能以客户端自报确认、localStorage权限或本地hash替代。首片的规则匹配与手动摘录会漏识别复杂表达，不宣称自动理解全会话或通用DLP。
