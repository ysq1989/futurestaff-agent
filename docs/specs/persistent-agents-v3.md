# FutureStaff Agent 3.0：持久智能体入口与本机数据

日期：2026-10-11。状态：源码实现、本地功能验收及 Stable/Beta 桌面开发门禁完成，发布和线上验收待另行授权；不是已发布版本。

## 目标

平台管理已有智能体，桌面选择智能体后创建会话。智能体身份、知识、Skills、工具声明和长期记忆持续存在；新会话继承它们，会话记录独立保存。替换空白工作区选择入口，保留历史工作区和会话作为明确的旧数据入口。

## 所有权与契约

平台 Agent 模块拥有智能体和共享状态；平台身份模块拥有用户、主体及权限；客户端只拥有本机工作文件、会话日志、配置缓存和同步状态。不能从模板安装结果冒充已有智能体。

新增 `/desktop/v1/agents` 和 `/desktop/v1/agents/{id}/snapshot`，版本 `1.0.0`，使用现有可撤销桌面会话。服务端根据真实用户主体及既有 Agent 权限检查可见性。快照只投影允许的文本规则、记忆、Skills 和知识文件，不输出凭据、插件执行配置或其他用户聊天。平台聊天增加可选 Agent 绑定；每次调用再次校验权限与版本并从服务器加载上下文。

工具仍由既有类型化 Tool/MCP 和确认层授权。云端工具不会因下载文件自动变成本机工具；未接通的能力必须显示实际状态，不能宣称已能执行。共享记忆不从普通聊天自动写回。

## 本机目录

新用户默认 `%LOCALAPPDATA%/FutureStaff Agent/`，非 Windows 使用 `~/.local/share/futurestaff-agent/`。环境、主体、用户、智能体依次隔离。ID 必须是校验后的 UUID，目录名不使用显示名称。

```text
desktop/                        外壳设置、保护存储、日志与浏览器状态
harness/                        新安装的原生 Harness Profile
environments/{dev|production}/tenants/{tenantId}/users/{userId}/
  sessions/ storages/ attachments/ settings/ session-search.sqlite
  agents/{agentId}/
    definition/snapshot.json    平台快照清单
    memory/                     本机记忆，不能冒充共享记忆
    workspace/                  本机持久工作文件
      .futurestaff-agent/definition/  受控知识缓存，可由本机文件工具读取
    sessions/{sha256(sessionId)}/   附件、草稿与输出目录
  agent-session-bindings/        Session ID 与 Agent/版本归属
```

旧 `~/.futurestaff/workspaces/` 存在的成员目录继续使用，不自动移动、删除、猜测历史智能体归属。原 Profile 数据路径、已有外壳数据及显式 `DSH_HOME` 保留；已有 `~/.dsh` 也继续使用。原生会话日志仍由 Harness 在成员 `sessions/` 管理，智能体会话子目录用于附件/草稿/输出归档，不伪造另一份聊天日志。数据位置迁移必须关闭写入、复制、校验后切换，源目录保留以便回退。本轮没有迁移按钮，不执行真实迁移。令牌继续使用 OS 保护存储。

快照限定 128 个 UTF-8 文本文件、每个 64 KiB、总计 1 MiB；聊天注入的智能体上下文另限制为 131072 字符，超限拒绝并显示提示。Windows 保留名、路径穿越、链接目录、个人上传文件和执行脚本均不进入快照。平台 fallback 存储读取不能触发共享文件迁移。知识缓存是可更新投影；平台仍是权威，快照清单决定本次配置，缓存中遗留文件不自动删除。

会话在首条消息前绑定 Agent ID 和版本，随后不可切换智能体或静默采用新配置；版本变化要求重新选择并新建会话。共享记忆与云端工具执行、云端会话同步没有新增适配，界面说明实际能力。

## 智能体模型路由 1.1

桌面选择和聊天显式使用 `snapshot?contractVersion=1.1.0`。平台响应包含 `modelPolicy.primaryModelId`、`modelPolicy.fallbackModelId` 和原 1.0 内容版本 `legacyVersion`；这些字段计入 1.1 的 `version`，不包含凭据。旧 1.0 接口及缓存格式仍可读，图片、Website、ERP 等既有业务调用继续使用原内容版本，不因聊天模型元数据升级而失配。

宿主会话绑定分别保存业务 `version` 和聊天 `modelVersion`。已有 1.0 绑定只有在当前认证身份、Agent ID、原内容版本均与平台新快照一致时，才可首次固定 `modelVersion`，保持原绑定和缓存不变。首次固定使用写好后原子创建的独立私有元数据；并发不同版本只有一个能成功，已有模型版本不能被替换。后续模型或内容变化仍要求新建会话，历史记录和工程保留。

新会话的默认选项是“智能体默认模型”。原生 Session 明确选择的模型 UUID 只影响该会话，不作为其他智能体或新会话的默认值，也不修改平台全局默认模型或清除用户已有设置文件。准备调用时仅冻结身份和取消信号；实际发送时先验证真实 Session、最新快照和版本，再授权 Agent 主模型或该会话明确选择的模型。主模型为空、不可用、跨租户或版本失配时停止，不自动尝试租户默认模型或备用模型。

1.1 聊天请求同时携带 `agentContractVersion: "1.1.0"` 和 `modelSelection: "agent-default" | "session-explicit"`。服务端再次校验默认请求的模型必须是当前 Agent 主模型；显式选择仍受当前租户模型授权约束。默认别名的图片能力只是当前模型池的输入范围，发送前必须按实际绑定模型再次检查；不能据租户默认模型推断 Agent 的图片能力。旧客户端请求语义保留，本协议需要平台与桌面对应版本部署后才作为运行验收通过。

## 技术与风格

客户端在 `plugins/fs-platform-access/`，复用 Cordis slots、原生 Workspace/Session 控制器及 React/CSS tokens，不修改固定 Harness。平台改动在 `backend/app/api/desktop_*` 与独立服务模块，复用权限和存储。无数据库 Schema 变更。

```ts
const credentials = await authorize()
credentials.signal.throwIfAborted()
// Identity comes from Host authorization; renderer input is never authority.
```

## 执行与验收

1. 记录 ADR 与版本目标；先新增拒绝/隔离/持久化回归测试。
2. 平台授权目录和快照；客户端数据根目录与旧目录兼容。
3. 选择智能体、自动创建工作区、会话绑定、上下文接入。
4. 类型检查、测试、构建、浏览器业务路径和精确差异检查。

客户端：`npm run typecheck -w @futurestaff/fs-platform-access`、`npm run test -w @futurestaff/fs-platform-access`。平台：`python -m pytest tests/test_desktop_agents.py tests/test_desktop_chat.py tests/test_desktop_templates.py`，Ruff 检查变更文件。仓库：`git diff --check`。实际结果及发行阻塞见 [验收记录](persistent-agents-v3-acceptance.md)。

验收覆盖未登录、跨主体、私有智能体、授权撤销、路径穿越、链接目录、快照大小、两智能体独立会话、重启后归属保持、旧目录保留和版本变化。云端及安装版真实验收需发布后进行；源码检查不算发布证明。

## 发布和回退

大版本目标为 3.0，内部协议版本分别保留。开发使用 3.0.0-rc.1；未获得发布授权前不更改服务器、安装版或生产数据，不提交和推送。回退使用原安装包与原数据路径；新增数据保留。禁止旧程序写入新版管理文件。

## 2026-10-12 会话入口修正

正式 Agent 继续使用原来的真实系统 Profile，不提供第二套正式环境。点击新会话先在主区域选择智能体；选择后沿用原生 Workspace/Session 控制器进入会话。左栏仅保留搜索和会话列表，并以工作区名称标明归属；移除选择卡片、长数据路径和重复旧工作区树。点击已有会话退出选择流程，历史会话、草稿和文件保留。展示归属不构成授权，首条消息的 Host 绑定和服务端 Agent 校验保持。
