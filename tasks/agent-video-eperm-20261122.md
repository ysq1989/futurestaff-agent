# Agent 视频 EPERM 修复

状态：完成；精确提交候选完整npm run check退出0，代码已提交，按用户授权推送。

用户授权：保留既有功能、平台接入及工作树，修复3项EPERM，完整回归通过后提交推送；不发布客户端或生产服务。Standard，fs-video本机文件持久化及非法输出测试所属，无schema、身份/API/业务契约变化，不执行真实模型。

本机main/d6e2728969是含既有桌面、移动和Cloud修改的保留副本；远端main/ffd243a6bf18536319fdd78d80da8cf141b1781a为提交父基线。storage/engine源码与远端一致；host测试有其他既有改动，须只提交本次修复片段。保留本地分支、index及用户数据，使用独立临时index审查远端基线上的精确修复树；不创建功能分支或linked worktree、不强推。忽略目录中的独立main验收快照只用于测试，使用原固定DSH子模块及独立安装的锁定依赖，不覆盖原仓HEAD/index。

验收目标：Windows rename短暂占用有界重试，保留原子替换和原文件；永久错误明确返回，并尽力清理自有临时文件，清理错误不得掩盖原始错误。链接测试使用普通权限可创建的真实junction，不能跳过原匿名/跨域/身份/失效/非法输出断言。新增可重复的故障注入测试；聚焦回归、完整npm run check、桌面与平台既有测试、远端精确修复树验收及迁移模块联调。中央协作事项只读复核，现有身份/素材契约不改变，不宣称整体事项关闭。

基线复现：fs-video 101项，98通过、1失败、2条件跳过。此前全仓日志中的两项rename EPERM为偶发，本次用受控错误重现并验证重试/永久失败边界；第三项普通文件symlink EPERM稳定复现。日志在忽略目录output/eperm-20261122。

实现：仅Windows EPERM/EACCES/EBUSY替换失败重试，最多6次、累计退避620ms；不删旧文件、不原位覆盖，POSIX和其他错误直接返回。6项新测试证明短暂占用时旧快照保持、成功后完整替换、永久错误/跨平台边界及临时清理。Windows真实dangling junction替代需提权的文件symlink，并移除相邻安全测试EPERM提前返回；业务拒绝断言完整保留。fs-video聚焦107项：105通过、0失败、2既有外部运行夹具条件跳过；类型通过。原两项rename用例20轮/40次均通过。

本机完整npm run check的产品类型/测试/构建已通过；check:desktop在既有electron-runtime.ts与已审查变体摘要不一致处停止（初始工作树已修改该文件，本次未改）。不放宽摘要、不覆盖桌面草稿。完整提交门禁以远端ffd基线和本次精确修复候选执行；该候选单独npm ci、GEO web依赖和Yarn immutable安装，不依赖本机其他未提交功能。初次无Git元数据/缺少GEO web依赖时的验收启动失败日志保留，按交接文档补齐独立验收环境后重新运行。

Agent/AIGC桥接候选联调已通过：消费AIGC已推送0b85a10，临时程序已清理、模型调用0；不改既有平台会话、授权、模型目录或费用接入。完整检查与提交指针见末尾最终回执。

完整候选进一步发现远端本身的桌面声明陈旧，非仅本机草稿：futurestaff-desktop-variants.json仍固定14e0da8b25的三个Stable源码摘要，之后已提交2988754d77增加Host原生诊断但未同步声明。已逐项证明旧摘要匹配14e0，审查该提交在electron-runtime/electron-shell-generation/runtime的完整差异及runtime-diagnostics实现与相邻测试：固定四类不可变元数据、最多16条启动缓冲、首订阅消费、订阅异常隔离，无原异常/路径/URL/renderer数据透传、无认证/业务请求变化。只把三个Stable摘要固定到ffd远端字节，并显式声明已有Stable-only runtime-diagnostics文件的精确摘要；Beta摘要不变。验证器与严格拒绝逻辑未改。复核继续保留[此前桌面窗口审查](../docs/validation/governance-desktop-window-20261026.md)。本机未提交pickVideoFiles等改动不在这些固定摘要内，原稿保留。

最终候选源码树e2a97a071c78494c373dc9279ce1f1a869bd0a1b（5个代码/测试/元数据文件）；布局门禁7测试、127共享源码对齐和19项精确产品差异通过。tar导出在Windows对CLAUDE链接做了复制回退，验收目录已按Git 120000原blob恢复为Windows常规指针文件，不修改产品源码。

Stable整套桌面首次运行1243通过、1失败、13条件跳过；唯一失败是futurestaff-profile.spec.ts的linked-child夹具同样写死file symlink而非Windows junction。只按相邻已有linked-package/其他Beta安全测试模式选择junction，并额外断言确为符号链接；原完整库存、外部包/身份拒绝、原代码和私有历史不变、安装幂等断言保留，无产品Profile逻辑改动。先记录真实EPERM RED，再聚焦68测试与完整桌面/根门禁验证。

## 最终验收

代码提交6b80c17db9d5de1417120e78a6f15d33f8b29078，根树精确等于e2a97a071c78494c373dc9279ce1f1a869bd0a1b；父基线ffd243a6。候选完整npm run check最终退出0：Desktop foundation、全部产品类型/测试/构建、Stable/Beta构建/类型/测试/运行闭包/CLI/Loader/Profile/许可/运维契约及75项根测试通过。桌面Market261、Stable1244、Beta1032测试通过，Stable/Beta各13个既有条件跳过；fs-video105通过、2个外部锁定媒体/Python夹具条件跳过，未新增跳过或削弱安全断言。桥接联调及原两项rename20轮/40次通过。

[机器回执与日志摘要](../docs/validation/agent-video-eperm-20261122.json)记录精确源码、命令退出码、现有条件跳过和本机草稿检查差异。验收源为独立main快照、锁定依赖和原固定DSH子模块；提交只含5个修复/测试/声明文件及本次文档，原local main/d6e272、index和其他工作树内容保留。临时桥接程序已清理；无客户端安装/重启/生产部署、schema/凭据/防火墙变更或真实模型调用。中央协作清单交付前已只读复核，原视频编辑/桌面素材等整体联合余项仍按既有回执，不因本次单仓测试宣称关闭。
