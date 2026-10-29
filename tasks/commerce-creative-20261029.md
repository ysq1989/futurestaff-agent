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

## 授权发布与更新

用户随后明确授权“继续开发并且授权发布和更新”。功能与发布修复已提交并推送：`886f7b7059`、`f3ad73f3c3216c2d135b0b9fef46046ee3f1aaa3`、`0ddc069dd0dbf34492349f82cbfb6b5444aea772`、最终构建源 `2e5ba279ef81ce9981dc88570b0860d6299201b4`。保留其他既有工作树差异，不纳入公开发布。

- Platform生产API 1.13.22已上线，素材接口真实HTTPS归档/重试/409/检索/下载/选用/跨企业拒绝及原有Agent API通过。入口修复后platform generation90，schema12不变，其他服务保持原版本。详见Platform同名任务。
- Agent 3.3.5从已提交源码导出构建，2118份源码字节与Git archive一致；五个未改动插件沿用精确公开3.3.4发布物中245份验证过的lib文件。新增公开3.3.4完整Profile升级库存，旧清单594份文件均验摘要。
- 不含无关本机改动的最终插件回归731项：730通过、0失败、1既有条件跳过；Native发布门禁200项通过、运行闭包228节点，安装包验证通过。构建时修复原有Native版本断言及客户端能力兼容版本常量。
- 正式更新源已发布3.3.5，回滚安装包3.3.4，保留confirmed-install策略与原Ed25519信任。公网重读清单验签和两份完整安装包摘要通过。安装包142019131字节，SHA256 `10ef7e9121934a525faaa2eda9abbadfe62a9221c6466e34e646111baaae4a44`；清单摘要 `9987b0b6a18152c97333c3d576b627448d6f62744ffacb9e027afad894baa63c`。
- 本机 `D:/FutureStaff Agent` 静默安装退出0，原始安装Profile610份文件验摘要，确认兼容常量含3.3.5。随后保留既有私有Web/克隆/预览能力：旧私有平台lib与公开升级差量三方合并，仅三处独立新增导入/调用需要合并且均保留两边；Native仅更新包版本，136份原有解包Native文件逐一保留。私有本机变体未改变公开安装包。
- 四份已存在的受管Profile代码已备份、核对安装前摘要后升级；私有随包Profile734份文件通过真实Native清单校验。更新前后2512份企业/身份/历史文件均未丢失或改动，91份会话原始前缀完整。安装后启动进程和实际登录界面显示3.3.5；保留旧会话及系统目录。
- 已安装Electron与其实际ASAR内FileSystemSkillProvider在独立验收工作区发现并读取全部五个技能，未调用模型；公开3.3.4→3.3.5实际Profile升级演练通过，成员工作区代码完整匹配，历史哨兵及选择状态保留。对应回执 `installed-skills-smoke.json`、`profile-upgrade-verification.json`。

安装与私有代码替换期间2512份文件完全一致；启动后另验2492份文件仍一致，91份原始会话前缀保留，无文件丢失。15份运行时文件随后变化，涉及会话投影缓存、凭据密文、用户偏好与Chromium存储/缓存；另5份浏览器文件锁定，未强行读取。该启动后检查不宣称凭据密文/缓存保持字节不变，不解密凭据、不回写旧会话或旧令牌。

忽略目录证据：`output/commerce-creative-20261029/{source-export.json,public-publication.json,public-https-verification.json,local-platform-merge.json,local-code-preservation.json,data-after-install.json,data-after-local-code.json}`。原完整安装目录、受管Profile代码及数据摘要已备份在同目录，未删除。

没有真实付费生成或真实商品视频生成验收，没有数据库迁移或外部广告投放。视频执行仍取决于AI系统当前授权工具。当前检索不含向量/OCR/ASR或知识库Web素材管理页；应用回滚保留所有素材及历史。
