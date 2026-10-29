# 企业电商创作与素材知识沉淀

2026-10-29；Platform 契约 1.0.0；[跨仓所有权与 API](D:/项目/FutureStaff-platform/tasks/commerce-creative-20261029.md)。

## 使用方法

当前有权使用的持久 Agent 与本机已安装角色可发现四个制作技能；云端归档和生图执行需要真实绑定、可用的持久Agent会话，纯本机模板不能凭技能获得该权限：

- commerce-product-images：商品主图、真实细节与场景套图；关键商品信息保真。
- commerce-detail-images：客户问题→卖点证据→模块文案→整套详情图。
- commerce-banner：一个传播目标，品牌、商品与文案分层，多尺寸适配。
- commerce-video：脚本分镜→独立商品参考→片段制作→剪辑字幕→实际音画验收。

共用 commerce-library 读取企业品牌/SKU/历史选用素材，记录事实来源和修改范围，完成版本化归档和复用。技能只提供制作方法，不授予模型、业务系统、知识发布或外部投放权限。Skill 为本项目原创适配；方法参考 dlazy-ai/ecommerce-skills、nexu-io/open-design 的 ecommerce-image-workflow、ymh3753201/ai-commerce-video，不安装或执行其代码。

企业品牌、商品资料可来自当前授权系统和素材历史；知识事实正式采纳继续服从 governance。当前角色自行设定的工具限制保留；需要的视频生成或素材导入能力缺失时，交付完成的脚本/素材并明确缺口。现有 video_project_* 的固定动画不是任意商品视频生成接口。

## 工具

- agent_image_tools：读取当前AI系统的真实已授权能力。commerce_image_generate 选择实际工具与支持的参考图，成功后下载并自动归档图片、提示词与源参考；不修改AI模型池。
- commerce_image_compose：64–8192像素边长、最多1600万像素、32个图片/文字层；保留真实商品像素和可编辑layout.json。文字需显式换行及预览检查，工具不自动声称文字无横向溢出。
- creative_asset_archive/search/get/download/select：私有企业素材保存、元数据分页检索、完整版本读取、校验下载和原作者选用。只传相对路径，身份和凭据由Host获取。
- commerce_image_download：恢复原生成结果的本机下载；不调用模型。生成或下载/归档未知时保留原请求编号。

## 持久化与知识状态

本机有实际文件；`.commerce-archive/<requestId>.json` 保存冻结请求指纹，改参必须新建版本。Platform 保存不可变manifest与内容寻址文件，真实tenant/actor/agent来自认证。并发同请求改参冲突，历史与baseVersion保留；同主体的有权Agent可检索企业素材，其他主体无法读取。

上传最多24份文件、单份64 MiB、合计96 MiB；支持图片、视频、音频、文案/字幕和JSON/HTML/CSS可编辑工程。下载逐字节验摘要，附件强制下载/no-store。检索是标题/SKU/brief/渠道/语言的有界子串匹配，nextCursor表示未完；不提供向量检索、自动OCR/ASR或知识库Web页面的素材管理视图。

自动归档为draft；原作者对已展示的明确版本说“采用这版”后记录选用。Host从真实用户消息及前一轮关联工具回执核对版本/hash，取消/疑问/工具伪造不能放行。选用与内容发布、商品事实核实及永久品牌规则是不同状态。所有素材 knowledgeStatus 保持 unverified-material。

远端保存只有校验回执后为saved；失败保留本机成品和编号，先get原版本再用同requestId/同文件补存。补存不重新生成。不将本机文件保存宣称为远端知识入库。

## 发布边界

需要客户端与Platform新契约共同发布才具备云端归档；客户端旧版本和服务端旧版本不会凭文档自动获得能力。源码测试不等于已安装或已部署。无数据库迁移、未执行真实付费调用、无公开发布。回滚应用保留素材与历史。
