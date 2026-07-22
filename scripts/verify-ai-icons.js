const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const {
  AI_BOOKMARK_ICON_OPTIONS,
  resolveAIIconNameForSemantic,
} = require('../out/util/AIIconCatalog')

// Every selected asset and its positive semantic example is reviewed explicitly.
// The full-library hashes below force this review to run again whenever any icon
// or concept is added, removed, or renamed.
const expectedCatalog = [
  ['entry', 'fun_rocket_fluent.svg', '初始化扩展入口'],
  ['algorithm', 'arch_brain_fluent.svg', 'Punycode 解码算法'],
  ['flow', 'arch_flow_chart_flat_color.svg', '执行同步工作流'],
  ['branch', 'arch_git_branch_purple.svg', '分派路由分支'],
  ['architecture', 'arch_framework.svg', '软件架构核心'],
  ['hierarchy', 'arch_tree_structure_flat_color.svg', '构建语法树'],
  ['target', 'arch_direct_hit_fluent.svg', '执行目标解析'],
  ['hook', 'arch_hook_twitter.svg', '注册请求拦截器'],
  ['factory', 'arch_factory_fluent.svg', '创建对象工厂'],
  ['extension', 'arch_puzzle_piece_fluent.svg', '注册插件扩展点'],
  ['parsing', 'ui_microscope_fluent.svg', '运行词法分析器'],
  ['serialization', 'ui_document_purple.svg', '反序列化响应'],
  ['data', 'arch_database_blue.svg', '加载数据模型'],
  ['storage', 'arch_data_backup_flat_color.svg', '保存缓存备份'],
  ['recovery', 'arch_data_recovery_flat_color.svg', '回滚并恢复状态'],
  ['network', 'arch_server_green.svg', '发起远程请求'],
  ['api', 'ui_folder_type_api_vscode.svg', '注册 REST API 端点'],
  ['io', 'arch_electric_plug_fluent.svg', '写入标准输出'],
  ['file', 'arch_source_file_yellow.svg', '读取文件内容'],
  ['clipboard', 'ui_clipboard_fluent.svg', '写入剪贴板'],
  ['email', 'ui_e_mail_fluent.svg', '发送电子邮件'],
  ['import', 'ui_inbox_tray_fluent.svg', '批量导入配置'],
  ['export', 'ui_outbox_tray_fluent.svg', '批量导出配置'],
  ['link', 'arch_globe_showing_asia_australia_fluent.svg', '还原 URL 显示'],
  ['configuration', 'arch_settings_flat_color.svg', '加载配置文件'],
  ['cloud', 'arch_cloud_flat_color.svg', '分配云端资源'],
  ['deployment', 'arch_deploy_red.svg', '执行灰度发布'],
  ['build', 'arch_building_construction_fluent.svg', '编译并打包产物'],
  ['terminal', 'arch_terminal_purple.svg', '执行命令行脚本'],
  ['schedule', 'ui_calendar.svg', '注册定时任务'],
  ['async', 'ui_repeat_button_fluent.svg', '轮询并重试任务'],
  ['dependency', 'arch_chains_fluent.svg', '解析模块依赖'],
  ['template', 'ui_template_flat_color.svg', '渲染代码模板'],
  ['maintenance', 'arch_hammer_and_wrench_fluent.svg', '重构技术债'],
  ['git', 'brand_file_type_git_vscode.svg', '执行 Git 变基'],
  ['search', 'ui_search_flat_color.svg', '搜索并定位声明'],
  ['filter', 'status_prohibited_fluent.svg', '过滤黑名单条目'],
  ['validation', 'status_test_green.svg', '执行结构验证'],
  ['error', 'status_bug.svg', '处理请求异常'],
  ['crash', 'status_crash.svg', '捕获进程崩溃'],
  ['warning', 'status_warning_fluent.svg', '记录降级警告'],
  ['debug', 'status_debug.svg', '输出诊断日志'],
  ['performance', 'status_timer_clock_fluent.svg', '检测请求超时'],
  ['analytics', 'arch_bar_chart_fluent.svg', '生成统计分析报表'],
  ['trend_up', 'arch_chart_increasing_fluent.svg', '展示增长趋势'],
  ['trend_down', 'arch_chart_decreasing_fluent.svg', '展示下降趋势'],
  ['experiment', 'status_flask.svg', '运行 A/B 实验'],
  ['repair', 'status_patch.svg', '应用热修复补丁'],
  ['expiration', 'status_expired_flat_color.svg', '清理过期缓存'],
  ['approval', 'status_approval_flat_color.svg', '完成准入审批'],
  ['security', 'fun_shield_fluent.svg', '检查访问权限'],
  ['authentication', 'arch_key_flat_color.svg', '验证 API Key'],
  ['encryption', 'arch_data_encryption_flat_color.svg', '加密敏感数据'],
  ['privacy', 'arch_data_protection_flat_color.svg', '执行数据脱敏'],
  ['locking', 'arch_lock_flat_color.svg', '获取互斥锁'],
  ['unlocking', 'arch_unlock_flat_color.svg', '释放锁并解锁'],
  ['ai', 'fun_robot_fluent.svg', '执行大模型推理'],
  ['calculation', 'ui_calculator_fluent.svg', '计算计费公式'],
  ['policy', 'arch_balance_scale_fluent.svg', '执行合规审计规则'],
  ['documentation', 'ui_open_book_fluent.svg', '生成开发文档'],
  ['image', 'ui_gallery_flat_color.svg', '缩放位图图像'],
  ['audio', 'ui_headphone_fluent.svg', '解码音频流'],
  ['video', 'ui_movie_camera_fluent.svg', '处理视频编解码'],
  ['user', 'ui_manager_flat_color.svg', '加载用户资料'],
  ['location', 'ui_location_red.svg', '解析地理坐标'],
  ['mongodb', 'arch_file_type_mongo_vscode.svg', '查询 MongoDB'],
  ['mysql', 'arch_file_type_mysql_vscode.svg', '连接 MySQL'],
  ['sqlite', 'arch_file_type_sqlite_vscode.svg', '打开 SQLite'],
  ['postgresql', 'brand_postgresql_logo.svg', '访问 PostgreSQL'],
  ['redis', 'brand_redis_logo.svg', '写入 Redis'],
  ['container', 'brand_docker.svg', '构建 Docker 容器镜像'],
  ['orchestration', 'brand_kubernetes_logo.svg', '部署 Kubernetes Pod'],
  ['aws', 'brand_aws_logo.svg', '调用 AWS 服务'],
  ['azure', 'brand_microsoft_azure_logo.svg', '连接 Microsoft Azure'],
  ['gcp', 'brand_google_cloud_logo.svg', '连接 Google Cloud'],
  ['github', 'brand_github.svg', '触发 GitHub Actions'],
  ['gitlab', 'brand_gitlab_logo.svg', '创建 GitLab Merge Request'],
  ['terraform', 'brand_terraform_icon_logo.svg', '应用 Terraform 配置'],
  ['typescript', 'brand_typescript.svg', '解析 TypeScript 类型'],
  ['javascript', 'brand_javascript.svg', '运行 JavaScript 模块'],
  ['python', 'brand_python_logo.svg', '启动 Python 解释器'],
  ['java', 'brand_java_logo.svg', '加载 Java JVM 类'],
  ['golang', 'brand_go.svg', '编译 Go 语言服务'],
  ['rust', 'brand_rust.svg', '构建 Rust crate'],
  ['cpp', 'brand_c_plusplus_logo.svg', '编译 C++ 模块'],
  ['csharp', 'brand_c_sharp_logo.svg', '构建 C# 项目'],
  ['php', 'brand_php_logo.svg', '执行 PHP 请求'],
  ['ruby', 'brand_ruby_logo.svg', '加载 Ruby gem'],
  ['nodejs', 'brand_nodedotjs.svg', '启动 Node.js 服务'],
  ['react', 'brand_react.svg', '渲染 React 组件'],
  ['vue', 'brand_vue_logo.svg', '挂载 Vue 组件'],
  ['angular', 'brand_angular.svg', '注入 Angular 服务'],
  ['svelte', 'brand_svelte_icon_logo.svg', '编译 SvelteKit 页面'],
  ['eslint', 'brand_eslint_logo.svg', '运行 ESLint 规则'],
  ['jest', 'brand_jest_logo.svg', '执行 Jest 测试'],
  ['android', 'brand_android.svg', '启动 Android Activity'],
  ['apple', 'brand_apple.svg', '初始化 iOS 应用'],
  ['windows', 'brand_windows.svg', '调用 Win32 API'],
  ['linux', 'brand_linux.svg', '注册 Linux 信号'],
]

const dictionary = JSON.parse(fs.readFileSync(path.join('resources', 'icon_dictionary.json'), 'utf8'))
const dictionaryIds = dictionary.map(icon => icon.id).sort()
const dictionaryNames = [...new Set(dictionary.map(icon => icon.name))].sort()
const hashLines = lines => crypto.createHash('sha256').update(lines.join('\n')).digest('hex')
assert.equal(dictionaryIds.length, 1499, 'The icon library changed and must be reviewed for AI selection')
assert.equal(dictionaryNames.length, 681, 'The icon concept set changed and must be reviewed for AI selection')
assert.equal(hashLines(dictionaryIds), '06cc8b8777655c554494d9de44b97f38d03ef321d7d5807982ffcc45ba1f8288')
assert.equal(hashLines(dictionaryNames), 'd09b4dce81061c899d9aa0f2ebe9dbcd65fe1053a370443f8b3425465d6640f3')

const expectedByKey = new Map(expectedCatalog.map(([key, iconName, example]) => [key, { iconName, example }]))
assert.equal(expectedByKey.size, expectedCatalog.length, 'Duplicate expected AI semantic key')
assert.equal(AI_BOOKMARK_ICON_OPTIONS.length, expectedCatalog.length)

const dictionaryIdSet = new Set(dictionaryIds)
const selectedIconNames = new Set()
const colorVariantCounts = new Map()
for (const option of AI_BOOKMARK_ICON_OPTIONS) {
  const expected = expectedByKey.get(option.key)
  assert.ok(expected, `Unexpected AI semantic key: ${option.key}`)
  assert.equal(option.iconName, expected.iconName, `Unexpected icon for AI semantic key: ${option.key}`)
  assert.equal(selectedIconNames.has(option.iconName), false, `AI icon asset reused by multiple keys: ${option.iconName}`)
  selectedIconNames.add(option.iconName)
  assert.equal(fs.existsSync(path.join('resources', 'custom_icons', option.iconName)), true, `Missing AI icon asset: ${option.iconName}`)
  assert.equal(dictionaryIdSet.has(option.iconName), true, `AI icon is absent from dictionary: ${option.iconName}`)
  assert.equal(
    resolveAIIconNameForSemantic(option.key, { labels: [expected.example] }),
    option.iconName,
    `Semantic evidence should accept AI icon key: ${option.key}`,
  )
  assert.equal(
    resolveAIIconNameForSemantic(option.key, { labels: ['处理普通业务逻辑'], anchor: expected.example }),
    undefined,
    `Source anchors alone must not authorize AI icon key: ${option.key}`,
  )

  const colorVariant = option.iconName.match(/_(blue|green|purple|red|yellow)\.svg$/)?.[1]
  if (colorVariant) colorVariantCounts.set(colorVariant, (colorVariantCounts.get(colorVariant) ?? 0) + 1)
}

for (const [expectedKey, , example] of expectedCatalog) {
  const acceptedKeys = AI_BOOKMARK_ICON_OPTIONS
    .filter(option => resolveAIIconNameForSemantic(option.key, { labels: [example] }) !== undefined)
    .map(option => option.key)
  assert.deepEqual(acceptedKeys, [expectedKey], `Ambiguous AI icon semantics for example: ${example}`)
}

assert.ok(AI_BOOKMARK_ICON_OPTIONS.length >= 90, 'AI icon catalog should cover the reviewed high-signal concepts')
assert.ok(colorVariantCounts.size >= 4, 'AI icon catalog must use at least four base color variants')
assert.ok(Math.max(...colorVariantCounts.values()) <= 5, 'A single base color variant must not dominate the AI icon catalog')

const resolve = (key, ...labels) => resolveAIIconNameForSemantic(key, { labels })
assert.equal(resolve('../outside.svg', '验证 API Key'), undefined)
assert.equal(resolve('not-an-icon', '验证 API Key'), undefined)
assert.equal(resolve('authentication', '可读性提升与 URL 还原'), undefined)
assert.equal(resolve('authentication', '验证 API Key'), expectedByKey.get('authentication').iconName)
assert.equal(resolve('configuration', '处理普通函数参数'), undefined)
assert.equal(resolve('configuration', '通用追踪参数黑名单配置'), undefined)
assert.equal(resolve('filter', '特定平台清理规则与白名单'), expectedByKey.get('filter').iconName)
assert.equal(resolve('algorithm', '清理 URL 追踪参数'), undefined)
assert.equal(resolve('async', '执行 async function'), undefined)
assert.equal(resolve('link', '可读性提升与 URL 还原'), expectedByKey.get('link').iconName)
assert.equal(resolve('validation', '验证 API Key'), undefined)
assert.equal(resolve('security', 'API Key 访问权限'), undefined)
assert.equal(resolve('data', '访问 PostgreSQL 数据库'), undefined)
assert.equal(resolve('postgresql', '访问 PostgreSQL 数据库'), expectedByKey.get('postgresql').iconName)
assert.equal(resolve('cloud', '部署 AWS 云服务'), undefined)
assert.equal(resolve('aws', '部署 AWS 云服务'), expectedByKey.get('aws').iconName)
assert.equal(resolve('error', '处理 fatal error'), undefined)
assert.equal(resolve('crash', '处理 fatal error'), expectedByKey.get('crash').iconName)
assert.equal(resolveAIIconNameForSemantic('entry', { labels: [] }), undefined)

console.log(`AI icon curation verified: ${dictionaryIds.length} assets reviewed, ${AI_BOOKMARK_ICON_OPTIONS.length} selected.`)
