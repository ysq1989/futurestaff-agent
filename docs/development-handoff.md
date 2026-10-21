# FutureStaff Agent 笔记本开发交接

更新：2026-10-21。Agent 客户端后续由笔记本开发；台式机负责其他 FutureStaff 系统。本次交接收尾后，不在台式机安装依赖、运行开发客户端或打包 Agent，除非用户另有明确安排。台式机原目录和运行数据保留。

## 当前基线

当前最新客户端3.2.1，已修复遗留凭据锁的自动恢复，并在原安装目录验证保存密码、登录和重启；生产更新源3.2.1、回滚3.2.0。见[修复验收](../tasks/desktop-credential-lock-20261021.md)。下方早期发布段按当时基线理解。

2026-10-21 后续发布：客户端 **3.2.0** 已公开手动下载，Platform **1.13.0** 已部署 PROD；签名更新源已同步3.2.0，3.1.1回滚包保留。见[智能体分发发布记录](agent-distribution-acceptance-20261021.md)。下表保留3.1.1交接基线，不能当作最新下载版本。

| 项目 | 已确认状态 |
| --- | --- |
| 权威仓库 | `https://github.com/ysq1989/futurestaff-agent.git`，只使用 `main` |
| 正式版本 | Windows x64 **3.1.1**，回滚安装包 **3.1.0** 保留 |
| 发行源码 | `1a7450cf51`，标签 `deploy/desktop/3.1.1-1a7450cf51` |
| 更新源 | `https://fsstory.net/desktop-updates/stable.json`，既有签名信任不变 |
| 配套平台 | Platform `85cb673` 已发布，支持 Agent 模型策略协商 1.1；旧 1.0 兼容 |
| 实际案例 | 同一原生聊天制作咖啡店初稿并修改一次，两版均完整播放，历史版本保留 |

发行摘要、免费账单核验、原生验收和已知范围见 [3.1.1 交付记录](../tasks/agent-laptop-handoff-20261021.md)。3.0.6/3.0.7 的换机过程移至 [历史交接](development-handoff-20261017.md)，不要据旧日期恢复旧版本。

## 笔记本准备与启动

在笔记本新建检出目录，路径由该机器自行选择；不要在旧平台快照目录直接拉取客户端历史。客户端仓库为公开仓，Python 后端/Web 历史快照 `ysq1989/FutureStaff-Agent-web` 不是当前 Platform 权威仓。

需要 Node.js `^22.19.0 || >=24.0.0`、npm、Corepack/Yarn 4.18.0 和 pnpm。锁文件、`desktop-shell/vendor/`、补丁及固定子模块均保留，不更新上游提交。

```powershell
git clone --recurse-submodules https://github.com/ysq1989/futurestaff-agent.git FutureStaff-Agent
Set-Location FutureStaff-Agent
git switch main
git pull --ff-only
git submodule update --init --recursive
npm ci
npm run desktop:install
npm run check
npm run release:profile
npm run desktop:dev
```

`check` 编译并验证产品与桌面；`release:profile` 生成桌面启动器要读取的内置 Profile。图形客户端统一从仓库根运行 `npm run desktop:dev`；`npm run dev` 是 Alpha Web 入口。根 `.env.example` 含早期 Web/Runner 配置，不要把其中 `DSH_*` 变量直接照搬到图形启动环境。桌面启动器自行传入进程级目录配置；平台账号在客户端正常登录，使用已有平台模型不需要新增 OpenAI Key。

开发数据位于检出目录的 `.dsh/desktop-development` 与 `.dsh/desktop-dev-user-data`。产品成员工作目录继续遵守当前环境、主体、用户和 Agent 的归属策略；已有 `~/.futurestaff/workspaces/` 路径不会因启动新客户端自动迁移。Windows 临时目录若返回 8.3 别名，按 [历史交接](development-handoff-20261017.md) 的进程级规范路径方法核对，不改系统环境或测试断言。

## 台式机资料与数据边界

| 资料 | 位置与处理 |
| --- | --- |
| 当前源码 | `D:/项目/FutureStaff/FutureStaff Agent`；已推送，笔记本从 Git 获取 |
| 更早迁移来源 | `D:/项目/futurestaff-dsh`；仅历史参考 |
| 本次已登录安装版 | `%LOCALAPPDATA%/FutureStaff Agent/{harness,desktop}`；桌面“FutureStaff Agent 新版”只设置进程级路径 |
| 原有定制环境 | Roaming 配置及旧 `~/.dsh` 原样保留；不能伪称官方原版后强制覆盖 |
| 原生咖啡成片 | `outputs/video-native-case/{initial,revised}`，本机忽略目录 |
| 制作与发布证据 | `outputs/video-native-case/`、`outputs/video-agent-v311-*.json`、`work/platform-agent-model-policy-20261021/`，仅按需脱敏交接 |

源码交接不等于会话、成员工程或凭据迁移。本轮没有复制登录凭据、迁移成员数据或删旧目录。笔记本优先重新登录；如果要迁移完整会话和工程，先确认账户与实际数据根，再关闭写入、单独复制及校验，保留源数据。不要把 `.dsh`、Electron userData、浏览器 Profile、数据库、原始日志或整个 `work/outputs` 提交 Git。

依赖和制作组件按锁定版本重新准备，不复制 `node_modules` 或组件缓存。可单独拷贝脱敏的咖啡媒体与制作配方作为验收资料；它们不直接覆盖笔记本的成员 Profile。

## 后续开发与发布

先读 [开发规范](development.md)、[当前任务](../tasks/CURRENT.md) 和对应模块说明。只使用 `main`，保留已有变更，不修改 DSH Core；提交前运行仓库要求的检查。开发和打包在笔记本执行。

正式发布继续使用 [升级机制](specs/desktop-in-app-updates.md) 和 [发布契约](specs/desktop-update-publication.md)。`docs/deployment.md` 中的 Docker 流程属于早期服务端运行形态，不是升级 Windows 客户端的步骤。3.1.1 使用现有 Ed25519 清单签名与安装器字节验证，不把它表述为 Windows Authenticode 签名。

发布私钥、SSH/Git 权限通过安全渠道单独配置，私钥继续放源码树外；不重建公钥信任、不把凭据写进交接包。今后修改 Platform 模型契约时，笔记本客户端与本机负责的平台实现要共同核对兼容性；不能把整个 Platform 工作树当成 Agent 发布内容。
