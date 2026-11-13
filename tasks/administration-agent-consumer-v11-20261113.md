# 行政V1.1与独立页面：Agent消费端

2026-11-13。**本仓候选READY，源码已提交推送，双镜像隔离运行和既有备份恢复预检通过；未切生产Cloud，待三端联合就绪与切换时新鲜备份恢复。** Root为本仓唯一实现写入方。Platform与行政分别由其维护者实施，本任务只改SDK/Cloud和相关测试/回执。用户原始迁移/提交推送/发布授权已直接读取核验，来源ID见[接收回执](collaboration/PROPOSED-administration-20261113-agent-owner-and-rule-v11.md)。生产Cloud仍`0.1.0-a52cf521b9b4`。

## 冻结契约

Platform `docs/contracts/ADMINISTRATION_PLATFORM_V1_1.md`、`ADMINISTRATION_EMPLOYEE_BINDING_V1_1.json`、`examples/administration-v1.1-operations.json`、`ADMINISTRATION_WEB_APP_V1.md`及`examples/administration-web-confirmation-urls.json`；快照在SDK测试`fixtures/administration-v11/`。新确认地址只接受精确`https://administration.fsstory.net/leave?intent=<同一个小写UUID>`，兼容旧Platform精确路径；拒绝额外/重复参数、userinfo、hash、编码/路径规范化伪装与任意其他origin。DEV不接受PROD行政链接。

## 本地实现

- 在线context将登录principal与本企业真实employee分开；Host认证和模型归属保持principal。每个业务工具前后重验绑定；不接受模型指定employee。
- Cloud会话保存principal/tenant/employee归属，变更/缺失/撤权拒绝；旧无绑定行政历史保留但不自动收养。普通组织revision变化不换人。API视图不暴露内部绑定。
- V1严格兼容；一旦验证V1.1就不能降回V1。Cloud协议标记可在同员工下单调提升，落盘与普通save都保留已验证下限，包含并发列表提升/读取中断旧文档/重启场景，不覆盖消息。
- 规则字段闭合、无主管与版本一致；`pending_system_approval`不是主管待办，系统批准不得虚构resolved_by；撤回时决定来源/规则决定字段与审批时间为空，approval_rule快照保留。非接受/未知操作的result为空，原七字段envelope不变，预览不等于提交。
- 新旧本人确认链接均严格校验；系统提示和工具文案改为行政应用，模型仍仅本人查询+预览，无提交/撤回/审批/管理工具。

## 验证与候选

根目录SDK104/Cloud48/Mobile32通过、0跳过，使用合成身份和本地HTTP/DSH模型替身，无真实员工业务或付费调用。独立审查指出的协议降级与并发持久化窗口均有RED→GREEN回归；最终审查未见新的必修阻断。

隔离release仓基线`844942936305f2d3b5165c600d41ba50b1062b6f`，GitHub main已只读核对一致。只复制13份SDK/Cloud/测试/合同文件，不包含根目录其他脏工作或Android035源码。隔离仓同样104/48/32通过；A候选build `0.1.0-7f4f73e000cd`，源hash`7f4f73e000cd5e6b0943a440bde020dcd78c0b2ad31c459be20bf4df12b4bdae`。前端沿用034十份资产，不重建或改变正在手机测试的035。

A支持全部V1.1数据/URL和中性本人确认提示，拟作为验证后的兼容回退；B仅在A上增加自动规则状态的明确模型解释提示。两候选都必须有各自来源、运行与恢复证明。**旧a52禁止作为V1.1数据后的安全回退**。候选A此前未生产，不冒称已生产稳定版本。

兼容A源码已在隔离main本地提交`9730ec569d339d6e3e3234405aded36894612f4b`，从Git规范LF归档重新构建的`compatibility-a-from-commit`与工作区候选的build/source hash完全相同，十份静态资产与已发布版本相同。构建依赖使用隔离仓的Cloud-local sharp0.34.3；不使用根目录其他版本。

正式B在A上仅补模型对系统规则的解释提示，避免把`pending_system_approval`说成人类主管待审、把null resolved_by虚构成人类审批，或把批准等同外部ack已确认。根目录及隔离仓Cloud48项通过；SDK104/Mobile32输入未变。B工作区候选build`0.1.0-9d35a827f507`、source hash`9d35a827f507e9b0162d09b922ec6cc1d064db60d9c018415e01bac3cef9364f`。B规范归档重建/镜像/恢复证据及正式状态待补。

## 候选READY回执

- 兼容A：源码`9730ec569d339d6e3e3234405aded36894612f4b`；build`0.1.0-7f4f73e000cd`；image`sha256:ec65fa743671e0c2c0b3a7bdb4ccd7856096fd8ca9ca5fe0c47bc9db4c7e7ee9`。
- 正式B：源码`37d7e1e638313938bdbae952be2c28aef9d528e5`；build`0.1.0-9d35a827f507`；image`sha256:f5a6a964e1accca08f859b3377761b39e8264cf0cf096d5b481efff240a5d872`。
- 两提交已从隔离main推送，并只读核对GitHub main=B。规范Git源码归档重建均与已测试工作区的build/source hash一致。原保留副本工作树和索引未重置/拉取，Android035及桌面原有工作保留；后续同步勿直接覆盖该副本。
- 两镜像均以nonroot、只读、无网络、无真实用户数据的临时容器通过health200、静态200、匿名401、错误Origin403、sharp及DSH JSONL加载；没有启动新生产容器或改变service.env。
- 双镜像对**既有发布前已验证备份**完成实际解包逐文件SHA和AES-GCM解密，27文件、10加密记录均通过，备份SHA`554f3b2505db1ee46add9549df7341222227edad3ebfefa7b7c15e7ac042cef7`。这是历史备份格式恢复预检，**不是当前生产新鲜恢复**；正式切换仍须停写后采集当时数据、实际恢复，并保持原密钥和全部记录。不得恢复旧备份覆盖新业务。
- 兼容回退只用A，保留同协议/员工围栏、新旧URL和规则DTO；A此前未生产，不称已生产稳定版本。a52不具备新围栏，出现V1.1历史后不得恢复到它。

候选及日志在`work/administration-agent-consumer-v11-20261113/`，规范候选为`compatibility-a-from-commit`和`production-b-from-commit`；source证明`a-canonical-proof.json/b-canonical-proof.json`，镜像smoke和`restore-preflight.log`分别记录边界。三端候选及联合验证就绪后再串行安排切换：须先让Cloud具备消费兼容，再由生产者启用新URL/规则事实。真实SSO/本人确认/主管或规则执行及Knowledge审核由对应授权方分别验收，本回执不冒充整体已上线。
