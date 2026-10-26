# 所有 Agent 默认交互卡片：实现与验收

日期：2026-10-26（Asia/Shanghai）。本轮交付为源码、构建及隔离运行验收；当前已安装客户端尚未更新为本轮代码。原安装版的 SHOP/ERP/图片实机结论仍见 [2026-10-25 报告](shop-subprocess-repair-20261025.md)，不能用本轮测试替代安装版业务验收。

## 已补齐的缺口

此前 `MessageCard` 只共享 React 外观，普通 Agent 没有可直接调用的统一工具。本轮新增全局 `agent_message_card`，在当前成员 Profile 的 Host 与客户端分别装配，继承现有账号和会话归属检查；模型按实际可见工具获得固定指引。新建 Agent 不需要逐一修改技能或发布内容。

支持信息说明、摘要、文本/多行/下拉字段、选择按钮。用户回答只回到生成卡片的 Agent，不调用业务 API。SHOP 商品、ERP 确认、图片成果继续使用专用卡片、授权和回执。纯信息卡无需等待点击；有按钮的卡片等待真实用户回答。新工具是默认界面能力，不扩大业务系统 scope。

| 创建方式 | 覆盖依据 | 实际验证范围 |
| --- | --- | --- |
| 平台 Agent（普通/已发布/当前快照） | 全局工具注册；原模型策略绑定与业务 scope 校验继续执行 | 空业务 scope 的平台聊天过滤/指引回归；原版本与快照测试纳入全插件回归 |
| 本地人才模板 | 标准组合复制后继承全局工具；不依赖 recipe.tools 写入新工具 | 纯模板无新增授权仍可见卡片；recipe 显式声明兼容；原人才安装/会话测试纳入回归 |
| 新复制的自定义 preset | DSH 工具注册继承 | 使用真实 Cordis、Tools、AgentLoop、AgentPresets 创建隔离 preset 并官方 copy()，新 Agent 继承卡片工具 |
| 显式 tools.restrict 的自定义配置 | 保留配置原限制 | allow=[] 时卡片不可见，另一 Agent 不受影响；未强行绕过限制 |

最后两项是运行库与隔离 preset 测试。没有平台/模板绑定的原生自定义 preset 仍受既有 `FUTURESTAFF_AGENT_REQUIRED` 约束，未宣称其完整平台对话或安装版业务验收通过。只读检查当前 Platform 源码的 `desktop_chat.py` / `agent_business_scope.py` 表明该精确工具不属于业务系统前缀；本轮未修改或部署 Platform。

## 回答、历史和权限

- 首个回答在 Host 同步固定，包含随机 eventId。并发相同回答复用原回执；换选项或改字段被拒绝。
- view 只读；respond 只记录用户输入；retry 只重送已有回答，沿用原 eventId。网络结果未知时先核对原卡片，不允许用户改答后再次提交。
- 返回通道固定生成卡片时的 Agent 对象和原 sessionId；每次操作以及异步回传前后重新授权。切主体、身份变化、绑定版本变化、撤权或原运行实例失效均不会向其他 Agent 回传。
- 默认 10 分钟有效期。历史快照可查看但不能回答；回答以原会话插件消息保留。重启不会把历史内容恢复成可执行授权，也不保证旧卡片永久保留选中高亮。
- 仅接受有界纯文本数据、固定字段和固定按钮；不接受模型 HTML、URL、工具名或脚本。表单必填/枚举同时由客户端与 Host 校验；请求总字节有上限，UTF-8 跨块中文完整保留。

## 一并修复的现有问题

查看商品图片、业务详情和关闭窗口的原生按钮补齐 `type=button`，避免隐式提交外层表单。图片原图下载增加同步锁、取消信号和生命周期检查；切主体隐藏旧图片/关闭预览，卸载或身份变化后忽略迟到的图片与下载响应。原文件导出逻辑未替换。

## 本机浏览器闭环

测试使用生产 `applyAgentMessageCardClient` 注册、真实 `mountAgentMessageCards` 同源 HTTP 路由和隔离测试 Agent。没有调用模型供应商、登录凭据、真实商城或 ERP 业务接口。

同轮两张卡片展示 → 键盘填写必填中文/选择下拉 → 快速双击按钮 → Host 固定回答 → 原 Agent 收到一次 followup。旁边 Agent 收到 0 次，业务操作 0 次。另测过期、身份变化、迟到响应、未知结果核对与原回答重送。实际测试回执为 [real-host-browser-receipt.json](../../output/agent-message-cards-20261026/client/real-host-browser-receipt.json)，其中 `testOnly=true`。

![生产组件的本机测试卡片](D:/项目/FutureStaff-Agent-client/output/agent-message-cards-20261026/client/real-host-cards-desktop.png)

![窄窗口深色模式的已回答卡片](D:/项目/FutureStaff-Agent-client/output/agent-message-cards-20261026/client/real-host-cards-narrow-dark.png)

## 检查与交付

最终类型检查与构建通过；完整插件回归 **629 项：628 通过、0 失败、1 项既有跳过**，包含新建 Agent 工具继承、通用卡片浏览器闭环及现有业务适配器。Profile 隔离打包 2/2 通过，包含新协议、Host、客户端和投影文件。定向 UI 审查 5 文件、0 项发现、0 自动修改。独立审查覆盖真实 DSH 新 preset 继承、异步身份切换拒绝和中文分块。

完整插件回归的首次默认并发结果为 615 通过、9 失败、1 跳过：其中 8 项浏览器启动超时，1 项新增注册清单未更新。补齐注册清单后，限制并发的整包运行为 626 通过、2 失败、1 跳过；失败为浏览器 CDP 连接和一个图片恢复测试进程，单独串行复核 2/2 通过。随后一次串行运行被运行环境重连中断，未计通过。原失败与中断日志均保留；最终使用 `node --test --test-concurrency=1 --test-timeout=45000 plugins/fs-platform-access/test/*.test.js` 完整执行 **628 通过、0 失败、1 跳过，139.1 秒**，见 [最终整包日志](../../output/agent-message-cards-20261026/plugin-suite-final.log)。没有弱化断言或跳过失败测试。

证据目录：[output/agent-message-cards-20261026](../../output/agent-message-cards-20261026/)。未提交、推送或发布安装器/feed，未重启当前安装的客户端，未改写当前账号、会话、工程、绑定、远端 Agent 定义或用户原文件。当前工作树包含其他任务的既有修改，不能把整包构建直接等同本轮限定安装候选。

开发接口与约束见 [设计协议](../specs/agent-message-cards-20261026.md)。组件仍复用既有 MessageCard 与主题变量，21st 只参考 Chat Messages / AI Message 元数据，无新增 UI 框架或依赖。
