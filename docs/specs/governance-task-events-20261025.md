# 当前任务事件候选建议：默认关闭的第二片

在YSQ-MI当前Agent插件上增量开发，保持首片规格与保护记录。当前Host的post-commit session/event是正确实时入口，session.firstLiveSeq区分运行期；uiConversation folding会重放，因此不能作为收集源。本片不注册真实会话监听，只实现实际事件的纯规范化函数、默认关闭的任务建议controller和合成源UI接入。真实desktop_current_task即使传enabled也保持not_connected，缺合法task授权桥不能启用；isolated_synthetic只能由代码显式构造，产品UI无开启按钮。

接收上下文由可信外部binding提供owner、sessionId、taskId、turn、firstLiveSeq与authorizationVersion，事件不能自报身份。只处理当前任务最小增量；user/message必须来源user，插件/goal/tool输出不作用户证据。assistant提问可作规则上下文，不作事实/同意；interrupted消息丢弃。completed时合并每域最多一张，aborted及其他非正常任务结束清理；不逐句弹窗，不调用模型。

缺信息后的回答、纠正、明确诉求、抱怨通过保守规则形成建议。界面分别显示必要用户原话、规则摘要/触发原因、任务来源、接收域/分享范围和未连接；规则不宣称AI语义能力。本地basis新增rule_summary，与explicit_user、model_inference独立，旧记录可读；该本地值尚无Platform wire映射，不能发送为正式契约。未确认只在内存，用户可核对修改、本机保存或仅本次。后者按当前task/domain抑制重复重放；真实HTTP仍默认拒绝。暂不接受结构化模型输出，避免把模型文本冒充user_statement。

架构：governance-task-events.ts（normalize + lifecycle controller）→ CandidateWorkbench可选taskSource（稳定外部store + epoch生命周期）→ 首片MessageCard/LocalCandidateOutbox。默认产品仅展示未开启/未连接状态，不给真实用户开启持续记录。

边界测试包括关闭/伪身份/非user来源、firstLiveSeq与turn限制、允许无关事件seq空隙、同事件幂等与冲突、旧seq忽略、任务结束合并与域最小化、重复end不新建ID、仅本次不复活、取消/撤权/换owner/session/task异步失效、必要原话与规则摘要区分、未经确认零持久/零HTTP。合成浏览器直接喂事件并完成卡片核对保存，不再通过手动粘贴生成建议；沿用浅色/窄屏暗色与键盘验证。

验证：插件typecheck/build；全部非browser插件回归加首片/第二片browser测试；独立审查；原129项脏文件按SHA核对。无独立lint脚本，记录diff检查和源码审查，不宣称整仓或安装版验收。不得修改安装版、DSH Core、真实数据、网络安全配置，不新增依赖/凭据或commit/push/部署。
