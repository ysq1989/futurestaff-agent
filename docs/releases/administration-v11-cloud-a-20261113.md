# 行政V1.1消费端：Cloud A兼容基线发布

后续状态：B已于2026-11-13 11:11:52上海时间发布，A保留为兼容回退，见[B正式回执](administration-v11-cloud-b-20261113.md)。本文下方保留A发布当时事实。

2026-11-13 **10:09:18上海时间**实际切换A，公网后检通过。**仅A已发布，B及三端独立页面迁移未完成**。Platform当前维护者在已核验人类联合发布授权下明确本次独立窗口，并保持生产Platform1.15.1/g130/schema16及原V1 context/URL。Root不修改Platform或行政源码/数据库/规则。

## 实际版本

- 源码`9730ec569d339d6e3e3234405aded36894612f4b`，已推送；build`0.1.0-7f4f73e000cd`，无独立generation。
- image`sha256:ec65fa743671e0c2c0b3a7bdb4ccd7856096fd8ca9ca5fe0c47bc9db4c7e7ee9`。
- runtime+HTML source hash`7f4f73e000cd5e6b0943a440bde020dcd78c0b2ad31c459be20bf4df12b4bdae`，Git规范归档与已测试工作区构建一致。
- 此前运行`0.1.0-a52cf521b9b4`、image`sha256:1e673759bb2a2c5be72b2f46acc280c88165a19bb74cf5571fb3cb0fc97771ef`，切换前精确CAS及9个会话idle通过。旧版本仅在数据未变、仍属V1兼容且任务状态安全时可恢复；一旦出现V1.1事实禁止恢复旧a52。

A新增在线principal/tenant/employee归属、工具前后复验、历史不重绑及V1.1单调协议围栏；新规则DTO和新旧本人确认链接严格校验，六工具/原认证凭据及modelPolicy保持。兼容旧服务不代表新生产者功能已经启用。旧无员工绑定的行政历史保留但不自动收养，新建会话须重新验证；其他系统上下文不受影响。

## 新鲜备份与真实恢复

停止原服务并确认退出后，采集**当时28份文件**的逐文件SHA；原环境及密钥单独保留。新鲜归档SHA256`f8e2f2e0054336af36f02d40e6ec5308578f63bd2708a67067508b4fc4b1f468`，环境快照SHA256`216a7c651d9e89c4c6d1b26deb9d09f7ae30f8beae9b0eb8cfb7c05cf885bac7`。

归档在私有目录实际解包，全部文件SHA与停止后原数据一致；A、B两个固定镜像分别在nonroot/只读/无网络容器中，以原密钥完成同一批**10份加密记录**的AES-GCM解密及JSON解析。恢复测试后再次确认原数据和环境未变，才原子替换唯一AGENT_BUILD_ID并启动A。没有将旧备份恢复到生产、没有覆盖新业务，也没有自动回放未知请求。

私有备份位于服务器`/opt/futurestaff-agent-cloud/releases/administration-v11-a-ops-20261113-0.1.0-7f4f73e000cd/backup`，不下载或展示成员正文/密钥。此前27文件历史备份只作候选预检，本次28文件才是实际发布新鲜恢复，两者不可混称。

## 验证

SDK/协议104、Cloud48、Mobile32专项回归均通过、0跳过；包含身份/规则/URL、降级、并发历史读取和旧中断文档保存后重启围栏。隔离Git仓测试与规范源码重建通过；两镜像此前均通过无网络运行smoke。

发布脚本10项临时目录/mock-Docker测试通过并独立复核。审查发现并修复“原容器已退出、恢复失败且V1数据发生变化仍重启旧服务”的缺口。两个异常恢复分支现在都要求数据逐SHA相同、V1协议兼容、状态安全；停止后快照尚未取得时只能按停止前快照确认未变。不能确认时保留当前数据并停住，不盲目恢复旧协议。

实际脚本SHA256`71b2c390910dd1dc9c558779d95953e0124e8db4b30132415c41e57134eb240d`，测试SHA256`336435d60422a4c85ab87d15882a9e80d18f99173b2cd6c835e4d66041705717`；源码和测试及其provenance已随发布保存在服务器私有操作目录。

切换后实际image与build匹配，公网health200、10份静态文件逐SHA、入口等于index通过。匿名systems/admin sessions/AIGC authorize均401，错误Origin login403，Platform行政context匿名401。没有使用真实员工凭据、创建请假/审批或调用付费模型；这些后检不等于真实业务/生产SSO验收。

Android仍**0.3.5/code18**，APK SHA256`6cc0243b359e1f8cc354dd7e534e89dac3a13c87cc035986a0319cc3c5d14a08`，更新清单已重验。前端仍`cac9db9bb757`，十份资产与原版本相同，JS SHA256`a3916370f1a541a3a37ac1a017c83e71195f8ad74382626d908ef780bc15e023`；没有重新发布APK或修改AIGC服务。

## 下一阶段

窗口已通知Platform和行政维护者结束，供其采集各自的新鲜基线。B候选`0.1.0-9d35a827f507`/源码`37d7e1e638313938bdbae952be2c28aef9d528e5`/image`sha256:f5a6a964e1accca08f859b3377761b39e8264cf0cf096d5b481efff240a5d872`继续保持未切；仅增系统规则解释提示，全部身份/协议/DTO/URL围栏与A兼容。三方最终窗口与真实联合验证后再切B，并以实际生产A为兼容回退；不提前启用企业规则或宣称三端迁移完成。

证据：[实际闭环](../../work/administration-agent-consumer-v11-20261113/a-release-closure.json)、[新鲜恢复](../../work/administration-agent-consumer-v11-20261113/fresh-restore-a.json)、[切换](../../work/administration-agent-consumer-v11-20261113/switched-a.json)、[公网](../../work/administration-agent-consumer-v11-20261113/public-a-verified.json)、[实际操作](../../work/administration-agent-consumer-v11-20261113/switch-a-live.log)、[发布器测试](../../work/administration-agent-consumer-v11-20261113/switch-a-tests.log)。整体进度见[实施任务](../../tasks/administration-agent-consumer-v11-20261113.md)。
