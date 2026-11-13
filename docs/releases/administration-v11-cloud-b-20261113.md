# 行政 V1.1：Cloud B 正式发布

2026-11-13 **11:11:52 上海时间**已实际发布。Platform 当前维护者确认行政 B 已运行 g3/0.2.2 后，明确开放独立 Agent B 窗口；本次窗口完成并已通知两维护者。Platform 最终 C/g133 随后完成，正常浏览器真实账号 PKCE/HR 配置/唯一半天申请及无主管规则台账确认也已验收，见末尾接续。本仓不修改其他系统源码或数据；Agent 自然语言真实模型、小米15语音及通知列表 UI 仍未据此验收。

## 精确版本

- 源码 `37d7e1e638313938bdbae952be2c28aef9d528e5`，已推送；build `0.1.0-9d35a827f507`。
- image `sha256:f5a6a964e1accca08f859b3377761b39e8264cf0cf096d5b481efff240a5d872`。
- runtime/HTML source hash `9d35a827f507e9b0162d09b922ec6cc1d064db60d9c018415e01bac3cef9364f`，规范 Git 归档重建与已测候选一致。
- 兼容回退 A：源码 `9730ec569d339d6e3e3234405aded36894612f4b`、build `0.1.0-7f4f73e000cd`、image `sha256:ec65fa743671e0c2c0b3a7bdb4ccd7856096fd8ca9ca5fe0c47bc9db4c7e7ee9`。

B 与 A 的协议、员工绑定、存储及 URL 围栏相同，仅增加模型解释系统规则状态的提示：`pending_system_approval` 不是主管待办；`system_rule` 的空 resolved_by 不得虚构为人类；批准不得推断外部 ack 已确认。六个本人查询/预览工具保持，没有提交、撤回或审批工具。

## 新数据兼容恢复证明

在隔离私有目录运行实际固定 B、A 镜像及真实 Cloud CLI/DSH/JSONL，容器 `--network none`，Platform 和模型使用进程内合成响应；没有挂载生产数据或使用真实员工凭据/付费模型。B 以 principal≠employee 的 V1.1 上下文写入真实会话和历史，含系统批准、系统待审、撤回规则快照、人工决定、原七字段操作 envelope、新行政本人确认 URL。

B 完成 214 个检查，A 直接使用**同一份 B 新数据**完成 253 个检查，包括原历史不丢失、请求幂等不重放、六工具、URL/私人字段边界、员工映射变化阻断、协议降级阻断和 ERP 范围隔离。原 B 数据新鲜归档实际解包后逐文件 SHA 相同（4 文件，SHA256 `25fdf7f445dbe895f23dc1999635fed36c90ea41aecb690663a377e30abf5ee8`）。旧 a52 在恢复副本上作为负控，按预期得到 502/ADMINISTRATION_RECEIPT_INVALID，模型与预览调用均为零；**a52 不得作为回退**。

该证明不是生产 SSO 或真实员工业务验收。证明回执 SHA256 `a6c3379e7e78582d7f99a9b6cc29ae22463e80c965fac06cd51c23be39f60f2b`，服务器私有目录 `/opt/futurestaff-agent-cloud/releases/admin-v11-b-to-a-proof-20261113-9d35a827f507-attempt1`。不展示认证状态、Cookie 或成员正文。

## 实际切换与后检

专用 B 发布器 11 项隔离测试 RED→GREEN，通过独立只读复核；不能直接复用 A 阶段仅允许 V1 的旧恢复逻辑。异常时仅允许固定 A/B 镜像，候选停止后确认 exited，保留当前数据切回兼容 A，不恢复旧归档；未知协议、活动任务、损坏 JSON、符号链接或陌生替换镜像会阻止恢复。

切换前固定 A 镜像/build CAS 和 9 个 idle 会话通过。停止 A 后采集**当时 28 份文件**，新归档 SHA256 `f6ecf32befd6acd8420370814bd2a55376e22081bf5cd9580021e4d1d1236efb`，环境快照 SHA256 `b84104409ee10018f602b5d74ee49426d04c537212a95d96ed163c421f20b2a3`。真实解包逐文件 SHA 一致，固定 A/B 镜像分别在无网络只读非 root 容器中用原密钥完成同一批 **10 份加密记录**的 AES-GCM 解密。再次核对原数据及环境未变后，原子替换唯一 AGENT_BUILD_ID，启动固定 B 并确认实际 image/health。没有恢复旧备份覆盖新数据。

实际脚本 SHA256 `7949aecef2f11352824b6141d8ea57a179a6b38cfd0eb53df84a5a823b5a66ed`；测试 SHA256 `0471db81a7bd9fdaa6d4208cff20f7ef6ec1bd83f195ea4417d41fcda720e342`。脚本、测试及 provenance 随私有操作目录保存。新鲜备份在 `/opt/futurestaff-agent-cloud/releases/administration-v11-b-ops-20261113-0.1.0-9d35a827f507/backup`。

公网 health、10 份静态资源全文 SHA、入口与 index 相同通过；匿名 systems/行政 sessions/AIGC authorize 均 401，错误 Origin login 为 403，Platform 行政 context 匿名为 401。此前 SDK104/Cloud48/Mobile32 专项测试 184 项全部通过、0 跳过；本次未改产品代码，仅发布冻结镜像。

Android 仍 **0.3.5/code18**，APK `6cc0243b359e1f8cc354dd7e534e89dac3a13c87cc035986a0319cc3c5d14a08`/130996200 字节。更新清单全文 SHA `be6a56e111745bc1c2f73e0d2992c80c06aaa59db4858d1f80ce55b47c6d0c62` 及 no-store、公开 APK HEAD 长度已重验；手机语音仍待用户小米15真机验收。前端沿用十份原资产，未改变正在测试的 APK。

证据：[闭环](../../work/administration-agent-consumer-v11-20261113/b-release-closure.json)、[新数据恢复](../../work/administration-agent-consumer-v11-20261113/b-to-a-proof.json)、[实际新鲜恢复](../../work/administration-agent-consumer-v11-20261113/fresh-restore-b.json)、[切换日志](../../work/administration-agent-consumer-v11-20261113/switch-b-live.log)、[公网](../../work/administration-agent-consumer-v11-20261113/public-b-verified.json)、[发布器测试](../../work/administration-agent-consumer-v11-20261113/switch-b-tests.log)。

## Platform 最终窗口回告

所属维护者随后确认最终 C 已上线：Platform API/Web **1.16.0/g133/schema17/source4e3e8524**；197 静态全文 SHA、54 个非目标容器/其他配置、兼容 current+1/四全档及审批 timer enabled/lastsuccess 检查通过。审计 tag `deploy/platform/prod-administration-workspace-1.16.0-4e3e8524` 已推送，完整依据在 Platform `output/administration-workspace-20261113/release-receipt.json`。行政 **g3/0.2.2/source6419130d** 的公网/PKCE/边界通过，目录和旧链接指向 `administration.fsstory.net`。本仓据所属维护者回告登记，未自行切换其他系统；本次软件运维窗口已结束，不再另开容器切换。真实主账号 SSO、HR 和员工端到端业务仍待用户正常登录验收，无真实模型调用。

## 正常浏览器真实业务验收接续

2026-11-13 行政维护者补回已提交推送的验收文档，来源提交 `4924466`，已读取[正常浏览器请假验收](../../../FutureStaff-administration/docs/acceptance/main-account-browser-20261113.md)。该接续更新上一阶段“主账号 SSO/HR 待验”的状态：用户从固定入口重新完成正常 PKCE 登录，在授权业务页面完成本人显式任职、联调期初/排班、已审核知识 v2/version-1 和无主管规则 revision1 的配置，并提交唯一一笔半天申请。主登录身份和企业员工档案同 Identity、不同 User，原账号及权限保留。

审批实际为 `approved/system_rule`，主管及 resolved_by 均 NULL；行政台账已用240分钟、占用0。行政库和 Platform 所属维护者分别只读核验唯一审批、应用/ack 各一次，正常审批详情页面显示台账已确认。未重复提交、重放事件或额外扣减。联调期初仅为本次获批测试假设，不作为法定年假认定；原13份期初记录保持。

后台给原登录 primary 的完成通知恰1条，但主控台没有通知列表入口，本次未核验用户看到通知 UI。此项真实验收覆盖正常业务页面的无主管规则路径；不代表具名主管真人审批、Agent 自然语言真实模型调用或 Android 0.3.5/小米15语音已通过。本次接续只更新文档，不切容器、不重发 APK、不调用模型，真实账号凭据、业务标识及 HR 正文不复制到本仓。
