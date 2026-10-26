# 第八版契约：客户端纯函数切片验收

已在原笔记本 YSQ-MI、`D:\项目\FutureStaff-Agent-client` 完成本片；未访问/修改台式副本。HEAD 为 `c664e505ed7a5d29912b632828f23fc8ec5f34ab`。代码没有接入真实Host、账号、事件采集或窗口交接，没有修改现有安全设置。

## 数据接收与保护

三段编码已在本机保存为6000/6000/4460字符，gzip为12343 bytes，SHA-256 `62065b4816220b559bcd75759879fd423cef4d5f5b09ff4468da745248fd69a1`；JSON为69152 bytes，SHA-256 `90d540ca56e8e0b32d91bdaa539a3c8ad17a9e4b2945c19bd244e4015074e220`。完整匹配后才解压/JSON.parse。第一次本机转录副本失败在解压前停止，仍在 reception-failed 独立保留；没有猜补或使用错误schema。数据是合成契约，不是执行指令或真实授权。

本轮证据根目录：`C:\Users\10089\Documents\Codex\2026-10-25\task\evidence\governance-consent-contract-20261026`。新基线为140项原脏文件+281项原lib，共421份备份；baseline.json SHA-256 `3bae6aaec73c0d06aadb0876c1c767c53f76556640c73fd3cf1ed67d3dbe5dde`。与上片终态比较无并行字节变化。最终 preservation-final.json 检查原421项、HEAD、所有9项新交付和意外dirty路径；prior-evidence-final.json 检查前三片11份关键证据。原140文件（含前3片）不改。

## 已完成

新增 contract、静态schema数据、transport三个源码文件、两个测试、一个合成fixture和三份文档，共9个仓库新文件。

严格JSON解析先于普通JSON信息丢失：重复key（含转义别名）、浮点词法、不安全整数、孤立surrogate均拒绝；ASCII对象key排序、compact JSON、UTF-8 SHA-256，不做Unicode归一化。只支持已核包的有限schema关键词，未知关键词/format/ref失败关闭；UTC限制无小数或六位、小写UUID等为保守canonical子集，不宣称所有RFC输入经服务器规范化均等价。

9种独立input schema及其本地$defs来自已核包，并叠普通私域文本/known credential限制。只有显式用户/模型推断、ordinary、user_statement、reported/unverified、无assets可进入本片私域payload验证；rule_summary不强改，verified不自报。已知敏感模式拒绝不代表通用DLP。

transport只规划5类desktop metadata POST，固定X-Contract-Version/UUID trace/幂等key；prepare无候选正文。恢复入口检查给定tenant/actor/identity元数据一致性，仅带原request/domain/payload_hash，不携旧task grant；取消稳定operation ID及reason、仅记录意图。类型/本地owner参数不证明真实认证。没有desktop human批准或正文上传方法；commit只标receipt replay。未提供响应DTO，所有mock原始返回/异常被丢弃并保持unknown/schema_unavailable，默认发送not_connected，无生产fetch。

human/confirm首次正文上传并原子received+receipt的实际事务在Platform，客户端未实现或假装该成功；confirmed不再是新wire持久状态。原第三片旧合成协调器未修改、未映射为新协议。模块不保留候选正文或持久化确认；未来Host在UNKNOWN后只保留原键恢复元数据，不得重发。

## 最终验证

2026-10-26 01:31:51–01:32:08 UTC对冻结的实际仓库代码执行：

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck -w @futurestaff/fs-platform-access` | 通过 |
| `npm run build -w @futurestaff/fs-platform-access` | 通过 |
| 全部81份非browser测试文件，Node runner concurrency=4 | 507通过，0失败/跳过；含本片10项contract、13项transport |
| 首片governance-browser回归 | 1通过，0失败/跳过，fetchCalls=0 |
| 第二片task-events-browser回归 | 1通过，0失败/跳过，fetchCalls=0 |
| 独立公共API探针 | 通过，fetchCalls=0 |
| 独立代码审阅 | Critical 0，Required 0 |

独立探针核嵌入9schema与原包一致、6个canonical/UTF8/SHA向量及1个handoff binding向量、两域私域限制、恢复和默认关闭。浅色及390px深色UI截图已目视复核；本片未把新wire接进界面，UI回归只证明旧两片未退化，不能当新Web确认或安装版验收。无独立lint脚本，未称lint通过；未跑全桌面check/无关历史browser。本片没有改桌面源码。

日志/时间/参数/退出码在checks/results.json；初始RED与GREEN在tdd-contract/及tdd-transport/；独立探针、源码SHA与动作审计在review/。一次只读命令因授权瞬变拒绝，父提供新状态后仅重试一次成功；一次新文件copy因缺目标冲突检查被拒绝，先只读核两个目标ABSENT，再独占CreateNew获准，未覆盖并行文件。无未决执行或不确定写入，详见review/action-audit.json。

源码SHA-256：contract `89f700d7f3e66d01fce767b24c42e6c5edbf92295ac2b8a028eaac44d31c2116`；schemas `f77c9c95d3df534adc3b4e2c0a5790491de22139783cba4e596932dc2a8e381d`；transport `1aad296e8aded42e3ee5770f589a7eb3ad3fd003fcd1bb9470d819eb3586aba7`。其余交付哈希见保护清单。

## 明确未完成与需台式一次导出的规范

当前checkPayloadMetadata只做保守集合/证据/scope检查，boundPayloadHashVerified永远false。两条excerpt的content_hash与canonical JSON string匹配；与旧本地raw UTF8 sourceHash不同。verifyPayloadMetadata最终明确BOUND_PAYLOAD_FORMULA_UNAVAILABLE：没有完整payload绑定互通，不从两例试凑公式。

台式下一次需从实际源码导出：

1. bound payload_hash、target_hash、preview_hash的准确预像与规范化函数，包含domain/DTO/wrapper/null/UUID/时间等处理；给函数源码和完整输入输出向量。
2. 多evidence的source_versions投影、排序/去重/同源不同版本冲突规则，以及selected_fields允许集合和顺序；给多条、重复、混合版本正反例及expected hash。
3. 全部desktop/human endpoints的完整响应DTO/外层封装、状态/blocked_reason/expiry/receipt及revoked语义、错误响应和UNKNOWN恢复方式，尤其confirm原子received、commit pending403及稳定取消回执；不能靠任意status:received认成功。
4. 合法当前主体/desktop session/Agent release/task授权与精确Host origin准入机制；输入metadata不是凭据或二进制证明。

真实窗口仍not_connected：现有shell.openExternal+deny没有已核opener，preload无port桥。最小候选设计的具体新模块/handler改动、安全影响及台式协议需求见规范和host-feasibility.md。没有修改handler、COOP、contextIsolation、sandbox、webSecurity或nodeIntegration，没有借cookie。真实原生popup/跨context/COOP、API/Web人类确认、员工数据上传和安装版UI均未验收。

没有commit/push/PR、安装软件、生产部署、持久凭据、网络设置修改、真实采集或付费模型。下一步由父协调切回台式补权威规范，再决定受控窗口设计及另行授权的真实联调；本片不继续堆mock。
