<div align="center">
  <img src="./resources/bookmark_logo.png" width="112" height="112" alt="CodeBookmark Logo">

  <h1>代码书签（CodeBookmark）</h1>

  <p><strong>可分层、可拖拽，并能随文件移动自动恢复的 VS Code 源码书签</strong></p>

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

代码书签（CodeBookmark）是一个面向源码导航的 VS Code 扩展：它把普通书签组织成可拖拽的层级树，在文件移动或改名后自动恢复绑定，并提供自动代码标记、导入导出、撤销重做、图标和 AI 辅助。

# 界面概览

[![代码书签界面概览](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

左侧“代码书签”面板按文件和父子层级集中展示书签，语义图标帮助快速识别代码作用；点击任意书签，即可在右侧编辑器中定位对应的代码位置。

---
**[用户使用指南](#用户使用指南)**<br>
[安装扩展](#安装扩展) · [初次使用](#1-初次使用) · [快捷键与基本操作](#2-快捷键与基本操作) · [层级、拖拽、固定容器与排序](#3-层级拖拽固定容器与排序) · [搜索、行内标签与图标](#4-搜索行内标签与图标) · [TODO、FIXME、BUG 自动书签](#5-todofixmebug-自动书签)<br>
[文件移动、改名与失效恢复](#6-文件移动改名与失效恢复) · [导入与导出](#7-导入与导出) · [AI 辅助](#8-ai-辅助) · [撤销、重做与故障处理](#9-撤销重做与故障处理) · [设置一览](#10-设置一览)

**[开发者指南](#开发者指南)**<br>
[目录结构与生成边界](#1-目录结构与生成边界) · [激活流程与视图状态](#2-激活流程与视图状态) · [模型与树结构](#3-模型与树结构) · [持久化布局与脚本身份](#4-持久化布局与脚本身份)<br>
[文件事件、转移日志与存储根切换](#5-文件事件转移日志与存储根切换) · [保存队列、外部编辑与原子写入](#6-保存队列外部编辑与原子写入) · [源码位置追随](#7-源码位置追随) · [撤销设计](#8-撤销设计)<br>
[AI 协议与安全边界](#9-ai-协议与安全边界) · [自动标记与语言配置](#10-自动标记与语言配置) · [图标系统与 Webview](#11-图标系统与-webview) · [构建、测试与发布](#12-构建测试与发布)


<br>

# 用户使用指南

## 安装扩展

### 🛍️ 从 VS Code Marketplace 安装

在 VS Code 扩展面板中搜索 `CodeBookmark`，确认发布者为 `realSilasYang` 后点击“安装”。扩展要求 VS Code `1.125.0` 或更高版本。

### 📦 从 VSIX 安装

从 GitHub Releases 下载发布的 `.vsix` 文件，在 VS Code 中执行“扩展：从 VSIX 安装…”，或在终端运行：

```bash
code --install-extension codebookmark-1.0.1.vsix
```

### 🧑‍💻 从源码运行

安装 Node.js 24 和 VS Code 后，在项目目录执行 `npm ci` 与 `npm run compile`，再按 `F5` 启动扩展开发宿主。完整的构建和测试命令见[开发者指南](#开发者指南)。

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
| 让新书签自动归入某个节点 | 右键普通书签，选择“设为当前文件的新书签容器”。之后在同一文件中新建的书签都会放入该节点；当前作用域同时只能有一个固定容器，再次执行可取消 |
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

扩展会读取 VS Code 内置语言以及已安装语言扩展提供的注释规则。语言扩展被安装、卸载、启用或停用后，识别规则也会随之刷新。

只有真正位于行注释或块注释中的标记才会被识别。字符串、普通标识符，以及不支持注释的 JSON 都不会误生成自动书签；同一行可以识别多个不同标记。

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

### 📄 导入单个脚本

当前脚本还没有书签时，可在空视图中选择“导入书签配置文件”，把一份 CodeBookmark JSON 明确绑定到这个脚本。

### 📁 导入整个工作区

当前窗口处于工作区模式时，文件选择器还允许选择整个配置文件夹。扩展会递归读取导出的 `*.codebookmark.json`，按照配置文件的相对目录映射到当前工作区源码；如果选择的是全局存储中的 `scripts` 目录，也能批量识别其中源码路径仍位于当前工作区的有效脚本配置（配置信封）。多根工作区会先要求选择目标根目录。

导入配置记录的源码哈希与当前文件不同时，扩展会先确认是否继续。脚本身份或书签身份与现有数据冲突时，会生成新的身份并合并数据，避免覆盖其他配置。

### 📤 导出当前书签作用域

面板中的“更多 → 导出书签为…”提供以下格式：

| 格式 | 结果 |
| --- | --- |
| Markdown | 按文件和层级输出标签、行号、状态与代码内容 |
| HTML | 可打印的响应式表格，支持浅色/深色显示 |
| CSV | 带 UTF-8 BOM，包含文件、行列、层级、状态、标签和代码内容，并防止表格公式注入 |
| 纯文本 | 适合直接阅读或粘贴的缩进文本 |
| 配置源文件 | 将当前作用域内每个脚本的 JSON 配置分别格式化导出 |

Markdown、HTML、CSV 和纯文本的普通导出，会把当前显示范围（工作区或单个脚本）内的书签汇总为一个便于阅读的文件。“配置源文件”则会先等待所有书签保存任务（保存队列）完成，再把每个脚本的 JSON 配置分别导出到一个带时间戳的目录。

### 🗃️ 按源文件批量导出

需要逐文件导出时，使用“批量导出当前文件夹下…”。它会从当前活动脚本所在目录开始递归查找，只处理其中已有书签的文件，并为每个源文件分别生成所选格式；原有相对目录结构会保留，所有结果不会合并成一个总文件。

## 8. AI 辅助

### 🔌 配置 AI 连接

使用 AI 功能前，可从面板顶部的 AI 菜单选择“AI 配置”，直接打开对应设置：

| 设置 | 填写内容 |
| --- | --- |
| `codebookmark.AI.endpoint` | 完整的 HTTP/HTTPS 接口地址 |
| `codebookmark.AI.apiKey` | API Key，会以明文保存在 VS Code 的 `settings.json` 或对应工作区设置中 |
| `codebookmark.AI.model` | 模型名称 |
| `codebookmark.AI.assignIcons` | 默认开启；让 AI 在生成书签后选择书签图标 |

远程接口建议始终使用 HTTPS。对于非本机的 `http://` 地址，扩展会在以 Bearer 方式发送 API Key 前弹出确认窗口；localhost HTTP 可以用于本地模型服务。配置完成后，可点击模型名称设置项中的“验证 AI 连接”来单独验证 Endpoint、Model 和 API Key。

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

修改 `globalStoragePath` 后，扩展会先把旧目录中等待保存的数据全部写完，再将 `scripts`、`scopes` 和恢复日志合并到新目录。目标目录中不同的数据会保留为备份或冲突副本；如果转移失败，扩展会继续使用来源目录，而来源目录本身也会始终保留为备份。

## 10. 设置一览

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `codebookmark.globalStoragePath` | 空 | 必填；用于保存全部书签配置的绝对目录 |
| `codebookmark.defaultExpandLevel` | `3` | 展开按钮要展开到的层级；`0` 表示全部 |
| `codebookmark.autoSpace` | `true` | 自动调整中英文/数字间距 |
| `codebookmark.inlineLabel` | `true` | 在光标行末显示书签标签 |
| `codebookmark.AI.endpoint` | 空 | 完整的 AI 接口地址 |
| `codebookmark.AI.apiKey` | 空 | AI API Key，明文保存在 VS Code 设置中 |
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
│  ├─ CONTRIBUTING.md               贡献流程与验证要求
│  ├─ SECURITY.md                   漏洞报告策略
│  └─ SUPPORT.md                    使用支持与问题分类
├─ docs/
│  ├─ images/                       README 界面截图
│  └─ RELEASING.md                  维护者发布指南
├─ src/
│  ├─ extension.ts                  扩展同步激活入口
│  ├─ commands/                     命令注册、导航与导出
│  ├─ config/                       配置读取、缓存和存储目录校验
│  ├─ models/                       Bookmark、BookmarkSet、排序状态
│  ├─ providers/                    树视图、交互编排、保存队列、AI 与撤销
│  ├─ repository/                   脚本配置、移动恢复、存储目录转移
│  ├─ subscriptions/                编辑器、文件系统和配置事件适配
│  └─ util/                         身份、路径、指纹、AI、自动标记和图标工具
├─ scripts/
│  ├─ verify-*.js                   模块级回归与架构约束
│  ├─ verify-all.js                 专项验证统一入口
│  └─ icon_tools/                   图标清单、下载与字典生成
├─ integration-tests/               VS Code Extension Host 集成测试
├─ resources/                       扩展图标、图标字典、Fuse 与自定义 SVG
├─ THIRD_PARTY_LICENSES/            随扩展分发的第三方许可证全文
├─ generate-package-json.js         从编译后的常量生成扩展清单
├─ package.json                     生成结果，不是命令清单的唯一事实源
├─ CHANGELOG.md                     版本变化记录
└─ THIRD_PARTY_NOTICES.md           内置图标、Fuse.js 的来源与署名
```

`out/`、`.vscode-test/` 和 `node_modules/` 都是生成或依赖目录，不应手工修改。扩展元数据和 npm 脚本定义在 `src/util/constants/BasePackage.ts`；命令、菜单、快捷键、设置和子菜单定义在 `src/util/constants/Commands.ts`；颜色定义在 `Colors.ts`。`npm run compile` 会先清理 `out/`、编译 TypeScript，再重新生成 `package.json`。

## 2. 激活流程与视图状态

`activate()` 必须同步完成命令、TreeView、订阅器和 UndoManager 的注册，随后把磁盘读取交给 Provider 后台执行，避免慢磁盘让 VS Code 激活超时。AI API Key 由 `ExtensionConfig` 从 VS Code 配置读取，不参与扩展激活时的独立存储初始化。

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

`BookmarkSet` 负责身份去重、父子查询、同文件拖拽、防循环、固定容器、路径批量改写和重复文件节点合并。跨文件拖拽在 Provider 层拒绝，以保持“一份脚本配置只拥有一个脚本的数据”这一边界。

## 4. 持久化布局与脚本身份

```text
<globalStoragePath>/
├─ scripts/
│  └─ <scriptId>.json
├─ scopes/
│  └─ <工作区名_路径哈希>/
│     └─ _workspace_order.json
├─ .script-relocations/
│  └─ <operationId>.json
└─ .storage-transfer.json
```

脚本信封结构为 `{ script, bookmarks }`。`script` 保存 `id`、绝对 `path`、最近确认时间、可选的失联时间/排序位置和源码指纹；`bookmarks` 只保存该脚本的书签树。工作区目录不再保存书签副本，只保存视图顺序，因此同一脚本从工作区打开或独立打开都命中 `scripts/<scriptId>.json`。

工作区空视图的单文件导入仍以当前活动脚本为目标；工作区文件夹导入优先把所选目录中的 `*.codebookmark.json` 去掉后缀作为源码相对路径，并拼接到选定工作区根目录；若是原始 `scripts` 目录，则使用信封中的绝对脚本路径，但只接受仍位于该工作区的路径。导入前会验证配置结构和目标源码，指纹不一致时对整个批次统一确认；成功文件作为一次撤销操作提交，损坏配置、缺失源码和单个写入失败会分别计数，不影响其他候选继续导入。

脚本、书签和转移操作的身份均由 128 位加密安全随机数生成，并以固定的五段十六进制文本表示；格式不携带版本或设备含义。`isScriptId()` 只校验这一稳定格式。

源码指纹的 SHA-256 和大小来自流式读取，设备号与 inode 只在文件系统提供时记录。Repository 会先在相同大小的候选中计算 SHA-256；唯一的完整哈希匹配可以直接确认。没有唯一哈希匹配时，设备号和 inode、文件名、扩展名会用于排列候选，最多读取 20 个书签内容或前后文锚点进行评分；最高分仍有并列时，不会静默绑定。

工作区候选扫描上限为 50,000 个目录项；锚点兜底只读取不超过 16 MiB 的候选文件。文件大小是哈希筛选索引，设备身份也是快捷证据；二者都不是跨设备恢复的必要条件。

## 5. 文件事件、转移日志与存储根切换

`fileEditorSubscriber` 处理文档编辑、打开、创建、重命名、删除、活动编辑器、工作区目录和设置变化。源码创建由 VS Code 文件事件与工作区文件监视器双通道覆盖，适配只产生 create 事件的外部移动工具。

原生 rename 会先写 `.script-relocations/<operationId>.json`，再重绑所有受影响信封并更新工作区顺序，最后删除日志。下次启动会检查未完成日志；若旧路径重新出现而新路径不存在，还可反向完成恢复。delete 会为受影响脚本统一写入失联标记（包括只含自动标记的配置），内存视图再清理当前路径节点；后续 create/reconcile 仍可按指纹和锚点恢复。

存储根切换由 `StorageRootTransfer` 串行执行：先刷新来源保存队列，再逐文件复制或合并。相同脚本身份按 `lastSeenAt` 选择主数据并保留无重复书签；同身份冲突会重写书签身份；无法语义合并的文件保存为带内容哈希的冲突副本。真实路径检查阻止来源和目标通过符号链接或目录联接互相包含。

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

`AIService` 向用户配置的完整 Endpoint 发送 `POST` JSON：`model`、`messages` 和固定低温度；鉴权使用 `Authorization: Bearer`。响应读取 OpenAI Chat Completions 风格的 `choices[0].message.content` 或 `text`，内容可以是字符串或文本分片。

生成协议只允许 `label`、`lineNumber`、`anchor`、受控 `icon` 语义键和 `children`；优化协议只允许已提供的 `id`，以及可选的 `new_label` 或 `icon`。运行时契约追加在用户自定义提示词之后，并明确把源码、文件名、标签和身份当作数据，降低提示注入影响。解析后还会执行字段白名单、图标键白名单、数量 300、层级 8、标签长度 120、锚点逐行定位和允许身份集合校验。

源码读取采用读取前后 stat 快照；网络返回后再次验证源码内容/版本、书签 JSON 快照和存储作用域。只有三者都未变化才应用结果。覆盖生成只删除手动书签，自动代码标记保持受保护并占用其源码行。

网络层限制请求/响应字节数、声明长度、分块累计长度、超时和取消；大响应等待用户确认时会暂停响应流和连接空闲计时，但一次请求的绝对总时限仍会继续计算。401/403、429 和连续失败由文件夹批处理分类熔断。

## 10. 自动标记与语言配置

`LanguageCommentProfileRegistry` 遍历已安装扩展的 `contributes.languages`，安全解析带注释和尾逗号的语言配置文件，合并同一语言分散声明的扩展名、文件名、文件模式和注释语法。单个配置最大 512 KiB，最多读取 4,096 个语言贡献，并以最多 8 个并发任务加载。

`CodeMarkerScanner` 是轻量词法扫描器，跟踪行注释、块注释、普通字符串、持久引号和部分语言的多行字符串；内置规则为动态配置读取失败时的兜底。`CodeMarkerBookmarks` 负责稳定复用原身份、保留用户标签/图标、提升手动子节点、清理消失标记和维持自动节点前缀。

工作区后台扫描最多发现 2,000 个文件，默认跳过超过 2 MiB 的未打开文件，并使用 4 个并发读取任务。打开文档使用内存内容，不受后台文件大小限制，但仍受单配置 10,000 节点上限约束。

## 11. 图标系统与 Webview

`scripts/icon_tools/build-curated-list.js` 从明确的 Iconify 集合和语义概念生成下载清单；输出文件名使用来源身份后缀，如 `_fluent`、`_twitter`、`_google_noto`、`_mozilla`、`_vscode`。`download-extra-icons.js` 只接受 HTTPS、限制重定向和响应大小，并拒绝脚本、外部引用和事件处理器。`generate-icon-dictionary.js` 将磁盘 SVG 与中英文语义词合并并要求每个图标具有足够的中文关键词。

IconPicker Webview 对字典字段和图标名做白名单校验，使用 CSP 与随机 nonce，不生成内联事件属性。字典异步缓存；分类每页渲染 160 项，滚动继续加载，搜索最多返回 200 项，避免约 1,500 个图标一次性创建全部 DOM。

第三方图标集合、作者与许可证见 `THIRD_PARTY_NOTICES.md`。生成或下载图标后必须重新生成字典并运行图标验证。

## 12. 构建、测试与发布

```bash
npm ci
npm run compile
npm run verify
npm run test:integration
npm audit
npm run package:list
npm run package:vsix
```

- `npm run compile`：清理 `out/`、严格编译 TypeScript、生成 `package.json`。
- `npm run lint`：检查 `src/**/*.ts`、清单生成器和全部 `scripts/**/*.js`。
- `npm run verify`：依次执行 compile、lint 和全部 `verify-*.js` 专项验证。
- `npm run test:integration`：编译后启动隔离的 VS Code Extension Host，验证真实激活、命令注册、配置和文件打开。
- `npm run verify:icons`：单独核对 SVG 文件名、安全内容和字典一一对应。
- `npm run package:list`：使用固定版本的 VS Code 官方打包工具预览 VSIX 文件清单。
- `npm run package:vsix`：编译并生成可安装的 VSIX；可通过 `-- --out <文件名>` 指定输出路径。
- `npm run check:release`：依次执行全量验证、扩展宿主集成测试、依赖审计和打包清单检查。

当前专项验证覆盖激活时序、AI 协议/密钥/大小/取消、自动标记、导入导出、命令清单、存储根转移、移动重连、外部配置、保存队列、作用域、撤销、视图切换和图标资源。新增行为应优先补到对应 `verify-*.js`；涉及 VS Code API 生命周期的行为再补集成测试。

图标维护流程：

```bash
node scripts/icon_tools/build-curated-list.js
node scripts/icon_tools/download-extra-icons.js
node scripts/icon_tools/generate-icon-dictionary.js
npm run verify:icons
```

发布前应通过 `npm run check:release`。扩展包只包含 `out`、`resources`、`README.md`、`CHANGELOG.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md` 与 `THIRD_PARTY_LICENSES`。推送版本标签后，Release 工作流会通过 GitHub OIDC 与 Microsoft Entra ID 的短期令牌，用同一个 VSIX 依次发布 Marketplace 和 GitHub Release，仓库不保存长期发布凭据；身份配置、失败重跑与完整发布步骤见 [发布指南](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/RELEASING.md)。Marketplace Publisher ID 已固定为 `realSilasYang`，并由发布工作流核对，后续版本不应修改。项目源码使用 MIT 许可证，第三方图标与 Fuse.js 遵循各自许可证。

# Star 历史趋势

<div align="center">
  <a href="https://www.star-history.com/#realSilasYang/CodeBookmark&amp;Date">
    <img src="https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&amp;type=Date" alt="CodeBookmark Star 历史趋势图">
  </a>
</div>
