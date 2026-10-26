# 当前任务事件候选建议：本地第二片验收

在YSQ-MI的 `D:\项目\FutureStaff-Agent-client` 完成增量第二片，HEAD保持 `c664e505ed7a5d29912b632828f23fc8ec5f34ab`。首片备份/报告保留；本片独立基线位于 `C:\Users\10089\Documents\Codex\2026-10-25\task\evidence\governance-task-events-20261025`，baseline.json SHA-256为 `04e222100b38acd20311298c24dec67ffe3dfe0bdb17271f2ecfdb3389f31b02`，记录129项当前脏文件与275份原lib产物共404份可逆副本。

## 实现与边界

新增 `governance-task-events.ts` 的纯SessionEvent规范化器和仅内存任务聚合controller。经源码核对，实际Host入口是post-commit `session/event`、运行期边界是 `session.firstLiveSeq`；user/message.data直接是UserMessage，必须source.kind=user，普通工具结果不能冒充用户。Conversation fold会重放，未作为收集入口。

生产来源desktop_current_task默认关闭，即使enabled=true也not_connected；没有注册真实session/event监听、读取历史或启用真实采集。只有显式isolated_synthetic factory可用于合成验证。合法任务scope桥仍缺，不能凭renderer/工具自报tenant/actor/task授权。未来须Host authorizeLocal身份与真实agent/session实例及独立task授权共同核验。

合成增量绑定owner/session/task/turn/授权版本/firstLiveSeq；串行去重、冲突关闭、旧序忽略、任务结束合并每域最多一张，不逐句弹窗。取消/撤权/换绑定用epoch与generation清理，闭合序号拒绝迟到输入；仅本次抑制当前任务同域重放。sourceId包含可信会话/任务定位前缀及完整隔离hash，sourceVersion明确为本地事件序号和授权版本hash。

规则摘要独立本地basis=rule_summary，与用户明确原话、AI推测分开；不调用模型，也不把规则声称AI语义能力。旧本地记录仍可读取。rule_summary尚未定义Platform wire映射；真实提交仍拒绝。卡片复用首片修改/独立同意/本机保存/仅本次/恢复路径，未确认不持久。保存失败不显示假成功；手动草稿与事件草稿分别按精确来源管理。

语义门禁：比例问答和一次性任务尺寸偏好不自动形成反馈/知识；明确无法生成/没有选项仅形成待核实诉求，不判定bug；长期品牌标准须明确表达。关联短答保留必要同域用户前文与回答，不将助手问题当user_statement，也不夹带另一域内容。建议来源、规则说明、接收域、当前分享范围和未连接状态在UI分别显示。

## 验证

最终检查于2026-10-25 15:23 UTC完成，针对最后按域筛句后的实际代码重新执行，未沿用453/457/459等中间版本结果。

| 检查 | 最终结果 |
| --- | --- |
| `npm run typecheck -w @futurestaff/fs-platform-access` | 通过 |
| `npm run build -w @futurestaff/fs-platform-access` | 通过 |
| 本插件全部78份非browser测试文件，Node runner concurrency=4 | 460通过，0失败，0跳过，包含22条任务事件单测 |
| `node --test plugins/fs-platform-access/test/governance-browser.test.js` | 1通过，0失败，0跳过；首片完整交互回归 |
| `node --test plugins/fs-platform-access/test/governance-task-events-browser.test.js` | 1通过，0失败，0跳过；含语义正反例、生命周期与分域确认 |
| 独立只读审查 | 已知Critical/Required全部解决 |

完整命令/退出码/日志由本片 `checks/results.json` 记录，测试进程使用 `--import file:///C:/Users/10089/Documents/Codex/2026-10-25/task/local-test-network.mjs` 仅允许loopback fetch，两套UI的fetchCalls均0。首片browser回归输出单独写入本片 `ui/first-slice-regression`；第二片写入 `ui/task-suggestions`，含 `merged-task-light.png`、`merged-task-narrow-dark.png` 和 `ui-result.json`，已视觉核对。测试进程的 `FUTURESTAFF_GOVERNANCE_TEST_OUTPUT` / `FUTURESTAFF_GOVERNANCE_TASK_TEST_OUTPUT` 可指定独立输出目录，均未写全局设置，不覆盖首片原证据。

首次第二片browser失败（比例澄清短答未关联）保留于 `ui/ui-result-initial-failure.json`；首片AI推测文案差异和第二片绑定切换失败分别保留在checks中。修复与用户后续语义收紧均重新验证，不隐藏失败。

## 保护与下一门禁

本片只改两个首片源码：本地basis枚举扩展和可选事件source UI；其余127项本片基线脏文件按SHA原字节保留。`preservation-final.json`记录最终SHA与生成产物变化，CURRENT及其他并行任务不改。没有commit/push/PR、安装软件、更新安装版、部署、付费模型或持久凭据。

规则仅为有限、保守基线，不是通用AI识别，也未承诺高召回。模糊内容不建议或保留待核；后续语义能力须通过结构化接收约定与另行模型联调推进。当前已选定正反例全部通过，未继续扩展语言模式。

真实Platform API与安装版桌面业务UI均未验收；根级desktop完整check及无关历史browser未跑。该workspace无独立lint脚本，分别记录类型/构建、diff检查与独立审查。下一门禁是可信Agent/app/version/task/scope桥、contracts.py与本地新增basis的正式映射、合法接收域/可见人员/撤权核验、服务端开关及另行授权的真实端到端验收。不能伪造Web管理员、Origin/CSRF或借cookie。
