# 企业知识候选与产品反馈：客户端本地首片（2026-10-25）

## 目标和范围

在笔记本 YSQ-MI 的当前 fs-platform-access 插件内实现非阻断候选卡片。用户从当前对话选择并手动提供最小文字摘录，明确授权后做确定性识别，不读取历史目录、不调用模型、不自动采集。候选未经确认只在内存。两类本地保存意愿独立，服务端权限必须另行核验。桌面确认桥未接通，正式 HTTP 默认拒绝；入箱不等于发布，产品反馈不等于排期。

## 技术和结构

沿用 React/TypeScript、Cordis session-scoped conversation.input.dock、现有 MessageCard 和 appearance tokens，不改 DSH Core、不新增依赖。新增 governance-candidates/outbox 纯逻辑模块、client/governance-candidates.tsx 与合成测试；index.tsx 仅加注册。基线/备份另存本任务 evidence/governance-20261025。

## 交互和布局

默认收起一个“候选草稿”入口，展开后显示必要摘录输入与授权，再显示两类独立候选。每卡先显示内容、明确陈述或AI推测、必要脱敏依据，再显示接收域/谁可见/用途/未连接。按钮为“保存候选到本机”“修改后保存”“仅本次”，已保存可取消。表单有label、错误提示和禁用态；默认不阻断聊天，无modal、无抢焦点。390px单列换行，宽屏使用双列元信息；沿用主题和键盘焦点。

组件：CandidateDock → ExcerptAuthorization → CandidateCard → MessageCard/MessageCardAction/MessageCardNotice；LocalCandidateOutbox 独立持有状态，账号/租户/session变化清空未确认草稿并停止异步结果回写。

## 验收

合成记录识别新事实/纠正/表达/资源变化和目标/期望/实际；explicit_user 与 model_inference 分开；2:3仅为宽高比，缺选项不直接标bug；密钥/凭据不入队、个人信息最小化。五分钟确认完整预览绑定，双击幂等，同key异hash冲突，改卡/撤权/换号/过期/重放/取消挡迟到；未知结果先查原key，不能改号重发。恢复只加载同owner，恢复授权false，损坏存储失败关闭。

## 视觉风险与修正

- 卡片过多：仅用户授权摘录后出现，并可收起。
- 假成功：持续显示“桌面提交未连接”，只说本地保存。
- 权限混淆：两域分别授权本机保存，平台授权/来源复用/管理员发布明确分开。
- 长摘录撑破布局：长度限制、文本换行、窄屏单列。
- 表单修改后误复用确认：内容变化撤销旧确认，必须重新保存。

## 验证命令和边界

`npm run typecheck -w @futurestaff/fs-platform-access`；`npm run build -w @futurestaff/fs-platform-access`；`node --test plugins/fs-platform-access/test/governance-*.test.js`；`node --test plugins/fs-platform-access/test/*.test.js`（均在实际本机仓库）。使用已有Edge临时profile和loopback做交互/主题/窄屏验证。仓库未提供该workspace独立lint脚本，补 git diff --check 和改动审查，不能声称lint已跑。不得安装、commit/push/PR、更新安装版或部署生产。真实API/安装版UI分别明确未测。

## 下一门禁

需获审的Agent/app/version/task/scope桌面授权与Web人类确认桥、实际contracts.py严格序列化对照、真实平台撤权与接收域策略、服务端部署和开关，以及单独授权的端到端测试。当前纯本地SHA不得宣称服务端互通。
