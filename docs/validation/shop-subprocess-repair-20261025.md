# SHOP 版本、推荐卡片与子进程退出修复验收

日期：2026-10-25（Asia/Shanghai）。

已更新当前安装的 FutureStaff Agent 3.3.0，完成 SHOP 当前版本入口、真实商品卡片和子进程实机验收，并再次正常退出、重启及核对原数据。验收后保持原已授权成员和主体，身份详情仅存私有证据。两轮安装的原基线、失败记录、备份与回执均保留；本次没有发布公共安装器/feed、提交代码或部署其他系统。

## 修复内容

| 问题 | 最终处理 |
| --- | --- |
| 旧 SHOP 会话触发当前配置/modelPolicy 版本检查，目录没有正常新入口 | 只向当前获授权且配置有效的 SHOP 角色提供“安装当前版本 → 开始对话”。在独立 snapshot 目录创建工作区；原定义、绑定、会话和人工文件保持。版本检查继续生效，没有伪造模板或发布版本 |
| 新 SHOP 主列表无法作为推荐来源 | 兼容旧商品列表和服务端两项明确的只读商品主列表指纹。重新核对实际授权目录、只读注解、原会话/主体/来源、原页 ID 和重新读取的真实商品字段；详情、订单、任意动态操作及写操作仍不能冒充推荐来源 |
| stdio Socket ENOTCONN 未被 ChildProcess 错误边界接住，导致 Host fatal 退出 | 产品维护的 subprocess 补丁将独立 stdin/stdout/stderr 故障保留为任务错误，清理流并回收子进程，保留迟到错误和正常 EPIPE 行为；没有全局吞掉未捕获异常 |
| 真实 264 字符工作目录导致 rg/PowerShell 启动 ENOENT | 只在 Windows cwd 长度达到 259 时为 spawn 使用扩展路径；存储和会话路径不动。PowerShell 长目录启动准备中安全恢复原普通路径，使相对文件操作继续可用；短路径、非 Windows、编码和退出码行为保持 |

长目录问题以同一实际二进制、同一目录的失败/成功对照复现；258/259/260 字符边界、中文/单引号目录、相对 Glob/Grep/Get-Content 和退出码均有真实 Windows 回归。Windows 对长工作目录启动的限制亦见 [Microsoft 文档](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setcurrentdirectory)。没有将该发现声称为原始 Socket ENOTCONN 唯一的 OS 级成因。

上游 `deepseek-harness` 子模块保持干净。运行时改动由 `desktop-shell/patches/` 的 subprocess、pwsh 两个补丁持有，Yarn 固定原 0.1.2-rc.1 版本，没有升级依赖版本。

## 实际安装与保留

第一轮解决版本入口和 stdio 错误边界。实机又发现动态列表及 Windows 长目录问题，第二轮通过独立封存继续修复。第二轮仅 9 个操作：四份 managed 插件、两份 release manifest、两个 unpacked 运行时文件及配对 ASAR，共 17 个明确文件变化。安装资源、alpha、两个原成员 Profile 的插件各 267 个文件一致。

| 最终产物 | SHA-256 |
| --- | --- |
| release manifest | `07c1a42c9d4ca03b83b5d9bef22a1c84ae75e39d18892d7b3674d26998d04974` |
| app.asar | `02d2fdbae90b7546498782a473d09f9bed87e2a66d5e8ce75264cb00f20d3638` |
| subprocess lib/index.js | `b8fd00b9c1d8b0a4d07c68e80f32909be30034104caf7ca499df11bb577ca064` |
| pwsh lib/index.js | `5cd5777bef7d92e179f5790c4d5f90f7bd4b0155a0871eecfeb5085c38484788` |

ASAR 只修改两项 unpacked 文件的 size/integrity 索引，其余 index 和 packed payload 字节不变。EXE、主进程、其他 unpacked 代码、既有 Website 产物、GEO 及兼容历史保持。每步使用原哈希 CAS、同卷外部备份、单执行锁和故障回滚；未知字节不会被覆盖。

最初 3,394 个原文件经链式核对接到第二轮 3,431 文件基线：79 份原历史保留原前缀，7 份原工程索引的固定字段和旧会话成员保留，64 个原绑定及 63 个原图片文件保持原 SHA。记住密码密文保持原字节，账号/当前成员不变，GEO 604 份代码副本不变。合法新会话追加、会话密文刷新和 Chromium 状态变化单列，没有把这些称为所有文件逐字节不变。

第一轮重启审计曾因新增 chat-owner 密文记录报告失败。该失败原样保留；后续以真实新 history、binding 和源码 key 派生精确证明它属于新 SHOP 会话，未解密凭据，未放宽为允许任意 protected 文件。第二轮安装后及最后重启后的严格审计均为无非预期变化、无缺失。

## 商品推荐卡片实机验收

使用独立授权验收会话，重新查询当前授权的未上架主列表，参数为 `query:{type:2,is_show:0,page:1,limit:100}`。三款候选均在本次真实返回的页面内；没有沿用旧 view 或把详情冒充列表来源。店铺数量与商品明细仅存私有业务证据。

已核对三款授权验收商品的图片、名称、价格、库存及展示状态。实际商品标识、名称规格和数值明细仅保留在本机私有证据，不随源码公开。

三张原生卡片的真实图片均加载。实际点击候选图片打开大图，以 Escape 关闭；点击一次“选择这款”，观察处理时禁用、随后高亮“已选中”。原 SHOP 会话收到唯一的 selection 回传并确认已记录选择，该轮正常结束，选择后没有工具调用。

本轮只有只读主列表和推荐两次工具调用，没有导入、上架、订单或业务写操作。最后正常重启后，图片卡片和选择确认文本保留；旧视图按预期显示为历史只读，继续选择需重新查询。没有声称历史卡片的选中高亮被持久化。

实机商品截图仅保存在本机私有证据目录，未随公开仓库提交。

[大图实证](../../output/shop-card-source-repair-20261025/native/shop-image-zoom.jpg)、[原会话确认](../../output/shop-card-source-repair-20261025/native/shop-selection-roundtrip-ack.jpg)、[重启后历史与确认](../../output/shop-card-source-repair-20261025/native/final-restart-shop-history-readonly.jpg)、[SHOP 权威收据](../../output/shop-card-source-repair-20261025/shop-native-final-receipt.json)。此前来源错误和中断记录没有删除。

## 子进程实机验收

使用独立的本机只读验收会话，原 264 字符 cwd 不变。具体会话标识仅存私有记录，空初始化会话没有被误作验收证据。

| 顺序 | 实际工具 | 权威结果 |
| --- | --- | --- |
| 1 | Glob `**/*SHOP*` | 0 匹配，seq 64 → 65 |
| 2 | Grep 固定无匹配标记 | 0 命中，seq 76 → 77 |
| 3 | PowerShell 成功探针 | 固定 stdout 标记，正常退出，seq 88 → 89 |
| 4 | PowerShell 预期失败探针 | 固定 stderr 标记及明确退出码 7，seq 100 → 101 |
| 5 | 后续 PowerShell 成功探针 | 固定 stdout 标记，正常退出，seq 124 → 125 |

5 组 callId/调用/返回唯一成对，两个回合完整结束。正常退出的 0 根据工具成功渲染契约判定，未伪造未持久化的 canonical 字段；7 来自明确的持久退出码标记。15:40:16–15:51:44 的日志无 ENOTCONN、ENOENT、未捕获异常或异常退出，主 PID 91344 持续存活且响应，随后于 15:53:20 正常退出并重启。

[权威工具收据](../../output/shop-card-source-repair-20261025/native-subprocess-final-receipts.json)、[四项探针截图](../../output/shop-card-source-repair-20261025/native/subprocess-four-probes-passed.jpg)、[失败后继续运行](../../output/shop-card-source-repair-20261025/native/subprocess-after-exit7-success.jpg)。原诊断会话和修复前的失败结果继续保留。

## 检查与证据

插件构建/类型检查通过，完整回归 437 通过、1 项原有跳过；发布 Profile 检查 2 通过。运行时与包装专项 62 通过，交付隔离测试 15 通过。桌面构建/类型检查及单独执行的 closure、CLI、Loader、Profile、licenses、operations 全通过。

完整桌面 `check` 的实际退出码为 1：1,184 通过、13 跳过，唯一失败为未改动的 `futurestaff-profile.spec.ts:180` 文件符号链接 fixture，Windows 返回 EPERM。未弱化断言或修改系统安全设置，不称完整检查全绿。详见[检查结果](../../output/shop-card-source-repair-20261025/gate-status.json)和同目录原日志。

保留证据：[最终跨两波保留证明](../../output/shop-card-source-repair-20261025/transitive-final-preservation.json)、[初始到第二轮基线](../../output/shop-card-source-repair-20261025/pre-wave2-transitive-preservation.json)、[两轮代码链](../../output/shop-card-source-repair-20261025/transitive-code-chain.json)、[第二轮安装回执](../../output/shop-card-source-repair-20261025/installed-resource-receipt.json)、[安装后严格核对](../../output/shop-card-source-repair-20261025/after-install.json)、[验收后核对](../../output/shop-card-source-repair-20261025/after-restart-native-acceptance.json)、[最后重启核对](../../output/shop-card-source-repair-20261025/after-restart.json)。最终新增16个文件均已分类（14个浏览器运行文件、2个 SQLite WAL/SHM），未知改动0、丢失0；5个锁定浏览器文件未被声称为原字节相同。

前轮 ERP 确认及图片成果的实际验收仍见[原业务记录](../../output/interactive-message-cards-20261025/installed-update/business-acceptance.md)：本次没有再写 ERP 数据或生成图片，已有图片导出文件的 SHA 再次核对保持。
