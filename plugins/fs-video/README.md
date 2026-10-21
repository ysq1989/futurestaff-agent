# 通用视频制作

FutureStaff Agent 的本机视频制作模块。平台持久智能体“通用视频制作”加载 `video-production` Skill，用户用自然语言描述行业、用途和风格，智能体编排受控制作工具。当前3.1.1提供图形与文字动效短视频，含中文配音、原创程序配乐、字幕、封面、MP4 和 WebM；支持读取已有工程、创建修订并保留旧成片。真实原生聊天初稿、修订及双版播放验收见 [3.1.1任务记录](../../tasks/video-native-chat-20261021.md)。

不把示意当成真实拍摄、商品或软件界面。没有导入工具的素材引用会明确失败。当前可选竖屏/横屏、三种配色、轻快/舒缓/无配乐，最多12场和180秒。默认使用 V2 配音参数 `zh-CN-XiaoxiaoNeural / +8% / +2Hz`。Edge 在线语音依赖网络；失败会保留工程，不以无声视频冒充已配音完成。

宿主每次从真实会话、当前平台身份及不可变智能体快照版本解析工作区。所有本机工具具有设备与审批声明；工程、不可变修订和成片仍位于现有成员的智能体工作区。可信制作组件单独缓存于 `%LOCALAPPDATA%/FutureStaff/v/<owner>/<锁定版本>`；`owner` 是可信成员及Agent身份SHA-256的定长50位小写base36编码，完整保留256位身份信息，避免Windows目录大小写别名。缓存拒绝链接祖先，并校验随包固定文件哈希，不迁移或删除旧工程与缓存。

渲染异步返回任务，进度可查询、可取消，退出登录或切主体时取消。成功文件用10分钟的本机私有链接预览/下载，支持分段播放；可再次查询原任务刷新链接。桌面窗口加载固定、无JavaScript的HTML播放页，再由同源控件读取同一授权素材；播放页和素材均检查真实会话、成员/Agent版本、有效期和安全输出路径，保留原生请求限制，不公开上传客户资料。

首次渲染在后台下载约140MB的固定制作组件，解压约350MB，不做系统级安装；下载源、字节数和 SHA-256 由版本化的 `runtime-lock.json` 固定，运行文件另由随包的 `runtime-files.json` 校验。依赖只从 Python、PyPI、Gyan 和固定提交的 Noto 官方仓获取，源地址不能由模型填写。系统需有 Microsoft Edge；无浏览器、组件加载或在线语音连接失败分别返回明确任务错误。短缓存避免嵌入Python的Windows路径限制，语音及媒体文件参数另使用Windows长路径格式；不依赖开发机器的output目录。

制作工具采用受控Canvas、独立FFmpeg、Python、Edge在线语音和本机原创程序配乐，没有调用付费制作API，也没有使用Remotion。Edge语音仍依赖外部在线服务，组件及其许可证随缓存保留；“免费工具”不代表任意文本模型、外部素材或后续服务价格都免费。

文本模型由FutureStaff AI/主体模型池管理：默认选择当前Agent主模型策略，显式选择只留在当前会话，无付费fallback。3.1.0开发案例的两次Agnes文本生成已核账quota=0；3.1.1真实咖啡聊天核对25次已完成请求及对应账单均quota=0，另一次冷启动默认模型验收的正文和自动标题两次请求也均为0。更早价格未知的全局模型能力问答未计入免费结论。不要因为模型名称相同就永久假设零价，不自动切换付费模型。

智能体对外只承担视频制作和修改，底层模型名不作为助手身份。平台创建可能继承默认技能；`scripts/focus-video-agent.mjs` 只针对已授权的既定视频 Agent，通过标准管理和带版本历史的文件接口收紧 Soul、角色说明与 Skill，并移除精确内容哈希匹配的无关技能副本，不改变其他 Agent 或平台默认技能。默认只检查，`--apply` 执行，成功或结果不明后的重跑只验证；回执放在受控的 `work/` 目录。快照变化后应选择该 Agent 新建会话，旧会话保持原版本，不静默迁移。原登记回执保留，内容版本不同不会被覆盖为新证据。

工具采用固定 Canvas 模板和独立 FFmpeg 进程，无需 Remotion。配乐本机合成，不引用第三方音乐。FFmpeg、Python、edge-tts、字体及 Python 依赖的原始许可证保留在本机组件中：

- [FFmpeg 许可证](https://ffmpeg.org/legal.html)，[Windows 构建及源代码信息](https://www.gyan.dev/ffmpeg/builds/)。
- [edge-tts 代码与许可](https://github.com/rany2/edge-tts)。
- [Python 3.11.9](https://www.python.org/downloads/release/python-3119/)。
- [Noto CJK 固定源](https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c)，字体使用 SIL OFL。

开发：在仓库根运行 `npm run test -w @futurestaff/fs-video`。`scripts/demo.mjs` 接受案例 JSON 目录和受信运行组件配置，完成同项目初版、修订版、编码及完整解码验证。正式运行不依赖开发机器 output 目录。发布 Profile 必须包含 `lib/assets`、两份运行锁与模块入口；根发布验证器检查这些资产。
