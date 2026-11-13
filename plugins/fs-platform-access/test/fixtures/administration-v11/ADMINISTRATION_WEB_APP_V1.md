# 行政独立工作台与Platform模块会话 V1

2026-11-13冻结，实施中，未发布。用户明确要求请假、审批待办、初始化归独立行政应用，并授权验证后提交推送与发布。本契约只迁移交互承载，不改变六模型输入、wire名称、人工确认或主管实例授权。

## 登录与权限

唯一PROD client `futurestaff-administration-prod`，origin `https://administration.fsstory.net`，callback `/oauth/callback/futurestaff`。沿既有S256 PKCE一次码与模块会话，无新DEV。module cookie `__Host-futurestaff_administration_prod`的短JWT只保存在行政BFF后端；浏览器只持行政自有opaque HttpOnly/Secure/Host-only cookie。BFF固定私网base `http://futurestaff-prod-platform-platform-api-1:8000`（已从现有行政API健康GET200验证），固定Host `administration.fsstory.net`；配置只允许该目标、正式Platform HTTPS origin或明确隔离测试注入，不接受请求输入目标。不转发任意cookie/Location/URL，不跟随重定向。

GET `/api/auth/administration-session`闭合投影：`schema_version=1`、`user{id,tenant_id,display_name}`、`tenant{id,name}`、`module{module_id='administration',client_id,environment='prod'}`、`permissions`、`expires_at`。user.id始终真实登录principal；员工映射只通过业务context的principal_user_id/employee_id取得。每请求重验当前身份、任职围栏、企业开通及权限，BFF绑定原principal/tenant/权限，不静默换人。

精确权限组：member/agent_admin仅`['administration.leave']`；org_admin/platform_admin为`['administration.leave','administration.manage','administration.policy.review']`。企业未显式开通则无权限。无新增approve权限；主管决定仍在线核验命名实例/当前直属关系/真人会话，管理身份不授予代审。

## 固定模块业务端口

前缀`/api/administration-app/v1`，仅上述模块cookie；拒绝Authorization、HMAC及desktop派生会话。POST只接受固定行政Origin和same-origin通道。行政BFF先完成opaque真人会话及同源CSRF验证，再固定向此端口发模块cookie；不能让服务actor或agent_read进入此通道。旧Platform bearer+CSRF端口不放宽。

GET：context、requests、policies、ledger、intents/{UUID}、operations/{UUID}、management/context、management/members、management/rule、management/employment/operations/{UUID}、approvals/inbox、approvals/{UUID}。

POST：previews、requests、requests/retry、requests/{UUID}/withdraw、management/employment、management/balances/open、management/calendar、management/policies、management/rule、approvals/{UUID}/decisions。

requests query仅after UUID/size 1..100；members仅page>=1/size 1..100/search（最多200字符）；inbox仅page/size。其他无query，拒绝重复/未知参数。members仅投影tenant_id/total/items{user_id,name,job_name,grade_name}。employment operation仅当前tenant/actor的member.enroll_global_self，不能读取其他组织操作或当余额operation。

输入输出复用现有人类BFF闭合DTO和V1.1员工/规则绑定。management/rule GET为{tenant_id,missing_manager_action,revision}，未设置require_manager/revision=0；POST为{operation_id,expected_revision,missing_manager_action}，回执同GET加operation_id；持久revision>=1。409 ADMINISTRATION_RULE_REVISION_CHANGED明确未更新，可清旧CAS后重读；409 ADMINISTRATION_RULE_OPERATION_CHANGED禁止换号覆盖；网络/未知保留原编号查询/重试。服务端用当前租户锁、审计及原操作回执，不存行政台账。

## 确认URL及旧链接兼容

字段仍`human_confirmation_url`，预览/operation envelope与V1.1样例字段不改。新产出唯一为`https://administration.fsstory.net/leave?intent=<同intent_id的规范小写UUID>`。消费者在迁移期间精确兼容旧`https://platform.fsstory.net/administration?intent=<同UUID>`。仅HTTPS、精确origin/path、唯一intent参数；禁止credentials、fragment、额外/重复query及任意重定向。不是对子域通配信任。合成URL边界样例见[机器样例](examples/administration-web-confirmation-urls.json)。原七字段operation样例仍以[原文件](examples/administration-v1.1-operations.json)为准。

旧Platform `/administration`→行政`/leave`、`/administration/management`→`/management`、`/approvals`→`/approvals`；仅保留对应合法且唯一的intent/approval UUID。其余参数不转发，无open redirect。新通知与新确认URL直接到行政。Platform移除三个控制台业务菜单和组件装配，保留开通/授权/应用入口；后台通用审批/outbox仍归Platform。

发布顺序：消费者先验证旧/新精确URL兼容，行政独立候选完成会话/页面/精确Schema及恢复验收，Platform模块端口和旧跳转完成联合验收后按目标CAS切换。三端READY前不宣称生产迁移完成。当前+一个回滚须支持实际新任职/规则事实，禁止用旧版本忽略新身份围栏或伪造主管决定。
