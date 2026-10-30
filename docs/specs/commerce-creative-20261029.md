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
- commerce_image_preview：只读预览当前授权工作区内的已有 PNG/JPEG/WebP 相对路径；不生图、不下载远端文件、不归档。拒绝路径越界，原图最多64 MiB/1600万像素，附件预览有界压缩，保留原文件。

## 图片展示（2026-10-30）

生成、合成、下载及图片素材下载成功后，Host保存会话图片附件；工具卡片与“本轮图片”展示电商图片，支持打开文件及放大。预览保存失败只报告预览暂不可用，保留原成功回执，不重跑生成。未知或失败结果不伪装为成功预览。

历史会话中，只有关联到安全的 `commerce-output/` 相对路径、且已有真实图片附件的 `read_image` 回执才恢复到图片栏；渲染器不读取本机路径，不重写日志或重新调用模型。初次登录恢复完成前不读附件；已绑定主体/用户变化后立即清空图片及操作。

本机3.3.6的显示修复及验证见[任务记录](../../tasks/commerce-image-preview-20261030.md)。此记录不代表已发布新版桌面安装包。

## 持久化与知识状态

本机有实际文件；`.commerce-archive/<requestId>.json` 保存冻结请求指纹，改参必须新建版本。Platform 保存不可变manifest与内容寻址文件，真实tenant/actor/agent来自认证。并发同请求改参冲突，历史与baseVersion保留；同主体的有权Agent可检索企业素材，其他主体无法读取。

上传最多24份文件、单份64 MiB、合计96 MiB；支持图片、视频、音频、文案/字幕和JSON/HTML/CSS可编辑工程。下载逐字节验摘要，附件强制下载/no-store。检索是标题/SKU/brief/渠道/语言的有界子串匹配，nextCursor表示未完；不提供向量检索、自动OCR/ASR或知识库Web页面的素材管理视图。

自动归档为draft；原作者对已展示的明确版本说“采用这版”后记录选用。Host从真实用户消息及前一轮关联工具回执核对版本/hash，取消/疑问/工具伪造不能放行。选用与内容发布、商品事实核实及永久品牌规则是不同状态。所有素材 knowledgeStatus 保持 unverified-material。

远端保存只有校验回执后为saved；失败保留本机成品和编号，先get原版本再用同requestId/同文件补存。补存不重新生成。不将本机文件保存宣称为远端知识入库。

## 发布边界

2026-10-29已发布：Agent 3.3.5、Platform API 1.13.22，契约1.0.0；生产归档/检索/下载/选用闭环与本机安装验收记录见[任务](../../tasks/commerce-creative-20261029.md)。客户端旧版本仍需升级。无数据库迁移、未执行真实付费调用或外部广告投放。视频执行取决于AI系统实际授权能力。回滚应用保留素材与历史。
