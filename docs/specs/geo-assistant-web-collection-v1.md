# GEO 助手网页采集对接契约 V1

2026-10-21。分工：本仓只实现 Agent 安装版和本机执行；GEO 服务端、数据库、网页及发布由 GEO 拥有者负责。本契约供双方联调，不代表服务端已上线。平台能力/版本声明另由 Platform 拥有者处理，不在本任务部署。

## 身份和入口

生产固定 Origin `https://geo.fsstory.net`，DEV 固定 `https://geo-dev.fsstory.net`，只由已核验 Platform 环境推导。接口前缀 `/api/geo/native/v1/assistant`。每次请求由 Host 申请当前主体的 GEO 60秒应用授权并以 Authorization Bearer 发送；audience 必须为对应的 futurestaff-geo-prod/dev。令牌不返回模型、不落本机任务日志。

服务端必须通过 Platform `/api/auth/module-session` 核验 GEO 短授权，不能把请求中的 tenantId 当身份。读操作需有效 GEO 权限，创建/领取/回传需 geo.operator/admin。结果保持 Agent 本机回传标记，不宣称服务器独立核验浏览器。

## 业务接口

所有 JSON 成功响应为 `{data: ...}`；错误为 `{error:{code,message,requestId}}`。编号由前置读取返回，不猜 UUID。

| 方法与相对路径 | 请求/响应 |
| --- | --- |
| GET /projects | data 为当前主体计划数组，含 id/name |
| GET /projects/:projectId/prompts | data 为原始问题数组，含 id/question |
| GET /projects/:projectId/jobs?page=1 | data 为任务数组；每页100，page 1..10 |
| POST /projects/:projectId/jobs | promptId、mode（首期“豆包 快速”）、language=zh-CN、memoryState=UNKNOWN、requestId（8–80位字母数字_-）；冻结原题、品牌及条件，原requestId换内容拒绝 |
| GET /projects/:projectId/jobs/:jobId | 返回 id/question/state/conditions/result/summary/screenshots；screenshots只给私有编号和哈希，不内联图片 |
| POST /projects/:projectId/jobs/:jobId/claim | executorId；仅创建者/QUEUED可领取，返回 leaseToken（UUID）和原任务 |
| POST /projects/:projectId/jobs/:jobId/resume | executorId；仅原创建者和执行器可恢复原leaseToken，绝不重置任务或授权重问 |
| POST /projects/:projectId/jobs/:jobId/result | executorId、leaseToken、result；不可变、按原结果幂等，原执行器可补传已过期为UNKNOWN的任务 |
| POST /projects/:projectId/report | jobIds（1–100）、可选baselineJobIds（1–100）；回传真实分母、未知/失败、条件相同的同题前后观察变化 |

conditions 至少包含 mode/language/memoryState；服务端可额外保存 product=doubao、surface=WEB、session=NEW_CONVERSATION、region/model=UNKNOWN 等冻结条件。

## result

- state：SUCCEEDED / FAILED / UNKNOWN / NEEDS_LOGIN / CAPTCHA。
- 原 question、实际 mode、language=zh-CN、memoryState=UNKNOWN、sourceUrl（首期仅 https://www.doubao.com/chat/数字 或 /chat/）、observedAt（ISO时间）。可选 questionEcho 保存产品自动空格后的可见原题，不改原始question。
- answer（最多100000字符）、answerComplete、searchState（ENABLED/DISABLED/UNKNOWN）、citationState（COMPLETE/UNKNOWN/UNSUPPORTED）。失败/未知需 errorCode，不能声明回答或引用完整。
- sources 最多100条：role=CITED/RETRIEVED/TEXT_URL、url、title、marker。CITED 必须保留原生标记；正文普通网址及搜索参考不提升为原生引用。
- citationObservation：NONE_VISIBLE / NATIVE_MARKERS_MAPPED / UNRESOLVED。COMPLETE 需要逐条原生标记映射，或完整观察确认没有原生标记，并附来源证据截图。
- screenshots 最多16张：role=ANSWER/SOURCES、PNG base64；单张原始PNG≤512KiB，base64合计≤8,000,000字符。成功需回答截图。超限或遮挡返回明确UNKNOWN与有界的不完整附件，不能静默截断后称成功。
- adapterVersion 首期 doubao-web-v1。服务端回执存截图私有ID/顺序/SHA；截图按主体及计划授权读取。

原生工具分为计划/问题/任务读取、豆包登录、创建、执行、证据回看和报告。提交一次前先持久化 STARTED；中断不自动重问；完整 RESULT 落盘后只恢复原回传。任务和浏览器目录按环境/主体/成员/Agent/版本隔离，不复制浏览器登录资料。

## 联调标准

先确认原生接口存在且真实授权可读取，再创建一条明确的新采样，核对豆包原题/模式/回答/引用/截图与 GEO 私有证据，最后看有效分母和报告。找不到接口、登录、验证码、模式变化、页面遮挡或不完整引用都如实记录，不能用模型 API、人工导入或隔离夹具替代线上验收。

DeepSeek 为后续适配：须先由双方确认产品字段、sourceUrl、adapterVersion 及报告分组扩展，再开放工具；不把 DeepSeek 模型接口当真实网页。
