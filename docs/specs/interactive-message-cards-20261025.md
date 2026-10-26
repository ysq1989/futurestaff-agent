# 对话内交互消息卡片：实现研究与效果稿

日期：2026-10-25（Asia/Shanghai）
状态：用户已于 2026-10-25 确认效果并授权开发；首批源码接入和隔离验证已完成，未安装、未发布。
当前优先事项：对话内可视化 UI；前轮 DSH 优化评估已存档，后续再改。

## 用户目标

Agent 的回复可以包含商品、数据、表单、进度和成果卡片。用户直接在消息中选择、补全、核对或查看结果；点击后卡片显示真实处理状态，Agent 在原对话继续响应。先用图片确认效果，再实施。

本次图片使用示例数据，不代表真实商品、价格、订单或已交付功能。未调用真实业务或启动客户端。

## 效果稿

### 1. 回复中直接比较和选择

![商品选择消息卡片](../../output/interactive-message-cards-20261025/01-inline-product-selection.png)

- 卡片位于 Agent 回复下方，和当前对话属于同一内容流。
- 三款候选展示图片、价格、库存、推荐理由；支持查看大图、选择和已选状态。
- 点击选择后回传原 Agent，并继续提供比较或方案整理操作。
- 商品选择只记录选择，不隐含导入、上架或其他业务写入。

### 2. 卡内核对、确认与执行结果

![消息卡片操作生命周期](../../output/interactive-message-cards-20261025/02-inline-action-lifecycle.png)

- 待确认：清楚展示对象、数量、金额和本次动作，明确尚未执行；提供返回修改、确认创建草稿。
- 执行中：禁止重复提交，保存并核实结果。实施时确认与修改控件均应进入禁用或明确受限状态；图片仅示意主按钮禁用。
- 完成：依据业务实际回执显示草稿编号、状态及结果入口，Agent 继续原对话。草稿成功不等于正式提交。
- 历史状态：操作过期时重新生成预览；请求已发送但结果不明时查询原结果，不再次提交。

第一张借鉴现有商品推荐机制，增加了统一消息布局与后续建议按钮。第二张提出内联核对/确认布局；现有 ERP 主要在右侧业务抽屉内完成确认，不能把这张效果稿当成现有功能截图。

## 当前已经实现的基础

| 类型 | 当前行为 | 源码入口 |
| --- | --- | --- |
| 商品推荐 | 聊天回答下方常驻商品图片卡；选择回传原 Agent；工具组折叠后仍可见 | `plugins/fs-platform-access/src/client/shop-recommendations.tsx:11-32`、`shop-operations.tsx:54-69`、`shop-recommendation-gallery.ts:9` |
| ERP 查询与业务操作 | 工具卡可显示表格和入口按钮；表单/核对/确认主要在页面内右侧抽屉 | `plugins/fs-platform-access/src/client/erp.tsx:33,62-71`、`erp-order-form.tsx:22,45` |
| SHOP 操作 | 聊天卡入口与页面内业务抽屉，支持原预览确认链路 | `plugins/fs-platform-access/src/client/shop-operations.tsx:38-71` |
| 图片成果 | 本轮作品集、审核状态、大图、原图对照和下载 | `plugins/fs-platform-access/src/client/fashion-gallery.ts:7`、`fashion-preview.tsx:28-68` |
| 视频成果 | 结果链接进入独立 Electron 视频预览窗；未发现专用聊天内视频卡 | `plugins/fs-video/src/host.ts:206-218,251,304`、`desktop-shell/dsh-plugin-desktop/src/video-window.ts:23` |

这些都是当前源码的实现事实。本次只读检查，没有重新做安装版或业务全流程验收。

## DSH 如何支持这些卡片

当前锁定的 DSH `0.1.2-rc.1` 已有必要机制，此功能不要求先升级底座。

1. Agent 调用已登记工具，Host 校验参数并取得结构化业务数据。
2. `output.render()` 生成模型可读内容，`output.presentationMeta()` 提供 UI 引用和展示信息。
3. `tool/result` 保存 `content` 和 `meta`。规范执行值本身不会自动成为持久业务状态。
4. 一次工具对应的卡片使用 `tool.call.toolview` 按工具名分派 React 组件。
5. 跨事件更新的独立消息使用 `ConversationNodeDefinition` 折叠状态，再由 `conversation.chat.node` 或现有 `turnTail` 展示。
6. 卡片按钮访问受控 Host 路由，Host 重新核对当前身份、Session、业务权限与有效性。
7. 读取/执行结果更新卡片；需要继续对话时，经 `InteractionReturnChannel` 和原 Agent `followup()` 回传实际结果。

DSH 官方的 [Conversation 组装](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/conversation)记录事件到消息节点的扩展方式；[工具契约](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/tools)区分模型内容与展示信息；[用户交互](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/user-questions)还提供选择/提问的结构化等待与回答机制。

重要区别：模型输出 HTML 或 `<button>` 不会自动得到业务交互。锁定版 Markdown renderer 将 raw HTML 作为文字显示，见 `desktop-shell/deepseek-harness/packages/client/ui-primitives/src/markdown/render.tsx:273-275`。应让模型选择已注册能力并提供数据，由客户端固定组件决定布局与按钮行为。

Host 的 `presentCall/presentResult` 也不能直接当作 Web React 卡片 API；锁定版 Web 卡主要消费事件与 metadata。现有商品、ERP 和图片组件已经提供可复用入口。

## 下一步拟采用的范围

确认视觉方向后，优先复用一层通用卡片外壳和状态表达，由业务适配器决定字段与动作，避免每个 Agent 再做一套聊天界面。

- 候选/查询卡：商品、搜索结果、简表、详情、分页和选择。
- 信息补全/确认卡：已知字段、缺项、预览、返回修改、明确动作与执行回执。
- 进度/成果卡：当前阶段、受阻原因、图像/文件/视频入口和后续动作。

保留普通文本总结，让用户知道结果和下一步；有复杂明细时仍可打开现有抽屉或预览窗口。核心信息和主操作留在对话中，避免卡片只成为一个跳转入口。

窄窗口改为单列；按钮支持键盘焦点、处理中禁用和错误恢复；状态不只依赖颜色。前端沿用当前中性白灰底色、品牌蓝、字体和组件，不因效果稿引入另一套 UI 框架。

## 状态与历史记录的实际限制

`plugins/fs-platform-access/src/interaction.ts:19,27,60` 的业务 view 和回传 binding 当前存在内存中，默认 view 有效期 10 分钟。因此持久工具日志不等于旧按钮永久可用。

后续实施需区分历史快照与当前业务状态：以持久业务 ID/收据重新授权读取，过期确认按钮禁用并重新生成预览。打开历史、刷新或重播不得执行写入；双击不得重复提交；结果未知时查询原收据；切主体、退出或撤权后不得回传旧会话。

## 共享组件与首批接入

共享入口位于 `@futurestaff/fs-platform-access/message-cards`，同时由现有 `client` 入口导出。其他 Agent 的业务客户端适配器可直接复用，不需要复制聊天 UI 或修改 Agent 模板/历史 Session。

组件树：业务事件/工具适配器 → `MessageCard` → 业务数据或成果内容 + `MessageCardAction` + `MessageCardNotice`。业务字段、权限、动作和回执由各适配器继续拥有。

- `MessageCard`：标题、来源标签、状态、描述、内容、动作和页脚；支持 `loading/ready/pending/running/succeeded/failed/expired/unconfirmed/readonly`。
- `MessageCardAction`：默认 `type=button`，卡片忙碌时自动禁用；只有明确的取消/停止等待动作才可使用 `allowWhileBusy`。
- `MessageCardNotice`：信息、成功、警告和错误提示，支持辅助技术读出。
- `installMessageCardStyles` / `messageCardCss`：当前插件统一装配样式；独立消费者按同样生命周期装配，使用现有主题变量。

共享组件只负责呈现与交互可用性，不签发权限、不生成业务 URL、不接受模型 HTML，也不保存或迁移用户数据。业务调用的去重、未知结果读回和授权仍在原链路落实。

## 交付与下一道边界

研究阶段只提交文档与图片。用户随后指定首批商品推荐、ERP 确认、图片成果接入。三类接入现已完成，共享入口支持其他 Agent 的业务适配器复用；原授权、确认、幂等、会话回传和文件链路继续保留。

插件完整回归 420 通过、1 项既有跳过，Profile 隔离发布检查 2 通过；类型与构建检查通过。实际浏览器截图、边界回归及安装状态见[实现验证报告](../validation/interactive-message-cards-20261025.md)。安装版更新和真实业务验收仍单独记录，不将源码检查表述为已安装或已部署。

图片由内置 `image_gen` 生成，提示词与参考说明见 [prompts.md](../../output/interactive-message-cards-20261025/prompts.md)。现有截图仅作为品牌和布局参考，未覆盖。
