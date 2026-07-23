interface AIIconDefinition {
	readonly key: string
	readonly iconName: string
	readonly description: string
	readonly evidence: readonly RegExp[]
	readonly conflicts?: readonly RegExp[]
}

const authenticationEvidence = /认证|鉴权|登录|密钥|令牌|凭据|身份校验|\b(authentication|authenticate|login|sign in|api key|token|credential|oauth|jwt)\b/iu
const databaseTechnologyEvidence = /\b(mongodb?|mysql|sqlite|postgres(?:ql)?|redis)\b/iu
const cloudProviderEvidence = /\b(aws|amazon web services|azure|gcp|google cloud)\b|亚马逊云|微软云|谷歌云/iu
const encryptionEvidence = /加密|解密|密码学|密文|\b(encryption|decrypt(?:ion)?|encrypt|cipher|cryptography)\b/iu
const privacyEvidence = /隐私|数据保护|数据脱敏|敏感信息|\b(privacy|data protection|redaction|masking|pii|gdpr)\b/iu
const filterEvidence = /过滤|筛选|白名单|黑名单|允许列表|拒绝列表|排除规则|\b(filter|allow ?list|deny ?list|white ?list|black ?list|exclusion rule)\b/iu
const crashEvidence = /崩溃|宕机|致命错误|恐慌终止|\b(crash|panic|fatal error|fatal exception)\b/iu
const transferEvidence = /数据导入|批量导入|导入配置|数据导出|批量导出|导出配置|\b(data import|batch import|data export|batch export|ingest|outbound delivery)\b/iu
const expirationEvidence = /过期|失效|陈旧数据|\b(expire|expired|expiration|ttl|stale data)\b/iu
const infrastructureProductEvidence = /\b(docker|kubernetes|k8s|pod|helm|aws|amazon web services|azure|gcp|google cloud|terraform)\b/iu

const AI_ICON_DEFINITIONS: readonly AIIconDefinition[] = [
	// Code structure and navigation
	{ key: 'entry', iconName: 'fun_rocket_fluent.svg', description: '程序入口、启动、初始化', evidence: [/入口|启动|初始化|激活扩展|程序主函数|\b(entry ?point|startup|bootstrap|initialize|initialization|activate|activation|main)\b/iu] },
	{ key: 'algorithm', iconName: 'arch_brain_fluent.svg', description: '明确命名的算法、编解码、散列、排序或压缩', evidence: [/算法|编解码|散列|哈希|排序算法|压缩算法|解压算法|\b(algorithm|punycode|base64|sha\d*|md5|dijkstra|quicksort|mergesort|compression|decompression)\b/iu], conflicts: [/图像|图片|音频|声音|语音|视频|录像|\b(image|audio|sound|voice|video|media)\b/iu] },
	{ key: 'flow', iconName: 'arch_flow_chart_flat_color.svg', description: '工作流、生命周期、处理管线、状态机', evidence: [/工作流|生命周期|处理管线|状态机|阶段编排|\b(workflow|lifecycle|pipeline|state machine|orchestration)\b/iu] },
	{ key: 'branch', iconName: 'arch_git_branch_purple.svg', description: '条件分支、路由分发、策略选择', evidence: [/条件分支|分支选择|路由分发|策略选择|分派|\b(branch|dispatch|router|routing|strategy selection)\b/iu] },
	{ key: 'architecture', iconName: 'arch_framework.svg', description: '软件架构、框架、核心引擎', evidence: [/软件架构|系统架构|框架核心|核心引擎|\b(software architecture|system architecture|framework core|core engine)\b/iu] },
	{ key: 'hierarchy', iconName: 'arch_tree_structure_flat_color.svg', description: '树结构、层级结构、AST、DOM 树', evidence: [/树结构|树形结构|层级结构|语法树|目录树|\b(hierarchy|tree structure|syntax tree|ast|dom tree)\b/iu] },
	{ key: 'target', iconName: 'arch_direct_hit_fluent.svg', description: '目标、精确命中、目标解析', evidence: [/精确命中|目标解析|目标选择|命中目标|\b(target resolution|target selection|direct hit|bullseye)\b/iu] },
	{ key: 'hook', iconName: 'arch_hook_twitter.svg', description: '钩子、拦截器、中间件', evidence: [/钩子|拦截器|中间件|\b(hook|interceptor|middleware)\b/iu] },
	{ key: 'factory', iconName: 'arch_factory_fluent.svg', description: '工厂模式、对象工厂、工厂方法', evidence: [/工厂模式|对象工厂|工厂方法|\b(factory pattern|object factory|factory method)\b/iu] },
	{ key: 'extension', iconName: 'arch_puzzle_piece_fluent.svg', description: '插件、扩展点、扩展注册', evidence: [/插件|扩展点|扩展注册|插件注册|\b(plugin|extension point|extension registration|addon)\b/iu] },
	{ key: 'parsing', iconName: 'ui_microscope_fluent.svg', description: '解析器、词法分析、语法分析、分词', evidence: [/解析器|词法分析|语法分析|分词器|\b(parser|tokenizer|lexer|lexical analysis|syntax analysis|parse tree)\b/iu] },
	{ key: 'serialization', iconName: 'ui_document_purple.svg', description: '序列化、反序列化、编组与解组', evidence: [/序列化|反序列化|编组|解组|\b(serialization|deserialization|serialize|deserialize|marshal|unmarshal)\b/iu] },

	// Data, files, communication and integration
	{ key: 'data', iconName: 'arch_database_blue.svg', description: '数据库、数据模型、持久化、数据仓储', evidence: [/数据库|数据模型|持久化|数据仓储|数据库查询|\b(database|data model|repository|persistence|entity|orm|sql)\b/iu], conflicts: [databaseTechnologyEvidence] },
	{ key: 'storage', iconName: 'arch_data_backup_flat_color.svg', description: '存储、缓存、备份、落盘', evidence: [/存储|缓存|备份|落盘|保存状态|\b(storage|cache|caching|backup|save state|persist to disk)\b/iu], conflicts: [expirationEvidence, databaseTechnologyEvidence] },
	{ key: 'recovery', iconName: 'arch_data_recovery_flat_color.svg', description: '恢复、回滚、撤销、容错、故障转移', evidence: [/恢复|回滚|撤销|容错|故障转移|\b(recovery|rollback|restore|undo|failover|fallback)\b/iu] },
	{ key: 'network', iconName: 'arch_server_green.svg', description: '网络连接、远程请求、套接字、RPC', evidence: [/网络|远程请求|网络连接|服务端请求|客户端请求|\b(network|fetch|websocket|socket|rpc|http request|api request|remote request)\b/iu] },
	{ key: 'api', iconName: 'ui_folder_type_api_vscode.svg', description: 'API 端点、REST、GraphQL、OpenAPI', evidence: [/接口端点|接口契约|接口请求|接口响应|\b(api|rest|graphql|endpoint|openapi|swagger)\b/iu], conflicts: [authenticationEvidence, /文档|使用说明|\b(documentation|docs|readme|manual)\b/iu, /\b(win32|windows|android|ios|macos)\b/iu] },
	{ key: 'io', iconName: 'arch_electric_plug_fluent.svg', description: '标准输入输出、进程通信、系统集成', evidence: [/输入输出|标准输入|标准输出|系统集成|进程通信|\b(i o|stdin|stdout|stderr|ipc|child process|system integration)\b/iu] },
	{ key: 'file', iconName: 'arch_source_file_yellow.svg', description: '文件读写、文件解析、目录扫描、文件系统', evidence: [/文件读写|读取文件|写入文件|文件解析|目录扫描|文件系统|\b(file system|read file|write file|readfile|writefile|filesystem|directory scan)\b/iu] },
	{ key: 'clipboard', iconName: 'ui_clipboard_fluent.svg', description: '剪贴板、复制、粘贴', evidence: [/剪贴板|复制粘贴|\b(clipboard|copy and paste|pasteboard)\b/iu] },
	{ key: 'email', iconName: 'ui_e_mail_fluent.svg', description: '电子邮件、邮箱、SMTP', evidence: [/电子邮件|邮件发送|邮件接收|邮箱|\b(e-?mail|smtp|mailbox|imap)\b/iu] },
	{ key: 'import', iconName: 'ui_inbox_tray_fluent.svg', description: '数据导入、摄取、入站接收', evidence: [/数据导入|批量导入|导入配置|摄取数据|入站接收|\b(data import|batch import|ingest|inbound receive)\b/iu] },
	{ key: 'export', iconName: 'ui_outbox_tray_fluent.svg', description: '数据导出、输出交付、出站发送', evidence: [/数据导出|批量导出|导出配置|输出交付|出站发送|\b(data export|batch export|outbound delivery|emit output)\b/iu] },
	{ key: 'link', iconName: 'arch_globe_showing_asia_australia_fluent.svg', description: 'URL、URI、链接、网址、域名、查询参数', evidence: [/链接|网址|域名|查询参数|\b(url|uri|href|hyperlink|domain name|query string|query parameter)\b/iu] },

	// Runtime, delivery and operations
	{ key: 'configuration', iconName: 'arch_settings_flat_color.svg', description: '配置文件、设置项、环境变量、首选项', evidence: [/配置文件|加载配置|应用设置|设置项|环境变量|首选项|\b(configuration file|load config|application settings?|preferences?|environment variable|env var)\b/iu], conflicts: [filterEvidence, transferEvidence, /\bterraform\b/iu] },
	{ key: 'cloud', iconName: 'arch_cloud_flat_color.svg', description: '通用云服务、云端资源、云计算', evidence: [/云服务|云端资源|云计算|\b(cloud service|cloud resource|cloud computing)\b/iu], conflicts: [cloudProviderEvidence] },
	{ key: 'deployment', iconName: 'arch_deploy_red.svg', description: '部署、发布上线、灰度发布', evidence: [/部署|发布上线|灰度发布|滚动发布|\b(deploy|deployment|rollout|release to production)\b/iu], conflicts: [infrastructureProductEvidence] },
	{ key: 'build', iconName: 'arch_building_construction_fluent.svg', description: '项目构建、编译、打包、捆绑', evidence: [/项目构建|构建产物|构建系统|编译|打包|捆绑产物|\b(project build|build artifact|build system|compile|compiler|bundle|bundling|packaging)\b/iu] },
	{ key: 'terminal', iconName: 'arch_terminal_purple.svg', description: '终端、命令行、控制台、Shell', evidence: [/终端|命令行|控制台|\b(terminal|command line|console|shell|cli|powershell|bash)\b/iu] },
	{ key: 'schedule', iconName: 'ui_calendar.svg', description: '计划任务、日程、定时调度、Cron', evidence: [/计划任务|定时任务|日程调度|定时调度|\b(schedule|scheduler|cron|calendar job)\b/iu] },
	{ key: 'async', iconName: 'ui_repeat_button_fluent.svg', description: '异步编排、并发、重试、轮询、任务队列；仅有 async/await 不足以匹配', evidence: [/异步编排|并发|重试|轮询|任务队列|\b(concurrency|concurrent|retry|polling|task queue|promise pool)\b/iu] },
	{ key: 'dependency', iconName: 'arch_chains_fluent.svg', description: '依赖、依赖注入、绑定关系、模块装配', evidence: [/依赖|依赖注入|绑定关系|模块装配|\b(dependency|dependency injection|binding|wiring|module resolution)\b/iu] },
	{ key: 'template', iconName: 'ui_template_flat_color.svg', description: '模板、脚手架、预设、范本', evidence: [/模板|脚手架|预设|范本|\b(template|scaffold|preset|boilerplate generator)\b/iu] },
	{ key: 'maintenance', iconName: 'arch_hammer_and_wrench_fluent.svg', description: '维护、重构、技术债治理', evidence: [/维护|重构|技术债|代码整治|\b(maintenance|refactor|refactoring|technical debt)\b/iu] },
	{ key: 'git', iconName: 'brand_file_type_git_vscode.svg', description: 'Git、提交、合并、变基、版本控制', evidence: [/版本控制|提交变更|合并分支|变基|\b(git|commit|merge|rebase|cherry pick|version control)\b/iu], conflicts: [/\b(github|gitlab)\b/iu] },

	// Search, quality and observability
	{ key: 'search', iconName: 'ui_search_flat_color.svg', description: '搜索、查找、定位、全文检索', evidence: [/搜索|查找|定位|全文检索|\b(search|lookup|find|locate|index lookup)\b/iu] },
	{ key: 'filter', iconName: 'status_prohibited_fluent.svg', description: '过滤、筛选、允许或拒绝列表、排除规则', evidence: [filterEvidence] },
	{ key: 'validation', iconName: 'status_test_green.svg', description: '结构验证、合法性校验、断言、测试', evidence: [/结构验证|合法性校验|数据校验|断言|单元测试|集成测试|质量检查|\b(validation|validate|assert|unit test|integration test|invariant|schema check|type check)\b/iu], conflicts: [authenticationEvidence] },
	{ key: 'error', iconName: 'status_bug.svg', description: '错误、异常、故障、失败处理', evidence: [/错误|异常|故障|失败处理|\b(error|exception|catch|throw|failure handling)\b/iu], conflicts: [crashEvidence] },
	{ key: 'crash', iconName: 'status_crash.svg', description: '崩溃、宕机、致命错误、Panic', evidence: [crashEvidence] },
	{ key: 'warning', iconName: 'status_warning_fluent.svg', description: '警告、风险、降级、弃用', evidence: [/警告|风险|降级|弃用|\b(warning|warn|risk|degradation|degraded|deprecated)\b/iu] },
	{ key: 'debug', iconName: 'status_debug.svg', description: '调试、日志、诊断、追踪', evidence: [/调试|日志|诊断|追踪|\b(debug|logging|logger|diagnostic|trace|telemetry)\b/iu] },
	{ key: 'performance', iconName: 'status_timer_clock_fluent.svg', description: '性能、计时、超时、延迟、基准测试', evidence: [/性能|计时|超时|延迟|基准测试|热点路径|\b(performance|benchmark|latency|timeout|timing|hot path|profiling)\b/iu] },
	{ key: 'analytics', iconName: 'arch_bar_chart_fluent.svg', description: '指标、统计、分析报表、图表', evidence: [/指标统计|统计分析|分析报表|数据图表|\b(metrics|analytics|statistics|dashboard|data chart)\b/iu] },
	{ key: 'trend_up', iconName: 'arch_chart_increasing_fluent.svg', description: '上升趋势、增长趋势、指标提升', evidence: [/上升趋势|增长趋势|指标提升|\b(upward trend|growth trend|metric increase)\b/iu] },
	{ key: 'trend_down', iconName: 'arch_chart_decreasing_fluent.svg', description: '下降趋势、衰减趋势、指标下降', evidence: [/下降趋势|衰减趋势|指标下降|\b(downward trend|declining trend|metric decrease)\b/iu] },
	{ key: 'experiment', iconName: 'status_flask.svg', description: '实验、试验、A/B 测试', evidence: [/实验|试验|灰度试验|\b(experiment|a b test|feature experiment|laboratory)\b/iu] },
	{ key: 'repair', iconName: 'status_patch.svg', description: '补丁、热修复、临时修复、Workaround', evidence: [/补丁|热修复|临时修复|应急修复|\b(patch|hotfix|workaround|temporary fix)\b/iu] },
	{ key: 'expiration', iconName: 'status_expired_flat_color.svg', description: '过期、失效、TTL、陈旧数据', evidence: [expirationEvidence] },
	{ key: 'approval', iconName: 'status_approval_flat_color.svg', description: '审批、审核通过、批准', evidence: [/审批|审核通过|批准|准入审核|\b(approval|approved|review approval)\b/iu] },

	// Security, privacy and synchronization
	{ key: 'security', iconName: 'fun_shield_fluent.svg', description: '安全边界、权限、授权、访问控制', evidence: [/安全边界|权限|授权|防护|访问控制|\b(security boundary|permission|authorization|access control)\b/iu], conflicts: [authenticationEvidence, encryptionEvidence, privacyEvidence] },
	{ key: 'authentication', iconName: 'arch_key_flat_color.svg', description: '认证、鉴权、登录、密钥、令牌、凭据', evidence: [authenticationEvidence] },
	{ key: 'encryption', iconName: 'arch_data_encryption_flat_color.svg', description: '加密、解密、密码学、密文', evidence: [encryptionEvidence] },
	{ key: 'privacy', iconName: 'arch_data_protection_flat_color.svg', description: '隐私保护、数据脱敏、PII、GDPR', evidence: [privacyEvidence] },
	{ key: 'locking', iconName: 'arch_lock_flat_color.svg', description: '互斥锁、读写锁、信号量、临界区、死锁', evidence: [/互斥锁|读写锁|信号量|临界区|死锁|加锁|\b(mutex|semaphore|read write lock|critical section|deadlock|lock acquisition)\b/iu] },
	{ key: 'unlocking', iconName: 'arch_unlock_flat_color.svg', description: '解锁、释放锁、解除冻结', evidence: [/解锁|释放锁|解除冻结|\b(unlock|release lock|lock release)\b/iu] },

	// Product and content domains
	{ key: 'ai', iconName: 'fun_robot_fluent.svg', description: '人工智能、大模型、模型推理、提示词、智能体', evidence: [/人工智能|大模型|模型推理|提示词|智能体|机器学习|\b(ai|llm|inference|prompt|embedding|agent|machine learning|chat completion)\b/iu] },
	{ key: 'calculation', iconName: 'ui_calculator_fluent.svg', description: '数学计算、公式、算术、计费', evidence: [/数学计算|公式计算|算术|计费|金额计算|\b(calculate|calculation|formula|arithmetic|billing calculation)\b/iu] },
	{ key: 'policy', iconName: 'arch_balance_scale_fluent.svg', description: '策略治理、合规、政策、审计规则', evidence: [/策略治理|合规|政策|审计规则|\b(policy|compliance|governance|audit rule)\b/iu] },
	{ key: 'documentation', iconName: 'ui_open_book_fluent.svg', description: '文档、README、手册、使用指南', evidence: [/文档|使用说明|使用指南|开发手册|\b(documentation|readme|manual|user guide|developer guide|api docs)\b/iu] },
	{ key: 'image', iconName: 'ui_gallery_flat_color.svg', description: '图像、图片、画布、位图、缩略图', evidence: [/图像|图片|画布|位图|缩略图|\b(image|bitmap|canvas|photo|thumbnail|gallery)\b/iu] },
	{ key: 'audio', iconName: 'ui_headphone_fluent.svg', description: '音频、声音、语音、录音', evidence: [/音频|声音|语音|录音|\b(audio|sound|voice|speech|recording)\b/iu] },
	{ key: 'video', iconName: 'ui_movie_camera_fluent.svg', description: '视频、录像、媒体流、视频编解码', evidence: [/视频|录像|媒体流|视频编解码|\b(video|media stream|video codec|movie)\b/iu] },
	{ key: 'user', iconName: 'ui_manager_flat_color.svg', description: '用户、账户、个人资料、租户', evidence: [/用户|账户|个人资料|租户|客户身份|\b(user|account|profile|customer|tenant)\b/iu] },
	{ key: 'location', iconName: 'ui_location_red.svg', description: '位置、地理定位、坐标、经纬度、GPS', evidence: [/地理定位|坐标|经纬度|位置服务|\b(location|geolocation|coordinates|latitude|longitude|gps)\b/iu] },

	// Data engines and infrastructure products
	{ key: 'mongodb', iconName: 'arch_file_type_mongo_vscode.svg', description: 'MongoDB、Mongo 数据访问', evidence: [/\b(mongodb?|mongo database)\b/iu] },
	{ key: 'mysql', iconName: 'arch_file_type_mysql_vscode.svg', description: 'MySQL 数据访问', evidence: [/\bmysql\b/iu] },
	{ key: 'sqlite', iconName: 'arch_file_type_sqlite_vscode.svg', description: 'SQLite 数据访问', evidence: [/\bsqlite\b/iu] },
	{ key: 'postgresql', iconName: 'brand_postgresql_logo.svg', description: 'PostgreSQL、Postgres 数据访问', evidence: [/\b(postgresql|postgres)\b/iu] },
	{ key: 'redis', iconName: 'brand_redis_logo.svg', description: 'Redis 缓存、Redis 数据访问', evidence: [/\bredis\b/iu] },
	{ key: 'container', iconName: 'brand_docker.svg', description: 'Docker、容器、镜像、Dockerfile', evidence: [/容器镜像|容器运行时|\b(docker|container image|container runtime|dockerfile)\b/iu] },
	{ key: 'orchestration', iconName: 'brand_kubernetes_logo.svg', description: 'Kubernetes、K8s、Pod、Helm、容器编排', evidence: [/容器编排|\b(kubernetes|k8s|pod|helm)\b/iu] },
	{ key: 'aws', iconName: 'brand_aws_logo.svg', description: 'AWS、Amazon Web Services', evidence: [/亚马逊云|\b(aws|amazon web services)\b/iu] },
	{ key: 'azure', iconName: 'brand_microsoft_azure_logo.svg', description: 'Microsoft Azure、微软云', evidence: [/微软云|\b(microsoft azure|azure)\b/iu] },
	{ key: 'gcp', iconName: 'brand_google_cloud_logo.svg', description: 'Google Cloud、GCP、谷歌云', evidence: [/谷歌云|\b(google cloud|gcp)\b/iu] },
	{ key: 'github', iconName: 'brand_github.svg', description: 'GitHub 仓库、Issue、Pull Request、Actions', evidence: [/\bgithub\b|GitHub 仓库|GitHub Actions|Pull Request/iu] },
	{ key: 'gitlab', iconName: 'brand_gitlab_logo.svg', description: 'GitLab 仓库、Merge Request、CI', evidence: [/\bgitlab\b|GitLab 仓库|Merge Request/iu] },
	{ key: 'terraform', iconName: 'brand_terraform_icon_logo.svg', description: 'Terraform、基础设施即代码', evidence: [/基础设施即代码|\b(terraform|infrastructure as code|iac)\b/iu] },

	// Languages, frameworks and platforms; only explicit names are accepted.
	{ key: 'typescript', iconName: 'brand_typescript.svg', description: 'TypeScript、TS 类型系统', evidence: [/\btypescript\b|TypeScript 类型|TS 类型系统/iu] },
	{ key: 'javascript', iconName: 'brand_javascript.svg', description: 'JavaScript、ECMAScript', evidence: [/\b(javascript|ecmascript)\b/iu] },
	{ key: 'python', iconName: 'brand_python_logo.svg', description: 'Python', evidence: [/\bpython\b/iu] },
	{ key: 'java', iconName: 'brand_java_logo.svg', description: 'Java、JVM', evidence: [/\b(java|jvm)\b/iu] },
	{ key: 'golang', iconName: 'brand_go.svg', description: 'Go 语言、Golang', evidence: [/Go 语言|\b(golang|go language)\b/iu] },
	{ key: 'rust', iconName: 'brand_rust.svg', description: 'Rust', evidence: [/\brust\b/iu] },
	{ key: 'cpp', iconName: 'brand_c_plusplus_logo.svg', description: 'C++、CPP', evidence: [/C\+\+|\bcpp\b/iu] },
	{ key: 'csharp', iconName: 'brand_c_sharp_logo.svg', description: 'C#、CSharp、.NET', evidence: [/C#|\bcsharp\b|\.net/iu] },
	{ key: 'php', iconName: 'brand_php_logo.svg', description: 'PHP', evidence: [/\bphp\b/iu] },
	{ key: 'ruby', iconName: 'brand_ruby_logo.svg', description: 'Ruby', evidence: [/\bruby\b/iu] },
	{ key: 'nodejs', iconName: 'brand_nodedotjs.svg', description: 'Node.js、NodeJS', evidence: [/\b(node js|nodejs)\b/iu] },
	{ key: 'react', iconName: 'brand_react.svg', description: 'React、JSX、TSX', evidence: [/\b(react|jsx|tsx)\b/iu] },
	{ key: 'vue', iconName: 'brand_vue_logo.svg', description: 'Vue、Vue.js', evidence: [/\b(vue|vue js)\b/iu] },
	{ key: 'angular', iconName: 'brand_angular.svg', description: 'Angular', evidence: [/\bangular\b/iu] },
	{ key: 'svelte', iconName: 'brand_svelte_icon_logo.svg', description: 'Svelte、SvelteKit', evidence: [/\b(svelte|sveltekit)\b/iu] },
	{ key: 'eslint', iconName: 'brand_eslint_logo.svg', description: 'ESLint、代码检查规则', evidence: [/\beslint\b/iu] },
	{ key: 'jest', iconName: 'brand_jest_logo.svg', description: 'Jest 测试', evidence: [/\bjest\b/iu] },
	{ key: 'android', iconName: 'brand_android.svg', description: 'Android', evidence: [/\bandroid\b/iu] },
	{ key: 'apple', iconName: 'brand_apple.svg', description: 'iOS、macOS、Apple 平台', evidence: [/Apple 平台|\b(ios|macos|ipados|watchos)\b/iu] },
	{ key: 'windows', iconName: 'brand_windows.svg', description: 'Windows、Win32', evidence: [/\b(windows|win32)\b/iu] },
	{ key: 'linux', iconName: 'brand_linux.svg', description: 'Linux', evidence: [/\blinux\b/iu] },
]

const AI_ICON_DESCRIPTIONS_EN: Readonly<Record<string, string>> = {
	entry: 'program entry point, startup, or initialization',
	algorithm: 'explicitly named algorithm, codec, hash, sort, or compression logic',
	flow: 'workflow, lifecycle, processing pipeline, or state machine',
	branch: 'conditional branch, route dispatch, or strategy selection',
	architecture: 'software architecture, framework core, or core engine',
	hierarchy: 'tree or hierarchical structure, AST, or DOM tree',
	target: 'target resolution, target selection, or precise hit',
	hook: 'hook, interceptor, or middleware',
	factory: 'factory pattern, object factory, or factory method',
	extension: 'plugin, extension point, or extension registration',
	parsing: 'parser, tokenizer, lexer, or syntax analysis',
	serialization: 'serialization, deserialization, marshaling, or unmarshaling',
	data: 'database, data model, persistence, or data repository',
	storage: 'storage, cache, backup, or persisting state to disk',
	recovery: 'recovery, rollback, restore, undo, failover, or fallback',
	network: 'network connection, remote request, socket, or RPC',
	api: 'API endpoint or contract, REST, GraphQL, OpenAPI, or Swagger',
	io: 'standard input/output, inter-process communication, or system integration',
	file: 'file I/O, file parsing, directory scan, or file system',
	clipboard: 'clipboard, copy, or paste',
	email: 'email, mailbox, SMTP, or IMAP',
	import: 'data or configuration import, ingestion, or inbound receipt',
	export: 'data or configuration export, outbound delivery, or emitted output',
	link: 'URL, URI, link, domain name, or query parameter',
	configuration: 'configuration file, setting, environment variable, or preference',
	cloud: 'generic cloud service, cloud resource, or cloud computing',
	deployment: 'deployment, production release, rollout, or staged release',
	build: 'project build, compilation, packaging, or bundling',
	terminal: 'terminal, command line, console, shell, or CLI',
	schedule: 'scheduled task, calendar job, scheduler, or cron',
	async: 'asynchronous orchestration, concurrency, retry, polling, or task queue; async/await alone is insufficient',
	dependency: 'dependency, dependency injection, binding, or module wiring',
	template: 'template, scaffold, preset, or boilerplate generator',
	maintenance: 'maintenance, refactoring, or technical-debt cleanup',
	git: 'Git, commit, merge, rebase, cherry-pick, or version control',
	search: 'search, lookup, find, locate, or full-text retrieval',
	filter: 'filtering, allow/deny list, or exclusion rule',
	validation: 'structural validation, assertion, schema or type check, or test',
	error: 'error, exception, fault, or failure handling',
	crash: 'crash, panic, outage, or fatal error',
	warning: 'warning, risk, degradation, or deprecation',
	debug: 'debugging, logging, diagnostics, tracing, or telemetry',
	performance: 'performance, timing, timeout, latency, benchmark, or profiling',
	analytics: 'metrics, statistics, analytics report, dashboard, or chart',
	trend_up: 'upward or growth trend, or increasing metric',
	trend_down: 'downward or declining trend, or decreasing metric',
	experiment: 'experiment, trial, laboratory work, or A/B test',
	repair: 'patch, hotfix, temporary fix, or workaround',
	expiration: 'expiration, invalidation, TTL, or stale data',
	approval: 'approval, approved review, or admission review',
	security: 'security boundary, permission, authorization, or access control',
	authentication: 'authentication, sign-in, API key, token, credential, OAuth, or JWT',
	encryption: 'encryption, decryption, cipher, ciphertext, or cryptography',
	privacy: 'privacy, data protection, redaction, masking, PII, or GDPR',
	locking: 'mutex, read/write lock, semaphore, critical section, or deadlock',
	unlocking: 'unlocking, releasing a lock, or unfreezing',
	ai: 'artificial intelligence, LLM, inference, prompt, agent, embedding, or machine learning',
	calculation: 'mathematical calculation, formula, arithmetic, billing, or amount calculation',
	policy: 'policy, compliance, governance, or audit rule',
	documentation: 'documentation, README, manual, user guide, developer guide, or API docs',
	image: 'image, bitmap, canvas, photo, thumbnail, or gallery',
	audio: 'audio, sound, voice, speech, or recording',
	video: 'video, movie, media stream, or video codec',
	user: 'user, account, profile, customer, or tenant identity',
	location: 'location, geolocation, coordinates, latitude/longitude, or GPS',
	mongodb: 'MongoDB or Mongo data access',
	mysql: 'MySQL data access',
	sqlite: 'SQLite data access',
	postgresql: 'PostgreSQL or Postgres data access',
	redis: 'Redis caching or data access',
	container: 'Docker, container image/runtime, or Dockerfile',
	orchestration: 'Kubernetes, K8s, Pod, Helm, or container orchestration',
	aws: 'AWS or Amazon Web Services',
	azure: 'Microsoft Azure',
	gcp: 'Google Cloud or GCP',
	github: 'GitHub repository, Issue, Pull Request, or Actions',
	gitlab: 'GitLab repository, Merge Request, or CI',
	terraform: 'Terraform or infrastructure as code',
	typescript: 'TypeScript or its type system',
	javascript: 'JavaScript or ECMAScript',
	python: 'Python',
	java: 'Java or JVM',
	golang: 'Go language or Golang',
	rust: 'Rust',
	cpp: 'C++ or CPP',
	csharp: 'C#, CSharp, or .NET',
	php: 'PHP',
	ruby: 'Ruby',
	nodejs: 'Node.js or NodeJS',
	react: 'React, JSX, or TSX',
	vue: 'Vue or Vue.js',
	angular: 'Angular',
	svelte: 'Svelte or SvelteKit',
	eslint: 'ESLint or linting rules',
	jest: 'Jest tests',
	android: 'Android',
	apple: 'iOS, macOS, iPadOS, watchOS, or Apple platform',
	windows: 'Windows or Win32',
	linux: 'Linux',
}

export const AI_BOOKMARK_ICON_OPTIONS = AI_ICON_DEFINITIONS.map(({ key, iconName, description }) => ({
	key,
	iconName,
	description,
}))

const iconDefinitions = new Map(AI_ICON_DEFINITIONS.map(definition => [definition.key, definition]))
const preciseDomainKeys = new Set([
	'architecture', 'hierarchy', 'target', 'hook', 'factory', 'extension', 'parsing', 'serialization',
	'clipboard', 'email', 'import', 'export', 'link', 'schedule', 'async', 'template', 'maintenance', 'git',
	'filter', 'validation', 'crash', 'analytics', 'trend_up', 'trend_down', 'experiment', 'repair',
	'expiration', 'approval', 'authentication', 'encryption', 'privacy', 'locking', 'unlocking', 'ai',
	'calculation', 'policy', 'documentation', 'image', 'audio', 'video', 'user', 'location',
])
const technologyKeys = new Set([
	'mongodb', 'mysql', 'sqlite', 'postgresql', 'redis', 'container', 'orchestration', 'aws', 'azure', 'gcp',
	'github', 'gitlab', 'terraform', 'typescript', 'javascript', 'python', 'java', 'golang', 'rust', 'cpp',
	'csharp', 'php', 'ruby', 'nodejs', 'react', 'vue', 'angular', 'svelte', 'eslint', 'jest', 'android',
	'apple', 'windows', 'linux',
])

function normalizeSemanticText(parts: readonly string[]): string {
	return parts
		.join('\n')
		.normalize('NFKC')
		.replace(/\bMongoDB\b/gi, ' mongodb ')
		.replace(/\bMySQL\b/gi, ' mysql ')
		.replace(/\bSQLite\b/gi, ' sqlite ')
		.replace(/\bPostgreSQL\b/gi, ' postgresql ')
		.replace(/\bTypeScript\b/gi, ' typescript ')
		.replace(/\bJavaScript\b/gi, ' javascript ')
		.replace(/\bECMAScript\b/gi, ' ecmascript ')
		.replace(/\bGitHub\b/gi, ' github ')
		.replace(/\bGitLab\b/gi, ' gitlab ')
		.replace(/\bOpenAPI\b/gi, ' openapi ')
		.replace(/\bGraphQL\b/gi, ' graphql ')
		.replace(/\bSvelteKit\b/gi, ' sveltekit ')
		.replace(/\bESLint\b/gi, ' eslint ')
		.replace(/\bOAuth\b/gi, ' oauth ')
		.replace(/\biOS\b/gi, ' ios ')
		.replace(/\bmacOS\b/gi, ' macos ')
		.replace(/\biPadOS\b/gi, ' ipados ')
		.replace(/\bwatchOS\b/gi, ' watchos ')
		.replace(/\.net\b/gi, ' dotnet')
		.replace(/([a-z\d])([A-Z])/g, '$1 $2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
		.replace(/[_./\\:-]+/g, ' ')
		.toLocaleLowerCase('en-US')
}

export function resolveAIIconNameForSemantic(
	value: unknown,
	semantic: { readonly labels: readonly string[], readonly anchor?: string },
): string | undefined {
	if (typeof value !== 'string') return undefined
	const requestedDefinition = iconDefinitions.get(value)
	if (!requestedDefinition) return undefined

	const labelText = normalizeSemanticText(semantic.labels)
	if (!labelText.trim()) return undefined
	const completeContext = normalizeSemanticText([...semantic.labels, semantic.anchor ?? ''])
	const matches = AI_ICON_DEFINITIONS.filter(definition =>
		definition.evidence.some(pattern => pattern.test(labelText))
		&& !definition.conflicts?.some(pattern => pattern.test(completeContext))
	)
	if (matches.length === 0) return undefined

	const priority = (definition: AIIconDefinition): number =>
		technologyKeys.has(definition.key) ? 3 : preciseDomainKeys.has(definition.key) ? 2 : 1
	const highestPriority = Math.max(...matches.map(priority))
	const mostSpecific = matches.filter(definition => priority(definition) === highestPriority)
	if (mostSpecific.length !== 1 || mostSpecific[0].key !== requestedDefinition.key) return undefined
	return requestedDefinition.iconName
}

export const AI_ICON_SELECTION_PROMPT = [
	'icon 是可选字段。只有书签标签直接出现下列领域语义时，才输出对应的 icon；源码锚点只能帮助理解和排除冲突，不能单独作为选图依据。普通函数、模块、参数处理、数据转换和说明性代码一律省略 icon。选择顺序为具体产品或技术、明确领域、通用动作，例如 PostgreSQL 使用 postgresql 而不是 data，API Key 使用 authentication 而不是 validation。同一优先级存在多个候选时省略 icon。仅有 async/await 不能选择 async。URL、URI、域名及查询参数应选择 link，不能选择 authentication。匹配程度不高、存在歧义或无法可靠判断时不要输出 icon；插件会再次校验，不匹配时使用默认图标。可选语义键如下：',
	...AI_BOOKMARK_ICON_OPTIONS.map(option => `- ${option.key}：${option.description}`),
].join('\n')

export const AI_ICON_SELECTION_PROMPT_EN = [
	'The icon field is optional. Include an icon only when the bookmark label directly expresses one of the domain meanings below. The source anchor may only clarify meaning or reject conflicts; it cannot authorize an icon by itself. Omit icon for ordinary functions, modules, parameter handling, data transformations, and explanatory code. Prefer a specific product or technology over a clear domain, and a clear domain over a generic action: for example, use postgresql rather than data for PostgreSQL, and authentication rather than validation for an API key. Omit icon when multiple same-priority candidates apply. async/await alone does not justify async. URLs, URIs, domain names, and query parameters use link, not authentication. When confidence is not high, the meaning is ambiguous, or no key reliably applies, omit icon so the extension uses its default icon. Available semantic keys:',
	...AI_BOOKMARK_ICON_OPTIONS.map(option => `- ${option.key}: ${AI_ICON_DESCRIPTIONS_EN[option.key]}`),
].join('\n')
