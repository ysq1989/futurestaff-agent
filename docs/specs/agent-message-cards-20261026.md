# 所有 Agent 默认可用的交互消息卡片

日期：2026-10-26（Asia/Shanghai）。在现有消息卡片外壳上补充 Host 工具、数据协议、固定组件与原会话回答通道。

## 目标与边界

标准配置下新建的平台 Agent、已发布 Agent、当前快照和本地人才模板，均自动获得 `agent_message_card`，无需改写 Agent 的技能、灵魂、版本、工程或历史文件。自定义工具限制仍受原有配置约束。单纯共享 React 组件不算实现默认支持。

通用卡片支持说明、至多 12 项摘要、至多 8 项简单文本/多行文本/下拉字段、至多 4 个回答按钮。它收集用户选择或补充信息，回到生成卡片的 Agent 会话；不会执行业务 API。SHOP 商品、ERP 确认、图片成果继续优先使用原生业务适配器。

所有显示内容均为纯文本；不接受模型 HTML、脚本、任意 URL、远程图片、工具名、HTTP 请求或命令。模型提供的摘要不是服务端业务凭证。按钮回答不替代业务预览、确认、授权或幂等收据。

## 协议与生命周期

工具输入：`{title, description?, facts?:[{label,value}], fields?:[{id,label,type,required?,options?}], actions?:[{id,label,variant?,submit?}]}`。`type` 仅 text/textarea/select；select 选项为 `{value,label}`。`submit:false` 按钮只回传选择，允许跳过缺失必填项。字段和按钮 ID 在各自范围唯一，文本与集合有固定上限，未知字段拒绝。无按钮的卡片为信息展示。

Host 产生 schemaVersion=1、module=agent-card、kind=message、随机 viewId、原 sessionId、expiresAt 和规范化 data；模型不能指定身份、接收会话、回执或状态。默认有效期 10 分钟。每次展示读取、回答、重试均重验当前账号、Agent 会话和绑定。响应保存 `{eventId,actionId,actionLabel,values}`，首次回答固定；重复同答复共享回执，改答拒绝。

固定 POST `/_futurestaff/message-card`，仅本机、同源、自定义头；action 为 view/respond/retry。view 与历史渲染无写入/回传副作用。respond 原子固定回答后回传原 Agent；retry 只重送已有 eventId，不能修改输入或重新执行业务。请求结果未知时先读取原 view，禁止直接构造新回答。

工具结果中的有界快照持久保留。过期或重启后，历史内容只读展示，按钮禁用；用户回答以原会话的插件消息保留。切账号、切主体、会话失效或撤权后隐藏旧内容并禁止回传。通用组件继续使用现有中性主题、可见焦点、窄屏单列、处理中禁用和明确错误恢复。

## 组件与覆盖检查

`AgentMessageCard` → `MessageCard` → 摘要 / 有标签字段 / `MessageCardAction` / `MessageCardNotice`。无新 UI 框架或依赖。需要验证：不隐式提交外层表单；键盘选择/填写；必填与选项验证；并发/双击去重；未知响应恢复；只重试原结果；过期快照；登出/切主体/撤权期间响应丢弃；多卡片及折叠工具仍可见；390px 与深色模式。五项主要风险分别以固定布局、真实状态、原业务适配器、纯文本边界及有界数据控制，避免伪造执行成功、权限扩大、历史重复写入、溢出和重复提交。

## 新 Agent 的用法

默认继承公共工具，无需为每个 Agent 编写 React 组件或变更 recipe。模型可按工具 schema 调用，例如：

```json
{
  "title": "请选择方案方向",
  "description": "记录偏好后，我会继续整理方案。",
  "fields": [{"id": "brief", "label": "补充要求", "type": "textarea"}],
  "actions": [
    {"id": "compare", "label": "先比较方案", "variant": "primary"},
    {"id": "later", "label": "稍后再说", "submit": false}
  ]
}
```

回答会以 `futurestaff.card.response` 插件消息进入原会话，含原卡片 viewId、固定 eventId、actionId/actionLabel 和 values；模型不传接收人、tenantId 或任意后端动作。通用协议供业务扩展通过 `@futurestaff/fs-platform-access/message-card-contract` 引用；视觉外壳继续从已有 `./message-cards` 引用。实现与验收见[本轮报告](../validation/agent-message-cards-20261026.md)。
