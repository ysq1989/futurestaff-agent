# 视频专用范围与原生聊天验收

用户要求：打开新版FutureStaff Agent，在“通用视频制作”的真实聊天中完成咖啡店视频初稿，再通过聊天修改一次；职责只聚焦视频制作。

## 已完成

- 开始菜单指向的已安装客户端为3.0.7。校验公开3.1.0安装器SHA后，通过正常NSIS静默更新到原有`D:/FutureStaff Agent`；退出码0、PE版本3.1.0、安装后app.asar SHA与已发布验收一致。保留Roaming用户目录、生产成员Profile与原成员工作目录；没有用空的acceptance Profile替代真实用户环境。
- 真实平台Agent原本继承20份网站设计、电商上新、通用任务执行、技能创建/安装和部署等技能文件。仅针对既定视频Agent，使用标准带版本历史的文件管理API移除这些副本，更新Soul/欢迎语/角色说明以及专用Skill1.0.1。全局技能、其他Agent、记忆与视频工程未动。新快照3文件：Soul、memory、video-production Skill。
- Agent仍为当前企业company/use、idle，既有免费主模型、无付费fallback，businessSystems=[]。新snapshot `ff3b9145e3018999bb816ff339a002b0eaeeafb7c164c3b51b9f80020e46a253`，Skill SHA `3106b184695f4306b0afac31b484f64d5b396d7b2f4a3823a6a448e6240959f2`。
- 运营脚本精确限制Agent/Skill/owner和20份原文件SHA，任何人类更改会拒绝；使用标准expected_version_token和历史版本API。未知写入结果与已完成操作只校验，不盲重写。真实20份删除历史已核对；临时验证session已撤销。
- 原桌面聊天后端已经按每次Agent权限和snapshot版本注入平台Soul/Skill；没有重复注入全量Prompt或修改DSH上游。视频专用范围来自Agent配置收紧。后续原生实测另外发现默认模型选择与Windows深路径问题，需3.1.1客户端修复。
- focused及原provision脚本测试8项通过，完整`npm run check`退出0：Stable117文件/1125项、Beta108文件/1032项（各13项原有条件跳过），根72项通过。记录在`outputs/video-agent-focus-check.log`。生产变更证据：`work/video-agent-focus-20261021/focus-receipt.json`。
- 真实标准后端聊天接口用新Agent snapshot和免费主模型回答“你能帮我做什么？”，HTTP200/stop，回复仅视频能力。平台审计admitted→completed，唯一新增账单479、1741输入/85输出、quota0。临时会话已撤销。证据`work/video-agent-focus-20261021/backend-capability-verification.json`；这是tools=[]的后端范围验证，不能代替原生界面的工具执行验收。

## 旧配置保留与新版启动

开始菜单原来的Roaming用户配置继续选中`~/.dsh`内的早期定制成员Profile，其中尚无视频模块。已只读查明根alpha清单SHA来自2.0.10官方安装器，但36项产品文件后来变化；平台59项lib与2026-10-05授权following-sync更新候选逐项一致，成员lib另有后续变更。因此升级器保留这些目录符合“用户修改不覆盖”的规则，不能将它们假称3.0.7官方原版后扩大允许覆盖范围。

未覆盖旧alpha/成员Profile、未改全局环境变量，也未迁移或删除用户工作文件。改用已安装且hash验证的3.1.0程序，以每进程DSH_HOME打开官方新版管理目录`%LOCALAPPDATA%/FutureStaff Agent/harness`，Electron状态在同级`desktop`。完整新版UI、选择智能体入口与视频代码实际存在；正常成员工作根仍按现有产品规则使用。启动收据`outputs/video-agent-managed-launch.json`。

## 原生聊天状态

用户已自行完成新版客户端登录。没有自动操作认证对话框、读取密码或注入临时凭据。

已在真实GUI会话`session-c0dc95be-b6c6-405f-87d5-58c6d66dca5e`提问能力范围，回答仅视频能力。实际发现“平台默认模型”仍解析到企业全局默认模型，费用未知；没有将这一轮宣称免费。随后在原生菜单明确选择已验证免费的FutureStaff模型，再通过聊天提交虚构社区咖啡店“街角咖啡”柑橘冷萃竖屏视频需求。

真实`video_project_create`成功创建工程`9c42e66a-b573-497f-8bbc-18b64d72a8c6`和初版`6f071da7-f982-4edc-9bf2-3371299801e0`。渲染任务`06e365ab-2b7d-416d-965b-43e11645ec7a`已实际执行：固定组件下载完成，但嵌入Python导入`_overlapped`时因Windows路径过长失败（Python绝对路径247字符，部分依赖超过260字符）。原项目和失败日志已保留，尚无本次成片，不能用旧样片或后端验证替代。

修复进行中：默认模型改为先读取当前Agent主模型策略再授权、显式选择仅留当前会话；旧业务接口保持1.0版本兼容。Windows运行组件改为按可信成员身份隔离的短缓存，项目与产物仍遵守原成员工作目录。私有成片链接用同一已认证原生会话预览，保留普通浏览器访问限制。完成修复、检查并打包后，继续原聊天渲染、播放初版，再通过聊天修改和播放第二版。

原聊天创建的第二个渲染任务`a2c7deaa-e957-4496-a61e-5fa37ff93d1f`已真实成功：1080×1920、30fps、27.733秒，MP4/WebM/封面/字幕的四项SHA均与制作清单一致，完整解码通过。初版已复制至ignored的`outputs/video-native-case/initial`供用户预览。通过聊天已提交精简到约20秒、自然音高、柔和配乐、保留原版的修改需求；最终修改版及原生实播仍待验收。

真实升级验收另外定位两项问题：缺少正式3.1.0 Profile清单的supersedence，且成员刷新没有覆盖视频包。现仅加入签名安装器`17e1879c…`对应的精确完整库存；用户修改、额外文件、身份不符、根或祖先链接均保留。已用标准只读计划和升级API更新本次现代环境，并校验原工程/版本/失败记录未变。最终公开包不包含本地中间构建的库存白名单，测试环境通过ignored的两阶段桥接对齐最终完整清单。

私有原生预览改为先加载固定HTML播放页，再由同源视频控件读取原授权素材；直接导航原始MP4在Electron中会中止文档加载。模型偶尔输出的自然音高`0`/`0Hz`规范化为Edge接受的`+0Hz`，范围与代码输入限制保持不变；工具说明也给出明确格式。
