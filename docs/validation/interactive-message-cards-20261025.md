# 通用交互消息卡片实现验证

日期：2026-10-25（Asia/Shanghai）。

最新收尾：[SHOP 版本、动态商品卡片与子进程修复已更新当前客户端并实机通过](shop-subprocess-repair-20261025.md)，最后正常重启和原数据核对通过。ERP 与图片的前轮实际结果保留。以下结论及记录属于此次修复之前的阶段，未覆盖或删除原失败证据。

结论：共享卡片与三类源码接入、隔离回归与构建通过，本机安装及两次正常启动完成。后续授权测试主体中，ERP 消息确认和图片成果对照/下载已实际通过；仅新增明确合成对象的测试销售草稿（编号仅存私有验收记录）。SHOP 当前配置版本边界/无可用新入口，未计通过。用户要求保持当前验收成员和主体，身份详情仅存私有证据。只读诊断触发本机 Glob 子进程 ENOTCONN 退出，已正常重启并验证数据，未修底层故障；未发布公共安装器/feed。

最新：[真实业务复验与截图](../../output/interactive-message-cards-20261025/installed-update/business-acceptance.md)。以下保留源码阶段及安装阶段记录。

本机交付、备份与验收边界见[安装与数据保留报告](../../output/interactive-message-cards-20261025/installed-update/README.md)。以下保留源码阶段验证记录。

规格和用户确认效果：[交互消息卡片](../specs/interactive-message-cards-20261025.md)。原 DSH 优化清单继续存档，不随本次实施。

## 实现

| 部分 | 结果 |
| --- | --- |
| 共享组件 | `client/message-card.tsx` 提供卡片、状态、按钮、提示与生命周期样式。由主客户端装配，公共 `message-cards` 子入口可独立导入；未引入依赖或更换 DSH |
| 商品推荐 | 真实来源、图片大图、选择、已选、回传重试保留；本轮卡片不随工具折叠消失；受限历史快照仅用于过期只读展示，过期不能选择，403/切身份清除展示 |
| ERP | 新增 `erp-card-state.ts` 和 `erp-gallery.ts`；消息中直接核对/确认，卡片与抽屉共享原收据锁；真实表单生成的预览可返回修改并保留草稿，执行时锁定关联编辑表单 |
| ERP 恢复 | 未知结果仅查询原操作；已确认保存但未读回时按原收据读取；原会话回传失败只重送已保存结果；打开详情保留完成与投递元数据 |
| ERP 页面 | 原表单、表格、编辑、详情抽屉保留；新业务事件更新卡片，不自动弹出遮罩；切身份丢弃迟到查询、预览和确认响应 |
| 图片成果 | 原授权附件、轮次作品集、大图/原图对照、下载/打开文件保留；处理中、失败、结果未知与待审核准确区分，预览失败不丢失原文件入口 |

共享状态含 `loading/ready/pending/running/succeeded/failed/expired/unconfirmed/readonly`。默认按钮不提交外层表单，忙碌仅锁定所属卡片；显式停止等待动作才可豁免。浅色/深色使用现有主题 token，主按钮正文对比度均通过 4.5:1 下限断言。

## 可复用入口

其他 Agent 的业务客户端适配器可以从 `@futurestaff/fs-platform-access/message-cards` 导入 `MessageCard`、`MessageCardAction`、`MessageCardNotice`。现有主客户端已统一安装样式；独立载体按其插件生命周期调用 `installMessageCardStyles(ctx)`。

```tsx
import {MessageCard, MessageCardAction} from '@futurestaff/fs-platform-access/message-cards'

// data and confirm are supplied by the authorized business adapter.
<MessageCard title={data.title} status="pending"
  description="请核对信息，尚未执行。"
  actions={<MessageCardAction variant="primary" onClick={confirm}>确认执行</MessageCardAction>}>
  <BusinessSummary data={data}/>
</MessageCard>
```

共享层不接受模型提供的可执行 HTML/脚本/任意业务地址，不负责签发权限或持久化业务。新业务沿用 Host 授权与幂等边界，并使用自己的结构化工具事件或固定 renderer 接入。此入口是跨 Agent 的复用能力；本次首批实际业务适配为上述三类。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck -w @futurestaff/fs-platform-access` | 通过 |
| `npm run build -w @futurestaff/fs-platform-access` | 通过，含 TypeScript 与浏览器 bundle |
| 插件目录 `node --test --test-concurrency=1` | 421 项：420 通过、0 失败、1 既有跳过；约 84 秒 |
| `node --test --test-concurrency=1 test/release-profile.test.js` | 2 通过；在临时路径验证可重定位产物和运行时 pin，共享组件及 ERP 辅助文件包含在产物中 |
| ERP 浏览器补充截图复验 | 1 通过；产品源码不变，仅增加待确认截图 |
| `21st review` 本次 6 个 UI 文件 | 0 finding，0 自动修改 |
| 公共子入口独立导入与 SSR | 通过；不执行操作，默认按钮语义正确 |
| 既有修改保留检查 | `.21st/design.json`、公共 package 和客户端 index 与本轮前副本比较，去除本轮明确增量后相同 |

唯一跳过是原有 `platform publication UI respects unsaved configuration, publishes and confirms stop` 用例，不属于本次三类卡片；未将跳过计为通过。

重点回归覆盖：重复点击、卡片/抽屉共享执行锁、未知结果禁止重发、已保存回传恢复、过期与403、切主体/登出及迟到响应、HTML 文本转义、本轮折叠后常驻、图片授权/对照/下载、外层表单防误提交、390px/桌面深浅色和键盘焦点。所有测试均使用隔离浏览器 Profile、临时目录与本地 fixture，不使用真实账号和业务数据。

## 浏览器证据

以下是实际源码组件的隔离浏览器截图，内含测试商品、模拟服装图和转义测试文本；不是安装版或真实订单验收。前期 AI 效果稿与这些运行截图分开保存。

| 场景 | 截图 |
| --- | --- |
| 商品推荐 | [桌面浅色](../../output/interactive-message-cards-20261025/implementation/shop-desktop-light.png)、[窄屏深色](../../output/interactive-message-cards-20261025/implementation/shop-narrow-dark.png)、[过期历史](../../output/interactive-message-cards-20261025/implementation/shop-expired-narrow-dark.png) |
| ERP | [待确认](../../output/interactive-message-cards-20261025/implementation/erp-pending-light.png)、[完成回执](../../output/interactive-message-cards-20261025/implementation/erp-completed-light.png)、[结果待核实](../../output/interactive-message-cards-20261025/implementation/erp-unconfirmed-narrow-dark.png) |
| 图片成果 | [桌面浅色](../../output/interactive-message-cards-20261025/implementation/fashion-desktop-light.png)、[窄屏深色](../../output/interactive-message-cards-20261025/implementation/fashion-narrow-dark.png) |
| 共用状态 | [窄屏深色](../../output/interactive-message-cards-20261025/implementation/shared-narrow-dark.png) |

日志：[最终插件回归](../../output/interactive-message-cards-20261025/implementation/plugin-suite-final.log)、[Profile 检查](../../output/interactive-message-cards-20261025/implementation/release-profile-tests.log)、[UI review](../../output/interactive-message-cards-20261025/implementation/ui-review.log)。

## 数据与交付边界

本次不迁移或清理账号、凭据、Profile、原工程、历史会话、业务数据库和原图片；不改 Host/业务确认 API 或授权策略。既有未提交工作继续保留，没有 commit、push 或服务端部署；后续授权的本机更新仅安装本次明确卡片产物。

历史 Session 的工具内容不重写；商品快照从已有成功工具结果投影，ERP 卡片从已有 metadata/内容重建。Host 的业务 view 仍可能过期，UI 不承诺旧确认永久有效，也不通过重播执行写入。

本机受管产物、账号恢复与两次重启已验证；原生业务会话/按钮及对应环境的完整旅程仍需具备目标业务权限与明确测试范围。本报告不将本地 fixture、Profile staging 或页面可见性视为业务交互通过。
