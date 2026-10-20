# 通用视频制作

FutureStaff Agent 的本机视频制作模块。平台持久智能体“通用视频制作”加载 `video-production` Skill，用户用自然语言描述行业、用途和风格，智能体编排受控制作工具。首版提供图形与文字动效短视频，含中文配音、原创程序配乐、字幕、封面、MP4 和 WebM；支持读取已有工程、创建修订并保留旧成片。

不把示意当成真实拍摄、商品或软件界面。没有导入工具的素材引用会明确失败。当前可选竖屏/横屏、三种配色、轻快/舒缓/无配乐，最多12场和180秒。默认使用 V2 配音参数 `zh-CN-XiaoxiaoNeural / +8% / +2Hz`。Edge 在线语音依赖网络；失败会保留工程，不以无声视频冒充已配音完成。

宿主每次从真实会话、当前平台身份及不可变智能体快照版本解析工作区。所有本机工具具有设备与审批声明；工程及缓存位于现有成员的智能体工作区。渲染异步返回任务，进度可查询、可取消，退出登录或切主体时取消。成功文件用10分钟的本机私有链接预览/下载，支持分段播放；可再次查询原任务刷新链接，不公开上传客户资料。

首次渲染在后台下载约140MB的固定制作组件，解压约350MB，不做系统级安装；下载源、字节数和 SHA-256 由版本化的 `runtime-lock.json` 固定，运行文件另由随包的 `runtime-files.json` 校验。依赖只从 Python、PyPI、Gyan 和固定提交的 Noto 官方仓获取，源地址不能由模型填写。系统需有 Microsoft Edge；无浏览器或网络失败时返回明确任务错误。

免费文本模型仍由 FutureStaff AI/主体模型池管理。本次案例通过现成 `futurestaff` 路由完成两次实际 Agnes 文本生成，核对引擎消费记录均 quota=0。不要因为模型名称相同就永久假设零价，不自动切换付费模型。

工具采用固定 Canvas 模板和独立 FFmpeg 进程，无需 Remotion。配乐本机合成，不引用第三方音乐。FFmpeg、Python、edge-tts、字体及 Python 依赖的原始许可证保留在本机组件中：

- [FFmpeg 许可证](https://ffmpeg.org/legal.html)，[Windows 构建及源代码信息](https://www.gyan.dev/ffmpeg/builds/)。
- [edge-tts 代码与许可](https://github.com/rany2/edge-tts)。
- [Python 3.11.9](https://www.python.org/downloads/release/python-3119/)。
- [Noto CJK 固定源](https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c)，字体使用 SIL OFL。

开发：在仓库根运行 `npm run test -w @futurestaff/fs-video`。`scripts/demo.mjs` 接受案例 JSON 目录和受信运行组件配置，完成同项目初版、修订版、编码及完整解码验证。正式运行不依赖开发机器 output 目录。发布 Profile 必须包含 `lib/assets`、两份运行锁与模块入口；根发布验证器检查这些资产。
