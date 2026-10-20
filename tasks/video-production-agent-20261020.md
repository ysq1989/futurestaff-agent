# 通用视频制作 Agent

状态：已发布 Windows 3.1.0，官网完整下载与客户端签名/文件校验通过。用户已授权开发、非 FutureStaff 免费模型案例、测试后发布体验。

基线：Agent main，开始时干净；Platform 仓已有 onboarding 等无关修改，完整保留。本次复用已有 Agent 管理接口添加受权配置，不部署 Platform 源码或修改 Schema。

契约见 docs/specs/video-production-agent-v1.md。桌面增加 fs-video；真实平台 Agent 与 Skill 用现有权限链登记。免费文本模型、免费在线旁白、本机音乐及动画；记录实际调用成本与制作清单。发布保留 3.0.7 与已验证回滚包，原签名信任及 stable.json URL 不变。

## 实施与验收

- fs-video 提供7个原生工具；严格输入、版本修订、幂等、成员隔离、后台任务、取消、私有预览和分段播放。所有本机工具声明设备与原生审批，不执行模型代码。
- 平台经现有管理员/配额/模型权限/SkillCreate/AgentCreate及后台初始化登记“通用视频制作”，native/company/use，无付费回退。Agent `5ae5429f-5652-40d7-890b-665c9c8c4e4d`；受权目录可见、快照Skill哈希相符，临时验收会话已撤销。未修改既有Agent或部署Platform源码。
- 现成futurestaff免费文本路由实际生成社区咖啡店初稿和修改稿，两笔引擎账单477/478均quota=0；用量与响应相符，没有新增Key或OpenAI调用。脚本和模型证据保存在ignored work目录。
- 咖啡店初版29.433秒，修订版25.8秒；同一项目保留旧版、修改脚本/配乐/配色，并把热杯示意改为符合冷萃内容的冰杯与橙片。初版因开发旧ffprobe深路径问题中断验收，完成文件经新组件逐项独立检查并保留恢复收据；修订版用正式组件真实完整渲染。一次在线语音连接失败明确记录failed，同一新组件的打包烟测和后续新请求成功；未降低TLS验证、未切收费。
- 首次组件准备从17个固定官方来源验证size/SHA、真实解压并按随包289文件清单校验；不信任缓存自写hash，拒绝额外执行文件、篡改与链接。嵌入Python/edge-tts/certifi及FFmpeg/ffprobe实际启动通过，取消与失败清理、并发等待独立。生产默认全官方HTTPS，无开发output路径回退。
- fs-video 39项测试通过；真实DSH Loader在登录入口active且零工具，在隔离成员fixture内7工具正常、SDK编译通过、未经审批不能调用。精确staged Profile复跑通过。仅复制lib的打包副本实际完成配音、系统Edge逐帧渲染、MP4/WebM及完整解码。
- 完整检查发现本机TEMP提供Windows8.3路径时，原Agent会话绑定把同目录别名误判为外部路径。现仅对可信Host cwd逐层拒绝链接后规范化；合法别名恢复，外部junction及renderer路径仍拒绝。相关真实浏览器和归属12项通过，成员升级13项通过。
- 审核官方3.0.7的301个文件与203个access代码哈希，纳入精确升级库存；新旧成员Profile均复制视频代码且保留用户目录。正式目标3.1.0，原manifest公钥、外部私钥位置及稳定feed URL不变；3.0.7和既有3.0.5包保留。

完整 `npm run check` 已退出0：全部产品工作区检查、Stable 117文件/1125通过、Beta 108文件/1032通过（各13项原有平台条件跳过）、根68项通过。fs-video39项无跳过。两版四格式Chrome实际播放至ended，帧递增、非黑、error=null；10场WordBoundary和字幕一致，音轨零削波，成片与master最低相关0.9972。证据在 `outputs/video-agent-case/playback-qa/verification.json`。

## 发布验收

- 发布源码：`5a3687a9ff`，main 已推送。安装器构建及自带校验退出0，运行时依赖闭包228个第一方节点闭合。
- 安装器：`https://fsstory.net/desktop-updates/FutureStaff-Agent-3.1.0-x64-Setup.exe`，140007592 bytes，SHA-256 `17e1879c96dcb126e909a46d42531b6adc0e9b1940f11da0453df05822cbaa39`。
- 实际 win-unpacked 客户端用隔离 user-data / Harness 启动，3.1.0 登录页、主侧栏和智能体入口正常显示；app.asar SHA-256 `be4f1cdab30f8d7175c927efab7550b38b2b8bd342e0b417e38ae9b63cb5dc38`。没有自动填写登录认证，也没有把这次启动验收表述为已在真实账号的原生聊天界面完整制片。真实成员 catalog/snapshot 和原生工具 Loader 分别验收通过。旧 dev 用户目录白屏状态保留，未删缓存或削弱安全配置；隔离打包客户端未复现。
- 官方稳定源仍为 `https://fsstory.net/desktop-updates/stable.json`。使用既有树外私钥签名、公钥不变、confirmed-install；公开 manifest SHA-256 `cb0b8ff1886755779220af6f7b89bcbc88dd29e3932f3c4e35be7d8042352b74`。发布锁内核对旧3.0.7 feed hash并私下备份后原子切换，保留3.0.7回滚与既有3.0.5文件。
- 从公开 HTTPS 完整下载3.1.0和3.0.7两包，实际客户端验证器核验签名、文件size及SHA-256；feed no-store，安装包immutable，READY/trust.json/previous-stable.json均404。证据：`outputs/video-agent-publish-receipt.json`、`outputs/video-agent-public-verification.json`、`outputs/video-agent-packaged-acceptance/launch.json`。
- 用户入口：更新客户端并登录 → 新会话 → 选择智能体 → 通用视频制作。已有企业权限范围内可用；模型无付费fallback。首次制作需要联网准备约140MB免费组件，使用现有成员工作目录；当前成片范围是图文动效短视频，不承诺写实生成或任意外部素材导入。
- 非 FutureStaff 案例和修订版：`outputs/video-agent-case/initial/video.mp4`、`outputs/video-agent-case/revised/video.mp4`；两次文本模型调用零计费，原创程序配乐、免费在线旁白及本机渲染。
