<div align="center">
  <img src="./resources/bookmark_logo.png" width="112" height="112" alt="CodeBookmark Logo">
  <p><strong>简体中文</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>

  <h1>代码书签</h1>

  <p><strong>粘性引擎让书签持续绑定脚本并准确跟随代码，支持 AI 辅助、丰富的书签图标与本地保存</strong></p>

  <p>
    <a href="https://github.com/realSilasYang/CodeBookmark/releases"><img src="https://img.shields.io/github/v/release/realSilasYang/CodeBookmark?style=flat-square&amp;label=version" alt="最新版本"></a>
    <a href="https://github.com/realSilasYang/CodeBookmark/releases"><img src="https://img.shields.io/github/downloads/realSilasYang/CodeBookmark/total?style=flat-square&amp;label=downloads" alt="GitHub 下载量"></a>
    <a href="https://github.com/realSilasYang/CodeBookmark/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/realSilasYang/CodeBookmark/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI 状态"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/github/license/realSilasYang/CodeBookmark?style=flat-square" alt="开源许可证"></a>
    <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.125.0-007ACC?style=flat-square" alt="VS Code 版本要求"></a>
  </p>

  <p>
    <a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">扩展市场</a> ·
    <a href="#界面概览">界面概览</a> ·
    <a href="#用户使用指南">用户指南</a> ·
    <a href="https://github.com/realSilasYang/CodeBookmark/releases">版本发布</a> ·
    <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">问题反馈</a>
  </p>
</div>

代码书签（CodeBookmark）是一款用书签标记和导航代码的 VS Code 扩展。核心粘性引擎让书签配置与脚本持续绑定，并在代码增删、文件改名、目录移动和工作区路径变化后重新定位书签。书签配置保存在用户指定的本地目录；AI 可以根据代码语义生成书签、优化标签并选择书签图标。层级组织、拖拽排序、自动代码标记、导入导出和撤销重做则用于辅助日常管理。

# 界面概览

[![代码书签界面概览](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

左侧“代码书签”面板展示与脚本绑定的书签、层级和语义图标；点击任意书签即可在右侧编辑器中定位对应代码。代码内容变化、脚本改名或目录移动后，粘性引擎会继续追踪并恢复定位。

---
**[用户使用指南](#用户使用指南)**<br>
[初次使用](#1-初次使用) · [快捷键与基本操作](#2-快捷键与基本操作) · [层级、拖拽、固定容器与排序](#3-层级拖拽固定容器与排序) · [搜索、行内标签与图标](#4-搜索行内标签与图标) · [TODO、FIXME、BUG 自动书签](#5-todofixmebug-自动书签)<br>
[文件移动、改名与失效恢复](#6-文件移动改名与失效恢复) · [导入与导出](#7-导入与导出) · [AI 辅助](#8-ai-辅助) · [撤销、重做与故障处理](#9-撤销重做与故障处理) · [设置一览](#10-设置一览)

**[开发者指南](#开发者指南)**<br>
[目录结构与生成边界](#1-目录结构与生成边界) · [激活流程与视图状态](#2-激活流程与视图状态) · [模型与树结构](#3-模型与树结构) · [持久化布局与脚本身份](#4-持久化布局与脚本身份)<br>
[文件事件、转移日志与存储根切换](#5-文件事件转移日志与存储根切换) · [保存队列、外部编辑与原子写入](#6-保存队列外部编辑与原子写入) · [源码位置追随](#7-源码位置追随) · [撤销设计](#8-撤销设计)<br>
[AI 协议与安全边界](#9-ai-协议与安全边界) · [自动标记与语言配置](#10-自动标记与语言配置) · [图标系统与 Webview](#11-图标系统与-webview) · [构建、测试与发布](#12-构建测试与发布)


# 打赏

如果代码书签与 AI 辅助为您节省了标记和导航代码的时间，欢迎通过下方二维码打赏作者。请选择支持方式：

<p align="center">
  <img src="./resources/donate/wechat-pay.png" width="220" alt="微信支付打赏二维码">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="./resources/donate/alipay.png" width="220" alt="支付宝打赏二维码">
</p>

# 用户使用指南

## 1. 初次使用

### ⚙️ 完成首次设置

第一次使用前，先告诉扩展把书签配置保存到哪里：

1. 安装并启用扩展，然后打开一个本地脚本或工作区。
2. 打开 VS Code 设置，搜索 `CodeBookmark`。
3. 填写必填项 `codebookmark.globalStoragePath`。这里必须使用绝对目录，也可以包含 `~` 或 `%环境变量%`；目录不存在时，扩展会自动创建。
4. 按 `Alt+B` 打开并聚焦“代码书签”面板，也可以点击活动栏中的书签图标。

### 💾 了解数据保存和显示范围

所有书签数据都保存在你指定的目录中，不会写进项目源码目录。

打开工作区时，面板会显示工作区内所有已有书签的文件；只打开一个脚本时，面板只显示这个脚本的书签。两种打开方式读取的是同一份脚本配置，所以不会复制出两份数据，也不会各自分叉。

扩展支持本地文件夹、远程文件夹和多根工作区，并在工作区侧的 Extension Host 中运行；书签存储目录必须能由该 Extension Host 访问。VS Code 虚拟工作区不受支持。未受信任的工作区仍可使用本地书签功能，但 AI 菜单、AI 命令和网络请求会保持禁用，直到你明确信任该工作区。

## 2. 快捷键与基本操作

### ⌨️ 使用常用快捷键

日常添加、删除和打开书签可以直接使用以下按键：

| 按键 | 使用位置 | 操作 |
| --- | --- | --- |
| `Ctrl+B` | 编辑器 | 切换当前行书签；多光标时逐行添加或删除 |
| `Ctrl+Alt+Shift+B` | 编辑器 | 强制添加书签，即使所在行已有书签 |
| `Ctrl+Alt+Shift+D` | 编辑器 | 删除当前行的普通书签 |
| `Alt+B` | 全局 | 打开并聚焦“代码书签”面板 |
| `F2` | 书签树 | 重命名当前书签；支持多选批量编辑 |
| `Delete` | 书签树 | 删除选中书签；支持多选 |

### 📝 添加书签时会记录什么

使用单个光标添加书签时，扩展会先让你确认标签；使用多个光标时，会生成用 `│` 分隔的批量标签。编辑器中有选区时，书签记录选中的内容；没有选区时，记录光标所在的整行。标签留空则不会保存书签。

### 🔧 打开或修复书签

点击书签后，扩展会打开对应文件并选中记录的位置。如果原位置已经无法识别，书签会显示警告图标。此时把光标放到正确位置，再使用“编辑书签”，即可重新绑定位置；需要时也可以同时修改标签。

## 3. 层级、拖拽、固定容器与排序

### 🧩 调整层级和顺序

书签不只能排成一列，还可以组成父子层级：

| 想做什么 | 操作方法与规则 |
| --- | --- |
| 调整书签顺序或层级 | 在同一文件内拖拽书签。父节点不能移进自己的子节点，书签也不能跨文件拖动 |
| 调整文件显示顺序 | 在工作区中多选并拖拽文件节点。顺序会写入工作区视图配置；如果当前使用时间或位置排序，拖拽后会自动切回自定义排序 |
| 让新书签自动归入某个节点 | 右键普通书签，选择“设置为书签容器”。之后在同一文件中新建的书签都会放入该节点；当前作用域同时只能有一个固定容器，可通过“取消作为书签容器”恢复默认位置 |
| 删除带有子项的书签 | 可以连同全部子项一起删除，也可以只删除当前节点，并把子项提升到父级 |
| 更换排序方式 | “排序模式”支持自定义顺序、创建时间升序/降序、代码位置升序/降序。时间和位置排序只改变当前显示，不会覆盖原有的自定义顺序 |

### 📂 控制展开深度

面板顶部的展开/折叠按钮按 `codebookmark.defaultExpandLevel` 控制展开深度。默认值 `3` 表示展开前三层，设为 `0` 表示展开全部层级。每个节点的展开状态会随书签配置一起保存。

## 4. 搜索、行内标签与图标

### 🔍 快速查找和识别书签

| 功能 | 使用方法与效果 |
| --- | --- |
| 当前文件内搜索 | 按标签、行号或代码内容筛选当前脚本的书签，选中结果即可跳转 |
| 行内标签 | `codebookmark.inlineLabel` 默认开启。光标所在行存在有效书签时，行尾会以幽灵文本显示该行的第一个书签标签 |
| 自动空格 | `codebookmark.autoSpace` 默认开启。标签中的中文与英文、数字之间会自动补上空格 |
| 自定义图标 | 右键书签打开图标选择器。图标分为代码状态、核心架构、界面资源、趣味标签和品牌徽标，支持中英文模糊搜索、分页加载和最近使用 |
| AI 语义图标 | `codebookmark.AI.assignIcons` 默认开启。插件从完整图标库中精选高辨识度语义图标，只有书签标签明确匹配并通过冲突复核时才使用；匹配不明确时保留默认图标。优化已有书签时只会更新仍使用默认图标的书签，不会覆盖手工自定义图标 |
| 默认图标 | 普通书签的图标由层级和是否包含子项决定；自动代码标记默认使用黄色提示灯图标。自定义后可随时选择“恢复默认图标” |

## 5. TODO、FIXME、BUG 自动书签

扩展无需连接 AI，就能把源码注释中的 `TODO`、`FIXME` 和 `BUG` 自动显示为书签。

### 🔎 自动识别哪些内容

扩展只读取同时注册了语法高亮 grammar 和正式注释规则的 VS Code 内置语言或语言扩展。语言扩展被安装、卸载、启用或停用后，识别规则也会随之刷新；当前语言模式为纯文本，或者语言只有文件扩展名却没有语法高亮时，不会生成自动书签。

标记必须位于真正的行注释或块注释中，并作为注释内容开头的独立指令出现，例如 `// TODO: 补充校验`、`# FIXME: 修复边界`、`/* BUG: 处理异常 */`、`* @TODO 完善文档` 或 `// [FIXME] 调整实现`。普通大写形式可以只写标记；后面有说明时必须使用冒号、全角冒号、连字符或“负责人括号＋冒号”等明确分隔。小写写法只有在 `todo:`、`@fixme`、`[bug]` 等明确指令结构中才会识别，保存时统一规范为大写。每段注释每行最多对应一个自动书签。

字符串、普通标识符、不支持注释的 JSON，以及“此模块会处理 TODO/FIXME/BUG”、`<!-- Minimalist Flat Code Bug -->`、`<!-- TODO Icon Metadata -->` 这类只是在说明文字或资源元数据中提到标记名称的内容，都不会生成自动书签。`todo item`、`fixme note`、`bug icon` 等小写普通说明也不会被当成显式指令。

### 📌 自动书签如何显示和保存

自动书签和普通书签使用相同的保存结构，都会记录路径、位置和前后文线索（上下文锚点），并始终排在当前文件的手动书签之前。每个文件最多同步 `5,000` 个自动标记，单份脚本配置最多包含 `10,000` 个书签节点。

### ✏️ 哪些内容可以修改

你可以自定义自动书签的标签和图标，源码位置变化后，这些自定义内容仍会保留。自动书签本身由源码管理，不能手动删除；从源码中删掉对应标记后，它会自动消失。如果自动书签下面还有手动子书签，子书签会被提升并保留。

### 🗂️ 工作区何时扫描

首次加载工作区时，扩展会在后台扫描源码，并排除依赖、构建、缓存、编辑历史和版本控制目录。没有被后台扫描到的文件，会在打开、创建或编辑时继续同步。

## 6. 文件移动、改名与失效恢复

### 🧭 为什么移动后还能找回书签

每个有书签的脚本都会获得一个独立、长期不变的随机身份。为了在脚本或文件夹移动、改名、换设备甚至修改内容后找回绑定，配置还会记录源码绝对路径、文件系统身份、SHA-256 内容哈希、文件大小，以及书签所在代码和前后文锚点。

这些信息只是逐层判断的线索，并不是必须全部相同的一组“身份证号码”。扩展会按下面的顺序尝试恢复：

1. **同一设备内移动：** 设备号和文件系统内部编号（inode）会让相应候选文件优先接受检查，但不能单独决定最终绑定。
2. **文件内容没有变化：** 扩展用唯一匹配的完整 SHA-256 哈希确认文件；文件大小只用来缩小需要计算哈希的候选范围。
3. **换设备或内容已变化：** 即使文件名、内容和大小都发生变化，扩展仍会根据书签代码和前后文锚点，并结合文件名与扩展名评分，寻找足够可信的新位置。
4. **出现多个相似候选：** 只有一个候选达到可信条件时才会自动恢复。若多个配置或文件同样可信，扩展会暂缓绑定并给出提示，不会在加载过程中弹出阻塞式选择框，也不会静默绑定到错误对象。

### 🚚 哪些移动方式能够恢复

VS Code 原生的文件或文件夹重命名、外部工具产生的“先删除、后创建”、只上报目标目录的移动事件，以及整个工作区根目录改名，都会进入同一套恢复流程。恢复时会一起更新磁盘配置、当前显示的书签树、文件显示顺序和对应的撤销历史。转移开始前还会先写入恢复日志；即使扩展宿主意外退出，下次读取配置前也会继续完成未结束的转移。

### 🗑️ 脚本被删除后会怎样

脚本被删除后，它的配置会作为待恢复记录保留，包括只含自动代码标记的配置。这样外部移动工具把一次移动拆成“删除 + 创建”事件时，后续出现的匹配脚本仍可自动重新连接，而不是因为先收到删除事件就丢失身份线索。

## 7. 导入与导出

### 📦 迁移或分享书签配置

在“更多 → 导入／导出书签”中，可以把当前脚本或工作区导出为一个 `.codebookmark` 可迁移书签配置，再导入本机其他目录，或导入 Windows、macOS、Linux 上的其他设备。配置包会保留书签标签、图标、层级、代码锚点、文件节点外观和跨文件布局，但不会携带本机绝对路径、设备号等机器身份。旧 JSON 文件和配置文件夹不再作为导入格式。

导入时会自动识别单脚本或工作区配置，并依次根据相对路径、源码摘要和书签上下文寻找唯一目标；无法可靠匹配的脚本会明确列为冲突，不会猜测绑定。目标已有书签时，可以选择“追加”或“覆盖”：追加会保留本机内容并合并双方修改，覆盖只替换成功匹配脚本的书签和布局，不会删除任何源码文件。配置包可反复导入、修改、再导出，交换记录会维持跨设备身份并避免重复书签。

当前脚本没有书签时，空视图中的“导入书签配置文件”按钮同样用于选择 `.codebookmark` 文件。单脚本模式下，“导出 → 可迁移书签配置”用于迁移和再次导入；文件夹或工作区模式下，同一入口位于“导出当前脚本的… → 可迁移书签配置”。“其他格式”用于生成下列阅读文件：

| 格式 | 结果 |
| --- | --- |
| Markdown | 按文件和层级输出标签、行号、状态与代码内容 |
| HTML | 可打印的响应式表格，支持浅色/深色显示 |
| CSV | 带 UTF-8 BOM，包含文件、行列、层级、状态、标签和代码内容，并防止表格公式注入 |
| 纯文本 | 适合直接阅读或粘贴的缩进文本 |

Markdown、HTML、CSV 和纯文本不能再次导入。文件夹或工作区模式还会同级显示“导出当前文件夹的…”，其中“可迁移书签配置”生成包含该目录内有书签脚本的单个迁移包，“其他格式”则继续按源文件分别输出。

### 🗃️ 按源文件批量导出

需要逐文件导出时，在“导出当前文件夹的… → 其他格式”选择格式。它会从当前活动脚本所在目录开始递归查找，只处理其中已有书签的文件，并为每个源文件分别生成结果；原有相对目录结构会保留，所有结果不会合并成一个总文件。

### 🗂️ 管理全部配置文件

在面板中打开“更多 → 书签配置文件管理”，可以查看当前全局存储目录中的全部书签存储记录，而不受当前工作区或活动脚本限制。管理界面会明确区分以下内容：

- **脚本书签配置：** 显示脚本路径、绑定状态、配置类型、书签总数与各级数量、自动或失效书签数量、绑定信息更新时间、文件修改时间和大小，并区分正式配置、迁移备份、冲突副本、已取代文件及损坏文件。
- **工作区排序与布局记录：** 显示工作区名称、路径哈希、参与排序的脚本路径及跨文件布局，不重复保存书签内容。
- **配置交换记录：** 显示迁移包的交换系列、作用域、修订、身份映射和合并基线；清理后不会删除当前书签，但该系列下次无法继续沿用原有跨设备身份。
- **存储迁移记录：** 显示迁移状态、原目录、目标目录、开始与完成时间，以及复制、合并和冲突文件数量。这类记录只用于说明最近一次存储目录迁移结果。

界面支持统一搜索、筛选、排序和多选；脚本配置可以打开仍存在的脚本，所有记录都可以在文件资源管理器中定位。删除或清理前，扩展会按所选类型说明影响并再次确认。确认后会先完成等待中的保存任务，再核对文件是否仍与界面读取时一致；已被其他程序修改的文件会跳过，防止误删新内容。操作完成后，管理界面和当前书签树都会从磁盘重新载入。

## 8. AI 辅助

### 🔌 配置 AI 连接

使用 AI 功能前，可从面板顶部的 AI 菜单选择“代码书签 AI 参数”，直接打开对应设置：

| 设置 | 填写内容 |
| --- | --- |
| `codebookmark.AI.address` | AI 地址；可以填写资源 Endpoint、API Base URL 或完整请求 URL，插件会自动识别和补全 |
| `codebookmark.AI.APIKey` | 服务要求的 API Key；无需鉴权的本地服务可以留空。填写后会以明文保存在 VS Code 的 `settings.json` 或对应工作区设置中 |
| `codebookmark.AI.model` | 模型名称；Azure v1 中填写部署名称 |
| `codebookmark.AI.assignIcons` | 默认开启；让 AI 在生成书签后选择书签图标 |

常见地址都可以直接填写：

| 地址形式 | 示例 | 插件处理方式 |
| --- | --- | --- |
| OpenAI 或兼容服务的域名 / API Base URL | `api.openai.com`、`https://openrouter.ai/api/v1`、`http://127.0.0.1:1234/v1` | 补全 Chat Completions；仅在服务器明确表明路由不存在时尝试同源的其他兼容路径或 Responses |
| 完整 Chat Completions / Responses URL | `https://api.openai.com/v1/chat/completions`、`https://api.openai.com/v1/responses` | 尊重明确选择，不再改写为另一种协议 |
| Azure OpenAI / Foundry 资源 Endpoint 或 Base URL | `https://资源名.openai.azure.com`、`https://资源名.openai.azure.com/openai/v1/` | 识别为 Azure v1，并优先请求 `/responses`；模型设置必须使用部署名称；完整的旧版 deployment URL 仍按原接口调用 |
| Anthropic Messages | `https://api.anthropic.com` 或完整的 `/v1/messages` URL | 使用 Messages 请求体、`x-api-key` 和 `anthropic-version` |
| Gemini 原生或 OpenAI 兼容接口 | `https://generativelanguage.googleapis.com`、`https://generativelanguage.googleapis.com/v1beta/openai` 或完整 URL | 原生地址补全 `models/...:generateContent`；OpenAI 兼容地址补全 `chat/completions`；Vertex AI 模型路径也会按原生格式识别 |
| Ollama | `localhost:11434`、`http://远程主机:11434/api` 或 `/v1` Base URL | 原生地址补全 `/api/chat`；`/v1` 使用 OpenAI 兼容格式；API Key 可以留空 |

省略 `http://` / `https://` 时，公网域名默认补为 HTTPS，localhost、回环地址和常见容器宿主名默认补为 HTTP。完整请求 URL 会保留协议意图；以 `/chat`、`/chat/completion`、`/response` 或 Gemini 模型路径结尾的半完整地址会补成对应接口，不会再把已有的 `chat` 重复追加。查询参数会保留，片段标识会移除。远程接口仍建议始终使用 HTTPS；对于非本机的 HTTP 地址，扩展会在发送源码和认证信息前弹出确认窗口。配置完成后，可点击模型名称设置项中的“验证 AI 连接”检查地址、协议、模型和所需密钥。测试成功后，地址设置会自动改为实际请求成功的完整地址；测试失败或取消时不会修改原地址。

### 🎯 选择生成或优化范围

AI 菜单中的操作分为三类：

| 作用范围 | 可以执行的操作 |
| --- | --- |
| 当前脚本 | 在没有书签时生成、向现有书签追加，或重新生成并替换全部手动书签 |
| 当前文件夹 | 递归查找所有支持的脚本，并执行上述三种生成策略 |
| 优化书签 | 优化选中的书签、当前脚本，或当前文件夹内有书签的脚本；可更新标签和语义图标，但不改变位置、层级、身份和锚点 |

### ✅ 扩展如何检查 AI 结果

重新生成时，由源码自动管理的 TODO/FIXME/BUG 书签会保留，并继续占用原来的代码行，防止 AI 在同一行重复生成普通书签。AI 只能提出标签、从 `1` 开始计算的行号、与源码逐字一致的锚点、层级和受控语义图标键；锚点与图标键通过验证后，书签身份、路径、创建时间、选区和上下文都由扩展自行生成。

AI 分析已打开的文档时，会使用编辑器中的最新内容，包括尚未保存的修改；文件没有打开时才读取磁盘。优化书签一次最多向模型提交 `300` 个书签，超过后会自动分批处理，因此不会静默丢掉后面的书签。

### 🛡️ 资源限制和中断规则

为防止超大文件、异常响应或长时间任务拖慢 VS Code，AI 功能有以下边界：

- 单个源码超过 512 KiB、响应超过 2 MiB 时会询问是否继续；源码硬上限 8 MiB，请求和响应硬上限均为 16 MiB。
- 文件夹扫描最多处理 500 个支持的脚本、20,000 个目录项和 64 层目录；依赖、构建、缓存和版本控制目录会跳过。
- 请求可以取消，默认超时为 60 秒，可配置范围为 1–600 秒。超时按一次请求的绝对总时长计算，即使接口持续返回数据流也不会无限延长。认证失败、遇到速率限制或连续 3 次请求失败时，文件夹任务会停止。
- AI 返回期间若源码、书签或当前处理范围发生变化，旧结果不会应用。文件夹任务每成功处理一个文件就立即加入保存队列；中途取消不会丢失此前结果。

## 9. 撤销、重做与故障处理

### ↩️ 撤销和重做哪些操作

添加、切换、删除、重命名、位置更新、图标修改、层级拖拽、文件排序、导入、AI 生成或优化、固定容器，以及清理失效书签，都支持撤销和重做。一次批量操作只占用一步，面板顶部按钮会直接显示下一步要撤销或重做的操作名称。

### 🕘 撤销历史保留多久

撤销历史按工作区或独立脚本分别隔离，只在当前 VS Code 窗口会话内有效。每个撤销栈和重做栈最多保留 `50` 个快照；所有作用域共同使用 `8 MiB` 预算，最多保留 `64` 个作用域。切换文件、重新加载磁盘数据或扩展宿主重新激活，不会立即清空同一窗口会话中的历史。

### 🔄 保存时遇到外部修改怎么办

连续发生的改动会在短暂延迟后合并，保存队列只处理真正受影响的脚本。保存时，扩展会先在同一目录写好临时文件，再一次性替换原配置，避免只写入一半；这种方式也叫原子替换。写入失败最多自动重试 `3` 次。检测到外部工具修改书签配置时，扩展只增量重新载入相关脚本；尚未写入的本地改动不会被全部取消，而会根据合并后的最新内存书签重新生成保存内容，从而保留两边变化并避免用旧数据覆盖外部修改。

### 🗄️ 更换书签存储目录

修改 `globalStoragePath` 后，扩展会先把旧目录中等待保存的数据全部写完，再将 `scripts`、`scopes`、`exchanges` 和恢复日志合并到新目录。相同交换系列会保留更新的记录，其他不同数据会保留为备份或冲突副本；只有新目录全部写入成功后，扩展才会删除原目录中的受管配置。转移或清理失败时，扩展会继续使用原目录，不会提前删除来源数据。

## 10. 设置一览

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `codebookmark.globalStoragePath` | 空 | 必填；用于保存全部书签配置的绝对目录 |
| `codebookmark.defaultExpandLevel` | `3` | 展开按钮要展开到的层级；`0` 表示全部 |
| `codebookmark.autoSpace` | `true` | 自动调整中英文/数字间距 |
| `codebookmark.inlineLabel` | `true` | 在光标行末显示书签标签 |
| `codebookmark.AI.address` | 空 | AI 地址；支持资源 Endpoint、API Base URL、Chat Completions、Responses、Anthropic Messages、Gemini generateContent 和 Ollama 地址自动补全 |
| `codebookmark.AI.APIKey` | 空 | 服务要求的 API Key，明文保存在 VS Code 设置中；无需鉴权的本地服务可留空 |
| `codebookmark.AI.model` | 空 | AI 模型名称 |
| `codebookmark.AI.assignIcons` | `true` | 让 AI 在生成书签后选择书签图标 |
| `codebookmark.AI.timeoutS` | `60` | 单次请求的绝对总超时秒数，范围 1–600 |
| `codebookmark.AI.prompt` | 内置生成提示词 | AI 生成书签的系统提示词 |
| `codebookmark.AI.optimizePrompt` | 内置优化提示词 | AI 优化书签标签和语义图标的系统提示词 |



# 开发者指南

## 1. 目录结构与生成边界

```text
CodeBookmark/
├─ .github/
│  ├─ ISSUE_TEMPLATE/               Issue 模板与安全报告入口
│  ├─ workflows/                    持续集成与联动发布
│  ├─ dependabot.yml                npm 与 GitHub Actions 依赖更新策略
│  ├─ PULL_REQUEST_TEMPLATE*.md     中英文 Pull Request 检查清单
│  ├─ CONTRIBUTING*.md              中英文贡献流程与验证要求
│  ├─ SECURITY*.md                  中英文漏洞报告策略
│  └─ SUPPORT*.md                   中英文使用支持与问题分类
├─ .vscode/
│  ├─ launch.json                   Extension Host 调试入口
│  ├─ tasks.json                    编译与监听任务
│  └─ settings.json                 项目文件嵌套规则
├─ config/
│  ├─ eslint.config.mjs             ESLint 严格检查配置
│  └─ tsconfig.json                 TypeScript 编译配置
├─ docs/
│  ├─ README.*.md                   12 份非简体中文项目文档
│  ├─ CHANGELOG.en.md               英文版本变化记录
│  ├─ images/                       README 界面截图
│  ├─ legal/                        第三方声明与许可证全文
│  └─ release/                      中英文更新日志模板与发布指南
├─ resources/                       扩展图标、图标字典、Fuse 与自定义 SVG
├─ scripts/
│  ├─ build/                        清理、编译清单生成与运行时代码打包
│  ├─ icons/                        图标清单、下载与字典生成
│  ├─ i18n/catalogs/                扩展清单的稳定键语言目录
│  ├─ integration/                  Extension Host 集成测试启动器
│  ├─ lib/                          清单稳定键与本地化读取工具
│  ├─ release/                      VSIX 打包与 Release 正文生成
│  ├─ fixtures/                     专项验证共享的固定输入
│  ├─ test-support/                 Node 验证使用的模块替身与 VS Code 假实现
│  ├─ verify-*.js                   模块级回归与架构约束
│  └─ verify-all.js                 专项验证统一入口
├─ src/
│  ├─ extension.ts                  扩展同步激活入口
│  ├─ commands/                     命令注册、导航与导出
│  ├─ config/                       VS Code 设置读取与缓存
│  ├─ i18n/
│  │  ├─ Localization.ts            语言解析、目录回退与命名参数插值
│  │  └─ catalogs/                  运行时稳定键语言目录
│  ├─ models/                       书签领域模型、编解码、序列化树与工作区顺序
│  ├─ portable/                     可迁移配置格式、归档、匹配、合并与交换记录
│  ├─ providers/                    用户工作流与 VS Code 视图、保存、AI、撤销编排
│  ├─ repository/                   磁盘格式、目录索引、移动恢复与存储转移
│  ├─ subscriptions/                编辑器、文件系统和配置事件适配
│  ├─ testing/                      真实 Extension Host 的只读测试接口
│  └─ util/                         身份、路径、指纹、AI、自动标记和图标基础能力
├─ tests/
│  ├─ unit/                         node:test 单元测试
│  ├─ contracts/                    清单、能力边界与供应链契约测试
│  └─ integration/                  VS Code Extension Host 集成测试
├─ README.md / CHANGELOG.md         中文项目文档与版本变化记录
├─ LICENSE                          项目主许可证
├─ package.json                     生成结果，不是命令清单的唯一事实源
└─ package-lock.json                可复现的 npm 依赖锁定
```

`out/`、`.vscode-test/`、`node_modules/` 和根目录的 `package.nls*.json` 都是生成或依赖内容，不应手工修改；NLS 清单由编译生成到 `package.json` 同级供 VS Code 与 VSIX 使用，但不纳入源码管理，并在资源管理器中折叠到 `package.json` 下。扩展元数据和 npm 脚本定义在 `src/util/constants/BasePackage.ts`；命令、菜单、快捷键、设置和子菜单定义在 `src/util/constants/Commands.ts`；颜色定义在 `Colors.ts`。`npm run compile` 会先清理 `out/`、编译 TypeScript，再根据 `scripts/i18n/catalogs/manifest.<语言>.json` 重新生成 `package.json` 和 NLS 目录。Marketplace 默认简介保持自然、精炼的简体中文，不再混入检索词；30 个 `keywords` 独立覆盖核心英文、简繁中文以及日、韩、越、西／葡、法、俄、德、意搜索词。扩展安装后，各受支持语言使用自己的母语清单，其他明确的非中文环境回退英文。

运行时文案统一使用 `localize('稳定键', { 命名参数 })`，13 套完整目录位于 `src/i18n/catalogs/`。业务源码不保存平行语言原文，也不能用译文参与条件判断；命令 ID、菜单条件、Webview 消息、筛选/排序稳定值、配置键和持久化字段始终与语言无关。运行时目录和 VS Code 在扩展激活前解析的命令、菜单、设置文案均跟随 `vscode.env.language`，因此插件界面始终与 VS Code 显示语言一致。简体中文是探测为空时的默认目录，`zh-Hans` 回退简体，`zh-Hant` 回退台繁，澳门地区回退港繁；明确但未注册的非中文语言回退英文。

新增运行时文案时，应在所有已注册目录加入同一个稳定键，并保证 `{name}` 占位符集合完全一致，再由业务代码传入对应命名参数。新增一种界面语言需要增加统一导出 `messages` 的目录文件，在 `Localization.ts` 注册语言代码和格式区域，并在本地化验证器登记语言身份特征；不需要修改任何功能模块。清单语言则增加 `scripts/i18n/catalogs/manifest.<语言>.json`，生成器会自动发现。`verify-localization.js` 会逐项检查 13 种目录的发现与注册、目录键、占位符、技术标记、语言身份、静态调用、旧双文本接口、用户可见字面量、清单行为以及配套文档，缺键、结构漂移或翻译缓存残留都会使验证失败。

开发时按职责定位入口：

| 要修改的内容 | 主要位置 | 维护边界 |
| --- | --- | --- |
| 扩展元数据、设置、命令、菜单与快捷键 | `BasePackage.ts`、`Commands.ts`、`scripts/i18n/catalogs/` | `package.json` 与 `package.nls*.json` 是生成结果 |
| 运行时界面文案与语言回退 | `src/i18n/Localization.ts`、`src/i18n/catalogs/` | 功能模块只引用稳定键；各目录必须拥有相同键和占位符 |
| 书签字段、树规则、编解码和工作区顺序 | `src/models/` | 先保持持久化契约，再调整 Provider 的交互编排 |
| 命令流程、树视图、保存、撤销和配置管理 | `src/commands/`、`src/providers/`、`src/subscriptions/` | VS Code 事件适配与用户工作流在这里汇合 |
| 可迁移配置导入、导出、匹配和合并 | `src/portable/`、`PortableImportWorkflowRunner.ts` | 包内不保存机器路径；歧义目标不自动绑定；多文件写入必须可回滚 |
| 脚本信封、索引、移动恢复和存储根转移 | `src/repository/`、`src/util/Persistence*.ts` | 所有磁盘数据都必须经过格式身份、版本和原子写入约束 |
| AI 地址、协议、传输、响应解析与工作流 | `src/util/AI*.ts`、`src/providers/AI*.ts` | `util` 负责协议与安全边界，Provider 负责状态核验和应用结果 |
| TODO、FIXME、BUG 自动标记 | `LanguageCommentProfiles.ts` → `CodeMarkerScanner.ts` → `CodeMarkerBookmarks.ts` → `CodeMarker*` Provider | 语言资格、词法扫描、树同步和生命周期逐层分开 |
| 图标与配置管理 Webview | `src/util/quick_pick_icon/`、`BookmarkConfigurationManagerWebview.ts`、`resources/` | Host 提供白名单数据和本地化文本，Webview 只处理展示与稳定消息值 |
| 自动化验证 | `tests/unit/`、`tests/contracts/`、`tests/integration/`、`scripts/verify-*.js` | 按纯逻辑、公开契约、真实 VS Code 生命周期和专项回归选择层级 |

## 2. 激活流程与视图状态

`activate()` 必须同步完成命令、TreeView、订阅器和 UndoManager 的注册，随后把磁盘读取交给 Provider 后台执行，避免慢磁盘让 VS Code 激活超时。AI API Key 由 `ExtensionConfig` 从 VS Code 配置读取，不参与扩展激活时的独立存储初始化。

`CodeBookmarkViewProvider` 是保留 VS Code API 外观的组合根，不再直接承载所有业务实现：AI 文件夹流程、配置管理、可迁移配置导入和自动标记生命周期分别交给独立 Runner 或 Controller，保存、刷新、视图、文档变化等交给对应 Coordinator。`BookmarkRepository` 保持稳定 Facade，把候选源码索引、脚本信封编解码和文件节点编解码下沉到无循环依赖的单一职责模块；架构验证同时限制两个 Facade 的行数预算，防止逻辑重新堆回核心文件。

目录之间采用概念上的依赖方向：`extension.ts` 负责装配，`commands/` 与 `subscriptions/` 适配 VS Code 命令和事件，`providers/` 编排完整工作流，`models/`、`repository/` 与 `util/` 提供领域、持久化和基础能力。这是新增代码应遵守的维护边界，不等同于所有目录都被形式化分层；现有架构守卫实际保证的是生产模块可达、运行时无循环依赖，以及两个核心 Facade 不突破体积预算。

```text
extension.activate
  → 创建 CodeBookmarksViewProvider
  → 注册 TreeView、命令和文件事件
  → Provider 后台准备目标作用域
  → Repository 读取并恢复脚本配置
  → FileUtils 重定位书签内容
  → 一次性提交 BookmarkSet
  → 发布树变化与 VS Code context keys
```

视图切换使用 generation、AbortSignal 和串行准备队列淘汰过期请求。新树完整准备好之前保留旧树，提交后再按“空到有”“有到空”“内容不变”选择 context key 与树事件顺序，避免欢迎页、按钮和树内容闪烁。树可见时还会等待首个节点完成取项，但有 1.5 秒上限，不会无限阻塞。

## 3. 模型与树结构

`Bookmark` 同时是持久化实体和 `TreeItem`。普通节点保存随机身份、创建时间、标签、脚本路径、选区、代码内容、前后文锚点、图标、展开/固定状态、子项和可选自动标记元数据。文件节点只作为脚本容器，额外持有 `scriptId`，不参与源码内容重定位。

`Bookmark.fromJSON()` 对类型、位置范围、展开状态和自动标记元数据做严格校验；最大深度为 64，最大节点数为 10,000。损坏的单条书签可被跳过，损坏的脚本信封不会进入索引。

`BookmarkSet` 负责身份去重、父子查询、同文件树操作、防循环、固定容器、路径批量改写和重复文件节点合并。Provider 允许文件节点与普通书签进行跨文件视觉排序和嵌套，但不会转移书签的数据所有权：一份脚本配置始终只保存该脚本拥有的书签，跨文件关系单独交给工作区布局记录。

## 4. 持久化布局与脚本身份

```text
<globalStoragePath>/
├─ scripts/
│  └─ <scriptId>.json
├─ scopes/
│  └─ <工作区名_路径哈希>/
│     ├─ _workspace_layout.json
│     └─ _workspace_order.json      仅在尚未升级的旧顺序记录中出现
├─ exchanges/
│  └─ <exchangeId_作用域哈希>.json  跨设备身份映射与合并基线
├─ .script-relocations/
│  └─ <operationId>.json
└─ .storage-transfer.json
```

每类持久化数据都有独立的 `format` 身份和 `schemaVersion: 1`，覆盖脚本信封、工作区排序与布局、配置交换记录、脚本转移日志、存储根转移日志、撤销会话和最近图标。只有完全没有版本头的数据允许一次性升级；半个版本头、错误格式和未来版本会明确拒绝，避免把未知数据误读成当前结构。不可重建的旧脚本配置会保留迁移备份；成功完成的事务日志会连同临时迁移备份一起删除，不让历史元数据阻止旧目录清理。

脚本信封结构为 `{ format, schemaVersion, script, bookmarks }`。`script` 保存 `id`、绝对 `path`、最近确认时间、可选的失联时间/排序位置和源码指纹；`bookmarks` 只保存该脚本的书签树。工作区 `_workspace_layout.json` 只保存跨文件顺序、父子关系、隐藏、容器和展开状态，不复制任何书签正文；读取旧 `_workspace_order.json` 后，首次保存新布局会写入当前记录并删除旧顺序文件。因此同一脚本从工作区打开或独立打开都命中 `scripts/<scriptId>.json`。

可迁移配置是扩展名为 `.codebookmark` 的受限 ZIP 容器，由清单、去除本机路径的脚本书签、可选工作区布局和合并基线组成。读取时验证格式版本、条目路径、数量、展开大小、SHA-256、脚本身份和递归书签身份；旧 JSON、配置目录、未知条目和半有效包会整包拒绝。目标解析按相对路径、原始或规范化源码摘要、书签锚点的顺序接受唯一证据，写入脚本、布局与交换记录时提供逆序回滚。

脚本、书签和转移操作的身份均由 128 位加密安全随机数生成，并以固定的五段十六进制文本表示；格式不携带版本或设备含义。`isScriptId()` 只校验这一稳定格式。

源码指纹的 SHA-256 和大小来自流式读取，设备号与 inode 只在文件系统提供时记录。Repository 会先在相同大小的候选中计算 SHA-256；唯一的完整哈希匹配可以直接确认。没有唯一哈希匹配时，设备号和 inode、文件名、扩展名会用于排列候选，最多读取 20 个书签内容或前后文锚点进行评分；最高分仍有并列时，不会静默绑定。

工作区候选扫描上限为 50,000 个目录项；锚点兜底只读取不超过 16 MiB 的候选文件。文件大小是哈希筛选索引，设备身份也是快捷证据；二者都不是跨设备恢复的必要条件。

## 5. 文件事件、转移日志与存储根切换

`fileEditorSubscriber` 处理文档编辑、打开、创建、重命名、删除、活动编辑器、工作区目录和设置变化。源码创建由 VS Code 文件事件与工作区文件监视器双通道覆盖，适配只产生 create 事件的外部移动工具。

原生 rename 会先写 `.script-relocations/<operationId>.json`，再重绑所有受影响信封并更新工作区顺序，最后删除日志。下次启动会检查未完成日志；若旧路径重新出现而新路径不存在，还可反向完成恢复。delete 会为受影响脚本统一写入失联标记（包括只含自动标记的配置），内存视图再清理当前路径节点；后续 create/reconcile 仍可按指纹和锚点恢复。

存储根切换由 `StorageRootTransfer` 串行执行：先刷新来源保存队列，再逐文件复制或合并。相同脚本身份按 `lastSeenAt` 选择主数据并保留无重复书签；相同交换系列按 `updatedAt` 保留更新记录；无法语义合并的文件保存为带内容哈希的冲突副本。目标数据全部落盘后，来源根中的 `scripts`、`scopes`、`exchanges`、`.script-relocations` 和迁移日志会被删除；根目录内不属于 CodeBookmark 的文件保持不变。真实路径检查阻止来源和目标通过符号链接或目录联接互相包含。

## 6. 保存队列、外部编辑与原子写入

Provider 按绝对源码路径合并保存请求，保存项携带当前树、存储根、序号和可选脏路径。工作区内同一根目录的请求会合并成一次 Repository 保存，只触碰受影响脚本；全量请求会覆盖增量范围。失败按 500 ms 起步指数退避，最多尝试 3 次。

`FileChangeFingerprintTracker` 分别记录已知磁盘哈希和本扩展计划写入的哈希。写入前、临时文件完成后、原子 rename 前都会检查目标是否被外部修改；配置监视器据此区分自身写入和外部写入。检测到外部更新时只增量重载相关脚本，尚未落盘的本地队列会基于最新内存树重新生成，不会用旧快照覆盖外部内容。

`deactivate()` 等待书签保存和撤销会话持久化。配置导出和存储根切换可要求保存必须成功，否则操作中止。

## 7. 源码位置追随

书签创建时记录选区内容以及由相邻行构成的上下文。文档编辑采用 300 ms 合并，不累计可能过期的增量行号，而是在最终文档快照中重新定位：

- 原位置内容仍匹配且上下文最优：保留位置并刷新上下文。
- 内容在其他位置出现：按上下文相似度和与原行距离评分后移动选区。
- 原内容消失但原行仍有新文本：视为同行编辑，刷新内容指纹。
- 内容和可用位置都消失：标记为失效，等待用户重绑或清理。

自动代码标记不经过通用粘性算法，而是由扫描结果重新同步；这样源码标记删除时不会留下失效自动书签。

## 8. 撤销设计

`UndoManager` 保存整个 `BookmarkSet` 和可选工作区顺序的 JSON 快照。每次数据操作先 capture，确认发生变化后再以 `UndoAction` 提交；批量 AI、批量编辑和多选拖拽因此保持原子撤销。

历史按 `workspace:<root>`、`file:<absolutePath>` 或 `global` 分区。文件或目录移动时，内存树和历史快照内的路径、工作区顺序、作用域键会一起重写。历史通过 `workspaceState` 持久化，但带当前 `vscode.env.sessionId`，因此只恢复同一窗口会话。

## 9. AI 协议与安全边界

AI 网络链路分为三个独立边界。`AIAddressClassifier` 统一判断本机、Azure、Vertex AI 和 Ollama 主机，供协议补全与 HTTP 安全检查共同使用。`AIEndpointResolver` 先规范重复斜杠、尾斜杠和重复接口后缀，再区分完整请求 URL、半完整协议路径、API Base URL 与资源 Endpoint；半完整路径只补齐已表达的协议，不跨协议猜测。Azure 资源地址或 `/openai/v1/` Base URL 默认使用官方推荐的 Responses，已知兼容服务使用各自公开的 Base URL 规则，未知服务只生成有限的同源 OpenAI 兼容候选。

`AIProtocolCodec` 分别构建和解析 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini generateContent 与 Ollama Chat。OpenAI 兼容服务默认使用 Bearer 鉴权，Azure 使用 `api-key`，Anthropic 使用 `x-api-key` 和固定协议版本，Gemini Developer API 使用 `x-goog-api-key`；无需鉴权时不会发送空的认证头。Responses 请求显式设置 `store: false`。

`AIHttpTransport` 只负责 POST 传输、响应状态、大小限制、暂停确认、超时和取消；`AIService` 负责依次调用解析器、编解码器和传输层。自动候选只允许相同 origin，并且只在 405 或能够确认是路由不存在的 404 时继续；部署、模型或资源不存在的业务型 404 会原样报告。400、401/403、429、5xx、超时、取消或响应格式错误都会保留原错误并立即停止，避免重复计费、泄露密钥或掩盖配置问题。

生成协议只允许 `label`、`lineNumber`、`anchor`、受控 `icon` 语义键和 `children`；优化协议只允许已提供的 `id`，以及可选的 `new_label` 或 `icon`。运行时契约追加在用户自定义提示词之后，并明确把源码、文件名、标签和身份当作数据，降低提示注入影响。解析后还会执行字段白名单、图标键白名单、数量 300、层级 8、标签长度 120、锚点逐行定位和允许身份集合校验。

源码读取采用读取前后 stat 快照；网络返回后再次验证源码内容/版本、书签 JSON 快照和存储作用域。只有三者都未变化才应用结果。覆盖生成只删除手动书签，自动代码标记保持受保护并占用其源码行。

网络层限制请求/响应字节数、声明长度、分块累计长度、超时和取消；大响应等待用户确认时会暂停响应流和连接空闲计时，但一次请求的绝对总时限仍会继续计算。重定向不会自动跟随，避免认证信息被带到其他 origin。401/403、429 和连续失败由文件夹批处理分类熔断。

## 10. 自动标记与语言配置

`LanguageCommentProfileRegistry` 先从已安装扩展的 `contributes.grammars` 确认哪些语言具有语法高亮，再读取 `contributes.languages` 指向的正式语言配置。只有同时具有 grammar、配置文件可读取且配置中存在有效注释语法的语言，才会得到自动标记扫描资格；同一语言分散声明的扩展名、文件名、文件模式和注释语法会在确认后合并。配置解析兼容注释和尾逗号，单个文件最大 512 KiB，最多读取 4,096 个语言贡献，并以最多 8 个并发任务加载。

`CodeMarkerScanner` 是轻量词法扫描器，跟踪行注释、块注释、普通字符串、持久引号和部分语言的多行字符串，只接受注释开头具有明确结构的 TODO、FIXME、BUG 指令。内置语法提示只会细化已经确认的注释 token，例如 AutoHotkey 分号边界、多行字符串和持久引号；它不会按语言 ID 或扩展名单独授权扫描。没有已发现 profile、语言配置读取失败或文件只有普通文本/资源元数据时，扫描规则为空。`CodeMarkerBookmarks` 负责稳定复用原身份、保留用户标签/图标、提升手动子节点、清理消失标记和维持自动节点前缀。

工作区文件发现模式只由已经确认的语言贡献生成。后台扫描最多发现 2,000 个文件，默认跳过超过 2 MiB 的未打开文件，并使用 4 个并发读取任务；打开文档使用内存内容，不受后台文件大小限制。每个脚本最多生成 5,000 个自动标记，手动书签与自动标记组成的整份配置仍受 10,000 节点上限约束。

## 11. 图标系统与 Webview

`scripts/icons/build-curated-list.js` 从明确的 Iconify 集合和语义概念生成下载清单；输出文件名使用来源身份后缀，如 `_fluent`、`_twitter`、`_google_noto`、`_mozilla`、`_vscode`。`download-extra-icons.js` 只接受 HTTPS、限制重定向和响应大小，并拒绝脚本、外部引用和事件处理器。`generate-icon-dictionary.js` 将磁盘 SVG 与中英文语义词合并并要求每个图标具有足够的中文关键词。

IconPicker Webview 对字典字段和图标名做白名单校验，使用 CSP 与随机 nonce，不生成内联事件属性。字典异步缓存；分类每页渲染 160 项，滚动继续加载，搜索最多返回 200 项，避免约 1,500 个图标一次性创建全部 DOM。

第三方图标集合、作者与许可证见 `docs/legal/THIRD_PARTY_NOTICES.md`。生成或下载图标后必须重新生成字典并运行图标验证。

## 12. 构建、测试与发布

```bash
npm ci
npm run compile
npm run lint
npm run verify
npm run verify:release
npm run test:unit
npm run test:contract
npm run test:coverage
npm run test:integration
npm audit
npm run package:list
```

- `npm run compile`：清理 `out/`、严格编译 TypeScript、将扩展运行时代码打包为单一入口，并生成 `package.json` 与本地化清单。
- `npm run clean:generated`：移除 `out/`、`.vscode-test/`、`coverage/`、根目录 `package.nls*.json`、临时 VSIX、日志与调试文件，让根目录回到源码视图；不会删除 `node_modules/`。
- `npm run lint`：以零警告标准检查 `src/**/*.ts`、`scripts/**/*.js` 和 `tests/**/*.js`。
- `npm run test:unit` / `npm run test:contract`：使用 Node 标准 `node:test` 运行单元测试和外部行为契约，不依赖第三方测试运行器。
- `npm run test:coverage`：用 Node 原生覆盖率运行上述标准测试并执行最低覆盖率门槛。
- `npm run verify`：依次执行 compile、零警告 lint、标准单元/契约测试和全部可在开发阶段成立的 `verify-*.js` 专项验证；不会要求尚未发布的开发版本预先写入正式更新日志。其中激活守卫通过 TypeScript AST 检查真实 `AwaitExpression`，加载状态与视图切换守卫按方法结构定位，不把注释当成代码边界。
- `npm run verify:release`：只运行依赖正式版本资料的更新日志与发布就绪守卫，应在版本号和中英文更新日志准备完成后执行。
- `npm run test:integration`：编译后自动查找并复用本机已安装的 VS Code，以隔离的临时用户目录启动真实 Extension Host；分别验证简中、港繁、台繁、英、日、越、韩、西、法、葡、俄、德、意 13 种清单、激活、命令与配置，并额外验证土耳其语宿主回退英文。简中和英文环境还会实际执行添加书签、撤销/重做、落盘重载、VS Code 内移动和外部移动后的身份追随，以及自动标记指令与 SVG 元数据反例。找不到本机程序时明确失败，不会下载额外测试运行时。
- 如需指定其他 VS Code，可运行 `node scripts/integration/run-integration-tests.js "--vscode-executable=<Code.exe 路径>"`，或设置 `CODEBOOKMARK_VSCODE_EXECUTABLE_PATH`；显式路径优先于自动发现。
- `npm run verify:icons`：单独核对 SVG 文件名、安全内容和字典一一对应。
- `npm run package:list`：使用固定版本的 VS Code 官方打包工具预览 VSIX 文件清单。
- `npm run package:vsix`：仅供 GitHub Actions 使用，输出必须写入 runner 临时目录；本地发布准备不生成或保留 VSIX。
- `npm run check:release`：依次执行开发验证、发布专用守卫、扩展宿主集成测试、依赖审计和打包清单检查。

当前标准测试与专项验证覆盖激活时序、工作区能力、持久化版本、AI 地址归一化、五类 AI 协议、同源路由回退、密钥、大小与取消，以及自动标记、导入导出、命令清单、存储根转移、移动重连、外部配置、保存队列、作用域、撤销、视图切换、图标资源和发布供应链。模块图守卫当前验证 163 个生产 TypeScript 模块均可从声明入口到达，且运行时循环依赖为 0。纯逻辑优先加入 `tests/unit`，公开清单或跨模块约束加入 `tests/contracts`，复杂历史回归保留在对应 `verify-*.js`，涉及 VS Code API 生命周期的行为必须补真实 Extension Host 测试。

`scripts/verify-chinese-comments.js` 当前覆盖 `.github/`、`config/`、`scripts/`、`src/` 和 `tests/` 中 329 个一方维护的 TypeScript、JavaScript、MJS 与 YAML 脚本。每个模块必须以至少两句结合实际职责的完整中文说明开头；守卫同时拒绝旧五段式模板、纯英文说明、重复说明句和整段复用。`resources/fuse.min.js` 等第三方代码以及 ESLint、TypeScript、覆盖率等机器指令不在中文改写范围内。

图标维护流程：

```bash
node scripts/icons/build-curated-list.js
node scripts/icons/download-extra-icons.js
node scripts/icons/generate-icon-dictionary.js
npm run verify:icons
```

发布前应通过 `npm run check:release`。扩展包只包含 `out`、`resources`、`package.nls*.json`、13 种语言的 `README`、中英文 `CHANGELOG`、`LICENSE` 和 `docs/legal` 下的第三方声明与许可证。扩展内“查看使用说明”会按照当前 VS Code 语言打开对应 README，未知的非中文语言回退英文。发布工具 `@vscode/vsce` 固定在开发依赖和 lockfile 中，全部 GitHub Actions 固定到完整提交 SHA。Release 只接受属于 `main` 历史的注解标签；工作流在远端 runner 临时目录生成 VSIX，通过 OIDC 短期令牌发布 Marketplace、核对线上包哈希，并创建仅附带 VSIX 的 GitHub Release，不再提供 SBOM 或 `SHA256SUMS`。仓库不保存长期发布凭据，本地发布准备不保留中间物或产物；完整流程见[发布指南](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.md)。Marketplace Publisher ID 固定为 `realSilasYang`。项目源码使用 MIT 许可证，第三方图标与 Fuse.js 遵循各自许可证。

# Star 历史趋势

<div align="center">
  <a href="https://www.star-history.com/#realSilasYang/CodeBookmark&amp;Date">
    <img src="https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&amp;type=Date" alt="CodeBookmark Star 历史趋势图">
  </a>
</div>
