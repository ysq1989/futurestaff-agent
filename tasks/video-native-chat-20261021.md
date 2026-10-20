# 视频专用范围与原生聊天验收

用户要求：打开新版FutureStaff Agent，在“通用视频制作”的真实聊天中完成咖啡店视频初稿，再通过聊天修改一次；职责只聚焦视频制作。

## 已完成

- 开始菜单指向的已安装客户端为3.0.7。校验公开3.1.0安装器SHA后，通过正常NSIS静默更新到原有`D:/FutureStaff Agent`；退出码0、PE版本3.1.0、安装后app.asar SHA与已发布验收一致。保留Roaming用户目录、生产成员Profile与原成员工作目录；没有用空的acceptance Profile替代真实用户环境。
- 真实平台Agent原本继承20份网站设计、电商上新、通用任务执行、技能创建/安装和部署等技能文件。仅针对既定视频Agent，使用标准带版本历史的文件管理API移除这些副本，更新Soul/欢迎语/角色说明以及专用Skill1.0.1。全局技能、其他Agent、记忆与视频工程未动。新快照3文件：Soul、memory、video-production Skill。
- Agent仍为当前企业company/use、idle，既有免费主模型、无付费fallback，businessSystems=[]。新snapshot `ff3b9145e3018999bb816ff339a002b0eaeeafb7c164c3b51b9f80020e46a253`，Skill SHA `3106b184695f4306b0afac31b484f64d5b396d7b2f4a3823a6a448e6240959f2`。
- 运营脚本精确限制Agent/Skill/owner和20份原文件SHA，任何人类更改会拒绝；使用标准expected_version_token和历史版本API。未知写入结果与已完成操作只校验，不盲重写。真实20份删除历史已核对；临时验证session已撤销。
- 原桌面聊天后端已经按每次Agent权限和snapshot版本注入平台Soul/Skill；没有重复注入全量Prompt或修改DSH上游。视频专用范围来自Agent配置收紧，无需再替换3.1.0二进制。
- focused及原provision脚本测试8项通过，完整`npm run check`退出0：Stable117文件/1125项、Beta108文件/1032项（各13项原有条件跳过），根72项通过。记录在`outputs/video-agent-focus-check.log`。生产变更证据：`work/video-agent-focus-20261021/focus-receipt.json`。
- 真实标准后端聊天接口用新Agent snapshot和免费主模型回答“你能帮我做什么？”，HTTP200/stop，回复仅视频能力。平台审计admitted→completed，唯一新增账单479、1741输入/85输出、quota0。临时会话已撤销。证据`work/video-agent-focus-20261021/backend-capability-verification.json`；这是tools=[]的后端范围验证，不能代替原生界面的工具执行验收。

## 旧配置保留与新版启动

开始菜单原来的Roaming用户配置继续选中`~/.dsh`内的早期定制成员Profile，其中尚无视频模块。已只读查明根alpha清单SHA来自2.0.10官方安装器，但36项产品文件后来变化；平台59项lib与2026-10-05授权following-sync更新候选逐项一致，成员lib另有后续变更。因此升级器保留这些目录符合“用户修改不覆盖”的规则，不能将它们假称3.0.7官方原版后扩大允许覆盖范围。

未覆盖旧alpha/成员Profile、未改全局环境变量，也未迁移或删除用户工作文件。改用已安装且hash验证的3.1.0程序，以每进程DSH_HOME打开官方新版管理目录`%LOCALAPPDATA%/FutureStaff Agent/harness`，Electron状态在同级`desktop`。完整新版UI、选择智能体入口与视频代码实际存在；正常成员工作根仍按现有产品规则使用。启动收据`outputs/video-agent-managed-launch.json`。

## 原生聊天状态

3.1.0实际新版窗口已打开并留在登录入口。此前旧配置显示“登录已过期”，已请求用户本人完成登录；Computer Use安全规则禁止自动操作认证对话框，未点击登录、未读取密码或向客户端注入临时凭据。新目录的正常登录同样等待用户本人完成。

待用户登录后新建视频Agent会话，以新snapshot绑定；先验证职责回答，再通过UI发送咖啡店制作需求、等待真实成片、播放，再通过UI提交一次修改并验证新旧版本。尚不能把服务器配置校验或既有样片当作本次原生聊天完成证据。
