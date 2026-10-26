/**
 * Translations for built-in agent templates.
 *
 * Backend stores templates with English source-of-truth (`name`,
 * `description`, `capability_bullets`). The Talent Market UI looks up the
 * Chinese rendering here and shows it when `i18n.language` starts with `zh`.
 *
 * Keys MUST match `AgentTemplate.name` exactly. Missing entries fall back to
 * the original English values, so it's safe to ship a partial map.
 */

interface TemplateLocale {
    name: string;
    description: string;
    bullets: string[];
}

interface TemplateLike {
    name: string;
    description: string;
    capability_bullets?: string[];
}

const ZH: Record<string, TemplateLocale> = {
    'Vietnam Visa Agent': {
        name: '越南签证 Agent',
        description: '管理越南电子签证订单与申请表：收单建档、申请人资料录入、受控网签提交、支付链接与 App No 进度跟踪。',
        bullets: [
            '订单管理 —— 收单建档、查询、取消（含原因）与完成',
            '申请人录入 —— 护照/证件照上传与资料复核差异报告',
            '网签与支付 —— 受控提交、App No 进度跟踪与支付链接',
        ],
    },
    'ERP 系统帮助': {
        name: 'ERP 系统帮助',
        description: 'ERP 系统的帮助与支持 —— 教你怎么操作系统、判断是操作错误还是真实 Bug，并把 Bug 与二次开发需求整理成结构化报告，经你确认后沉淀为团队经验。',
        bullets: [
            '操作指引 —— 按官方功能手册讲解客户/销售/采购/生产/库存/财务/报表的操作步骤',
            'Bug 诊断 —— 先区分操作错误与真实 Bug，用只读查询核验数据与界面是否一致',
            'Bug/需求收集 —— 整理结构化报告（复现步骤/预期 vs 实际/影响范围），经你确认后沉淀为经验',
        ],
    },
    'ERP 采购助理': {
        name: 'ERP 采购助理',
        description: '采购与供应商管理 —— 维护供应商/物料档案，管理采购订单全生命周期（创建/确认自动入库/收货/完成），并根据低库存给出补货建议。',
        bullets: [
            '供应商管理 —— 建档、联系人维护、分类与启用状态',
            '采购订单 —— 创建、确认（自动入库）、收货跟进、状态推进',
            '低库存补货 —— 读取库存预警，输出建议采购清单供确认',
        ],
    },
    'ERP 生产助理': {
        name: 'ERP 生产助理',
        description: '生产与工单管理 —— 维护 BOM，创建并确认生产工单（标准生产扣料增成品/简易生产只增成品），跟踪生产状态流转。',
        bullets: [
            'BOM 管理 —— 产品物料清单维护，标准/简易生产模式',
            '生产工单 —— 创建、确认（系统联动扣料与成品入库）、状态推进',
            '物料齐套校验 —— 确认前核对物料库存，缺口如实提示',
        ],
    },
    'ERP 财务助理': {
        name: 'ERP 财务助理',
        description: '财务与对账 —— 登记财务记录与销售回款/采购付款，核对应收应付与损益，输出对账差异清单，金额操作均需确认。',
        bullets: [
            '财务记录 —— 收入/支出/应收/应付登记与汇总核对',
            '回款与付款 —— 关联订单登记，应收应付对账',
            '损益核对 —— 财务汇总与损益表交叉验证',
        ],
    },
    'ERP 库存助理': {
        name: 'ERP 库存助理',
        description: '仓库与库存管理 —— 执行入库/出库/调拨，核对库存流水与盘点差异，输出低库存预警清单，出入库均注明原因并确认。',
        bullets: [
            '出入库与调拨 —— 按仓库执行，出库校验库存、调拨保持总量不变',
            '库存总览 —— 产品/物料库存查询与低库存识别',
            '流水核对 —— 出入库记录查询与盘点差异清单',
        ],
    },
    'ERP 经营分析助理': {
        name: 'ERP 经营分析助理',
        description: '经营分析与报表解读 —— 只读读取 ERP 报表与经营驾驶舱，输出销售/采购/库存/客户/损益分析与周月经营简报，识别经营风险。',
        bullets: [
            '经营简报 —— 周/月分析：收入/支出/利润/订单/库存/生产',
            '报表解读 —— 销售、采购、库存、客户贡献 Top10、损益趋势',
            '风险预警 —— 低库存、逾期订单、应收账龄、客户集中度',
        ],
    },
    'Product Selection Specialist': {
        name: '\u9009\u54c1\u987e\u95ee',
        description: '\u4ece\u5e73\u53f0\u8d27\u6e90\u4e2d\u7b5b\u9009\u5408\u9002\u5546\u54c1\uff0c\u7ec4\u5efa\u81ea\u5df1\u7684\u8d27\u6c60\uff0c\u5e76\u7528\u5df2\u6ce8\u518c\u7684\u6a21\u677f\u5236\u4f5c H5 \u5546\u54c1\u96c6\u5408\u9875\u9762\u3002',
        bullets: [
            '\u6309\u5173\u952e\u8bcd\u3001\u5206\u7c7b\u3001\u6807\u7b7e\u548c\u4ef7\u683c\u7b5b\u9009\u53ef\u9009\u5546\u54c1',
            '\u521b\u5efa\u548c\u7ef4\u62a4\u5c0f B \u7684\u4e2a\u4eba\u8d27\u6c60',
            '\u4ece\u5e73\u53f0\u6a21\u677f\u5e93\u53d1\u5e03 H5 \u5546\u54c1\u96c6\u5408',
        ],
    },
    // ─── Office ─────────────────────────────────────────
    'Project Manager': {
        name: '项目经理',
        description: '管理项目时间线、任务派发、跨团队协调和进度汇报。',
        bullets: [
            '项目规划与里程碑',
            '状态报告与仪表盘',
            '跨团队协调',
        ],
    },
    'Chief of Staff': {
        name: '幕僚长',
        description: '你的私人幕僚长 —— 每日简报、优先级分诊、跟进追踪、用你的语气拟稿。',
        bullets: [
            '每日简报 —— 一分钟读完今天最要紧的事',
            '优先级分诊 —— 哪些做、哪些缓、哪些放、哪些扔',
            '跟进追踪 —— 跨会话不让任何事掉链子',
        ],
    },
    'Private Assistant': {
        name: '私人助理',
        description: '你的私人助理 —— 日常备忘、跟进提醒、草拟消息和轻量计划整理。',
        bullets: [
            '日常协调 —— 整理优先级、提醒和未完成事项',
            '拟稿支持 —— 消息、纪要、短更新先给你一版',
            '跟进记忆 —— 记录人、决策和待办',
        ],
    },

    // ─── Software Development ───────────────────────────
    'Frontend Developer': {
        name: '前端开发工程师',
        description: '构建响应式、无障碍的 Web 界面 —— React/Vue 组件、Core Web Vitals 优化、像素级实现。',
        bullets: [
            '组件实现 —— React/Vue + TypeScript，状态干净',
            '性能审计 —— LCP/INP/CLS 指标 + 具体修复方案',
            '无障碍 review —— WCAG、键盘、屏幕阅读器路径',
        ],
    },
    'Backend Architect': {
        name: '后端架构师',
        description: '设计撑得住的 API、数据模型和服务边界 —— 一致性、延迟、运维成本的取舍都摊在桌上。',
        bullets: [
            'API 设计 —— REST/GraphQL 形态,合约清晰,错误路径明确',
            '数据建模 —— Schema、索引、分区、迁移顺序',
            '取舍分析 —— CAP、一致性、延迟 vs 成本,坦诚说风险',
        ],
    },
    'Code Reviewer': {
        name: '代码审查员',
        description: '像资深工程师一样读 diff —— 抓正确性、安全、可维护性问题,跳过 bikeshedding。',
        bullets: [
            '正确性 & 边界情况 —— 月底凌晨什么会出岔子',
            '安全 —— OWASP 级问题在生产前抓住',
            '可维护性 —— 标记下任读不懂的"聪明代码"',
        ],
    },
    'DevOps Automator': {
        name: 'DevOps 自动化工程师',
        description: '搭 CI/CD、IaC 和 runbook —— 自动化要可观测、不靠魔法。',
        bullets: [
            'CI/CD 设计 —— 快、稳、失败模式清楚',
            '基础设施即代码 —— Terraform、Kubernetes 清单、Helm',
            '运维手册 —— 最常出问题的 10 个场景的应对剧本',
        ],
    },
    'Rapid Prototyper': {
        name: '快速原型工程师',
        description: '把想法变成几小时就能点的 demo —— 在你下重注前先让你"摸到"产品。',
        bullets: [
            'MVP 拆解 —— 把想法剥到只剩验证假设的 3 个核心功能',
            '全栈原型 —— 用最熟、最快的工具搭出可运行 demo',
            '可点击 demo —— 真能跑的,不是死的 mockup',
        ],
    },
    'Designer': {
        name: '设计师',
        description: '协助设计需求拆解、设计系统维护、素材管理和竞品 UI 分析。',
        bullets: [
            '从需求出设计简报',
            '设计系统维护',
            '竞品 UI 分析',
        ],
    },
    'Product Intern': {
        name: '产品实习生',
        description: '协助产品经理做需求分析、竞品研究、用户反馈分析和文档整理。',
        bullets: [
            '需求 & PRD 支持',
            '用户反馈分类',
            '竞品研究',
        ],
    },

    // ─── Marketing ──────────────────────────────────────
    'Growth Hacker': {
        name: '增长黑客',
        description: '设计增长实验、分析漏斗、挖掘获客循环 —— 推动真指标,不是虚荣数字。',
        bullets: [
            '漏斗诊断 —— 找到那个最关键的漏点',
            '实验设计 —— ICE 评分 + 假设清晰的 A/B 测试',
            '增长循环 —— 推荐、内容、产品自驱式增长引擎',
        ],
    },
    'Content Creator': {
        name: '内容创作者',
        description: '把想法变成跨平台内容 —— 编辑日历、博客、Newsletter、社媒文案,口吻像你的品牌。',
        bullets: [
            '编辑日历 —— 月度主题 + 各渠道具体选题',
            '长文撰写 —— 博客、Newsletter、落地页文案',
            '平台适配 —— 一个想法,按渠道节奏重写',
        ],
    },
    'SEO Specialist': {
        name: 'SEO 专家',
        description: '通过关键词策略、技术 SEO 审计、基于搜索意图的内容简报来增长自然搜索流量。',
        bullets: [
            '关键词地图 —— 按意图聚类、按机会值排序',
            '技术审计 —— 抓取性、Core Web Vitals、Schema、重复内容',
            '内容简报 —— 写给谁、要什么、对手在写什么',
        ],
    },
    'TikTok Strategist': {
        name: 'TikTok 策略师',
        description: '做能跑完播的短视频选题 —— 钩子驱动、懂算法、贴着你的领域调',
        bullets: [
            '开头钩子 —— 按完播率,不是按巧妙度做',
            '内容公式 —— 验证过的结构,适配你的赛道',
            '发布节奏 —— 测试计划,边发边学算法奖励什么',
        ],
    },
    'LinkedIn Content Creator': {
        name: 'LinkedIn 内容创作者',
        description: '在 LinkedIn 上打造个人品牌和 B2B 思想领导力 —— 真有人读、真愿意转的帖子。',
        bullets: [
            '个人品牌口吻 —— 具体、有观点、可信度优先',
            '帖子工程 —— 钩子、故事、要点、一个明确的 CTA',
            '周度节奏 —— 主题积累成可识别的专业领域',
        ],
    },
    'Market Researcher': {
        name: '市场研究员',
        description: '专注市场研究、行业分析、竞争情报追踪和趋势洞察。',
        bullets: [
            '行业 & 趋势分析',
            '竞争情报追踪',
            '结构化研究报告',
        ],
    },

    // ─── Trading ────────────────────────────────────────
    'Market Intel Aggregator': {
        name: '市场情报聚合器',
        description: '每日财经情报 —— 扫全球新闻,把信号从噪音里筛出来,5 分钟读完今天对你盘面真有影响的事。',
        bullets: [
            '每日简报 —— 5-10 条真要紧的故事,按影响排序',
            '信号 vs 噪音 —— 标出炒作、堆头条、回锅故事',
            '一句话总结 —— 每条故事末尾给出交易相关解读',
        ],
    },
    'Macro Watcher': {
        name: '宏观观察员',
        description: '盯央行、关键数据、地缘事件 —— 给你日历、共识、二阶解读。',
        bullets: [
            '事件日历 —— 美联储/欧央行/日央行会议、CPI/NFP/GDP、地缘日期',
            '共识框定 —— 市场预期是什么、超预期/不及预期长什么样',
            '二阶解读 —— 一份数据如何重塑利率、汇率、风险偏好',
        ],
    },
    'Watchlist Monitor': {
        name: '盯盘助手',
        description: '盘中盯你的标的:抓有意义的价格变化、关键位突破、可命名催化剂 —— 闭市自动安静。',
        bullets: [
            '盘中告警 —— 价格异动、放量、关键位破位、新闻催化',
            '交易时段纪律 —— 你的市场开盘时跑,闭市静默',
            '收盘复盘 —— 你的 watchlist 今天发生了啥、晚上要想啥',
        ],
    },
    'Technical Analyst': {
        name: '技术分析师',
        description: '老实读图:当前形态、关键位、可能演化、还有让这个判断作废的失效条件。',
        bullets: [
            '看图 —— 趋势、结构、关键位、指标共振',
            '形态框定 —— 多条路径 + 明确的失效条件',
            '多周期对照 —— 日线/4 小时/1 小时是否一致',
        ],
    },
    'Risk Manager': {
        name: '风险管理员',
        description: '每个交易想法的看门人。Stage 你的想法 → 跑 guards → 拿 GREEN/YELLOW/RED → 你来决定要不要发。',
        bullets: [
            '交易暂存 —— 在动手前先把想法写下来',
            'Guard 检查 —— 单笔风险、仓位、集中度、冷静期、规则',
            'GREEN/YELLOW/RED 判定 —— 每笔交易过同一份 checklist',
        ],
    },
    'Trading Journal Coach': {
        name: '交易日志教练',
        description: '读你过去的交易、找重复犯的错、提议规则 —— 跟 Risk Manager 形成闭环,让你越来越好。',
        bullets: [
            '交易记录 —— 每次 push 自动落档 + 打标签',
            '周复盘 —— 跨多笔交易找模式,不是单笔尸检',
            '规则演化 —— 提议加进 trading_rules.md (你点头才生效)',
        ],
    },
    'Earnings & Filings Analyst': {
        name: '财报与公告分析师',
        description: '读季报、8-K、电话会纪要 —— 提炼经营、风险、估值锚相对上期的变化。',
        bullets: [
            '财报深读 —— 经营趋势 + 关键指标 vs 上期变化',
            '公告扫描 —— 8-K、S-3、内部人交易、重大事件',
            '电话会蒸馏 —— 指引变化、口吻转变、管理层回避了什么',
        ],
    },
    'COT Report Analyst': {
        name: 'COT 持仓分析师',
        description: '读 CFTC 周度持仓报告 —— 跟踪商业 vs 投机持仓,标出历史上反转之前的极端位置。',
        bullets: [
            '周度持仓摘要 —— 商业/投机/小户的持仓变化',
            '极端检测 —— 净持仓在多年高点或低点',
            '历史背景 —— 这周的极端值与历史拐点对照',
        ],
    },
    'Pre-Market & Open Briefer': {
        name: '盘前简报员',
        description: '美股交易日早 8 点 ET 的一屏简报:隔夜要闻、期指、关键合约、财报、数据 —— 开盘前你需要知道的。',
        bullets: [
            '隔夜摘要 —— 亚欧收盘、关键头条、期指水平',
            '开盘日 setup —— 盘前财报、数据公布、关键位',
            '8 点 ET 节奏 —— 美股交易日触发一次,其他时间静默',
        ],
    },
    'Tilt & Bias Coach': {
        name: '心态与偏差教练',
        description: '帮你检查现在适不适合交易。在你做出报复性、FOMO、过度仓位、疲劳决策之前抓住你。',
        bullets: [
            '盘前自检 —— "我现在该不该做交易"诊断',
            '偏差识别 —— 给你正在踩的认知陷阱命名',
            '行为干预 —— 状态不对时的具体行动建议',
        ],
    },

    // ─── ERP System ──────────────────────────────────────
    'ERP 设计助理': {
        name: 'ERP 设计助理',
        description: '管理ERP中的设计阶段销售订单 —— 查询订单、上传客户附件、推进设计状态，不取消任何订单。',
        bullets: [
            '订单查询 —— 按客户、状态、日期范围或订单号筛选销售订单',
            '附件上传 —— 将设计图纸、规格说明和样图上传到客户记录',
            '状态推进 —— 将订单在设计工作流各阶段之间流转',
        ],
    },
    'ERP 销售助理': {
        name: 'ERP 销售助理',
        description: '管理ERP客户与销售订单 —— 查询、新增、修改客户信息和订单信息。',
        bullets: [
            '客户管理 —— 查询、新建、修改客户档案与联系人信息',
            '订单管理 —— 查询、新建、修改销售订单及明细行',
            '订单跟踪 —— 查看订单从草稿到完成的全生命周期状态',
        ],
    },
    'ERP 老板助理': {
        name: 'ERP 老板助理',
        description: '老板的首席数字幕僚长 —— 拥有ERP全权限，指挥所有agent，通过员工的agent向人类员工下达任务。',
        bullets: [
            'ERP全权限 —— 查、增、改、删客户、订单、库存、财务等所有ERP数据',
            '指挥所有agent —— 通过A2A通信给销售助理、设计助理等下达指令',
            '任务分派 —— 根据组织通讯录找到对应员工的agent，通过渠道通知员工',
        ],
    },
};

/**
 * Resolve a template's display fields for the current locale.
 * Falls back to backend (English) values for any field missing in the map.
 */
export function translateTemplate(tpl: TemplateLike, isChinese: boolean): TemplateLocale {
    const fallback: TemplateLocale = {
        name: tpl.name,
        description: tpl.description,
        bullets: tpl.capability_bullets || [],
    };
    if (!isChinese) return fallback;
    const zh = ZH[tpl.name];
    if (!zh) return fallback;
    return {
        name: zh.name || fallback.name,
        description: zh.description || fallback.description,
        bullets: zh.bullets.length ? zh.bullets : fallback.bullets,
    };
}
