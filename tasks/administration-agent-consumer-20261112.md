# 行政FS助手消费接入

2026-11-12。当前：本地验证通过，准备独立发布。用户已授权交由本仓接入，并在Platform会话明确要求“把行政请假相关改动提交推送并发布上线”；当前维护者已直接读取该真人指令。[授权与契约回执](collaboration/PROPOSED-administration-20261112-agent-consumer.md)。不含付费模型测试或真实员工请假/余额操作。

原App0.3.4修复发行已冻结并发布，[发行回执](../docs/releases/mobile-toolbar-sso-0.3.4-20261112.md)。行政接入作为后续独立Cloud后端发布，保留034前端及AIGC登录修复，无需重发APK；其就绪门禁和生产回执独立记录。

目标是当前员工独立行政会话、六项本人查询/确定性预览及原Platform本人确认URL。确认、主管待办、台账回写由所属服务在普通真人权限下执行，不在Agent新建审批/余额权威或写工具。

计划：[外置设计](../work/mobile-toolbar-sso-20261112/administration-consumer-plan.md)。SDK/Cloud写入子任务负责六显式方法、严格投影、在线授权、专用snapshot与原modelPolicy、工具装配和所有系统隔离；Mobile只复用目录/Markdown并新增行为验证，未改生产源码。首轮Mobile31/31与受控点击矩阵通过，后端TDD进行中。

六canonical工具保持不变，传输名称按Platform冻结的`fs_administration_leave_*_v1`唯一映射；每请求仅转换当前已提供工具及其历史，返回值恢复canonical，拒绝未知/未提供/大小写变体。没有付费供应商探测。

Cloud新增13项及原28项共41/41、typecheck/build通过，独立只读复核无阻断。SDK及聊天/原模型/会话归属相关94/94通过；Mobile31/31及受控浏览器主动打开本人确认链接通过，未改生产Mobile源码。证据位于`work/mobile-toolbar-sso-20261112/administration-{cloud-qa,mobile-qa}.md`；SDK公共生产者契约另有可独立执行的冻结测试夹具，生成器仍从Platform权威仓校验。

原目录有无关未推送commerce文档提交和大量既有修改；使用`work/administration-agent-consumer-20261112/release-repo`的独立origin/main副本，仅纳入本任务及可构建Cloud所需已上线基础源码，不推送原目录无关工作。行政服务与Platform明确ready后才切换消费者；未创建真实员工Agent业务实例，不以404作为就绪。
