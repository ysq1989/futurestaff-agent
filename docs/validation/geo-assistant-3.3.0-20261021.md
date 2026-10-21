# GEO 助手 Agent 3.3.0 本机交付

用户收窄分工后，本任务只调整 Agent。GEO、Platform 未发布、未执行真实迁移；此前已准备的两仓本地改动保留，由拥有者协调。本次没有修改其在线版本。

## 已完成

- 运行代码提交 `5e3dac1031` 已推送 main。安装程序 `outputs/FutureStaff-Agent-3.3.0-x64-Setup.exe`，141743496字节，SHA256 `bc9217bd8e67f2e5cd186e90b979e0f45a4bc45ef8790a9a80a74a4b81fc706e`。
- 安装至现有 `D:\FutureStaff Agent`，NSIS退出0，实际EXE版本3.3.0.0。安装后的 app.asar 与构建产物一致（SHA256 `213b97e13525e3d18cd72971916d42f5740dc6c3cf5604e2b17e97731f8c9164`），474项资源逐件校验通过。
- 原成员 Profile 混有历史受控补丁。独立历史构建、官方安装包与补丁收据证明166个旧文件来源；原界面包及5个无需更新的旧声明/运行文件合计7个保留原字节。未把当前成员内容添加到通用升级白名单。
- 旧初始化 Profile 和成员平台 lib 完整备份后，一次性迁入新官方初始化资源和受控 Host 代码。所有移动检查绝对路径边界、链接、原树CAS和身份标记，失败回滚测试通过，备份未删除。
- 成员通过正常工作区恢复流程补装 GEO 插件并确认应用重启。150项 GEO lib 与安装包一致；原7个保留文件仍相同。实际 Host 返回既有 `GEO_CLOUD_WORKSPACE_REQUIRED` 边界，不开放旧的可写本地 GEO 工作台。
- 实际安装版原账号状态ready，主体绑定有效，2个模型、8个应用、9个原助手可读；旧会话、系统入口和助手选择界面正常显示。最后退出验收模式，普通启动产生 `startup.run.completed / rendererStatus=healthy`，验收端口关闭。

安装和代码迁移后原1441项文件校验全部保留，其中6项旧初始化文件保存在完整备份。正常运行后467个业务工作区文件未变，记住密码的受保护密文文件字节未变；唯一变化的秘密存储文件确认为当前成员会话随正常恢复刷新。成员package/插件配置正常追加GEO/视频插件；浏览器运行缓存有更新、淘汰及占用，不能宣称运行中所有缓存仍逐字节不变。

## 验证与证据

源码审查无高置信阻塞。fs-geo 22项、根测试73项、stage 2项、Windows打包200项通过；原生参数经真实Harness schema验证。Windows全量检查遇既有文件symlink EPERM，保持原测试；同源代码在Linux Node24的Profile43项、视频Host15项全部通过且无跳过。一次性迁移另有6项隔离测试，涵盖未知改动/链接/CAS拒绝及双树失败回滚。

本机证据位于忽略目录 `output/geo-assistant-release-20261021/`：安装资源校验、迁移计划和回执、native-authenticated-read、native-loader-boundary、native-data-preservation-summary、normal-restart-verified及测试日志。界面证据在 `output/playwright/`。这些私有证据不随Git推送。

旧代码完整备份位于 `%USERPROFILE%\.dsh\futurestaff-upgrade-backups\geo-assistant-3.3.0-20261021144458155-59ee3fd7-d986-40b8-980c-d94572e224b6`。不要删除或盲目覆盖；回退前先正常停止Agent，并核对迁移回执中的原树和目标树指纹。此为本机一次性维护，不是普通客户的自动升级白名单。

## 未完成及交接

23:03（北京时间）只读确认 `GET https://geo.fsstory.net/api/geo/native/v1/assistant/projects` 仍为404/NOT_FOUND；实际授权助手目录没有GEO助手。GEO拥有者实现并发布 [对接契约](../specs/geo-assistant-web-collection-v1.md)，助手资源及 `geo.collection` / 最低客户端3.3.0门槛由Platform拥有者发布。

因此，实际GEO助手会话中的原生工具执行、豆包原题/原生引用/截图到线上效果报告的完整验收仍未完成。此前成功结果来自真实豆包和隔离GEO，不能冒充线上业务验收。DeepSeek按用户指定顺序待豆包完整通过后再接。公开更新源保持3.2.1，尚未切换为3.3.0。
