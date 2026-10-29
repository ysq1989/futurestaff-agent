# 企业电商内容技能与素材归档

2026-10-29，用户批准按讨论方案实施。跨仓：Agent-client 拥有技能、工作区投影和工具；Platform拥有企业私有素材资料集合。模型仍由AI系统选择。原有工作树差异保留，未创建分支或worktree。

实现入口：[业务与使用说明](../docs/specs/commerce-creative-20261029.md)。Platform所有权/契约/ADR位于其 `tasks/commerce-creative-20261029.md`、`docs/contracts/COMMERCE_CREATIVE_V1.md`、`docs/adr/0086-commerce-creative-library.md`。

## 已实现

- 四个制作 Skill 和一个共用企业资料/归档 Skill，打包为数据资源，实际原生文件系统Provider可发现/加载；已存在的成员技能完整保留。
- 模型能力发现与参考图门禁、实际图片生成/下载后自动企业归档；保留提示词与原始参考，原请求未知时恢复而不重新生成。
- 有界图片/文字分层合成，真实商品像素与可编辑layout.json；详情模块及Banner复用同一工具。
- 企业私有原文件与索引，SKU/标题/brief等有界分页搜索、完整版本、校验下载、原作者选用；新版本保留baseVersion和历史。
- 草稿、选用、正式知识事实区分；自动归档不调用governance发布。视频技能依赖当前AI系统的实际工具，不冒充已提供任意视频模型或素材导入能力。

## 验证

- 五个技能均通过skill-creator校验与真实Provider加载。
- 客户端完整相关插件回归与构建：742项中741通过、0失败、1项既有条件跳过；最终日志 `output/commerce-creative-20261029/plugin-tests-final.log`；变更后的聊天/工具目标49项通过。
- 后端目标89项通过（新素材集合、桌面Agent、图片与服装、知识库及正式查询），Ruff通过；已有Pydantic配置弃用警告不涉及本次源码。
- 可迁移发布Profile两项通过；新增技能资源已纳入打包验证，清单保留在原预算内。
- 本机真实HTTP合成闭环：分层合成→上传→同编号幂等补存→检索→下载/摘要核对→真实消息选用→再次检索selected通过。回执 `output/commerce-creative-20261029/roundtrip-receipt.json`，预览 `banner.png`；均明确为合成测试，不是真实商品广告。

未执行真实付费生成、安装替换、服务器部署、数据库迁移、提交或推送；部署需同时更新Platform API与客户端。正式发布从已审main构建，保留旧代码及所有素材作为回滚依据。当前检索不含向量/OCR/ASR或知识库Web素材管理页。相关代码与素材存储无数据库结构变更。
