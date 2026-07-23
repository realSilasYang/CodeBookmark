<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="CodeBookmark Logo">

  <p><a href="../README.md">简体中文</a> · <strong>English</strong></p>

  <h1>CodeBookmark</h1>

  <p><strong>A sticky engine keeps bookmarks bound to scripts and accurately follows code, with AI assistance, rich bookmark icons, and local storage</strong></p>

  <p>
    <a href="https://github.com/realSilasYang/CodeBookmark/releases"><img src="https://img.shields.io/github/v/release/realSilasYang/CodeBookmark?style=flat-square&amp;label=version" alt="Latest release"></a>
    <a href="https://github.com/realSilasYang/CodeBookmark/releases"><img src="https://img.shields.io/github/downloads/realSilasYang/CodeBookmark/total?style=flat-square&amp;label=downloads" alt="GitHub downloads"></a>
    <a href="https://github.com/realSilasYang/CodeBookmark/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/realSilasYang/CodeBookmark/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI status"></a>
    <a href="../LICENSE"><img src="https://img.shields.io/github/license/realSilasYang/CodeBookmark?style=flat-square" alt="License"></a>
    <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.125.0-007ACC?style=flat-square" alt="Required VS Code version"></a>
  </p>

  <p>
    <a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> ·
    <a href="#interface-overview">Interface</a> ·
    <a href="#user-guide">User Guide</a> ·
    <a href="https://github.com/realSilasYang/CodeBookmark/releases">Releases</a> ·
    <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">Issues</a>
  </p>
</div>

CodeBookmark is a VS Code extension for marking and navigating code with bookmarks. Its sticky engine keeps bookmark configurations bound to scripts and relocates bookmarks after code edits, file renames, folder moves, and workspace path changes. Bookmark configurations stay in a local folder you choose. AI can generate bookmarks from code semantics, improve labels, and select bookmark icons. Hierarchical organization, drag-and-drop ordering, automatic code markers, import and export, and undo/redo support everyday management.

# Interface Overview

[![CodeBookmark interface overview](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

The Code Bookmarks panel on the left shows bookmarks bound to scripts, their hierarchy, and semantic icons. Select any bookmark to reveal the corresponding code in the editor. After code changes, script renames, or folder moves, the sticky engine continues tracking and restores the location.

---
**[User Guide](#user-guide)**<br>
[Install](#install) · [Getting Started](#1-getting-started) · [Keyboard Shortcuts and Basics](#2-keyboard-shortcuts-and-basics) · [Hierarchy, Drag and Drop, Containers, and Sorting](#3-hierarchy-drag-and-drop-containers-and-sorting) · [Search, Inline Labels, and Icons](#4-search-inline-labels-and-icons) · [Automatic TODO, FIXME, and BUG Bookmarks](#5-automatic-todo-fixme-and-bug-bookmarks)<br>
[Moves, Renames, and Recovery](#6-moves-renames-and-recovery) · [Import and Export](#7-import-and-export) · [AI Assistance](#8-ai-assistance) · [Undo, Redo, and Failure Handling](#9-undo-redo-and-failure-handling) · [Settings Reference](#10-settings-reference)

**[Developer Guide](#developer-guide)**<br>
[Repository Structure and Generated Boundaries](#1-repository-structure-and-generated-boundaries) · [Activation and View State](#2-activation-and-view-state) · [Model and Tree Structure](#3-model-and-tree-structure) · [Persistence and Script Identity](#4-persistence-and-script-identity)<br>
[File Events, Relocation Journals, and Storage Transfers](#5-file-events-relocation-journals-and-storage-transfers) · [Save Queue, External Edits, and Atomic Writes](#6-save-queue-external-edits-and-atomic-writes) · [Following Source Positions](#7-following-source-positions) · [Undo Design](#8-undo-design)<br>
[AI Protocols and Security Boundaries](#9-ai-protocols-and-security-boundaries) · [Automatic Markers and Language Configuration](#10-automatic-markers-and-language-configuration) · [Icon System and Webviews](#11-icon-system-and-webviews) · [Build, Test, and Release](#12-build-test-and-release)

<br>

# User Guide

## Install

### 🛍️ Install from VS Code Marketplace

Open the [CodeBookmark page on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark) directly, select Install, and let VS Code complete the installation. The publisher should be `realSilasYang`. The extension requires VS Code `1.125.0` or later; update from the [official VS Code download page](https://code.visualstudio.com/download) if needed.

### 📦 Install from a VSIX

Open the [latest CodeBookmark release](https://github.com/realSilasYang/CodeBookmark/releases/latest) and download `codebookmark-version.vsix` from Assets. Then run "Extensions: Install from VSIX..." in VS Code and select the downloaded file, or use:

```bash
code --install-extension "/path/to/codebookmark-version.vsix"
```

### 🧑‍💻 Run from source

Install [Node.js 24](https://nodejs.org/en/download) and [VS Code](https://code.visualstudio.com/download), then obtain the source from the [CodeBookmark repository](https://github.com/realSilasYang/CodeBookmark). In the project folder, run `npm ci` and `npm run compile`, then press `F5` to start an Extension Development Host. See the [Developer Guide](#developer-guide) for the complete build and test workflow.

## 1. Getting Started

### ⚙️ Complete the initial setup

Before first use, tell the extension where to store bookmark configurations:

1. Install and enable the extension, then open a local script or workspace.
2. Open VS Code Settings and search for `CodeBookmark`.
3. Set the required `codebookmark.globalStoragePath`. It must be an absolute folder path and may include `~` or `%ENVIRONMENT_VARIABLE%`. The extension creates the folder if it does not exist.
4. Press `Alt+B` to open and focus the Code Bookmarks panel, or select its bookmark icon in the Activity Bar.

### 💾 Understand storage and view scope

All bookmark data is stored in the folder you selected. It is not written into the source project.

When a workspace is open, the panel shows every bookmarked file in that workspace. When only one script is open, it shows bookmarks for that script. Both modes read the same script configuration, so they do not duplicate or fork the data.

## 2. Keyboard Shortcuts and Basics

### ⌨️ Use common shortcuts

| Shortcut | Context | Action |
| --- | --- | --- |
| `Ctrl+B` | Editor | Toggle a bookmark on the current line; with multiple cursors, add or remove one per line |
| `Ctrl+Alt+Shift+B` | Editor | Force-add a bookmark even if the line already has one |
| `Ctrl+Alt+Shift+D` | Editor | Delete ordinary bookmarks on the current line |
| `Alt+B` | Global | Open and focus the Code Bookmarks panel |
| `F2` | Bookmark tree | Rename the current bookmark; supports batch editing of a selection |
| `Delete` | Bookmark tree | Delete selected bookmarks; supports multiple selection |

### 📝 What is recorded when you add a bookmark

With one cursor, the extension asks you to confirm the label. With multiple cursors, it creates batch labels separated by `│`. If the editor has a selection, the bookmark records the selected content; otherwise it records the full cursor line. An empty label is not saved.

### 🔧 Open or repair a bookmark

Selecting a bookmark opens its file and selects the recorded location. If the original location can no longer be identified, the bookmark shows a warning icon. Move the cursor to the correct location and use Edit Bookmark to bind it again, optionally changing the label at the same time.

## 3. Hierarchy, Drag and Drop, Containers, and Sorting

### 🧩 Change hierarchy and order

Bookmarks can form parent-child hierarchies instead of a single flat list:

| Goal | Operation and rules |
| --- | --- |
| Change bookmark order or hierarchy | Drag bookmarks within the same file. A parent cannot be moved into its own child, and bookmarks cannot be dragged across files |
| Change file display order | Select and drag file nodes in a workspace. The order is stored in the workspace view configuration. Dragging while a time or position sort is active switches back to Custom Order |
| Put new bookmarks under a node automatically | Right-click an ordinary bookmark and choose "Use as New Bookmark Container for Current File." New bookmarks in the same file are added below it. A scope can have only one pinned container; run the action again to unset it |
| Delete a bookmark with children | Delete the entire subtree, or delete only the current node and promote its children to the parent |
| Change sorting | Sort Mode supports custom order, creation time ascending/descending, and source position ascending/descending. Time and position sorting only affect the view and never overwrite the custom order |

### 📂 Control expansion depth

The expand/collapse button uses `codebookmark.defaultExpandLevel`. The default `3` expands the first three levels; `0` expands every level. Each node's expanded state is stored with its bookmark configuration.

## 4. Search, Inline Labels, and Icons

### 🔍 Find and identify bookmarks quickly

| Feature | Usage and behavior |
| --- | --- |
| Search current file | Filter bookmarks in the current script by label, line number, or code content, then select a result to jump to it |
| Inline labels | `codebookmark.inlineLabel` is enabled by default. When the cursor line has a valid bookmark, the first bookmark label on that line appears as ghost text at the line end |
| Automatic spacing | `codebookmark.autoSpace` is enabled by default and inserts spacing between Chinese text and Latin letters or numbers |
| Custom icons | Right-click a bookmark to open the icon picker. Icons are grouped into Code Status, Architecture, UI Resources, Fun Tags, and Brand Logos, with bilingual fuzzy search, paged loading, and recently used icons |
| AI semantic icons | `codebookmark.AI.assignIcons` is enabled by default. The extension uses a curated set of high-signal semantic icons only when the bookmark label explicitly matches and passes conflict checks. Ambiguous meanings keep the default icon. When improving existing bookmarks, AI only changes bookmarks that still use a default icon and never overwrites a manually selected icon |
| Default icons | An ordinary bookmark's default icon depends on its level and whether it has children. Automatic code markers use a yellow lightbulb by default. After customization, Restore Default Icon is always available |

## 5. Automatic TODO, FIXME, and BUG Bookmarks

Without any AI connection, the extension can display `TODO`, `FIXME`, and `BUG` source comments as bookmarks.

### 🔎 What is recognized

The extension reads comment rules contributed by built-in VS Code languages and installed language extensions. Rules refresh when language extensions are installed, removed, enabled, or disabled.

Only markers inside actual line or block comments are recognized. Strings, ordinary identifiers, and JSON without comment support do not create false automatic bookmarks. One line may contain several distinct markers.

### 📌 How automatic bookmarks are displayed and stored

Automatic and ordinary bookmarks use the same persistence structure. Both record path, position, and surrounding context anchors, and automatic bookmarks always appear before manual bookmarks in a file. At most `5,000` automatic markers are synchronized per file, and one script configuration can contain at most `10,000` bookmark nodes.

### ✏️ What can be edited

You may customize an automatic bookmark's label and icon; those choices remain after the source position moves. The source owns the automatic bookmark itself, so it cannot be deleted manually. Remove the source marker to remove the bookmark. Manual children below a removed automatic bookmark are promoted and preserved.

### 🗂️ When a workspace is scanned

On initial workspace load, the extension scans source files in the background and excludes dependency, build, cache, editor-history, and version-control folders. Files not found by the background scan are synchronized when opened, created, or edited.

## 6. Moves, Renames, and Recovery

### 🧭 Why bookmarks survive a move

Every bookmarked script receives an independent, long-lived random identity. To recover a binding after a script or folder is moved or renamed, after changing devices, or after changing file contents, the configuration also records the absolute source path, file-system identity, SHA-256 content hash, file size, bookmarked code, and surrounding context anchors.

These values are layered clues, not a set of fields that must all match. Recovery proceeds as follows:

1. **Move on the same device:** the device number and file-system inode prioritize candidate files for inspection, but never decide the binding by themselves.
2. **Unchanged file content:** a unique full SHA-256 match confirms the file. Size is used only to narrow the candidates that need hashing.
3. **New device or changed content:** even if name, content, and size all changed, bookmark code and surrounding anchors are scored together with file name and extension to find a sufficiently reliable new location.
4. **Several similar candidates:** automatic recovery occurs only when one candidate uniquely meets the confidence requirements. If several configurations or files are equally credible, binding is deferred and the user is notified. Loading never opens a blocking chooser or silently binds to the wrong object.

### 🚚 Supported move patterns

The same recovery path handles native VS Code file or folder renames, delete-then-create events from external tools, move events that only report a destination folder, and complete workspace-root renames. Recovery updates the on-disk configuration, current bookmark tree, file display order, and relevant undo history together. A recovery journal is written before transfer starts, so a later activation can finish an interrupted operation after an Extension Host exit.

### 🗑️ What happens after a script is deleted

The configuration remains as a recoverable record, including configurations containing only automatic markers. If an external move tool represents one move as "delete + create," the later matching script can reconnect automatically instead of losing identity evidence when the delete arrives first.

## 7. Import and Export

### 📄 Import one script

When the current script has no bookmarks, choose Import Bookmark Configuration from the empty view to explicitly bind one CodeBookmark JSON file to that script.

### 📁 Import a workspace

In workspace mode, the picker also accepts an entire configuration folder. The extension recursively reads exported `*.codebookmark.json` files and maps their relative directories to source files in the current workspace. If the selected folder is a global storage `scripts` directory, it can batch-recognize valid script envelopes whose source paths still belong to the workspace. A multi-root workspace asks for the destination root first.

If an imported source hash differs from the current file, the extension asks whether to continue. When script or bookmark identities conflict with existing data, new identities are generated and data is merged instead of overwriting another configuration.

### 📤 Export the current bookmark scope

More > Export Bookmarks As... provides:

| Format | Result |
| --- | --- |
| Markdown | Labels, line numbers, status, and code grouped by file and hierarchy |
| HTML | A printable responsive table that supports light and dark color schemes |
| CSV | UTF-8 with BOM; includes file, line, column, level, status, label, and code, with spreadsheet formula-injection protection |
| Plain Text | Indented text for direct reading or pasting |
| Configuration Source | Pretty-printed JSON configuration for every script in the current scope, kept as separate files |

Ordinary Markdown, HTML, CSV, and Plain Text export combines the visible scope, either the workspace or one script, into one readable file. Configuration Source waits for the complete save queue, then exports each script's JSON to a timestamped folder.

### 🗃️ Batch export by source file

Use Batch Export Current Folder As... for one output file per source file. Starting at the active script's folder, it searches recursively and processes only files that already have bookmarks. The original relative directory layout is preserved, and outputs are never merged into one aggregate file.

### 🗂️ Manage every configuration file

Open More > Manage Bookmark Configurations to inspect every record in the global storage folder, independent of the current workspace or active script. The interface distinguishes:

- **Script bookmark configurations:** script path, binding health, configuration role, total and per-level bookmark counts, automatic or invalid counts, binding update time, file modification time, and size. Primary configurations, transfer backups, conflict copies, superseded files, and damaged files are identified separately.
- **Workspace order records:** workspace name, path hash, ordered script paths, and item count. These records only restore file display order and contain no bookmarks.
- **Storage transfer journals:** transfer state, old and new folders, start and completion times, and copied, merged, and conflicting file counts. They describe the latest storage-folder transfer only.

The page supports unified search, filtering, sorting, and multi-selection. Existing scripts can be opened from script records, and every record can be revealed in the file explorer. Before deletion, the extension explains the impact by selected type and asks again. Deleting a script configuration directly deletes its bookmarks and cannot be undone through bookmark undo. Removing a workspace order resets that workspace's custom file order without deleting bookmarks. Removing a transfer journal does not affect current bookmarks or storage. After confirmation, pending saves finish first and every file revision is rechecked; files changed by another program are skipped to prevent deleting newer content. The manager and current bookmark tree reload from disk when the operation completes.

## 8. AI Assistance

### 🔌 Configure an AI connection

Before using AI, choose AI Settings from the panel's AI menu:

| Setting | Value |
| --- | --- |
| `codebookmark.AI.address` | AI address. Enter a resource endpoint, API base URL, or complete request URL; the extension detects and completes it |
| `codebookmark.AI.APIKey` | API key required by the service. Local services without authentication may leave it empty. A value is stored in plain text in VS Code `settings.json` or the selected workspace settings |
| `codebookmark.AI.model` | Model name; for Azure v1, enter the deployment name |
| `codebookmark.AI.assignIcons` | Enabled by default; lets AI choose icons after generating bookmarks |

Common address forms can be entered directly:

| Address form | Examples | Handling |
| --- | --- | --- |
| OpenAI or compatible domain / API base URL | `api.openai.com`, `https://openrouter.ai/api/v1`, `http://127.0.0.1:1234/v1` | Completes Chat Completions. Other same-origin compatible paths or Responses are tried only when the server explicitly reports a missing route |
| Complete Chat Completions / Responses URL | `https://api.openai.com/v1/chat/completions`, `https://api.openai.com/v1/responses` | Preserves the explicit protocol and does not rewrite it to another one |
| Azure OpenAI / Foundry resource endpoint or base URL | `https://resource-name.openai.azure.com`, `https://resource-name.openai.azure.com/openai/v1/` | Recognized as Azure v1 and prefers `/responses`; the model setting must be the deployment name. Complete legacy deployment URLs keep their original API |
| Anthropic Messages | `https://api.anthropic.com` or a complete `/v1/messages` URL | Uses the Messages body, `x-api-key`, and `anthropic-version` |
| Native Gemini or its OpenAI-compatible API | `https://generativelanguage.googleapis.com`, `https://generativelanguage.googleapis.com/v1beta/openai`, or a complete URL | Native addresses complete `models/...:generateContent`; compatible addresses complete `chat/completions`; Vertex AI model paths retain their native form |
| Ollama | `localhost:11434`, `http://remote-host:11434/api`, or a `/v1` base URL | Native addresses complete `/api/chat`; `/v1` uses the OpenAI-compatible format; an API key is optional |

If the scheme is omitted, public domains default to HTTPS while localhost, loopback addresses, and common container host names default to HTTP. Complete request URLs retain their protocol intent. Partial paths ending in `/chat`, `/chat/completion`, `/response`, or a Gemini model path are completed for that protocol without appending a duplicate `chat`. Query parameters are preserved and fragments are removed. HTTPS remains recommended for every remote service. For a non-local HTTP address, the extension asks before transmitting source and credentials. After setup, use Test AI Connection from the model-name setting to verify address, protocol, model, and required credentials. After a successful test, the address setting is replaced with the complete URL that actually worked; a failed or cancelled test leaves the original address unchanged.

### 🎯 Choose generation or improvement scope

| Scope | Available operations |
| --- | --- |
| Current script | Generate when there are no bookmarks, append to existing bookmarks, or regenerate and replace every manual bookmark |
| Current folder | Recursively find supported scripts and apply any of the three generation strategies |
| Improve bookmarks | Improve selected bookmarks, the current script, or bookmarked scripts in the current folder. Labels and semantic icons may change, but positions, hierarchy, identities, and anchors do not |

### ✅ How AI results are validated

During regeneration, source-owned TODO/FIXME/BUG bookmarks remain and continue occupying their source lines so AI cannot create a duplicate ordinary bookmark on the same line. AI may propose only a label, one-based line number, exact source anchor, hierarchy, and controlled semantic icon key. After anchor and icon validation, the extension itself generates identity, path, creation time, selection, and context.

AI uses the latest in-editor content for an open document, including unsaved changes. It reads from disk only when the file is not open. At most `300` bookmarks are sent in one improvement request; larger sets are automatically divided into batches, so later bookmarks are never silently dropped.

### 🛡️ Resource limits and interruption rules

- Source over 512 KiB or a response over 2 MiB requires confirmation. The hard source limit is 8 MiB; request and response hard limits are both 16 MiB.
- A folder scan processes at most 500 supported scripts, 20,000 directory entries, and 64 levels. Dependency, build, cache, and version-control folders are skipped.
- Requests can be cancelled. The default timeout is 60 seconds, configurable from 1 to 600 seconds. It measures absolute total request time, so an endless stream cannot extend it indefinitely. Folder processing stops on authentication failure, rate limiting, or three consecutive request failures.
- If source, bookmarks, or the current scope changes while AI is responding, the stale result is not applied. A folder task queues each successful file for saving immediately, so cancelling midway preserves prior results.

## 9. Undo, Redo, and Failure Handling

### ↩️ What can be undone and redone

Add, toggle, delete, rename, position updates, icon changes, hierarchical dragging, file sorting, import, AI generation or improvement, pinned containers, and clearing invalid bookmarks all support undo and redo. A batch operation occupies one history step, and the toolbar buttons name the next operation directly.

### 🕘 History lifetime

History is isolated by workspace or standalone script and exists only in the current VS Code window session. Each undo and redo stack retains at most `50` snapshots. All scopes share an `8 MiB` budget and at most `64` scopes. Switching files, reloading disk data, or reactivating the Extension Host does not immediately clear history for the same window session.

### 🔄 External changes during saving

Rapid changes are coalesced after a short delay, and the save queue touches only affected scripts. Saving writes a temporary file in the same folder and atomically replaces the original, avoiding partially written configurations. A failed write is retried at most `3` times. When another tool changes a configuration, only affected scripts reload. Pending local changes are regenerated from the latest merged in-memory tree, preserving both sides and preventing an old snapshot from overwriting external work.

### 🗄️ Change the bookmark storage folder

After `globalStoragePath` changes, pending data in the old folder is fully saved before `scripts`, `scopes`, and recovery journals are merged into the new folder. Different destination data is kept as backups or conflict copies. Old CodeBookmark configuration files are deleted only after every write to the new folder succeeds. On transfer or cleanup failure, the extension continues using the old folder and never deletes source data early.

## 10. Settings Reference

| Setting | Default | Description |
| --- | --- | --- |
| `codebookmark.globalStoragePath` | Empty | Required absolute folder for all bookmark configurations |
| `codebookmark.defaultExpandLevel` | `3` | Level reached by Expand; `0` expands all levels |
| `codebookmark.autoSpace` | `true` | Adjust spacing between Chinese text and Latin letters or numbers |
| `codebookmark.inlineLabel` | `true` | Show the bookmark label at the end of the cursor line |
| `codebookmark.AI.address` | Empty | AI address with automatic completion for resource endpoints, API base URLs, Chat Completions, Responses, Anthropic Messages, Gemini generateContent, and Ollama |
| `codebookmark.AI.APIKey` | Empty | API key required by the service, stored in plain text in VS Code settings; optional for unauthenticated local services |
| `codebookmark.AI.model` | Empty | AI model name |
| `codebookmark.AI.assignIcons` | `true` | Let AI choose bookmark icons after generation |
| `codebookmark.AI.timeoutS` | `60` | Absolute total timeout for one request, from 1 to 600 seconds |
| `codebookmark.AI.prompt` | Built-in generation prompt | System prompt for AI bookmark generation |
| `codebookmark.AI.optimizePrompt` | Built-in improvement prompt | System prompt for improving labels and semantic icons |

# Developer Guide

## 1. Repository Structure and Generated Boundaries

```text
CodeBookmark/
|- .github/
|  |- ISSUE_TEMPLATE/               Bilingual issue templates and private security link
|  |- workflows/                    Continuous integration and coordinated release
|  |- CONTRIBUTING.md / .en.md      Contribution workflow and verification requirements
|  |- SECURITY.md / .en.md          Vulnerability reporting policy
|  `- SUPPORT.md / .en.md           Support and issue routing
|- config/
|  |- eslint.config.mjs             Strict ESLint configuration
|  `- tsconfig.json                 TypeScript compiler configuration
|- docs/
|  |- README.en.md                  English project documentation
|  |- CHANGELOG.en.md               English release history
|  |- images/                       README screenshots
|  |- legal/                        Third-party notices and full license texts
|  `- release/                      Bilingual changelog templates and release guides
|- resources/                       Extension assets, icon dictionary, Fuse, and custom SVGs
|- scripts/
|  |- build/                        Cleanup, manifest generation, and runtime bundling
|  |- icons/                        Icon manifest, download, and dictionary generation
|  |- integration/                  Extension Host integration-test launcher
|  |- lib/                          Shared manifest-localization build and verification helpers
|  |- release/                      GitHub Release-notes generation
|  |- verify-*.js                   Module regression and architecture contracts
|  `- verify-all.js                 Unified contract-test entry
|- src/
|  |- extension.ts                  Synchronous extension activation entry
|  |- i18n/                         Runtime Chinese/English language selection
|  |- commands/                     Command registration, navigation, and export
|  |- config/                       Configuration access, caching, and storage validation
|  |- models/                       Bookmark, BookmarkSet, and sorting state
|  |- providers/                    Tree view, manager Webview, save queue, AI, and undo
|  |- repository/                   Script configuration catalog, move recovery, deletion, and storage transfer
|  |- subscriptions/                Editor, file-system, and configuration event adapters
|  `- util/                         Identity, paths, fingerprints, AI, code markers, and icon tools
|- tests/integration/               VS Code Extension Host integration tests
|- .vscode/settings.json            Project file-nesting rules
|- README.md / CHANGELOG.md         Chinese project documentation and release history
|- LICENSE                          Main project license
|- package.json                     Generated output, not the sole command-manifest source
`- package-lock.json                Reproducible npm dependency lock
```

`out/`, `.vscode-test/`, `node_modules/`, and root-level `package.nls*.json` files are generated or dependency content and must not be edited manually. Compilation creates the NLS catalogs next to `package.json` for VS Code and VSIX packaging, but source control ignores them and Explorer nests them under `package.json`. Extension metadata and npm scripts are defined in `src/util/constants/BasePackage.ts`; commands, menus, keybindings, settings, and submenus in `src/util/constants/Commands.ts`; and colors in `Colors.ts`. `npm run compile` cleans `out/`, compiles TypeScript, and regenerates `package.json` plus every `package.nls*.json` catalog. Marketplace does not switch discovery metadata by client locale, so its default title and description are Chinese; after installation, Chinese locales use the Chinese manifest and every officially supported non-Chinese VS Code locale uses the English manifest. Runtime strings use `src/i18n/Localization.ts` with the same Chinese-versus-English rule.

## 2. Activation and View State

`activate()` must synchronously register commands, TreeView, subscribers, and UndoManager, then delegate disk reads to the Provider in the background so slow storage cannot time out VS Code activation. `ExtensionConfig` reads the AI API key from VS Code configuration; it has no separate activation-time secret store.

```text
extension.activate
  -> create CodeBookmarksViewProvider
  -> register TreeView, commands, and file events
  -> Provider prepares the target scope in the background
  -> Repository reads and recovers script configurations
  -> FileUtils relocates bookmark content
  -> commit BookmarkSet once
  -> publish tree changes and VS Code context keys
```

View switching uses generations, AbortSignal, and a serialized preparation queue to discard stale requests. The old tree remains until the new one is complete. After commit, context keys and tree events are ordered according to empty-to-populated, populated-to-empty, or unchanged content, avoiding flashes between welcome text, buttons, and tree content. When visible, the tree also waits for its first item request, with a 1.5-second ceiling.

## 3. Model and Tree Structure

`Bookmark` is both a persisted entity and a `TreeItem`. An ordinary node stores random identity, creation time, label, script path, selection, source content, before/after anchors, icon, expanded/pinned state, children, and optional automatic-marker metadata. A file node is only a script container; it additionally owns `scriptId` and never participates in source-content relocation.

`Bookmark.fromJSON()` strictly validates types, position ranges, collapsible state, and marker metadata. Maximum depth is 64 and maximum node count is 10,000. One damaged bookmark can be skipped, while a damaged script envelope never enters the index.

`BookmarkSet` owns identity deduplication, parent-child lookup, same-file dragging, cycle prevention, pinned containers, bulk path rewriting, and duplicate file-node merging. The Provider rejects cross-file bookmark dragging to preserve the boundary that one script configuration owns data for one script only.

## 4. Persistence and Script Identity

```text
<globalStoragePath>/
|- scripts/
|  `- <scriptId>.json
|- scopes/
|  `- <workspace-name_path-hash>/
|     `- _workspace_order.json
|- .script-relocations/
|  `- <operationId>.json
`- .storage-transfer.json
```

A script envelope is `{ script, bookmarks }`. `script` stores `id`, absolute `path`, last confirmation time, optional missing time/order position, and source fingerprint. `bookmarks` contains that script's bookmark tree only. Workspace folders no longer duplicate bookmark data and store view order only, so opening a script from a workspace or alone resolves to the same `scripts/<scriptId>.json`.

A single-file import from an empty workspace view still targets the active script. Folder import removes the `*.codebookmark.json` suffix to obtain a relative source path and joins it to the selected workspace root. For a raw `scripts` directory, it uses absolute source paths from envelopes but accepts only paths still inside that workspace. The complete batch is structurally validated before import and fingerprint differences produce one confirmation. Successful files form one undo action; damaged configurations, missing sources, and individual write failures are counted independently without stopping other candidates.

Script, bookmark, and transfer-operation identities are 128-bit cryptographically secure random values rendered as fixed five-part hexadecimal text. The format carries no version or device meaning. `isScriptId()` validates only this stable format.

SHA-256 and size are obtained through streamed source reads; device number and inode are recorded only when the file system provides them. Repository first hashes candidates of equal size, and one full hash match can confirm directly. Without a unique hash, device/inode, name, and extension order candidates; up to 20 bookmark contents or context anchors are read and scored. A tied highest score never binds silently.

Workspace candidate scanning is capped at 50,000 entries. Anchor fallback reads only candidate files up to 16 MiB. Size is a hash-filter index and device identity is shortcut evidence; neither is required for cross-device recovery.

## 5. File Events, Relocation Journals, and Storage Transfers

`fileEditorSubscriber` handles edits, opens, creates, renames, deletes, active-editor changes, workspace folders, and settings. Source creation is covered by both VS Code file events and workspace file-system watchers, including external move tools that emit create only.

A native rename first writes `.script-relocations/<operationId>.json`, rebinds every affected envelope and updates workspace order, then removes the journal. The next activation resumes unfinished journals; if an old path returns while the new path does not exist, recovery can also complete in reverse. Delete marks every affected script missing, including automatic-only configurations, before removing current path nodes from memory. A later create/reconcile can still recover by fingerprint and anchors.

`StorageRootTransfer` runs serially. It flushes the source save queue, then copies or merges one file at a time. Matching script identities choose primary data by `lastSeenAt` and preserve nonduplicate bookmarks; bookmark identities are rewritten on conflict. Files that cannot be merged semantically become conflict copies named with a content hash. Only after every destination write succeeds are `scripts`, `scopes`, `.script-relocations`, and the transfer journal removed from the source root. Non-CodeBookmark files in that root remain untouched. Real-path checks prevent source and destination from containing one another through symbolic links or directory junctions.

## 6. Save Queue, External Edits, and Atomic Writes

The Provider coalesces saves by absolute source path. Each save item carries the current tree, storage root, sequence, and optional dirty paths. Requests under one workspace root merge into one Repository save that touches affected scripts only; a full request supersedes incremental scope. Failures use exponential backoff starting at 500 ms for at most three attempts.

`FileChangeFingerprintTracker` separately records the known disk hash and hashes planned by this extension. The target is checked before writing, after the temporary file is complete, and before atomic rename. This lets the watcher distinguish self-writes from external writes. An external update reloads only affected scripts. Pending local queue entries are regenerated from the latest in-memory tree instead of overwriting external content with an old snapshot.

`deactivate()` awaits bookmark saves and undo-session persistence. Configuration export and storage transfer may require a successful flush and abort otherwise.

## 7. Following Source Positions

At creation, a bookmark records the selection and context from adjacent lines. Document edits are coalesced for 300 ms. Instead of accumulating line-number deltas that may become stale, relocation uses the final document snapshot:

- Original content still matches with the best context: keep the position and refresh context.
- Content appears elsewhere: score context similarity and distance from the old line, then move the selection.
- Original content disappeared but the old line has new text: treat it as an edit on the same line and refresh the content fingerprint.
- Content and any usable location disappeared: mark invalid until the user rebinds or clears it.

Automatic code markers do not use the generic sticky algorithm. They resynchronize from scanner results so deleting a source marker never leaves an invalid automatic bookmark.

## 8. Undo Design

`UndoManager` stores JSON snapshots of the complete `BookmarkSet` and optional workspace order. Each data operation captures first and commits an `UndoAction` only after a real change. Batch AI, batch edits, and multi-selection drag therefore remain atomic undo steps.

History is partitioned by `workspace:<root>`, `file:<absolutePath>`, or `global`. On a file or folder move, paths, workspace order, and scope keys are rewritten in both the in-memory tree and history snapshots. History persists through `workspaceState` but includes the current `vscode.env.sessionId`, so only the same window session restores it.

## 9. AI Protocols and Security Boundaries

The AI network path has three independent boundaries. `AIAddressClassifier` consistently identifies local, Azure, Vertex AI, and Ollama hosts for both protocol completion and HTTP safety. `AIEndpointResolver` normalizes duplicate slashes, trailing slashes, and repeated route suffixes, then distinguishes complete request URLs, partial protocol paths, API base URLs, and resource endpoints. A partial path completes only the protocol it already expresses. Azure resource addresses and `/openai/v1/` bases default to the recommended Responses API; known compatible services use their published base rules; unknown services produce only a limited set of same-origin OpenAI-compatible candidates.

`AIProtocolCodec` builds and parses OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Gemini generateContent, and Ollama Chat independently. Compatible OpenAI services use Bearer authentication, Azure uses `api-key`, Anthropic uses `x-api-key` with a fixed protocol version, and Gemini Developer API uses `x-goog-api-key`. No empty authentication header is sent when a key is unnecessary. Responses requests explicitly set `store: false`.

`AIHttpTransport` owns POST transport, response status, size limits, paused confirmation, timeout, and cancellation. `AIService` invokes the resolver, codec, and transport in order. Automatic candidates must share the original origin and continue only for 405 or a 404 proven to mean the route is absent. A business 404 for a missing deployment, model, or resource is reported unchanged. Status 400, 401/403, 429, 5xx, timeouts, cancellation, and malformed responses stop immediately, avoiding duplicate billing, credential exposure, or masked configuration errors.

Generation accepts only `label`, `lineNumber`, `anchor`, controlled `icon`, and `children`. Improvement accepts only a supplied `id` plus optional `new_label` or `icon`. Runtime contracts are appended after custom prompts and explicitly treat source, names, labels, and identities as data to reduce prompt-injection impact. Results then pass a field allowlist, icon-key allowlist, count limit 300, depth limit 8, label limit 120, exact line-anchor resolution, and supplied-ID set validation.

Source reads use before-and-after stat snapshots. After a network response, source content/version, bookmark JSON snapshot, and storage scope are all checked again. A result applies only if all three are unchanged. Overwrite generation removes manual bookmarks only; automatic markers remain protected and occupy their source lines.

The network layer limits request/response bytes, declared length, accumulated chunks, timeout, and cancellation. While an oversized response waits for confirmation, the response stream and idle socket timer pause, but the absolute request deadline continues. Redirects are not followed, so authentication cannot be carried to another origin. Folder processing classifies and circuit-breaks on 401/403, 429, and repeated failures.

## 10. Automatic Markers and Language Configuration

`LanguageCommentProfileRegistry` scans installed extensions' `contributes.languages`, safely parses language configuration files containing comments or trailing commas, and merges extensions, file names, file patterns, and comment syntax declared separately for one language. One configuration is limited to 512 KiB, at most 4,096 language contributions are read, and at most eight tasks run concurrently.

`CodeMarkerScanner` is a lightweight lexical scanner that tracks line comments, block comments, ordinary strings, persistent quotes, and multiline strings for selected languages. Built-in rules are fallback behavior when dynamic configuration fails. `CodeMarkerBookmarks` reuses stable identities, preserves user labels/icons, promotes manual children, removes vanished markers, and maintains the automatic-node prefix.

Background workspace scanning discovers at most 2,000 files, skips unopened files over 2 MiB by default, and uses four concurrent reads. Open documents use in-memory content and are not limited by the background file size, but the 10,000-node configuration limit still applies.

## 11. Icon System and Webviews

`scripts/icons/build-curated-list.js` builds the download manifest from explicit Iconify collections and semantic concepts. Output names include source suffixes such as `_fluent`, `_twitter`, `_google_noto`, `_mozilla`, and `_vscode`. `download-extra-icons.js` accepts HTTPS only, limits redirects and response size, and rejects scripts, external references, and event handlers. `generate-icon-dictionary.js` combines on-disk SVGs with English and Chinese semantic terms and requires sufficient Chinese keywords for every icon.

The Icon Picker Webview allowlists dictionary fields and icon names, uses CSP with a random nonce, and emits no inline event attributes. The dictionary is cached asynchronously. Each category renders 160 items per page and continues on scroll; search returns at most 200 results, avoiding creation of roughly 1,500 DOM items at once. Both the Icon Picker and Configuration Manager receive a read-only localized text table from the extension host, while stable IDs, filter values, and message commands continue to drive behavior.

Third-party icon collections, authors, and licenses are listed in `docs/legal/THIRD_PARTY_NOTICES.md`. Regenerating or downloading icons must be followed by dictionary generation and icon verification.

## 12. Build, Test, and Release

```bash
npm ci
npm run compile
npm run verify
npm run test:integration
npm audit
npm run package:list
npm run package:vsix
```

- `npm run compile`: clean `out/`, compile TypeScript strictly, bundle the extension runtime into one entry point, and generate `package.json` plus localization catalogs.
- `npm run lint`: check `src/**/*.ts`, the manifest generator, and every `scripts/**/*.js`.
- `npm run verify`: compile, lint, then run every `verify-*.js` contract.
- `npm run test:integration`: compile, automatically find and reuse an installed VS Code, then start the Extension Host with isolated user data to verify real activation, command registration, configuration, and file opening in Chinese and English locales. It fails clearly when no installed VS Code is available and never downloads another test runtime.
- To select another VS Code, run `node scripts/integration/run-integration-tests.js "--vscode-executable=<path-to-Code.exe>"` or set `CODEBOOKMARK_VSCODE_EXECUTABLE_PATH`; an explicit path wins over auto-detection.
- `npm run verify:icons`: verify SVG file names, safe content, and one-to-one dictionary coverage.
- `npm run package:list`: use the pinned official VS Code packaging tool to preview VSIX contents.
- `npm run package:vsix`: compile and create an installable VSIX; add `-- --out <file>` to select the output path.
- `npm run check:release`: run all verification, Extension Host integration, dependency audit, and package-list checks.

Current contracts cover activation order, complete runtime and manifest localization, AI address normalization, five AI protocols, same-origin routing fallback, authentication, size, cancellation, automatic markers, import/export, command manifests, storage-root transfer, move recovery, external configuration changes, save queues, scopes, undo, view transitions, and icon assets. Add new behavior to the corresponding `verify-*.js` first; add integration coverage for VS Code API lifecycle behavior.

Icon maintenance:

```bash
node scripts/icons/build-curated-list.js
node scripts/icons/download-extra-icons.js
node scripts/icons/generate-icon-dictionary.js
npm run verify:icons
```

Run `npm run check:release` before publication. The VSIX contains only `out`, `resources`, `package.nls*.json`, the root Chinese `README` and `CHANGELOG`, their English versions under `docs`, `LICENSE`, and the third-party notices and licenses under `docs/legal`. After a version tag is pushed, the Release workflow obtains a short-lived token through GitHub OIDC and Microsoft Entra ID, publishes the same VSIX to Marketplace, and creates or updates the GitHub Release without storing a long-lived publishing credential. Identity setup, retry behavior, and the full procedure are in the [English release guide](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md). The Marketplace Publisher ID is fixed as `realSilasYang` and enforced by the workflow. Source is MIT licensed; third-party icons and Fuse.js retain their respective licenses.

# Star History

<div align="center">
  <a href="https://www.star-history.com/#realSilasYang/CodeBookmark&amp;Date">
    <img src="https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&amp;type=Date" alt="CodeBookmark star history chart">
  </a>
</div>
