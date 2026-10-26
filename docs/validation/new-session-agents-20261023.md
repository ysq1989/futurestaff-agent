# 新会话智能体目录本地验证

验证日期：2026-10-24（Asia/Shanghai）。需求开始于 2026-10-23。

## 结果与范围

侧栏底部的“智能体中心”入口已移除。“新会话”复用现有目录，直接展示当前成员可见的系统助手和通用助手，包含已安装及未安装条目。搜索、安装状态筛选、安装、更新、卸载、回滚和能力升级确认继续使用原 Host 逻辑。

目录采用三/二/单列内容区响应布局；卡片保留名称、状态、用途和主操作，技能、版本、卸载及回滚进入可展开详情。首屏加载使用骨架，服务错误可重试，无搜索结果及无安装条目提供恢复入口。保持既有浅色/深色主题和批准的 FutureStaff 标识。

模板开始对话使用 Host 返回的精确 sessionId；发布智能体通过 `open-installed` 的服务端 path 创建/选择对应工作区，不再回到目录。身份与成员应用授权变化会取消尚未完成的操作。操作锁覆盖快速连续安装、卸载、回滚和开始对话。

本次仅修改源码并生成本地构建，未安装、未重启已安装客户端、未发布安装器或更新 feed。未写入现用账号、Profile、凭据、会话或工程。截图中的成员与智能体资料为测试 fixture，不能作为生产目录或已安装客户端验收。

## 检查

- `npm run typecheck -w @futurestaff/fs-platform-access`：通过。
- `npm run test -w @futurestaff/fs-platform-access`：393 项，392 通过、0 失败、1 项既有跳过；包含 TypeScript 构建及客户端打包。
- 跳过项：既有 `platform publication UI respects unsaved configuration, publishes and confirms stop`，本次未改变其跳过条件。
- 新会话真实 Edge 回归先 RED 复现中转入口，再 GREEN：完整授权目录、跨租户应用隐藏、分类/搜索、安装后原地打开精确 session、发布智能体精确工作区、加载/局部错误/空状态、完整侧栏无重复入口、批准 logo 加载成功。
- 旧浏览器回归保留持久化、工程隔离、会话归档、安装不自动建会话、更新及回滚同步、设置关闭、权限撤销取消和 Picker 仅已安装约束。
- 发布卡片同步双击测试先 RED 证明两次安装请求，再 GREEN 验证仅一次；打开失败后可重试。
- 深浅色全部按钮 hover、selected、disabled、focus-visible 对比度检查通过，文字对比度达到 4.5:1；键盘焦点可见。
- 1440px 浅色/深色和 390px 窄屏截图已目视检查，无横向溢出；真实浏览器运行零 `Runtime.exceptionThrown`、零 `console.error`。
- `21st review` 五份变更源码：0 finding。目录灵感搜索服务不可用，因此沿用当前项目的组件与主题，未引入新依赖。
- `git diff --check` 本次已跟踪文件：通过；Git 仅提示已有 Windows CRLF 规范化。

## 证据

- [桌面浅色](../../output/new-session-agents-20261023/home-light-1440.png)
- [桌面深色](../../output/new-session-agents-20261023/home-dark-1440.png)
- [390px 窄屏](../../output/new-session-agents-20261023/home-light-390.png)
- [插件完整测试](../../output/new-session-agents-20261023/plugin-tests.log)
- [类型检查](../../output/new-session-agents-20261023/typecheck.log)
- [21st review](../../output/new-session-agents-20261023/ui-review.log)

主要源码：`src/client/agents.tsx`、`agent-center.tsx`、`talent-market.tsx`、`published-talent-card.tsx`、`sidebar.tsx`（均位于 `plugins/fs-platform-access/`）。其他既有未提交变更已保留，本次未提交或推送。

## 后续本机安装版验收（2026-10-24）

用户后续明确授权本机更新，已完成安装资源、alpha、当前成员及另一现有成员共四处同步。此次仅 15 个 UI 产物变化，原生壳与 Host 不变；两份受管 manifest 更新，成员配置、身份、角色材料未覆盖。保留 Profile 外同盘 6 个回滚副本。安装 runner 11 项通过；待升级 workspace 为零。

真实安装版正常重启 healthy，原账号自动恢复；新会话展示当前成员 28 项目录，侧栏底部重复入口消失。系统助手筛选与“市场研究”搜索结果已在真实 Windows 窗口检查；没有为测试安装智能体或创建业务会话。

安装前保护基线包含 1692 原文件，切换时 0 变化/0 缺失；普通启动与 UI 检查后账号、记住密码、原历史内容、工程及绑定核对通过，工作区原文件 0 变化。运行缓存和偏好记录时间的更新单独列出，不宣称整个浏览器数据目录字节不变。本次未发布公共安装器或 feed。

证据见[本机交付](../../output/new-session-installed-20261024/README.md)与[真实安装版截图](../../output/new-session-installed-20261024/screenshots/default.png)。此后续记录取代前文“仅源码，未更新安装版”的当前状态，保留其作为当时验证范围的历史记录。
