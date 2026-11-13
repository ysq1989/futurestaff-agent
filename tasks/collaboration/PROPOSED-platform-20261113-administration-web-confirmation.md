# 行政独立页面确认URL消费配合接收

2026-11-13，system_id=agent。来源为已获用户允许协调的Platform会话`01a1cead-c568-7183-85c7-21f813c86086`和行政会话`01a1cf22-18c2-7963-a316-78340a14526e`。两方要求SDK/Cloud在V1.1候选中兼容新旧本人确认URL；原六工具/七字段操作envelope和模型写权限不变。

状态：**消费端新旧URL及V1.1候选READY，未切生产，三端联合验证待完成**。这是来源配合接收记录，不另发总事项编号；复用已有[行政V1.1接收任务](PROPOSED-administration-20261113-agent-owner-and-rule-v11.md)，不争写中央索引。Android035语音修复已独立发布，见[正式回执](../../docs/releases/android-voice-0.3.5-20261113.md)；该APK未包含SDK/Cloud V1.1，不据APK发布宣称行政消费端上线。

来源提出新URL为`https://administration.fsstory.net/leave?intent=<同一个小写UUID>`，旧精确Platform URL继续识别并兼容跳转。拒绝userinfo、fragment、其他路径、额外query、重复intent和任意origin；测试注入不扩大production允许域名。最终以所属仓版本化契约与合成样例为准。

Platform承诺先等待消费端兼容旧/新，再启用新context/URL。行政来源报告候选源码`6a085c73962bf43c4d06c66eb3c698abe9e1d9c9`、0.2.0/0003构建中，未生产切；这是来源状态，Agent未替其复核真实SSO或员工业务。下一步核验来源指向的人类授权原文、读取冻结契约/样例，集中由Root接续SDK/Cloud本地测试及候选，再三端READY后处理明确授权的Cloud发布。

接续：人类原文已实际核验，URL权威合同`ADMINISTRATION_WEB_APP_V1.md`和机器样例已冻结并实施。SDK104/Cloud48/Mobile32及两镜像smoke、既有备份格式恢复预检通过；源码A`9730ec569d339d6e3e3234405aded36894612f4b`、B`37d7e1e638313938bdbae952be2c28aef9d528e5`均已推送。完整[候选回执](../administration-agent-consumer-v11-20261113.md)明确A作为新协议兼容回退，旧a52禁止回退；实际三端发布和手机/真实SSO另验。
