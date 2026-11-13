# Administration Platform V1.1：本人身份绑定与无主管规则

冻结日期2026-11-13，实施中、未上线。由当前Platform/行政共同唯一写入方冻结；V1的六模型输入、canonical/wire名称、scope/modelPolicy和真人确认渠道不变。旧V1正文保持，不将空审批人偷解释成人类批准。

## 本人绑定

Platform `/desktop/v1/administration/context`及人类BFF context新增：`contract_version="1.1.0"`、`principal_user_id: UUID`。`principal_user_id`必须等于当前真实登录/desktop认证User ID；`employee_id`是Platform按该Identity与当前tenant在线解析的有效企业User ID。普通员工二者相同；显式纳入的全局身份保持原登录锚点和企业档案分离。不接受客户端指定employee_id。

消费端每次工具执行前后验证当前认证principal和tenant，再取得context绑定employee；requests/operation结果必须同时属于该tenant/employee。无新绑定字段的旧V1，仅允许employee_id等于认证User ID。1.1.0不得缺principal字段或降回V1。映射缺失、变化、撤销必须拒绝并隔离旧历史，不将旧会话/记忆自动重绑另一员工。Agent历史围栏包含principal+tenant+employee及已验证映射版本（当前organization_revision）；相同员工的任职/余额变化应重新校验工具事实，不迁移到另一员工。

## 企业规则

企业规则`missing_manager_action`只接受`require_manager|auto_approve`，默认require_manager；显式配置有稳定正整数revision、修改actor/操作ID及审计。仅当前有效、持久任职的`manager_user_id IS NULL`、当前企业规则auto_approve时适用；缺少任职、停用/无权/自主管均拒绝自动路径。其他数据、余额/排班/有效制度及真人确认前置保持。

签名Context和预览新增可选`approval_rule`，缺省null；非空结构固定为`{"code":"missing_manager_auto_approve","revision":正整数}`。仅员工human/agent_read且manager_id=null时允许；platform_service证明不得携带。agent_read权限仍精确仅`administration.leave`，规则事实不授予模型写权限。预览/本人确认hash绑定该规则及organization_revision，提交再读当前规则，不允许旧预览复用。

## 申请与决定

主管路径的旧创建、回执、回调、ack保持V1。规则路径的manager_id为真实null，申请/预览保留非空approval_rule。新增内部路径前缀`/api/internal/approvals/v1.1/administration`，具有与V1相同create/cancel/query/acknowledge动作、幂等和HMAC边界；规则投递只用此前缀，旧V1拒绝null主管和规则决定。

create payload为V1业务字段（employee_id、organization_revision、kind、start、end、minutes、reason、policy_ref和可空岗位/级别）加manager_id=null及approval_rule。Platform在租户串行锁下在线核验员工任职/规则/版本。生成审批记录、稳定终态事件和delivery，不创建人类主管待办；员工通知和本人详情明确“按无主管规则自动通过”，不能显示某人批准。

规则回执沿用V1字段，加`decision_source="system_rule"`、`rule_code="missing_manager_auto_approve"`、`rule_revision`；state只允许approved、approver_id=null，decision_reason为明确规则说明。pending和cancelled无决定源（null），有稳定取消事件时沿用原取消/ack语义。规则匹配与拒绝场景不是rejected业务决定，不伪造系统驳回。

决定回调继续`/api/administration/v1/internal/approval-decisions`，闭合DTO新增上述3个可空字段；人工路径省略或decision_source="human"，必须真实具名approver且与原主管绑定，无rule字段。system_rule只接受approved/null approver/固定code+与请求approval_rule相同revision。行政保留真实空主管/规则快照/决定源，不将系统 actor填成人类resolved_by。先一次核销，再稳定ack，之后Platform application_state=applied。恢复/查询/取消/创建竞态保持原编号和单终态。

公开本人request/operation DTO新增approval_rule和decision_source/rule_code/rule_revision，可空；manager_id仅当approval_rule有效时允许null。规则申请尚未核销时decision_source可空；批准后必须system_rule且resolved_by=null。撤回终态不宣称发生自动批准。普通V1具名主管结果仍可读取，不因额外字段自动扩大模型权限。

operation顶层严格保持旧七字段`intent_id/submission_state/operation_id/expires_at/preview/result/error_code`，不新增principal或规则字段。`preview.approval_rule`在预览内；`result`为原本人request DTO，规则及决定字段只在result内。`not_accepted/unknown`可保留原preview而result=null，不能把预览当作已提交。完整合成样例见[operations](examples/administration-v1.1-operations.json)。

公开request状态增量`pending_system_approval`：已取得规则审批编号、尚待系统决定/核销，必须有非空approval_rule及null manager，不表示待人类主管。原主管路径仍为pending_supervisor；withdrawal_pending及其他终态沿用V1。source及rule决定字段在未批准前为空。

## 兼容与启用

1. 行政新版本先接受旧V1证明/人工回调并支持新schema，规则投递保持关闭，Platform仍旧版本。
2. Platform新版本支持显式任职、主账号/员工分离和内部v1.1。先以默认require_manager读取既有记录，检查服务桥。
3. Agent消费者升级并通过新本人/映射历史围栏与规则DTO验收。六输入和V1名单不改。
4. 三端都READY后，用户通过人类管理入口明确纳入主账号、录入其期初/排班、审核绑定制度并为乐奇无限开启auto_approve。不得为其他企业自动开通规则。
5. 旧V1消费者不能办理新profile映射或规则申请；拒绝并提示升级。出现新数据后，回退目标须能读取该schema/显式任职/自动终态，关闭新规则后保留未完成事件和原数据，不降库或恢复备份覆盖新业务。

 machine DTO增量见[绑定清单](ADMINISTRATION_EMPLOYEE_BINDING_V1_1.json)；具体闭合边界与接受/拒绝样例由各仓测试执行。该合同不等于生产功能已开通或真实企业已验收。
