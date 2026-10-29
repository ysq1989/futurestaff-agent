---
name: commerce-library
description: 企业电商创作的共用品牌/商品资料读取、素材归档、版本管理和历史复用。商品图、详情图、Banner、商品视频制作时配合对应技能使用；也用于查找、下载或选用企业历史素材。
---

# 企业创作资料与素材库

## 先建立制作依据

1. 从当前任务、已授权商品系统、企业资料与 `creative_asset_search` 获取品牌、SKU、实拍/包装、参数、已确认卖点和历史素材。不要每次重新询问已有资料；品牌库为空时只补影响交付的关键缺项。
2. 用 `creative_asset_get` 查看匹配版本的 brief、文件清单与选用信息，再 `creative_asset_download` 下载需要的文件。搜索是标题/SKU/brief/渠道/语言的子串匹配；nextCursor 存在表示尚未搜索完，不宣称全库无结果。原始图片文件中的 OCR、视频字幕或审核报告应保存为独立文本文件；它们尚不自动进入元数据搜索，把必要检索摘要写入 brief。
3. 整理工作区 `commerce-output/<projectId>/brief.json`：商品及事实来源、品牌规范版本、用途/渠道、客群、语言/尺寸、数量/时长、必留细节、禁用表达、预算和交付清单。来源不足的内容写为待核实，不从生成图片反推商品事实。示例结构见 `references/production-brief.md`。
4. 所有 reference 标明角色：真实商品身份、人物、场景、构图、风格。场景参考不能替代商品身份。已有证据不能证明背面、内部结构或配件时，使用原图裁切或保持可见范围。

## 执行与归档

- 按任务加载 commerce-product-images / commerce-detail-images / commerce-banner / commerce-video。技能决定方法和验收，AI 系统/当前授权能力决定模型；不要固定供应商、索取密钥、充值或改全局模型池。
- 每个项目一个 UUID projectId；每次不可变版本一个 UUID requestId。归档返回 versionId。修改用新 requestId，baseVersion 引用旧版。多个分支可并存，不把时间最新自动等同企业正式版。
- `commerce_image_generate` 成功下载后自动归档生成图片、实际提示词和最多两份参考图。返回 archiveStatus=saved 才能说已存入企业素材库。一个项目的多张图各自形成版本；最终用新的归档请求把完整套图、brief、文案、版式、质检一起打包为交付版本。
- 使用其他生成/剪辑工具时，完成每轮制作后调用 `creative_asset_archive`，files 仅为当前工作区相对路径。保存来源、成品、可编辑版式/工程、文案、脚本分镜、字幕、审核文件。格式支持 PNG/JPEG/WebP/MP4/WebM/MP3/WAV/Markdown/TXT/SRT/CSV/JSON/HTML/CSS；工程用 JSON 描述并附本工具链的实际参数，不声称可无损复现随机模型结果。
- brief 记录实际生成请求、使用的能力/模型回执、来源与修改摘要、检查项目及结果。没有调用或没有核验的项目不得写“通过”。实际参数中不保存 Token、认证头或密钥。
- 单文件上限64 MiB，每批总原始文件96 MiB，最多24份；超限分版本/分包，保留关联。工具不会远程抓任意URL。
- 远端归档失败/unknown：保留本机文件和 `.commerce-archive` 待确认记录。先按 projectId/versionId 读取原版本；缺失时用完全相同 requestId 与文件补存。可以重试幂等归档，不因此再次调用生成模型。用户应看到“本机已保存，企业归档待确认”。
- 生成结果未知：只查原生成 requestId；归档、下载或质检失败不授权再次付费生成。超过约定预算/重做次数时交付现有结果和具体缺口。

## 验收、选用与知识状态

按 `references/acceptance.md` 核验。产物先是企业私有素材草稿，同主体有可用 Agent 的成员可检索复用，不能对外公开。

向用户展示实际成品、差异与明确版本。上一轮通过get/archive读取并展示唯一完整版本后，原作者回复“采用这版”即可用 `creative_asset_select` 记录；调用时 expectedHash 来自该版本。Host核对真实用户消息及前一轮工具回执，禁止把本轮刚读取的版本套用到旧指令；多版本有歧义时先说明对应作品。含取消/疑问时拒绝。选用只是创意决定，knowledgeStatus 始终 unverified-material。

“这次背景改浅灰”保存在当前项目反馈；“今后这个系列都用浅灰”形成有系列/渠道/期限范围的规则候选。长期品牌规则和商品事实正式采纳必须走既有知识确认流程。本素材工具没有正式知识发布能力；不能把自动归档或选用说成事实已核实。企业/Agent权限由服务端决定。
