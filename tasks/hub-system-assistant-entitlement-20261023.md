# 货源系统助手不再额外要求团队套餐 — 2026-10-23

状态：已完成。Product Hub API 1.13.6、Platform API 1.13.7 已经 DEV→PROD；当前安装版已更新货源受管材料并在新会话真实查询成功。

用户明确要求：主体已开通货源集市且当前成员有对应权限，即可使用货源系统助手，与 ERP 一致；不额外要求团队套餐。

此前 Product Hub 1.13.5 把旧 Agent Key 的团队套餐门槛也用于新的桌面当前成员授权，导致正式环境的合法请求返回 `MEMBERSHIP_TIER_REQUIRED`。此前套餐拒绝回执保留为历史证据，本条新要求覆盖该旧产品行为。

本次范围为独立 Product Hub 服务端的两个当前成员分支：继续实时核验 Platform 的当前会话、成员、主体、已开通应用、模板及权限，然后按这些授权处理请求。私有货池归属、只读／操作员权限、幂等草稿、人工审核与发布边界保持。旧静态 Agent Key、H5 发布容量等其他商业规则不扩大修改。

按 DEV→PROD 发布；未迁移数据库、修改订阅或替换账号／Profile。Platform 额外仅修改一个受管材料文件，删除草稿示例的旧 team 要求并明确主体开通和成员授权；只有 Hub 0.3 recipe 摘要变化，其他助手和旧契约保持。当前安装版更新了这份文字材料，旧版本及其会话／工程保留，新会话调用一次 `call_product_hub_api / products_search` 成功返回 1 条，未执行业务写入。

正式 Hub 26 张业务表、804135 行的数量和摘要前后完全一致，订阅仍为 0 行。客户端 1480 项原文件增量核对通过，原会话内容、工程、记住密码保持；GEO 150 项及安装资源保持。偏好文件只更新经原 SHA 重建核验的 `recordedAt`，原偏好值未变。切换期间客户端曾停留一次加载错误，原受保护会话未清除，普通重启自动恢复原账号后完成实查。

见[本次交付、实机截图与数据核对](../output/hub-system-entitlement-20261023/README.md)。服务器候选、测试、回滚与 HTTP 证据位于独立 Hub 仓 `output/desktop-member-entitlement-20261023`，材料发布证据位于 Platform 仓 `output/hub-skill-entitlement-20261023`。未 commit/push 或重新发布 Windows 安装器／feed。
