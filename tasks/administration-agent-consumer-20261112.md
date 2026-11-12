# 行政FS助手消费接入

2026-11-13。当前：**已发布，公网验证及独立复核通过，员工业务待配置后实测**。用户已授权交由本仓接入，并在Platform会话明确要求“把行政请假相关改动提交推送并发布上线”，本会话再次要求跟进Platform后上线；维护者已核对真人指令。[授权与契约回执](collaboration/PROPOSED-administration-20261112-agent-consumer.md)。不含付费模型测试或真实员工请假/余额操作。

原App0.3.4修复发行已冻结并发布。行政接入作为后续独立Cloud后端发布，保留034前端及AIGC登录修复，无需重发APK；[本次发布回执](../docs/releases/administration-agent-consumer-20261112.md)记录就绪门禁、首次使用路径和生产证据。

目标是当前员工独立行政会话、六项本人查询/确定性预览及原Platform本人确认URL。确认、主管待办、台账回写由所属服务在普通真人权限下执行，不在Agent新建审批/余额权威或写工具。

计划：[外置设计](../work/mobile-toolbar-sso-20261112/administration-consumer-plan.md)。SDK/Cloud已完成六显式方法、严格投影、在线授权、专用snapshot与原modelPolicy、工具装配和所有系统隔离；Mobile复用目录/Markdown并新增行为验证，生产前端保持。

六canonical工具保持不变，传输名称按Platform冻结的`fs_administration_leave_*_v1`唯一映射；每请求仅转换当前已提供工具及其历史，返回值恢复canonical，拒绝未知/未提供/大小写变体。没有付费供应商探测。

Cloud新增13项及原28项共41/41、typecheck/build通过，独立只读复核无阻断。SDK及聊天/原模型/会话归属相关94/94通过；Mobile31/31及受控浏览器主动打开本人确认链接通过，未改生产Mobile源码。证据位于`work/mobile-toolbar-sso-20261112/administration-{cloud-qa,mobile-qa}.md`；SDK公共生产者契约另有可独立执行的冻结测试夹具，生成器仍从Platform权威仓校验。

原目录有无关未推送commerce文档提交和大量既有修改；使用`work/administration-agent-consumer-20261112/release-repo`的独立origin/main副本，仅纳入本任务及可构建Cloud所需已上线基础源码，不推送原目录无关工作。行政服务与Platform明确ready后才切换消费者；未创建真实员工Agent业务实例，不以404作为就绪。

已提交推送`5e185d8507d122c63f0ed294dc30b60b774e37b2`。正式生产`0.1.0-a52cf521b9b4`，镜像`sha256:1e673759bb2a2c5be72b2f46acc280c88165a19bb74cf5571fb3cb0fc97771ef`。实际28个bundle输入从提交的canonical字节重建，server SHA`78e96f9dff6414de5cf955fade60124e8427ecad63ea8768a232ff34052fecbb`相同。00:19:40在两方READY后完成CAS、27文件实际备份恢复/10密文解密及切换；精确版本、10静态SHA/实际首页、匿名权限和独立公网复核均通过。无真实员工/模型操作，未更改APP安装包或Website。

原工作目录main仍保留`d6e2728969`及无关未提交工作，未为同步远端而reset/pull或覆盖。后续接续先定位独立发布副本及该提交，笔记本权威环境仍待原维护者接收。本轮不发布Windows桌面客户端。
