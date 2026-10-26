# SHOP 版本与子进程退出修复

日期：2026-10-25。状态：两轮最小更新、商品卡片与子进程实机验收、最后正常重启及数据核对已完成。见[最终验证报告](../docs/validation/shop-subprocess-repair-20261025.md)。以下保留问题定位与阶段记录。

用户授权修复 SHOP 版本问题、ENOTCONN 退出问题，更新当前客户端并完成真实商品推荐卡片验收。保持当前授权验收成员 Profile，账号、记住密码、原会话、工程、规则、Skills 与原文件继续保留；先前恢复原主体的要求已撤销。

## 问题与实现边界

- 旧 SHOP 会话在 Host 当前配置/modelPolicy 版本边界报 FUTURESTAFF_AGENT_VERSION。当前目录只列模板与发布安装，缺少该既有授权角色的有效新会话入口。
- 新增显式“安装当前版本并新建会话”路径，读取当前授权 snapshot 与 scope，在版本隔离目录安装；新会话沿用现有 binding 字段，namespace 仅由 Host 的 canonical cwd 和已验证快照导出。原定义、绑定、工程和人工文件保持原字节，旧版本检查继续生效。
- Geo、视频、聊天图片、Website、图片成果等统一解析当前 binding 的真实工作区，避免新会话误读旧目录；模型/内容版本和成员/主体权限仍按当前服务端状态验证。
- ENOTCONN 已在实际 npm runtime 的 stdio 错误边界重现。使用产品维护的 dsh-subprocess-local 补丁接管任务级流错误，保留原错误并结束任务、清理子进程及输出；上游子模块保持不变，Host 不以全局忽略异常掩盖失败。

## 验证与安装计划

1. 先有失败回归，再实现和 GREEN；对版本隔离、并发安装/取消、当前身份和权限变化、正常与失败 subprocess 分别验证。
2. 构建和类型检查，插件完整回归、桌面补丁/包测试，独立复核。
3. 从本机实际程序制作最小候选：只覆盖明确修复产物，保留未部署的 Website 改动与其他 dirty 文件。子进程 unpacked 文件和 ASAR 对应完整性元数据成对更新，其他 ASAR index 与 packed bytes 保持。
4. 正常退出后建立新鲜保留基线，包含当前账号密文、Profile、权威历史、工程/绑定、图片、GEO 与完整程序 inventory；外部同卷备份、CAS 替换及失败回滚。
5. 在安装版验证真实 Glob/ripgrep、Shell 正常结束，任务失败有明确结果且 Host 仍正常；实际安装当前 SHOP 版本，新建会话读取三款授权验收候选商品的当前数据，验证图片大图、关闭、选择和原会话回传。不导入、不上架、不创建商城订单。
6. 正常重启复验并完成原文件核对，记录实际结果和证据；未完成的旅程不能记为通过。

原卡片实现与前轮记录见[实机复验](../output/interactive-message-cards-20261025/installed-update/business-acceptance.md)。本轮输出目录：`output/shop-subprocess-repair-20261025`；之前基线、失败和回执均保留。

## 追加实机发现

首轮实际安装完成于 14:58:42 +08:00，8 个操作成功且有同卷旧字节备份。严格 `after-install` 检查 3,394 原文件：无变化、无缺失、新用户文件 0；79 份历史、账号、记住密码、工程、图片原字节保留。原 ASAR 的变化明确列为批准变更。

更新后自动登录当前授权成员。新目录显示 33 项，SHOP 正常完成“安装当前版本 → 当前版本已安装 → 开始对话”；新会话使用独立 snapshot namespace，原 SHOP 绑定和原工作区未变。

新验收会话重新读取三款授权候选商品的详情，具体商品标识、名称、价格和库存仅存私有业务证据。但当前动态商品主列表 `shop_api_product_d8f7c2d2d8d2` 的 view 被旧推荐代码以 `SHOP_RECOMMENDATION_SOURCE_REQUIRED` 拒绝；同时新接口结果为 `status/msg/data{count,list}`，旧投影仅支持 `source:shop/list`。模型后续将来源错误误解为翻页问题，已在定位后终止，失败记录保留，未记为卡片成功。

追加修复只适配服务端实际授权且只读的商品主列表元数据与真实结果投影，继续保留 session/owner/permission、重查和 ID 成员校验。后续最小更新使用独立目录 `output/shop-card-source-repair-20261025`，首轮基线、封存、安装回执不改。
