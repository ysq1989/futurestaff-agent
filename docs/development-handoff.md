# FutureStaff Agent 换电脑开发交接

2026-10-17 安装版补充：当前源码及签名升级源为 3.0.7。3.0.6 因 Profile 文件数上限进入恢复模式，已修复并在 staging/afterPack 调用实际启动校验。3.0.7 正式打包客户端以隔离目录首启到登录页，最终 EXE 内主程序及 Profile 与受测资源一致；旧 Profile 升级、自定义代码和会话保留、公网完整下载及签名校验均通过，详见 [修复记录](../tasks/profile-startup-hotfix-307.md)。以下 3.0.6 开发登录及发布描述为此前验证结果，未覆盖出问题的安装版首启。

首次交接：2026-10-10；换机核对更新：2026-10-16。文档入口见 [开发文档导航](README.md)。

2026-10-17 本机更新：权威 main 已同步至 `D:/项目/FutureStaff/FutureStaff Agent`，旧 `D:/项目/futurestaff-dsh` 仅保留为历史迁移来源。此前旧目录停留在 2026-10-10 的 2.0.21，不能继续作为版本基线。使用 `npm run desktop:dev` 构建并启动当前 3.0.6 客户端，开发 Profile、Harness 会话和 Electron 状态保存在新目录 `.dsh/` 下；智能体工作文件仍遵循既有成员目录策略，本次不迁移。本机 `.env` 不设置上游禁止的 `DSH_*` 启动变量，启动器从进程环境传入。

Windows 本机校验需要使用临时目录的完整路径，避免 `ADMINI~1` 短路径与 Host 的规范路径比较失败。只在执行检查的 PowerShell 进程内设置 `$env:TEMP = node -e "process.stdout.write(require('node:fs').realpathSync.native(require('node:os').tmpdir()))"` 和 `$env:TMP = $env:TEMP`，不改系统环境或测试断言。GEO 固定发布源码使用仓库 `.gitattributes` 指定的 LF 字节，保持原 SHA-256 清单校验。

新目录验证：根工作区类型检查通过；初次组合检查因上述换行及临时短路径夹具退出，修正环境后按失败与未执行范围补齐检查。GEO 12 项、平台 299 项、产品构建、完整桌面门禁和根目录 64 项全部通过；Stable 117 文件/1119 项、Beta 108 文件/1032 项通过，各保留 13 项原有平台条件跳过。实际启动构建后的 3.0.6 到新版登录页，开发窗口保留，未代用户登录或执行业务操作。证据保存在本机 `.local-checks/v306-*.log`，不上传原始运行日志。

软件内签名升级源已于 2026-10-17 补齐至 3.0.6，外部签名及两个安装包完整摘要均已验证，3.0.5 回退包保留；详见[升级源发布记录](../tasks/in-app-update-306-20261016.md)。以下 2026-10-16 关于尚未切换 feed 的说明保留为当时历史状态。

## 仓库与范围

权威客户端仓库为 `https://github.com/ysq1989/futurestaff-agent.git`，由原 `futurestaff-dsh` 重命名而来，保留原 Git 历史。原先误建的同名平台快照仓库已删除。

后端/Web 历史快照现单独保存于私有仓库 `https://github.com/ysq1989/FutureStaff-Agent-web.git`。本客户端仓库当前为公开，不能上传本机配置、业务资料或登录凭据。两个本机目录原来指向相同 origin，本次已拆分；平台权威身份服务仍属于独立 Platform，不由快照替代。

本次提交保存当前客户端开发工作树，包括抖音模块、主体隔离与推理适配、系统页面导航、桌面模块窗口、测试、规格和任务记录。提交不是软件发布，也不表示各任务的真实网站验收或待办已经完成。

2026-10-16 的换机提交另保存现有 ERP/SHOP 助手、图片与选品流程、Website SSO、主体/会话侧栏、GEO 云端入口和本地发布开发成果，以及相关脚本、测试、品牌与任务记录。每个功能的完成程度以分项任务为准，不能将开发快照视为全部功能已验收。

## 新电脑获取

```powershell
git clone --recurse-submodules https://github.com/ysq1989/futurestaff-agent.git FutureStaff-Agent-client
cd FutureStaff-Agent-client
git status --short --branch
git submodule status
```

必须新建检出目录。不要在此前误拉取的平台快照目录中直接执行 `git pull`，它们不是同一份 Git 历史。

需要 Node.js 22+（以各工程 `engines` 为准）、npm、Corepack/Yarn 和 pnpm。按 README 安装根工程与桌面工程依赖，再执行 `npm run check`。不要手动复制 `node_modules` 或构建输出。

桌面工程当前要求 Node.js `^22.19.0 || >=24.0.0`，Yarn 固定为 `4.18.0`。在克隆目录中执行：

```powershell
npm ci
npm run desktop:install
# 仅在新机尚无 .env 时复制，随后按需配置，不覆盖现有文件。
Copy-Item .env.example .env
npm run check
```

桌面安装命令同时安装 GEO Web 源码依赖并执行桌面 Yarn immutable 安装。仓库中的 `desktop-shell/vendor/`、锁文件、补丁和固定子模块是可重建依赖的一部分，必须保留；不要因它们属于第三方就删掉。需要进入本机开发 Profile 时再执行 `npm run profile:install`，然后 `npm run dev -- --port 3080 --no-open`。默认端口与数据目录须先确认没有正在使用的实例。

两个上游子模块均固定提交，不能自动更新到最新分支：

- `desktop-shell/deepseek-harness`：`a66e4702047846cdaa10c66c9d3df3951f5ea70d`。
- `official-desktop`：`477b4f420553e8a52c2fbccc464d7561b239c443`，仅为迁移候选；不能把候选当成已经替换默认发行底座。

阅读 `docs/development.md`、`tasks/CURRENT.md` 和对应任务文件，区分已完成的源码验证、曾有的本机试运行和仍未完成的验收。只使用 `main`，保留本地工作；真实外部操作、部署、发布和用户数据改动须遵守既有授权边界。

## 配置与本机数据

客户端开发不需要照搬旧平台仓库的 Alembic、PostgreSQL、Redis 初始化流程。仅因更换电脑，不必安装 Docker；确有服务器容器或相应测试需求时再核对依赖。

仓库不包含 `.env`、用户会话、受保护凭据、浏览器账号 Profile、抖音 SQLite 数据、DSH 用户数据或发布签名密钥。按 `.env.example` 建立本机配置；凭据经安全渠道配置，不提交或输出。操作系统保护的凭据不保证可跨电脑复用，优先重新登录。

如需保留历史会话、文件和业务工作区，先确认实际 DSH 数据目录及账号/主体边界，再单独安全迁移。开发源码迁移不等于运行数据已备份。

## 2026-10-16 后续修复与 3.0.6 发布

初次换机快照中的失败已进入后续修复，最新结果以[测试与 PROD 交付记录](../tasks/ci-prod-release-20261016.md)为准。新电脑不要继续将下方历史失败当成当前已确认问题。

当前源码完整 `npm run check` 已通过，包括两套桌面门禁；Stable 1119 项、Beta 1032 项及根目录 64 项通过，Stable/Beta 各保留 13 项原有平台条件跳过。Web 仓库的 Repository Guard 也已通过。安装包 PROD 状态和摘要继续以交付记录为准。

3.0.6 独立 Windows x64 安装包[已发布 PROD](https://fsstory.net/desktop-updates/FutureStaff-Agent-3.0.6-x64-Setup.exe)，外部完整下载与 SHA-256 核对通过。构建源码为 `ee926bbd31e50ebde8ec040d60f5745aaf53b12f`。此为手动下载安装包交付，软件内签名升级源保持原状态，当前旧电脑没有被自动安装覆盖；3.0.5 回退包保留。详细摘要和回退方式见交付记录。

本轮保留原测试超时、业务断言和发布门禁，修复真实浏览器退出/连接回收、过期的版本夹具，并对 4 项既有产品差异逐项复核后更新摘要。3.0.5 公开安装包已核验为回退基线，新包只接受该版本完整匹配的代码清单，不覆盖用户自定义代码、会话或业务文件。

## 2026-10-16 初次换机快照验证（历史记录）

起始客户端 main：`1ef692067e1195c846a4498034a0e585fdce88f0`；推送前重新 fetch，确认与 origin/main 一致。两个固定子模块干净，未升级。完整命令日志只保留旧电脑本地 `work-migration-*.log`，不上传可能含运行上下文的原始日志。

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 未通过：工作区类型检查完成；抖音 UI 的 `test/browser-ui.test.js` 中真实浏览器渲染测试 30 秒超时，此后进程未正常退出。仅终止本次检查创建的进程树，未修改功能或关闭门禁 |
| `npm run build:product` | 通过，包含各产品工作区构建 |
| `npm run test -w @futurestaff/fs-platform-access` | 299 项通过 |
| `npm run test -w @futurestaff/fs-geo` | 12 项通过 |
| `node --test test/*.test.js` | 64 项通过 |
| `corepack yarn@4.18.0 --cwd desktop-shell workspace dsh-plugin-desktop typecheck` | 通过 |
| `corepack yarn@4.18.0 --cwd desktop-shell workspace dsh-plugin-desktop build` | 通过 |
| 从 `desktop-shell/dsh-plugin-desktop` 运行 `node ../../node_modules/vitest/vitest.mjs run tests/system-views.spec.ts tests/package.spec.ts` | 48 项通过、1 项失败；嵌入页面 11 项全部通过。唯一失败是 package 测试期待 `3.0.2`，当前 manifest 为 `3.0.5` |
| `npm run check:desktop` | 未通过：`Desktop variant reviewed source changed: electron-runtime.ts`，后续完整桌面门禁未执行 |
| `node scripts/verify-official-candidate.mjs` | 通过，仅确认固定候选，不代表默认发行底座已切换 |
| 敏感内容与差异检查 | 候选文件未发现真实凭据，命中项为隔离测试/Mock 字符串；真实配置、会话、数据库和原始日志不进入提交。5 个新增证据脚本仅移除多余文件末尾空行 |

以上描述首次换机快照当时的状态，后续修复与发布见上方交付记录。历史限制不代表后续任务没有获得授权或没有完成检查。

## 2026-10-10 验证（历史记录）

- `npm run check`：未完全通过。工作区类型检查、测试、产品构建通过；桌面布局检查停在 `verify-desktop-variants.mjs`，稳定版与 Beta 的 9 个源码路径存在未声明差异。
- `corepack yarn@4.18.0 --cwd desktop-shell workspace dsh-plugin-desktop build`：通过。
- `corepack yarn@4.18.0 --cwd desktop-shell workspace dsh-plugin-desktop typecheck`：通过。
- `corepack yarn@4.18.0 --cwd desktop-shell workspace dsh-plugin-desktop test`：114 个测试文件通过，1101 项测试通过，13 项跳过。
- `node --test test/*.test.js`：64 项通过。
- `node scripts/verify-official-candidate.mjs`：通过；两个子模块干净，固定提交可从上游获取。
- 暂存内容的敏感文件检查和 `git diff --cached --check`：通过；配置、凭据、数据库、浏览器 Profile 和本机运行数据未进入提交。

桌面差异清单涉及 `electron-runtime.ts`、`electron-shell-generation.ts`、`module-window.ts`、`startup-recovery-window.ts`，以及原生对话框的 HTML、React、CSS 和类型声明。应核对各差异的版本意图并按现有规则修复，不能简单关闭门禁或把未声明差异全部加入允许列表。完整桌面门禁后续阶段未执行；本次保存开发状态，不作为已验收发行物。
