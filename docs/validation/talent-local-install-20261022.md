# 人才模板下载安装到本机并用于对话

状态：2026-10-22 兼容模板的本机安装 → 已安装可选 → 真实对话 → 卸载／重启流程及源码回归完成。项目经理已实际安装、使用真实模型对话、卸载、重新安装，并通过正常无调试启动验证；当前保留一个已安装项目经理供用户使用。全 40 条模板均可本地安装尚未完成，32 条仍缺 Platform 本地执行材料。

## 最终产品规则

用户于 2026-10-22 明确纠正：智能体中心就是平台人才市场。用户在中心直接下载并安装人才到本机，再从已安装人才开始对话。未安装的人才不进入新会话或选择器，平台已有的授权智能体名单不能作为未安装时的兜底。

这替代了上一轮 [目录浏览方案](agent-talent-market-20261022.md) 中“前往平台聘用／在平台创建”和自动展示平台既有智能体的行为。上一轮验收保留为历史证据，不作为当前产品要求。

中心默认展示平台模板、中文分类和搜索。模板卡片提供“下载并安装”；本地已有同版本时提供“开始对话”，存在新版本时提供“更新安装”。“已安装”只展示当前成员本机启用的安装项。缺少本机工具、Skills 或连接器的模板保留 Host 返回的具体原因并禁用安装，不把角色提示词冒充完整业务能力。

本轮实际平台目录共 40 条，其中 8 条由平台提供了可本地安装的执行材料，另外 32 条明确依赖平台专有工具或 Skills 连接器，当前不兼容本地执行。客户端允许浏览这些模板，显示平台返回的原因并禁用安装；不能将“目录可见”表述为“40 条全部可本地运行”。本轮没有修改或部署 Platform 服务。

原发布安装包功能保留在“发布包管理”，明确只管理平台发布的桌面包，其数量不代表人才模板的本机安装总数。新会话目录可包含已安装的发布包，不能把未安装的发布记录或平台既有人才加入目录。

## 本机 Host 契约

以下接口继续要求同源本机请求及 `x-futurestaff-market: 1`，成员和环境来自 Host 的平台授权，不接受 Renderer 指定主体身份。

| 接口 | 行为 |
| --- | --- |
| `GET /_futurestaff/agent-market/catalog` | 读取当前平台人才模板，Renderer 只获得安全卡片字段及兼容性原因 |
| `GET /_futurestaff/agent-market/mine` | 返回本机已启用的安装项及受控工作区路径；同一模板只返回一个当前启用版本 |
| `POST /_futurestaff/agent-market/install` | 仅提交 `{templateId, version}`；Host 重新核验当前模板、摘要、权限及兼容性后安装，不修改全局默认预设 |
| `POST /_futurestaff/agent-market/open` | 仅提交 `{presetId}`；Host 校验本地启用项，使用精确预设创建并保存新会话，返回真实 `sessionId` |
| `POST /_futurestaff/agent-market/uninstall` | 仅提交 `{presetId}`；停用安装项，保留版本材料、工程及已存在的会话 |

安装完成后刷新本机列表，并广播安装状态变更，使后台新会话选择器及时刷新。加载本机安装项不等待独立发布包目录；发布包目录为空时不再读取平台既有人才作为对话候选。

“开始对话”、新会话页面和选择弹窗都打开 `open` 返回的精确 `sessionId`。Renderer 不再选择一个工作区后另建第二个会话，也不要求用户再次选择目录。设置内开始对话时先关闭设置，再进入这个已创建的会话；全页设置、返回焦点、原生窗口控件与后台历史会话沿用此前修复。

## 对话、模型与能力边界

本机人才绑定具有 `kind: local-template`、模板 ID 和不可变内容版本，不伪造平台 Agent ID，也不通过创建或聘用平台 Agent 代替本机安装。

Host 从原生会话头、真实工作区、预设投影及持久化创建准入记录解析归属。聊天使用已有通用 `/desktop/v1/chat` 契约和当前账号获准的模型；每次请求继续检查当前账号、主体、模型目录及撤销信号，不借用另一个平台 Agent 的模型策略。普通角色不获得 ERP、Shop、Website、GEO 或签证权限，业务范围固定为空数组 `businessSystems: []`，相关业务工具仍由现有服务端和 Host 边界拒绝。

已安装版本更新时，新会话使用新的启用版本；旧版本的工程和已准入会话继续保留。卸载后不能新建该版本会话，但已有历史会话仍按其原版本、归属和当前平台权限校验。安装不改变用户已有默认运行模式；不删除旧聊天、工程、账号、记住密码或 GEO 运行资源。

## 安装版加载链修复

实机安装曾暴露额外问题：桌面启动器把原生预设发现根目录强制写成 `roots: [shipped]`，覆盖成员原有配置。本地模板材料已经落盘，原生预设服务仍无法发现它，因而不能通过安装健康检查并启用。

启动器现保留成员配置的预设根目录、顺序及信任配置，仅在缺少内置根目录时追加 `shipped`，已有内置根目录不会重复追加。该修复先以两项回归复现覆盖行为，再通过完整 Profile 测试。完整桌面构建已完成，安装资源中的 ASAR 与 unpacked 内容同步，不依赖仅替换插件浏览器脚本。

最终回执确认：资源目录、alpha Profile 与当前成员 Profile 的 230 个平台插件文件、150 个 GEO 文件逐一一致；桌面入口与新构建一致，ASAR 的入口完整性与 unpacked 内容一致，待升级工作区数为 0，全页设置实现仍存在。此前全页设置与成员 Profile 升级兼容修复继续保留，GEO 代码未改动。

## 代码审查与自动回归

代码审查发现的启用状态与会话准入问题已落实修复，并通过对应回归：

- 同一模板使用原子启用指针，更新后只有一个版本进入 `mine` 和新会话选择器，旧版本留给历史会话；Renderer 继续拒绝重复启用版本。
- 安装材料通过原生预设发现及健康检查后，才提交启用状态，失败时不能在选择器中冒出不可用材料。
- 原生会话必须保存成功，创建准入记录应持久化；仅伪造预设名或工作区不能绕过卸载和安装检查。
- 更新、卸载及取消请求的串行提交继续检查当前授权信号，不能在账号变化后提交迟到操作。

UI 定向浏览器测试先复现旧方案仍出现平台聘用行为，再验证直接安装：失败不进入已安装，成功后中心、新会话和选择器仅出现该项；三次开始操作分别打开 Host 返回的三个精确会话，而不调用另建工作区／会话流程；卸载后选择器清空，平台既有九项不补位；退出后的迟到响应不打开会话。旧发布包安装、更新、确认、回滚、卸载及历史工程保护的浏览器回归继续通过。

最终平台插件回归共 334 项：333 项通过、0 项失败、1 项既有跳过。Profile 测试 43／43 通过；Host 与测试项目的 TypeScript 检查无诊断，完整桌面构建成功。隔离浏览器验证覆盖浅色、深色及窄屏，实际安装版结论另列如下。

## 实际安装版验收

验收使用当前安装版与现有成员身份，未执行平台聘用、创建平台人才或部署平台服务：

1. 目录实际返回 40 条，兼容状态为 8 条可安装、32 条不兼容并显示原因。初始未安装时，新会话无人才候选。
2. 项目经理下载并通过原生预设发现与健康检查后启用；“已安装”和新会话区域只显示这一项，未安装的其他 39 条及旧平台九项不会补入。
3. 从本机项目经理开始对话，进入 Host 创建的精确原生会话，真实模型按该角色回复。
4. 卸载后，新会话人才入口变为 0，既有对话继续保留。正常退出并以无调试参数启动后，原对话在卸载状态仍可使用真实模型回复“收到”。
5. 再次安装项目经理，幂等启用原有预设；再次正常退出并无调试启动，渲染器健康、调试端口关闭，已安装数与新会话候选数均为 1，唯一候选为项目经理。

最后状态是本机保留一个已安装项目经理；未安装的人才仍仅存在于目录浏览中。正常重启证据见 `installed-normal-restart-result.json` 和 `normal-restart-installed-choices.png`。

## 持久数据保留

本轮以更新前的 1,450 个原文件为基线。342 个原工程与绑定文件字节不变，61 个原历史文件字节不变，原历史没有追加字节。465 个原业务文件中只有工作区索引 `workspace.json` 因登记新的验收工作区正常增长；不能将这一结果写成“所有原业务文件完全未变”。

记住密码的加密封装及成员选择不变；一个当前会话加密封装随正常授权过程刷新。缺失或锁定差异仅涉及浏览器缓存，不计为业务数据丢失。数据核对脚本已把 `businessChangesOnlyWorkspaceIndex: true` 和 `secretChangesOnlyCurrentSession: true` 纳入通过条件，本轮均通过。验收新增的本机安装、工作区及会话是本轮已授权流程产生的数据，原工程、历史和默认偏好未被清空或替换。

## 本机证据索引

- `output/talent-market-20261022/local-install-red.log`：旧方案浏览器失败记录。
- `output/talent-market-20261022/local-install-focused.log`、`local-ui-focused.log`：本机安装及原发布包 UI 定向结果。
- `output/local-talents-20261022/light-1440.png`、`dark-1440.png`、`light-520.png`：隔离浏览器安装列表截图。
- [自动回归日志](../../output/talent-local-install-20261022/platform-tests-final.log)、[类型检查](../../output/talent-local-install-20261022/typecheck.log)、[Profile 回归回执](../../output/talent-local-install-20261022/profile-checks.json)、[桌面构建日志](../../output/talent-local-install-20261022/desktop-build.log)。
- [初始目录](../../output/talent-local-install-20261022/initial.png)、[安装成功](../../output/talent-local-install-20261022/install-success.png)、[已安装列表](../../output/talent-local-install-20261022/installed-list.png)、[仅本机已安装的对话候选](../../output/talent-local-install-20261022/installed-only-choices.png)、[真实模型对话](../../output/talent-local-install-20261022/real-chat.png)。
- [卸载结果](../../output/talent-local-install-20261022/uninstalled.png)、[卸载后无新对话候选](../../output/talent-local-install-20261022/uninstalled-choices.png)、[正常重启后继续原对话](../../output/talent-local-install-20261022/normal-restart-old-chat.png)、[首次正常重启回执](../../output/talent-local-install-20261022/normal-restart-result.json)。
- [重新安装回执](../../output/talent-local-install-20261022/reinstalled.json)、[再次正常重启回执](../../output/talent-local-install-20261022/installed-normal-restart-result.json)、[重启后唯一已安装候选截图](../../output/talent-local-install-20261022/normal-restart-installed-choices.png)。
- [最终机器验收汇总](../../output/talent-local-install-20261022/acceptance.json)：目录兼容性、完整实机流程、测试及未公开发布边界。
- [最终三层产物与 ASAR 一致性](../../output/talent-local-install-20261022/final-artifacts.json)、[数据保留汇总](../../output/talent-local-install-20261022/data-preservation-summary.json)。涉及实际工作区路径、会话内部字段的私有诊断文件不列入公开索引。

跟踪任务：[平台目录与本机安装](../../tasks/talent-local-install-20261022.md)。当前文档只记录本轮本机能力，不能据此宣称新正式安装包或公开更新源已经发布。
