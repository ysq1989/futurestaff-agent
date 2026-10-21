# 视频专用范围与原生聊天验收

用户要求：打开新版FutureStaff Agent，在“通用视频制作”的真实聊天中完成咖啡店视频初稿，再通过聊天修改一次；职责只聚焦视频制作。

状态：已完成。Windows3.1.1已发布并从公开HTTPS完整下载验证；真实原生聊天完成初稿、保留原版后修订，两版均在原生私有播放器播放至结束，安装版冷启动再次播放修订版通过。本文下方保留中途失败和环境排查历史；最终结论以“3.1.1最终验收”为准。

## 已完成

- 开始菜单指向的已安装客户端为3.0.7。校验公开3.1.0安装器SHA后，通过正常NSIS静默更新到原有`D:/FutureStaff Agent`；退出码0、PE版本3.1.0、安装后app.asar SHA与已发布验收一致。保留Roaming用户目录、生产成员Profile与原成员工作目录；没有用空的acceptance Profile替代真实用户环境。
- 真实平台Agent原本继承20份网站设计、电商上新、通用任务执行、技能创建/安装和部署等技能文件。仅针对既定视频Agent，使用标准带版本历史的文件管理API移除这些副本，更新Soul/欢迎语/角色说明以及专用Skill1.0.1。全局技能、其他Agent、记忆与视频工程未动。新快照3文件：Soul、memory、video-production Skill。
- Agent仍为当前企业company/use、idle，既有免费主模型、无付费fallback，businessSystems=[]。新snapshot `ff3b9145e3018999bb816ff339a002b0eaeeafb7c164c3b51b9f80020e46a253`，Skill SHA `3106b184695f4306b0afac31b484f64d5b396d7b2f4a3823a6a448e6240959f2`。
- 运营脚本精确限制Agent/Skill/owner和20份原文件SHA，任何人类更改会拒绝；使用标准expected_version_token和历史版本API。未知写入结果与已完成操作只校验，不盲重写。真实20份删除历史已核对；临时验证session已撤销。
- 原桌面聊天后端已经按每次Agent权限和snapshot版本注入平台Soul/Skill；没有重复注入全量Prompt或修改DSH上游。视频专用范围来自Agent配置收紧。后续原生实测发现默认模型选择与Windows深路径问题，已在3.1.1修复并完成实际验收。
- focused及原provision脚本测试8项通过，完整`npm run check`退出0：Stable117文件/1125项、Beta108文件/1032项（各13项原有条件跳过），根72项通过。记录在`outputs/video-agent-focus-check.log`。生产变更证据：`work/video-agent-focus-20261021/focus-receipt.json`。
- 真实标准后端聊天接口用新Agent snapshot和免费主模型回答“你能帮我做什么？”，HTTP200/stop，回复仅视频能力。平台审计admitted→completed，唯一新增账单479、1741输入/85输出、quota0。临时会话已撤销。证据`work/video-agent-focus-20261021/backend-capability-verification.json`；这是tools=[]的后端范围验证，不能代替原生界面的工具执行验收。

## 旧配置保留与新版启动

开始菜单原来的Roaming用户配置继续选中`~/.dsh`内的早期定制成员Profile，其中尚无视频模块。已只读查明根alpha清单SHA来自2.0.10官方安装器，但36项产品文件后来变化；平台59项lib与2026-10-05授权following-sync更新候选逐项一致，成员lib另有后续变更。因此升级器保留这些目录符合“用户修改不覆盖”的规则，不能将它们假称3.0.7官方原版后扩大允许覆盖范围。

未覆盖旧alpha/成员Profile、未改全局环境变量，也未迁移或删除用户工作文件。改用已安装且hash验证的3.1.0程序，以每进程DSH_HOME打开官方新版管理目录`%LOCALAPPDATA%/FutureStaff Agent/harness`，Electron状态在同级`desktop`。完整新版UI、选择智能体入口与视频代码实际存在；正常成员工作根仍按现有产品规则使用。启动收据`outputs/video-agent-managed-launch.json`。

## 原生聊天过程记录

用户已自行完成新版客户端登录。没有自动操作认证对话框、读取密码或注入临时凭据。

已在真实GUI会话提问能力范围，回答仅视频能力。实际发现“平台默认模型”仍解析到企业全局默认模型，费用未知；没有将这一轮宣称免费。随后在原生菜单明确选择已验证免费的FutureStaff模型，再通过聊天提交虚构社区咖啡店“街角咖啡”柑橘冷萃竖屏视频需求。

真实`video_project_create`成功创建工程`9c42e66a-b573-497f-8bbc-18b64d72a8c6`和初版`6f071da7-f982-4edc-9bf2-3371299801e0`。首个渲染任务`06e365ab-2b7d-416d-965b-43e11645ec7a`已实际执行：固定组件下载完成，但嵌入Python导入`_overlapped`时因Windows路径过长失败（Python绝对路径247字符，部分依赖超过260字符）。该任务未产生成片，原项目和失败日志仍保留；后续成功任务另行验收，没有用旧样片或后端验证替代。

后续完成的3.1.1修复：默认模型先读取当前Agent主模型策略再授权，显式选择仅留当前会话；旧业务接口保持1.0版本兼容。Windows运行组件改为按可信成员及Agent身份隔离的短缓存，项目与产物仍遵守原成员工作目录。私有成片链接用同一已认证原生会话预览，保留普通浏览器访问限制。修复、检查并打包后，已继续原聊天渲染、播放初版，再通过聊天修改和播放第二版。

原聊天创建的第二个渲染任务`a2c7deaa-e957-4496-a61e-5fa37ff93d1f`已真实成功：1080×1920、30fps、27.733秒，MP4/WebM/封面/字幕的四项SHA均与制作清单一致，完整解码通过。初版已复制至ignored的`outputs/video-native-case/initial`供用户预览。随后通过聊天提交精简到约20秒、自然音高、柔和配乐、保留原版的修改需求，修订和双版原生实播均已完成。

真实升级验收另外定位两项问题：缺少正式3.1.0 Profile清单的supersedence，且成员刷新没有覆盖视频包。现仅加入签名安装器`17e1879c…`对应的精确完整库存；用户修改、额外文件、身份不符、根或祖先链接均保留。已用标准只读计划和升级API更新本次现代环境，并校验原工程/版本/失败记录未变。最终公开包不包含本地中间构建的库存白名单，测试环境通过ignored的两阶段桥接对齐最终完整清单。

私有原生预览改为先加载固定HTML播放页，再由同源视频控件读取原授权素材；直接导航原始MP4在Electron中会中止文档加载。模型偶尔输出的自然音高`0`/`0Hz`规范化为Edge接受的`+0Hz`，范围与代码输入限制保持不变；工具说明也给出明确格式。

## 3.1.1最终验收

源码`1a7450cf51`已推送。完整`npm run check`退出0：Stable118文件/1145项、Beta108文件/1032项（各13项原有条件跳过）、根73项通过。fs-video最终47项通过、1项需要显式开发运行组件的条件测试跳过；该Windows嵌入Python fixture此前已单独实际通过，包含`asyncio`/`edge_tts`导入及超过260字符的语音参数读写。

通过真实GUI审批执行创建、渲染、修订、再次渲染，没有从开发脚本替代原生工具调用。初稿和修订均通过原生私有HTML播放器实际播放至结束，修订版在安装客户端冷启动后再次播放通过；人类自行登录，未自动填写认证或复制凭据。

| 验收项 | 初稿 | 修订稿 |
| --- | --- | --- |
| 时长与帧数 | 27.7333秒，832帧 | 19.6667秒，590帧 |
| 中文配音 | Xiaoxiao，`+6% / +2Hz` | Xiaoxiao，`-6% / +0Hz` |
| 原创程序配乐 | `upbeat` | `gentle` |
| 场景 | 5场 | 4场，`clean`配色 |
| 媒体 | MP4 1080×1920/30fps，WebM 720×1280/30fps | 同规格 |

两版各自MP4、WebM、封面和字幕四项实测SHA均与制作清单一致；MP4为H.264 Main、yuv420p、TV range、AAC及faststart，WebM为VP9/Opus。两种格式均用固定哈希组件完整解码通过，WordBoundary、字幕及配音参数与各自修订一致。修订的parent指向初稿，原工程、旧成片和失败记录均保留。修改版实际旁白73字符，去空白、标点和符号后63字符；此前“66字”的说法未作为准确验收结果。

组件缓存改为`%LOCALAPPDATA%/FutureStaff/v/<owner>/<锁定版本>`，完整SHA-256身份以50位小写base36表示，不截断且无Windows大小写别名；工程、不可变修订和输出继续保留在成员Agent workspace。当前Windows账号实算最长受锁组件文件193字符、Python扩展185字符、解压暂存238字符，超预算会在下载前明确失败；语音和媒体文件参数另用Windows NT长路径格式。组件加载失败与在线语音连接失败分别提示。

费用按实际核验范围记录：咖啡聊天25次已完成文本请求与对应引擎账单均为quota0，无未配对或模型不符记录。安装版冷启动后未手选模型的能力问答和自动标题另有两次完成请求，均使用Agent默认主模型、无fallback且quota0，企业全局默认未改。更早价格未知的全局模型能力问答明确排除，不能据模型名称推断未来所有调用免费。视频制作使用受控Canvas、独立FFmpeg、Python、Edge在线语音和本机原创程序配乐，无付费制作API或Remotion；在线语音仍依赖网络。

验收证据保存在ignored目录：`outputs/video-native-case/{initial,revised}`、`technical-receipt.json`、`acceptance.json`；模型费用及默认路由证据在`work/platform-agent-model-policy-20261021/`。这些证据包含真实环境元数据，手工交接应使用明确白名单并脱敏，不整包复制成员Profile、会话或凭据。

公开稳定源保持`https://fsstory.net/desktop-updates/stable.json`，3.1.1已发布并保留3.1.0回滚。正式安装器`https://fsstory.net/desktop-updates/FutureStaff-Agent-3.1.1-x64-Setup.exe`为140016874 bytes，SHA-256为`749c80826f2fea74a22459c7880354f0edf4d5129cfca4ae94d4838aabc01a4b`。从公开HTTPS完整下载的3.1.1及回滚包均通过签名、大小和SHA验证；feed为no-store，安装包immutable，私有发布文件仍404。证据为`outputs/video-agent-v311-publish-receipt.json`和`outputs/video-agent-v311-public-verification.json`。
