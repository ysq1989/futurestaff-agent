# 当前任务事件候选建议第二片

2026-10-25在笔记本YSQ-MI的当前Agent工作区完成。[规格](../docs/specs/governance-task-events-20261025.md)、[验收报告](../docs/validation/governance-task-events-20261025.md)。首片记录与备份原样保留，未修改CURRENT。

新增实际SessionEvent的纯规范化器、默认关闭/仅显式合成源可启用的任务聚合controller，任务结束后按域合并建议并复用首片本地确认UI。未注册真实监听，不读历史，不调用模型或正式API。普通尺寸偏好不产候选；反馈差距待核实，长期标准按域取证；规则摘要、用户原话与AI推测本地字段独立。

针对最终按域筛句修复版重新验证：typecheck/build通过，460项非browser回归+2项browser测试通过（均0失败/跳过），其中22项任务事件单测。两套fixture fetchCalls=0。有限规则不作为通用AI语义能力。重点验证生命周期、身份/任务隔离、去重/重放、分域、取消/撤权、确认前零持久、独立保存与仅本次。

证据与最终SHA：`C:\Users\10089\Documents\Codex\2026-10-25\task\evidence\governance-task-events-20261025`。独立基线129项脏文件，预期只增量修改2项本片拥有的源码，其他127项原字节保留，HEAD不变。完整保护结果见preservation-final.json，历史失败与中间通过版本保留attempts及checks归档。

下一门禁仍为可信桌面Agent/app/version/task/scope授权桥、结构化语义接收/模型另行联调、Platform wire映射（包括本地rule_summary）、人类确认/接收域/可见人员/撤权核验及另行授权的真实端到端验收。真实API、真实采集、安装版桌面均未验收；未部署、commit/push/PR。
