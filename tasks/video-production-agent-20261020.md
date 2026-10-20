# 通用视频制作 Agent

状态：功能与实际案例完成，正式客户端发布验收中。用户已授权开发、非 FutureStaff 免费模型案例、测试后发布体验。

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

安装物、实际客户端启动和发布收据待最后补齐，不能把源码及案例成功表述为已发布。
