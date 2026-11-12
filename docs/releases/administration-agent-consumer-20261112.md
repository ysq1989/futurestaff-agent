# 行政FS助手 Cloud消费者发布

任务始于2026-11-12；**2026-11-13 00:19:40（Asia/Shanghai）已发布上线并通过公网验证**。用户已授权行政相关源码提交、推送及上线；不包含付费模型调用或真实员工请假/余额验收。

## 行为与边界

行政助手使用独立`administration`上下文。存储快照与在线发布都必须仅含这一系统，沿用真实Agent身份及原`modelPolicy`。目录、创建、历史、附件、工具与恢复均重新验证当前成员及系统权限；general、混合系统或撤权后迟到结果不进入当前工作区。

六工具只查询本人上下文、申请、台账、有效制度、已知操作和准备预览。预览尚未提交，由员工主动打开固定Platform本人确认链接。desktop身份不转交普通浏览器，不提供模型提交、审批或管理工具。预览响应未知时同一回合不重复POST，重启也不自主重放；后续明确新请求才重新准备。

canonical名称保持`administration.leave.*.v1`，仅按Platform权威契约中的六个固定别名转换供应商传输名称。映射属于单次请求，仅允许当前已提供的工具；history及回包保持原调用ID和参数。未知、大小写变体、未提供及写操作别名均拒绝。

## 可复现来源

本次在独立`origin/main`副本构建，基线`4abe3c817a10235e7d1daa2086771763ea4436af`；原工作目录中的未推送commerce文档提交及其他桌面/video改动保持，未纳入本次推送。

Cloud/PWA基础源码过去未提交，作为行政消费者可构建的必要依赖一并纳入：`apps/agent-cloud`、`apps/agent-mobile`、Cloud Docker运行清单及打包脚本。SDK仅增加Cloud导出、行政六工具/请求映射/分类，并保留已上线AIGC专用授权入口。未引入旧工作目录的桌面、Web技能或额外浏览器依赖改动。

| 内容 | 已发布证据 |
| --- | --- |
| 已提交推送的源码 | `5e185d8507d122c63f0ed294dc30b60b774e37b2` |
| Cloud build | `0.1.0-a52cf521b9b4` |
| 生产image | `sha256:1e673759bb2a2c5be72b2f46acc280c88165a19bb74cf5571fb3cb0fc97771ef` |
| sourceHash（server.mjs+index.html） | `a52cf521b9b4784ea6634990f58c96fc39c799434863a358b5d3f7a21930c0ed` |
| server.mjs SHA256 | `78e96f9dff6414de5cf955fade60124e8427ecad63ea8768a232ff34052fecbb` |
| Mobile | `cac9db9bb757`，10项静态资产与已上线034逐字相同 |
| 独立runtime依赖 | 沿用已上线锁定版本，11项直接依赖，无供应商/模型配置变更 |
| 先前生产回退基线 | `0.1.0-8d45cce2e980`，image `sha256:591969e1cf9e307cc484870074259db5781cf3bc51d0bbe47ff35da23e340aac` |

```powershell
npm ci --workspace @futurestaff/agent-cloud --workspace @futurestaff/agent-mobile --include-workspace-root --ignore-scripts --no-audit --no-fund
npm run cloud:build
npm run cloud:test
npm run mobile:test
npm run typecheck -w @futurestaff/agent-mobile
npm run mobile:build
node scripts/prepare-agent-cloud.mjs dist/agent-cloud
```

公共契约冻结夹具位于`plugins/fs-platform-access/test/fixtures/administration`，附原文件SHA256。SDK单仓测试无需Platform源码；有权威仓时运行`node scripts/generate-administration-contract.mjs --platform-root=<Platform绝对路径> --check`逐字核对。夹具不改变权威归属，变更须由所属仓先冻结契约再重新生成。

## 验证及上线门禁

干净发布副本：SDK行政/聊天/原主模型/会话归属相关94/94，Cloud41/41（13新增+28原有），Mobile31/31；全部0skip。SDK与Cloud编译、Mobile typecheck/build及生产者契约校验均通过。Cloud与SDK分别完成独立只读复核。受控真实034浏览器验证初始无导航/提交，主动点击只打开精确本人确认链接且无Agent凭据，切ERP后旧链接消失。

所属行政服务和Platform须各自确认健康、固定双向桥接、四表迁移及受管模板/范围就绪后，消费者才切换。不以404或匿名401当作有权员工业务链已完成；本轮不创建真实员工Agent实例、调用付费模型、修改余额或提交请假。

切换须对现网image/build/env做CAS，确认无运行中任务，停写后真实备份并恢复校验数据与加密记录。候选健康失败仅在数据未接受新写入时恢复先前服务；保留数据，不回灌历史备份覆盖新操作。没有会话格式/数据库迁移，新行政历史保留；旧版仅供兼容恢复，不能宣称其能操作行政助手。

## 生产回执

服务器已暂存并校验19份发布文件，断网/只读/非root受限容器smoke通过：health/static 200、匿名目录401、错误Origin 403，Sharp/JSONL依赖可用。28个真实bundle输入从已提交的canonical字节重建，server产物与候选逐字相同。

已收到两方明确生产READY：行政`0.1.0/g1`、source `b8d1f735`；Platform API/Web `1.15.1`、generation130、Schema16、source `f6f2e08a4f691b41345c8adfc4515587457e0a04`。Platform维护方报告生产四表强制RLS、active行政模板、六canonical全L1、回写定时器和三服务17项桥接/配置布尔检查通过。其恢复演练发现的迁移守卫和全局审计Actor外键问题已由所属维护者修正、回归及重新演练，不改变V1消费者契约。中央索引由所属维护者接续更新。

消费者在旧image/build的CAS成立且无运行任务时切换。停写后实际备份并恢复27份数据文件，10份加密记录通过原密钥/AAD解密，文件哈希一致；没有会话格式或数据库迁移。备份在服务器`/opt/futurestaff-agent-cloud/releases/fs-assistant-ops-20261112-0.1.0-a52cf521b9b4/backup`，data归档SHA256为`554f3b2505db1ee46add9549df7341222227edad3ebfefa7b7c15e7ac042cef7`。原密钥和业务配置保持，仅更新Cloud build标识；旧兼容镜像保留。

公网已验证精确build、10份静态制品SHA、实际`/`与冻结`index.html`相同；系统目录/行政会话/AIGC授权匿名请求401，错误Origin登录403，Platform行政context匿名401。独立维护子任务另以4个公开GET复核Cloud健康与版本、实际首页SHA、匿名目录401、行政健康200，全部通过。该匿名验证不替代已登录员工业务验收。

最终运维证据保留在本机`work/administration-agent-consumer-20261112/{release-state,restore-passed,switched,public-verified}.json`。其中source/tree、runtime、镜像、数据恢复及公网状态分开记录。真实员工实例未自动创建，额度/制度未自动初始化或审核；真实员工模型调用和请假流程仍待配置后由用户验收。

APP仍使用[0.3.4下载](https://www.fsstory.net/downloads/android/FutureStaff-Agent-0.3.4.apk)，本次不重发APK。手机真实账户进入AIGC及语音验收仍由用户实机确认。

## 首次使用路径

管理员从Platform“平台设置→主体→授权应用”开通“行政请假”，按实际情况完成公司初始化；当前员工和任职须有效。首次从Platform `/assistant-catalog`“选用平台助手”中选择“行政请假助手”并选用；原服务端入口会创建或复用当前主体的真实Agent，并跳转其设置。必须有有效主模型和专用`['administration']`范围。模板不是Agent，不由客户端伪造UUID或模型策略。

新选用后先等待原后台完成初始化，再在APP刷新系统目录，选择“行政”并开始新会话。原入口会处理原生助手的自动发布；Mobile沿当前真实native Agent与snapshot准入，未新增手动发布步骤。未选用专用Agent、未开通企业应用或无当前成员授权时，行政入口会显示不可用；不自动创建员工实例或初始化额度。首次选用路径由Platform维护者在发布协调中确认，员工实机业务仍待授权配置后的验收。
