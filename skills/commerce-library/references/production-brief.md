# 创作资料结构

根据任务填实际可得信息，无需追问所有字段。资料可由商品系统与知识库读取；只问缺失且影响交付的关键项。

```json
{
  "projectId": "new UUID",
  "product": {"sku": "真实编号", "name": "名称", "variant": "指定款式", "sources": ["实际原图路径或获准记录ID"], "verifiedFacts": [], "unverified": [], "mustPreserve": []},
  "brand": {"sourceVersion": "已有素材版本ID或企业规范来源", "logo": "授权文件", "palette": [], "typography": [], "tone": "风格", "examples": []},
  "task": {"kind": "product-images/detail-images/banner/video", "audience": "客群", "channel": "实际渠道", "locale": "zh-CN", "objective": "一个主要目标", "formats": [], "deliverables": []},
  "production": {"referenceRoles": [], "factLocks": [], "budget": "已约定预算", "iterationLimit": "已约定轮数", "requests": []},
  "review": {"checks": [], "feedback": [], "limitations": [], "selectedVersion": null}
}
```

单张图片制作brief保留真实提示词、参考文件、实际请求ID与回执；套图交付版本补充每张图片的用途和事实来源。视频保存镜号、时长、画面、动作、商品依据、旁白、字幕、转场与所用片段ID。

归档映射：source=商品事实/实拍；reference=场景/风格参考；output=最终或候选成品；editable=版式/工程/实际提示词；copy=文案；storyboard=分镜；subtitle=字幕；review=审核/修改记录。生成商品母版仍是output，不改标真实source。
