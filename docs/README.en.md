<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="CodeBookmark logo">

  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <strong>English</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>

  <h1>CodeBookmark</h1>

  <p><strong>An anchoring engine keeps bookmarks attached to their scripts and tracks code precisely, with AI assistance, expressive icons, and local storage</strong></p>

  <p>
    <a href="https://github.com/realSilasYang/CodeBookmark/releases"><img src="https://img.shields.io/github/v/release/realSilasYang/CodeBookmark?style=flat-square&amp;label=version" alt="Latest release"></a>
    <a href="https://github.com/realSilasYang/CodeBookmark/releases"><img src="https://img.shields.io/github/downloads/realSilasYang/CodeBookmark/total?style=flat-square&amp;label=downloads" alt="GitHub downloads"></a>
    <a href="https://github.com/realSilasYang/CodeBookmark/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/realSilasYang/CodeBookmark/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI status"></a>
    <a href="../LICENSE"><img src="https://img.shields.io/github/license/realSilasYang/CodeBookmark?style=flat-square" alt="License"></a>
    <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.125.0-007ACC?style=flat-square" alt="Required VS Code version"></a>
  </p>

  <p>
    <a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> ·
    <a href="#interface-overview">Interface Overview</a> ·
    <a href="#user-guide">User Guide</a> ·
    <a href="https://github.com/realSilasYang/CodeBookmark/releases">Releases</a> ·
    <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">Report an Issue</a>
  </p>
</div>

CodeBookmark is a VS Code extension for marking important code and returning to it quickly. Its anchoring engine keeps each bookmark configuration attached to its script, then relocates bookmarks after edits, file renames, folder moves, or workspace path changes. Configurations live in a local directory chosen by the user. AI can read code semantics to create bookmarks, refine labels, and choose icons. Hierarchies, drag-and-drop ordering, automatic code markers, import and export, and undo/redo round out everyday bookmark management.

# Interface Overview

[![CodeBookmark interface overview](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

The Code Bookmarks panel shows the bookmarks attached to each script, their hierarchy, and their semantic icons. Selecting a bookmark opens its file and reveals the corresponding code. When code changes or a script or folder moves, the anchoring engine continues tracking it and restores the location.

---
**[User Guide](#user-guide)**<br>
[First Run](#1-first-run) · [Shortcuts and Everyday Use](#2-shortcuts-and-everyday-use) · [Hierarchy, Drag and Drop, Containers, and Sorting](#3-hierarchy-drag-and-drop-containers-and-sorting) · [Search, Inline Labels, and Icons](#4-search-inline-labels-and-icons) · [Automatic TODO, FIXME, and BUG Bookmarks](#5-automatic-todo-fixme-and-bug-bookmarks)<br>
[Moving, Renaming, and Recovering Files](#6-moving-renaming-and-recovering-files) · [Import and Export](#7-import-and-export) · [AI Assistance](#8-ai-assistance) · [Undo, Redo, and Failure Handling](#9-undo-redo-and-failure-handling) · [Settings Reference](#10-settings-reference)

**[Developer Guide](#developer-guide)**<br>
[Repository Layout and Generated Boundaries](#1-repository-layout-and-generated-boundaries) · [Activation and View State](#2-activation-and-view-state) · [Models and Tree Structure](#3-models-and-tree-structure) · [Persistence Layout and Script Identity](#4-persistence-layout-and-script-identity)<br>
[File Events, Relocation Journals, and Storage-Root Changes](#5-file-events-relocation-journals-and-storage-root-changes) · [Save Queue, External Edits, and Atomic Writes](#6-save-queue-external-edits-and-atomic-writes) · [Following Source Locations](#7-following-source-locations) · [Undo Architecture](#8-undo-architecture)<br>
[AI Protocol and Security Boundaries](#9-ai-protocol-and-security-boundaries) · [Automatic Markers and Language Profiles](#10-automatic-markers-and-language-profiles) · [Icon System and Webviews](#11-icon-system-and-webviews) · [Build, Test, and Release](#12-build-test-and-release)

<br>

# Donate

If bookmark navigation and AI assistance save you time, feel free to help lift the author out of poverty through one of the options below (≥Д≤).

<div align="center">
  <table>
    <tr><td align="center"><strong>WeChat Pay</strong></td><td align="center"><strong>Alipay</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="WeChat Pay donation QR code"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="Alipay donation QR code"></td></tr>
  </table>
</div>

# User Guide

## 1. First Run

### ⚙️ Complete the initial setup

Before creating bookmarks, tell the extension where their configuration files should be stored:

1. Install and enable the extension, then open a local script or workspace.
2. Open VS Code Settings and search for `CodeBookmark`.
3. Set the required `codebookmark.globalStoragePath` value. It must be an absolute directory, although `~` and `%ENVIRONMENT_VARIABLE%` are accepted. The extension creates the directory when necessary.
4. Press `Alt+B` to open and focus the Code Bookmarks panel, or select its bookmark icon in the Activity Bar.

### 💾 Understand storage and view scope

All bookmark data is stored under the directory you selected. CodeBookmark never writes it into the source project.

In a workspace, the panel shows every bookmarked file in that workspace. When only one script is open, it shows only that script. Both views refer to the same per-script configuration, so opening a script by itself does not create a duplicate or a separate branch of its bookmark data.

Local folders, remote folders, and multi-root workspaces are supported. CodeBookmark runs in the workspace-side Extension Host, so that host must be able to reach the configured storage directory. VS Code virtual workspaces are not supported. Local bookmark features remain available in an untrusted workspace, but all AI menus, commands, and network requests stay disabled until the workspace is explicitly trusted.

## 2. Shortcuts and Everyday Use

### ⌨️ Use the common shortcuts

The main bookmark actions are available directly from the keyboard:

| Key | Context | Action |
| --- | --- | --- |
| `Ctrl+B` | Editor | Toggle a bookmark on the current line; with multiple cursors, toggle each line |
| `Ctrl+Alt+Shift+B` | Editor | Add another bookmark even when the line already has one |
| `Ctrl+Alt+Shift+D` | Editor | Delete ordinary bookmarks on the current line |
| `Alt+B` | Anywhere | Open and focus the Code Bookmarks panel |
| `F2` | Bookmark tree | Rename the current bookmark; also supports batch editing a selection |
| `Delete` | Bookmark tree | Delete the selected bookmark or bookmarks |

### 📝 What a new bookmark records

With one cursor, CodeBookmark asks you to confirm the label before adding the bookmark. With multiple cursors, it creates a batch label separated by `│`. If the editor has a selection, the selected text becomes the bookmark content; otherwise the complete cursor line is recorded. An empty label cancels the new bookmark.

### 🔧 Open or repair a bookmark

Selecting a bookmark opens its file and selects the stored location. If the original location can no longer be identified, the tree shows a warning icon. Move the cursor to the correct position and use Edit Bookmark to bind it again; the same action can also update its label.

## 3. Hierarchy, Drag and Drop, Containers, and Sorting

### 🧩 Change hierarchy and order

Bookmarks can form a tree instead of a single flat list:

| Goal | Operation and rules |
| --- | --- |
| Reorder or nest bookmarks | Drag bookmarks within the same file. A parent cannot move into one of its descendants, and bookmarks cannot be dragged across files |
| Reorder file nodes | In a workspace, select and drag one or more file nodes. Their order is saved in the workspace view record. Dragging while time or position sorting is active switches back to custom order |
| Put future bookmarks under one node | Right-click an ordinary bookmark and choose Set as Bookmark Container. New bookmarks in the same file are then placed beneath it. Each scope has at most one active container; choose Stop Using as Bookmark Container to return to the default placement |
| Delete a bookmark that has children | Delete the complete subtree, or remove only that node and promote its children to the parent level |
| Change the sorting mode | Sort Mode offers custom order, creation time ascending or descending, and source position ascending or descending. Time and position sorting only change the current presentation and never overwrite the custom order |

### 📂 Control expansion depth

The expand/collapse control at the top of the panel uses `codebookmark.defaultExpandLevel`. The default value, `3`, expands the first three levels; `0` expands every level. Each node's own expanded state is stored with the bookmark configuration.

## 4. Search, Inline Labels, and Icons

### 🔍 Find and recognize bookmarks quickly

| Feature | How it works |
| --- | --- |
| Search the current file | Filter the current script's bookmarks by label, line number, or source text, then select a result to jump to it |
| Inline labels | `codebookmark.inlineLabel` is enabled by default. When the cursor line has a valid bookmark, the first label on that line appears as ghost text at the end of the line |
| Automatic spacing | `codebookmark.autoSpace` is enabled by default and inserts suitable spaces between Chinese text, Latin text, and numbers |
| Custom icons | Open the icon picker from a bookmark's context menu. Icons are grouped into code status, core architecture, interface resources, playful labels, and brand marks. The picker supports fuzzy Chinese and English search, incremental pages, and recently used icons |
| AI semantic icons | `codebookmark.AI.assignIcons` is enabled by default. CodeBookmark exposes a carefully selected semantic subset of the full library, and uses an icon only when a label is an explicit match that also passes conflict checks. Ambiguous labels retain the default icon. When existing bookmarks are improved, manually chosen icons are preserved; only bookmarks still using their default icon may be updated |
| Default icons | An ordinary bookmark's default icon reflects its level and whether it has children. Automatic source markers use a yellow indicator by default. A custom icon can always be reset with Restore Default Icon |

## 5. Automatic TODO, FIXME, and BUG Bookmarks

Without contacting any AI service, CodeBookmark can expose `TODO`, `FIXME`, and `BUG` directives from source comments as bookmarks.

### 🔎 What qualifies as an automatic marker

The extension only scans a language when an installed VS Code extension registers both a syntax-highlighting grammar and an official comment configuration for that language. The rules refresh when language extensions are installed, removed, enabled, or disabled. Plain-text mode, or a file extension that has no syntax-highlighting grammar, does not qualify.

A marker must occur inside a real line or block comment and begin the comment content as a distinct directive. Valid examples include `// TODO: validate this`, `# FIXME: handle the boundary`, `/* BUG: recover from failure */`, `* @TODO improve the docs`, and `// [FIXME] revise the implementation`. An uppercase marker may appear by itself. When text follows it, the marker needs an unmistakable separator such as a colon, full-width colon, hyphen, or an owner in parentheses followed by a colon. Lowercase forms are accepted only in explicit directive shapes such as `todo:`, `@fixme`, or `[bug]`, and are normalized to uppercase when stored. At most one automatic bookmark is created for each comment line.

Strings, ordinary identifiers, JSON without comment syntax, and descriptive text or resource metadata that merely mentions the names are excluded. Examples such as `this module handles TODO/FIXME/BUG`, `<!-- Minimalist Flat Code Bug -->`, and `<!-- TODO Icon Metadata -->` do not create bookmarks. Neither do ordinary lowercase phrases such as `todo item`, `fixme note`, or `bug icon`.

### 📌 How automatic bookmarks are displayed and stored

Automatic and ordinary bookmarks use the same storage shape: both record a path, position, and surrounding context anchors. Automatic bookmarks always appear before manual bookmarks for the same file. A script may synchronize up to `5,000` automatic markers, and one script configuration may contain no more than `10,000` bookmark nodes in total.

### ✏️ What you may customize

You may change an automatic bookmark's label and icon; those choices survive later source movement. The marker itself belongs to the source and cannot be deleted manually. Remove the directive from the source to remove its automatic bookmark. If it contained manual child bookmarks, those children are promoted and retained.

### 🗂️ When a workspace is scanned

On the first workspace load, CodeBookmark scans source files in the background while excluding dependency, build, cache, editor-history, and version-control directories. A file not reached by that scan is synchronized when it is opened, created, or edited.

## 6. Moving, Renaming, and Recovering Files

### 🧭 Why a bookmark can survive a move

Every bookmarked script receives its own long-lived random identity. To recover that binding after a script or directory is renamed, moved to another device, or edited, the configuration also records the absolute source path, an optional filesystem identity, a SHA-256 content hash, the file size, and source and context anchors for the bookmarks.

These values are layered evidence, not a single identity card whose every field must still match. Recovery proceeds in this order:

1. **A move on the same device:** the device number and internal filesystem number, or inode, give matching candidates priority, but cannot decide a binding by themselves.
2. **Unchanged file content:** a unique full SHA-256 match confirms the file. Size is only an index used to limit which candidates need hashing.
3. **Another device or changed content:** even when name, contents, and size have all changed, CodeBookmark scores the source and surrounding anchors together with the file name and extension to find a sufficiently credible new location.
4. **Several similar candidates:** automatic recovery occurs only when one candidate alone satisfies the confidence rules. If several files or configurations are equally credible, binding is deferred and a notice is shown. Loading never opens a blocking picker and never silently attaches data to the wrong object.

### 🚚 Move patterns that recovery supports

Native VS Code file and folder renames, external tools that report a move as deletion followed by creation, events that report only the destination directory, and a renamed workspace root all enter the same recovery pipeline. Recovery updates the disk configuration, visible tree, file order, and relevant undo history together. A recovery journal is written before transfer starts, allowing an interrupted Extension Host to finish the operation before configurations are loaded again.

### 🗑️ What happens when a script is deleted

Its configuration remains as a recoverable record, even when it contains only automatic source markers. An external mover can therefore emit a deletion first and a matching creation later without causing CodeBookmark to discard the script identity before the new file appears.

## 7. Import and Export

### 📦 Move or share bookmark configurations

More → Import/Export Bookmarks can export the current script or workspace as one `.codebookmark` portable bookmark configuration. The same package can be imported into another local folder or on Windows, macOS, and Linux. It preserves labels, icons, hierarchy, source anchors, file-node presentation, and cross-file layout without carrying machine-specific absolute paths or filesystem identities. Old JSON files and configuration directories are no longer import formats.

Import detects a script or workspace package automatically and looks for one reliable target by relative path, source digest, and bookmark context. Ambiguous scripts are reported as conflicts instead of being guessed. When a target already contains bookmarks, Append keeps local content and merges both sides, while Overwrite replaces only matched scripts and layout; neither option deletes source files. Packages may be imported, edited, and exported repeatedly, with exchange state preserving cross-device identities and preventing duplicate bookmarks.

The empty-view Import Bookmark Configuration File button now selects `.codebookmark` files as well. In single-script mode, Export → Portable Bookmark Configuration creates a package for migration and later import. In folder or workspace mode, the same action is under Export Current Script… → Portable Bookmark Configuration. Other Formats creates these readable files:

| Format | Output |
| --- | --- |
| Markdown | Labels, line numbers, state, and source content grouped by file and hierarchy |
| HTML | A printable responsive table with light and dark presentation |
| CSV | UTF-8 with BOM, containing file, line, column, level, state, label, and source content, with spreadsheet formula injection prevented |
| Plain text | Indented text designed for reading or pasting |

Markdown, HTML, CSV, and plain text cannot be imported. Folder and workspace mode also show Export Current Folder… at the same level: Portable Bookmark Configuration creates one package for bookmarked scripts below that folder, while Other Formats continues to create one result per source file.

### 🗃️ Batch export by source file

Choose Export Current Folder… → Other Formats when each source file needs its own output. The command searches recursively from the active script's directory, processes only files that already have bookmarks, and creates one result in the selected format per source file. Relative directories are preserved and outputs are not merged into a summary file.

### 🗂️ Manage every configuration file

More → Manage Bookmark Configuration Files opens a view of every CodeBookmark storage record in the current global storage directory, independent of the active script or workspace. It distinguishes:

- **Script bookmark configurations:** show source path, binding state, configuration kind, total and per-level bookmark counts, automatic and invalid counts, last binding update, file modification time, and size. Primary configurations, migration backups, conflict copies, superseded files, and damaged files are identified separately.
- **Workspace order and layout records:** show workspace name, path hash, participating script paths, and cross-file layout without duplicating bookmark content.
- **Configuration exchange records:** show the package series, scope, revision, identity mappings, and merge baseline. Clearing one keeps current bookmarks but prevents that series from reusing its previous cross-device identities.
- **Storage transfer records:** show transfer state, source and destination directories, start and completion times, and copied, merged, and conflicted file counts. They describe only the most recent storage-directory migration.

The view provides shared search, filtering, sorting, and multiselection. Existing source scripts can be opened from their configuration, and every record can be revealed in the file explorer. Before deletion or cleanup, CodeBookmark explains the effect for the selected types and asks for confirmation. Pending saves are then completed and each file is compared with the version originally displayed; files changed by another program are skipped so newer data cannot be deleted accidentally. The management view and active bookmark tree are then reloaded from disk.

## 8. AI Assistance

### 🔌 Configure an AI connection

Before using AI, choose AI Configuration from the AI menu at the top of the panel:

| Setting | Value |
| --- | --- |
| `codebookmark.AI.address` | A resource endpoint, API Base URL, or full request URL; CodeBookmark recognizes the form and completes it |
| `codebookmark.AI.APIKey` | The API key required by the service. Leave it empty for an unauthenticated local service. A provided key is stored as plain text in VS Code `settings.json` or the corresponding workspace setting |
| `codebookmark.AI.model` | The model name; for Azure v1 this is the deployment name |
| `codebookmark.AI.assignIcons` | Enabled by default; allows AI to choose an icon after generating a bookmark |

Common address forms can be entered directly:

| Address form | Example | What CodeBookmark does |
| --- | --- | --- |
| OpenAI or compatible host / API Base URL | `api.openai.com`, `https://openrouter.ai/api/v1`, `http://127.0.0.1:1234/v1` | Completes Chat Completions. It considers another same-origin compatible path or Responses only when the server clearly reports that the route is absent |
| Full Chat Completions / Responses URL | `https://api.openai.com/v1/chat/completions`, `https://api.openai.com/v1/responses` | Preserves the explicit protocol choice instead of rewriting it to the other API |
| Azure OpenAI / Foundry resource endpoint or Base URL | `https://resource-name.openai.azure.com`, `https://resource-name.openai.azure.com/openai/v1/` | Recognizes Azure v1 and tries `/responses` first. The model setting must be the deployment name. A complete legacy deployment URL keeps its original API |
| Anthropic Messages | `https://api.anthropic.com` or a complete `/v1/messages` URL | Uses the Messages body, `x-api-key`, and `anthropic-version` |
| Native Gemini or its OpenAI-compatible API | `https://generativelanguage.googleapis.com`, `https://generativelanguage.googleapis.com/v1beta/openai`, or a full URL | Completes a native address as `models/...:generateContent`, or an OpenAI-compatible address as `chat/completions`. Native Vertex AI model paths are recognized as well |
| Ollama | `localhost:11434`, `http://remote-host:11434/api`, or a `/v1` Base URL | Completes a native address as `/api/chat`; `/v1` uses the OpenAI-compatible shape. The API key may be empty |

When the scheme is omitted, public hosts default to HTTPS, while localhost, loopback addresses, and common container hostnames default to HTTP. A complete request URL keeps its protocol intent. A partial path ending in `/chat`, `/chat/completion`, `/response`, or a Gemini model path is completed within the protocol it already expresses; an existing `chat` segment is never appended twice. Query parameters are retained and URL fragments are removed. HTTPS remains strongly recommended for every remote service. Before sending source code and credentials to a nonlocal HTTP address, the extension asks for confirmation. Use Test AI Connection from the model setting to check the address, protocol, model, and required key. After a successful test, `codebookmark.AI.address` is replaced with the exact URL that accepted the request; cancellation or failure leaves the original value unchanged.

### 🎯 Choose generation or improvement scope

The AI menu divides work into three scopes:

| Scope | Available operations |
| --- | --- |
| Current script | Generate when no bookmarks exist, append to existing bookmarks, or regenerate and replace all manual bookmarks |
| Current folder | Find supported scripts recursively and apply the same three generation strategies |
| Improve bookmarks | Improve the current selection, current script, or bookmarked scripts in the current folder. Labels and semantic icons may change, but position, hierarchy, identity, and anchors never do |

### ✅ How CodeBookmark validates AI output

Regeneration preserves source-managed TODO, FIXME, and BUG bookmarks. Their original lines remain occupied, preventing AI from creating an ordinary bookmark on the same line. AI may propose only a label, a 1-based line number, a verbatim source anchor, hierarchy, and a controlled semantic icon key. After anchor and icon validation, CodeBookmark itself creates the bookmark identity, path, creation time, selection, and context.

For an open document, AI sees the latest editor text, including unsaved edits; disk is read only when the file is not open. Improvement sends no more than `300` bookmarks in one model request. Larger sets are divided into batches, so later bookmarks are not silently omitted.

### 🛡️ Resource limits and interruption rules

AI work is bounded so a large file, malformed response, or long-running task cannot indefinitely slow the editor:

- CodeBookmark asks before sending source over 512 KiB or accepting a response over 2 MiB. Source has an 8 MiB hard limit; both requests and responses have a 16 MiB hard limit.
- A folder scan handles at most 500 supported scripts, 20,000 directory entries, and 64 directory levels. Dependency, build, cache, and version-control directories are skipped.
- Requests can be cancelled. The default timeout is 60 seconds and the allowed range is 1–600 seconds. It measures absolute request duration, so a continuous response stream cannot extend it forever. A folder task stops after an authentication error, rate limit, or three consecutive request failures.
- If the source, bookmark data, or active scope changes while a response is in flight, the stale result is discarded. A folder task queues each successfully processed file for saving immediately, so cancellation retains completed results.

## 9. Undo, Redo, and Failure Handling

### ↩️ Operations that can be undone and redone

Add, toggle, delete, rename, move, change icon, drag within the hierarchy, reorder files, import, generate or improve with AI, set or clear a bookmark container, and remove invalid bookmarks all support undo and redo. A batch is one history step. The toolbar buttons show the exact action that will be undone or redone next.

### 🕘 How long history lasts

Undo history is isolated by workspace or standalone script and remains valid only within the current VS Code window session. Each undo and redo stack keeps up to `50` snapshots. All scopes share an `8 MiB` budget and at most `64` scopes. Changing files, reloading data from disk, or reactivating the Extension Host does not immediately erase history from the same window session.

### 🔄 External edits during a save

Rapid local changes are coalesced after a short delay, and the save queue touches only affected scripts. A save writes a temporary file in the same directory and then replaces the configuration in one operation, an atomic replacement that prevents half-written data. Failed writes are retried up to `3` times. When an external tool changes a configuration, CodeBookmark reloads only the relevant scripts. Pending local changes are rebuilt from the newly merged in-memory tree instead of being discarded or allowing an old snapshot to overwrite the external edit.

### 🗄️ Change the bookmark storage directory

After `globalStoragePath` changes, CodeBookmark first flushes pending data to the old directory, then merges `scripts`, `scopes`, `exchanges`, and recovery journals into the new directory. The newer record wins for the same exchange series; other distinct destination data remains as backups or conflict copies. Source configurations are removed only after every destination write succeeds. If transfer or cleanup fails, the old directory remains active and its data is not removed prematurely.

## 10. Settings Reference

| Setting | Default | Meaning |
| --- | --- | --- |
| `codebookmark.globalStoragePath` | Empty | Required absolute directory for all bookmark configurations |
| `codebookmark.defaultExpandLevel` | `3` | Depth reached by Expand; `0` means every level |
| `codebookmark.autoSpace` | `true` | Adjust spacing between Chinese, Latin text, and numbers |
| `codebookmark.inlineLabel` | `true` | Show a bookmark label at the end of the cursor line |
| `codebookmark.AI.address` | Empty | AI address with completion for resource endpoints, API Base URLs, Chat Completions, Responses, Anthropic Messages, Gemini generateContent, and Ollama |
| `codebookmark.AI.APIKey` | Empty | API key stored as plain text in VS Code settings; may remain empty for an unauthenticated local service |
| `codebookmark.AI.model` | Empty | AI model name |
| `codebookmark.AI.assignIcons` | `true` | Let AI choose bookmark icons after generation |
| `codebookmark.AI.timeoutS` | `60` | Absolute timeout for one request in seconds, from 1 to 600 |
| `codebookmark.AI.prompt` | Built-in generation prompt | System prompt used to generate bookmarks |
| `codebookmark.AI.optimizePrompt` | Built-in improvement prompt | System prompt used to improve bookmark labels and semantic icons |

# Developer Guide

## 1. Repository Layout and Generated Boundaries

```text
CodeBookmark/
├─ .github/
│  ├─ ISSUE_TEMPLATE/               Issue forms and private security-report entry
│  ├─ workflows/                    Continuous integration and coordinated release
│  ├─ dependabot.yml                npm and GitHub Actions update policy
│  ├─ PULL_REQUEST_TEMPLATE*.md     Chinese and English pull-request checklists
│  ├─ CONTRIBUTING*.md              Chinese and English contribution workflow
│  ├─ SECURITY*.md                  Chinese and English vulnerability policy
│  └─ SUPPORT*.md                   Chinese and English support and triage guide
├─ .vscode/
│  ├─ launch.json                   Extension Host debug entry
│  ├─ tasks.json                    Compile and watch tasks
│  └─ settings.json                 Repository file-nesting rules
├─ config/
│  ├─ eslint.config.mjs             Strict ESLint configuration
│  └─ tsconfig.json                 TypeScript compiler configuration
├─ docs/
│  ├─ README.*.md                   Twelve non-Simplified-Chinese project guides
│  ├─ CHANGELOG.en.md               English release history
│  ├─ images/                       README screenshots
│  ├─ legal/                        Third-party notices and complete licenses
│  └─ release/                      Chinese and English release guides and templates
├─ resources/                       Extension artwork, icon dictionary, Fuse, and custom SVGs
├─ scripts/
│  ├─ build/                        Cleanup, manifest generation, and runtime bundling
│  ├─ icons/                        Icon curation, download, and dictionary generation
│  ├─ i18n/catalogs/                Stable-key language catalogs for the extension manifest
│  ├─ integration/                  Extension Host integration-test launcher
│  ├─ lib/                          Stable manifest keys and localization readers
│  ├─ release/                      VSIX packaging and release-note generation
│  ├─ fixtures/                     Shared fixed inputs for focused verification
│  ├─ test-support/                 Module stubs and fake VS Code APIs for Node checks
│  ├─ verify-*.js                   Module regressions and architecture constraints
│  └─ verify-all.js                 Entry point for focused verification
├─ src/
│  ├─ extension.ts                  Synchronous activation entry
│  ├─ commands/                     Command registration, navigation, and export
│  ├─ config/                       VS Code setting access and caching
│  ├─ i18n/
│  │  ├─ Localization.ts            Locale resolution, fallback, and named interpolation
│  │  └─ catalogs/                  Stable-key runtime language catalogs
│  ├─ models/                       Bookmark domain, codecs, serialized trees, and workspace order
│  ├─ portable/                     Portable format, archive, matching, merge, and exchange state
│  ├─ providers/                    User workflows and view, save, AI, and undo orchestration
│  ├─ repository/                   Disk formats, indexes, relocation, and storage transfer
│  ├─ subscriptions/                Editor, filesystem, and configuration event adapters
│  ├─ testing/                      Read-only API exposed to the real Extension Host test suite
│  └─ util/                         Identity, path, fingerprint, AI, marker, and icon foundations
├─ tests/
│  ├─ unit/                         Tests built on node:test
│  ├─ contracts/                    Manifest, capability, and supply-chain contracts
│  └─ integration/                  VS Code Extension Host integration tests
├─ README.md / CHANGELOG.md         Chinese project documentation and release history
├─ LICENSE                          Project license
├─ package.json                     Generated result, not the sole command source of truth
└─ package-lock.json                Reproducible npm dependency lock
```

`out/`, `.vscode-test/`, `node_modules/`, and root-level `package.nls*.json` files are generated output or dependencies and must not be edited by hand. Compilation writes NLS catalogs beside `package.json` for VS Code and the VSIX, but they are not committed and are nested beneath `package.json` in the explorer. Extension metadata and npm scripts are defined in `src/util/constants/BasePackage.ts`; commands, menus, keybindings, settings, and submenus live in `src/util/constants/Commands.ts`; colors live in `Colors.ts`. `npm run compile` cleans `out/`, compiles TypeScript, and regenerates `package.json` and every NLS catalog from `scripts/i18n/catalogs/manifest.<locale>.json`. The default Marketplace description remains concise, natural Simplified Chinese and never doubles as a search-term list. Thirty independent `keywords` cover core English, Simplified and Traditional Chinese, Japanese, Korean, Vietnamese, Spanish/Portuguese, French, Russian, German, and Italian discovery terms. Once installed, each supported locale receives its complete native manifest; any explicitly non-Chinese locale without a catalog falls back to English.

Stable-key runtime language catalogs live in `src/i18n/catalogs/`, with one complete 627-entry catalog for each of the same 13 languages. Runtime code calls `localize('stable.key', { namedValue })`; feature modules contain neither parallel translations nor language-specific branches, and translated text is never used as a condition. Command IDs, menu conditions, Webview messages, stable filter and sort values, setting keys, and persistence fields are language-neutral. Runtime catalogs and the commands, menus, and configuration descriptions that VS Code resolves before activation all follow `vscode.env.language`, so the extension consistently uses the VS Code display language. Simplified Chinese is the default when no locale can be detected. `zh-Hans` resolves to Simplified Chinese, `zh-Hant` to Taiwan Traditional Chinese, and Macao to Hong Kong Traditional Chinese. An explicit but unsupported non-Chinese locale resolves to English.

To add a runtime message, add the same stable key to every registered catalog and preserve the exact set of `{name}` placeholders, then pass those named values at the call site. To add an interface language, create a complete `messages` export, register its language code and formatting locale in `Localization.ts`, and add its language-identity assertion to the localization verifier; feature modules do not change. For the manifest, add `scripts/i18n/catalogs/manifest.<locale>.json`, which is discovered by the generator. `verify-localization.js` checks discovery and registration, exact keys, explicit catalog entries, named placeholders, protocol tokens, language identity, static call sites, removal of the former dual-text interface, user-visible literals, manifest behavior, and paired documentation. A missing key, structural drift, inherited fallback, translation marker, or stale translation artifact fails verification.

Use these entry points when making changes:

| Area | Primary location | Boundary to preserve |
| --- | --- | --- |
| Extension metadata, settings, commands, menus, and keybindings | `BasePackage.ts`, `Commands.ts`, `scripts/i18n/catalogs/` | `package.json` and `package.nls*.json` are generated artifacts |
| Runtime copy and locale fallback | `src/i18n/Localization.ts`, `src/i18n/catalogs/` | Feature modules use stable keys only; every catalog has identical keys and placeholders |
| Bookmark fields, tree rules, codecs, and workspace order | `src/models/` | Preserve persistence contracts before changing Provider interaction flow |
| Commands, tree view, saves, undo, and configuration management | `src/commands/`, `src/providers/`, `src/subscriptions/` | VS Code event adaptation and complete user workflows meet here |
| Portable import, export, matching, and merge | `src/portable/`, `PortableImportWorkflowRunner.ts` | Packages contain no machine path; ambiguous targets never bind automatically; multi-file writes must be reversible |
| Script envelopes, indexes, relocation, and storage-root transfer | `src/repository/`, `src/util/Persistence*.ts` | Every disk record passes format identity, version, and atomic-write rules |
| AI addresses, protocols, transport, response parsing, and workflows | `src/util/AI*.ts`, `src/providers/AI*.ts` | `util` owns protocol and security boundaries; Providers verify state and apply results |
| Automatic TODO, FIXME, and BUG markers | `LanguageCommentProfiles.ts` → `CodeMarkerScanner.ts` → `CodeMarkerBookmarks.ts` → `CodeMarker*` Providers | Language eligibility, lexical scanning, tree synchronization, and lifecycle remain separate |
| Icon and configuration-management Webviews | `src/util/quick_pick_icon/`, `BookmarkConfigurationManagerWebview.ts`, `resources/` | The host supplies allowlisted data and localized copy; Webviews handle display and stable message values only |
| Automated verification | `tests/unit/`, `tests/contracts/`, `tests/integration/`, `scripts/verify-*.js` | Choose pure logic, public contract, real VS Code lifecycle, or focused regression according to the behavior |

## 2. Activation and View State

`activate()` resolves localization and constructs the extension synchronously, then returns without waiting for filesystem work. It exposes no public API in production. The integration API is returned only when `CODEBOOKMARK_INTEGRATION_TEST=1` and is omitted from the bundled production extension. Command handlers and the tree view are registered before background loading. Until the requested scope has been committed, mutating commands pass through `awaitScopeReady()` and fail with a clear message when loading failed.

`CodeBookmarksViewProvider` remains the stable Facade used by commands, subscriptions, and tests. Storage-root activation, AI workflows, configuration management, portable import, and the automatic-marker lifecycle belong to dedicated Controllers or Runners. Save, refresh, view, and document-change responsibilities live in focused Coordinators. `BookmarkRepository` is likewise a stable Facade; source-candidate indexing, script-envelope codecs, and file-node codecs are delegated to acyclic single-purpose modules. Architecture checks enforce size budgets for both Facades so implementation does not accumulate there again.

The intended dependency direction is conceptual: `extension.ts` performs composition; `commands/` and `subscriptions/` adapt VS Code commands and events; `providers/` orchestrate complete workflows; `models/`, `repository/`, and `util/` supply domain, persistence, and foundational capabilities. New work should respect this maintenance boundary, although the directories are not a formal layer system. Current architecture guards prove that every production module is reachable, that the runtime dependency graph has no cycle, and that the two Facades stay within their line budgets.

```text
extension.activate
  → construct CodeBookmarksViewProvider
  → register TreeView, commands, and file events
  → prepare the requested scope in the background
  → read and recover script configurations through Repository
  → relocate bookmark content through FileUtils
  → commit one complete BookmarkSet
  → publish tree changes and VS Code context keys
```

View changes use a generation number, `AbortSignal`, and a serial preparation queue to discard obsolete requests. The old tree remains visible until the replacement has been prepared completely. After commit, the publisher chooses event and context-key order according to empty-to-populated, populated-to-empty, or unchanged-content transitions, preventing welcome text, toolbar actions, and tree items from flickering. When the tree is visible, loading also waits for the first item to be requested, but never longer than 1.5 seconds.

## 3. Models and Tree Structure

`Bookmark` is both a persisted entity and a `TreeItem`. An ordinary node contains a random identity, creation time, label, script path, selection, source content, surrounding context, icon, expansion and container state, children, and optional automatic-marker metadata. A file node is only a script container; it also owns `scriptId` and does not participate in source-content relocation.

`Bookmark.fromJSON()` strictly checks types, position ranges, collapsible state, and automatic-marker metadata. The maximum depth is 64 and the maximum tree size is 10,000 nodes. A damaged individual bookmark can be skipped; a damaged script envelope never enters the index.

`BookmarkSet` owns identity deduplication, parent and child lookup, same-file tree operations, cycle prevention, the active bookmark container, bulk path rewriting, and duplicate file-node merging. Providers allow file nodes and ordinary bookmarks to be visually sorted and nested across files without transferring data ownership: one script configuration still stores only bookmarks owned by that script, while cross-file relationships live in the workspace layout record.

## 4. Persistence Layout and Script Identity

```text
<globalStoragePath>/
├─ scripts/
│  └─ <scriptId>.json
├─ scopes/
│  └─ <workspace-name_path-hash>/
│     ├─ _workspace_layout.json
│     └─ _workspace_order.json      present only for an unupgraded legacy order record
├─ exchanges/
│  └─ <exchangeId_scope-hash>.json  cross-device identity mappings and merge baseline
├─ .script-relocations/
│  └─ <operationId>.json
└─ .storage-transfer.json
```

Every persistence family carries its own `format` identity and `schemaVersion: 1`: script envelopes, workspace order and layout, configuration exchange records, script-relocation journals, storage-root transfer records, undo sessions, and recent icons. Only data with no version header at all is eligible for one-time migration. A partial header, wrong format, or future version is rejected explicitly so unknown data cannot be interpreted as the current schema. Irrecoverable legacy script data keeps a migration backup. Completed transaction journals and temporary migration backups are removed so historical metadata cannot prevent cleanup of an old directory.

A script envelope has the shape `{ format, schemaVersion, script, bookmarks }`. `script` holds `id`, absolute `path`, the last confirmation time, optional missing-since time or ordering position, and a source fingerprint. `bookmarks` contains only that script's bookmark tree. Workspace `_workspace_layout.json` stores cross-file order, parent relationships, hidden state, containers, and expansion without copying bookmark content. After a legacy `_workspace_order.json` is read, the first new-layout save writes the current record and removes the old order file. Opening a script through a workspace or by itself therefore always resolves to `scripts/<scriptId>.json`.

Portable configuration uses a bounded `.codebookmark` ZIP container with a manifest, machine-path-free script bookmarks, optional workspace layout, and an optional merge baseline. Reading validates the format version, entry paths and counts, expanded size, SHA-256 digests, script identities, and recursive bookmark identities; old JSON, directories, unknown entries, and partially valid packages are rejected as a whole. Target resolution accepts only unique relative-path, raw or normalized source-digest, or bookmark-anchor evidence. Script, layout, and exchange writes expose reverse-order rollback operations.

Script, bookmark, and relocation-operation identities are 128 cryptographically secure random bits rendered in a fixed five-part hexadecimal form. The text carries no version or device meaning, and `isScriptId()` validates only that stable format.

SHA-256 and size in a source fingerprint come from a streaming read. Device number and inode are stored only when the filesystem provides them. Repository hashes candidates of the same size first; one unique full-hash match is enough to confirm a file. Without that result, device identity, name, and extension rank candidates, and at most 20 source or context anchors are loaded for scoring. A tied top score never binds silently.

Workspace discovery is capped at 50,000 directory entries, and anchor fallback reads no candidate larger than 16 MiB. File size is a hash-selection index and filesystem identity is fast supporting evidence; neither is required for recovery across devices.

## 5. File Events, Relocation Journals, and Storage-Root Changes

`fileEditorSubscriber` handles document edits, opens, creates, renames, deletions, active-editor changes, workspace-folder changes, and settings changes. Source creation is observed through both VS Code file events and workspace file watchers, covering external movers that emit only create events.

A native rename first writes `.script-relocations/<operationId>.json`, then rebinds every affected envelope and updates workspace order before deleting the journal. Startup inspects incomplete journals; if an old path reappears while the new one does not, recovery may also complete in reverse. Delete marks every affected script as missing, including configurations containing only automatic markers, and then removes current-path nodes from the in-memory view. A later create or reconciliation can still recover them by fingerprint and anchors.

`StorageRootTransfer` changes storage roots serially. It first flushes the source save queue, then copies or merges one file at a time. Records with the same script identity choose primary data by `lastSeenAt` and preserve unique bookmarks; the newer `updatedAt` wins for one exchange series; files that cannot be merged semantically become conflict copies named with a content hash. After all destination data is durable, `scripts`, `scopes`, `exchanges`, `.script-relocations`, and the transfer journal are removed from the source root. Files not owned by CodeBookmark remain untouched. Real-path checks prevent source and destination from containing each other through symbolic links or directory junctions.

## 6. Save Queue, External Edits, and Atomic Writes

Providers coalesce saves by absolute source path. A queued item carries the current tree, storage root, sequence number, and optional dirty paths. Requests under the same workspace root merge into one Repository save that touches only affected scripts; a full request supersedes incremental scope. Failures use exponential backoff starting at 500 ms and stop after three attempts.

`FileChangeFingerprintTracker` separately records known disk hashes and hashes that CodeBookmark intends to write. The target is checked before writing, after the temporary file is complete, and before atomic rename, allowing the configuration watcher to distinguish self-writes from external writes. External updates trigger an incremental reload of relevant scripts. Pending local saves are regenerated from the latest merged tree rather than using an older snapshot to overwrite external content.

`deactivate()` waits for bookmark saves and undo-session persistence. Configuration export and storage-root transfer can require the flush to succeed and abort when it does not.

## 7. Following Source Locations

At creation time, a bookmark stores the selection content and context from neighboring lines. Document edits are coalesced for 300 ms. Rather than accumulating line-number deltas that may become stale, the final document snapshot is searched again:

- If the original position still matches and has the best context, retain it and refresh the context.
- If the content appears elsewhere, move the selection after scoring context similarity and distance from the former line.
- If the old content vanished but the original line now has new text, treat it as an edit in place and refresh the content fingerprint.
- If neither content nor a usable position remains, mark the bookmark invalid until it is rebound or cleared.

Automatic source markers bypass this general anchoring algorithm and are synchronized from a fresh scan. Removing a source directive therefore removes its automatic bookmark instead of leaving an invalid one behind.

## 8. Undo Architecture

`UndoManager` stores JSON snapshots of the complete `BookmarkSet` and optional workspace order. A data operation captures first and commits its `UndoAction` only after a real change is confirmed. Batch AI operations, batch edits, and multiselection drags are consequently atomic history steps.

History is partitioned under `workspace:<root>`, `file:<absolutePath>`, or `global`. A file or directory move rewrites paths, workspace order, scope keys, and both current and historical trees together. History is persisted through `workspaceState` but tagged with the current `vscode.env.sessionId`, so only the same window session restores it.

## 9. AI Protocol and Security Boundaries

The network path has three distinct boundaries. `AIAddressClassifier` consistently identifies local, Azure, Vertex AI, and Ollama hosts for both protocol completion and HTTP safety. `AIEndpointResolver` normalizes repeated slashes, trailing slashes, and duplicate API suffixes before distinguishing full request URLs, partial protocol paths, API Base URLs, and resource endpoints. A partial path is completed only within the protocol already expressed. Azure resource addresses and `/openai/v1/` Base URLs default to the officially recommended Responses API. Known compatible services follow their published Base URL conventions; unknown services receive only a small set of same-origin OpenAI-compatible candidates.

`AIProtocolCodec` independently builds and parses OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Gemini generateContent, and Ollama Chat. OpenAI-compatible services default to Bearer authentication, Azure uses `api-key`, Anthropic uses `x-api-key` plus a fixed protocol version, and Gemini Developer API uses `x-goog-api-key`. No empty authentication header is sent when a service needs no key. Responses requests explicitly set `store: false`.

`AIHttpTransport` owns only POST transport, response status, size limits, pause confirmation, timeouts, and cancellation. `AIService` sequences resolution, codecs, and transport. Automatic candidates always keep the same origin and continue only after a 405 or a 404 that can be identified as a missing route. A business-level 404 for a missing deployment, model, or resource is reported unchanged. A 400, 401/403, 429, 5xx, timeout, cancellation, or malformed response stops immediately and preserves the original error, avoiding duplicate charges, key exposure, or a masked configuration problem.

The generation schema accepts only `label`, `lineNumber`, `anchor`, a controlled `icon` semantic key, and `children`. The improvement schema accepts only an input `id` plus optional `new_label` or `icon`. A runtime contract is appended after the user-editable prompt and declares source, file names, labels, and identities to be data rather than instructions, reducing prompt-injection influence. Parsing then enforces field allowlists, icon-key allowlists, a count limit of 300, depth limit of 8, label length limit of 120, line-by-line anchor matching, and the exact set of allowed identities.

Source is read between two `stat` snapshots. After the network response, the source content or document version, bookmark JSON snapshot, and storage scope are checked again. Results apply only when all three remain unchanged. Regeneration removes only manual bookmarks; automatic source markers stay protected and keep their source lines occupied.

Transport limits request and response bytes, declared content length, accumulated chunk length, timeout, and cancellation. While the user decides whether to accept a large response, the stream and idle timer pause, but the request's absolute deadline continues. Redirects are never followed automatically, preventing credentials from crossing origins. Folder batches classify 401/403, 429, and consecutive failures as circuit breakers.

## 10. Automatic Markers and Language Profiles

`LanguageCommentProfileRegistry` first uses installed extensions' `contributes.grammars` declarations to establish which languages have syntax highlighting, then reads the official language configurations referenced by `contributes.languages`. A language receives an automatic-marker profile only when its grammar exists, its configuration is readable, and that configuration defines valid comment syntax. Extensions declared across several contributions have their extensions, file names, file patterns, and comment syntax merged only after eligibility is established. Configuration parsing accepts comments and trailing commas. Each file is limited to 512 KiB, at most 4,096 language contributions are read, and up to eight reads run concurrently.

`CodeMarkerScanner` is a lightweight lexical scanner that tracks line comments, block comments, ordinary strings, persistent quoted regions, and selected multiline-string forms. It accepts only TODO, FIXME, and BUG directives with an explicit structure at the beginning of comment content. Built-in syntax hints refine comment tokens that were already authorized, such as AutoHotkey semicolon boundaries, multiline strings, and persistent quotes; a language ID or extension never grants scanning by itself. When no profile was discovered, configuration loading failed, or a file contains only plain text or resource metadata, the rule set is empty. `CodeMarkerBookmarks` reuses stable identities, preserves user labels and icons, promotes manual children, removes vanished markers, and keeps the automatic-node prefix in order.

Workspace discovery patterns are derived only from confirmed language contributions. A background scan discovers at most 2,000 files, skips unopened files larger than 2 MiB, and uses four concurrent read tasks. Open documents use their in-memory content and are not subject to the background size cutoff. Each script yields at most 5,000 automatic markers, while the combined manual and automatic configuration remains under the 10,000-node limit.

## 11. Icon System and Webviews

`scripts/icons/build-curated-list.js` derives a download list from explicit Iconify collections and semantic concepts. Output names include their source identity, such as `_fluent`, `_twitter`, `_google_noto`, `_mozilla`, or `_vscode`. `download-extra-icons.js` permits HTTPS only, limits redirects and response bytes, and rejects scripts, external references, and event handlers. `generate-icon-dictionary.js` merges disk SVGs with Chinese and English semantic terms and requires enough Chinese search terms for every icon.

The IconPicker Webview allowlists dictionary fields and icon names, uses a CSP and random nonce, and creates no inline event attributes. Its dictionary is cached asynchronously. A category renders 160 items per page and loads more on scroll; search returns at most 200 items, avoiding creation of roughly 1,500 DOM nodes at once.

Third-party icon collections, authors, and licenses are documented in `docs/legal/THIRD_PARTY_NOTICES.md`. After generating or downloading icons, regenerate the dictionary and run icon verification.

## 12. Build, Test, and Release

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

- `npm run compile` cleans `out/`, compiles TypeScript in strict mode, bundles extension runtime code into one entry, and generates `package.json` plus localization catalogs.
- `npm run clean:generated` removes `out/`, `.vscode-test/`, `coverage/`, root `package.nls*.json`, temporary VSIX packages, logs, and debug files so the root returns to a source-focused view; it does not delete `node_modules/`.
- `npm run lint` checks `src/**/*.ts`, `scripts/**/*.js`, and `tests/**/*.js` with a zero-warning policy.
- `npm run test:unit` and `npm run test:contract` use the standard Node `node:test` runner for unit and external behavior contracts, with no third-party test runner.
- `npm run test:coverage` runs both standard suites with native Node coverage and enforces minimum thresholds.
- `npm run verify` runs compile, zero-warning lint, standard unit and contract tests, and every focused `verify-*.js` check that is valid during development; it does not require an unreleased version to appear in the formal changelog. The activation guard uses the TypeScript AST to identify real `AwaitExpression` nodes; loading-state and view-transition checks find method structure instead of treating comments as code boundaries.
- `npm run verify:release` runs only the changelog and release-readiness guards that depend on finalized version materials.
- `npm run test:integration` compiles and then discovers and reuses an installed local VS Code, launching a real Extension Host with an isolated temporary user-data directory. It verifies manifest selection, activation, commands, and settings for all 13 languages: Simplified Chinese, Hong Kong Traditional Chinese, Taiwan Traditional Chinese, English, Japanese, Vietnamese, Korean, Spanish, French, Portuguese, Russian, German, and Italian. It also runs a Turkish host to verify the English fallback. Chinese and English runs exercise bookmark creation, undo and redo, persisted reload, identity following through both VS Code and external moves, automatic marker directives, and SVG metadata counterexamples. The command fails clearly if VS Code is absent and never downloads a separate test runtime.
- To choose another VS Code installation, run `node scripts/integration/run-integration-tests.js "--vscode-executable=<path-to-Code.exe>"` or set `CODEBOOKMARK_VSCODE_EXECUTABLE_PATH`; an explicit path takes precedence over automatic discovery.
- `npm run verify:icons` independently checks SVG names, safe content, and one-to-one dictionary coverage.
- `npm run package:list` previews the VSIX file list with the pinned official VS Code packaging tool.
- `npm run package:vsix` is for GitHub Actions only and must write to runner temp. Local release preparation creates and retains no VSIX.
- `npm run check:release` runs development verification, release-only guards, Extension Host integration tests, dependency audit, and package-list inspection in sequence.

Current standard tests and focused checks cover activation order, workspace capabilities, persistence versions, AI address normalization, five AI protocol families, same-origin route fallback, credentials, byte limits, cancellation, automatic markers, imports and exports, manifest commands, storage-root transfer, relocation recovery, external configuration edits, save queues, scope handling, undo, view transitions, icon assets, and release supply chain. The module-graph guard currently proves that all 163 production TypeScript modules are reachable from declared entries and that the runtime graph has zero dependency cycles. Put pure logic in `tests/unit`, public manifest or cross-module constraints in `tests/contracts`, complex historical regressions in the corresponding `verify-*.js`, and VS Code API lifecycle behavior in a real Extension Host test.

`scripts/verify-chinese-comments.js` currently covers 329 first-party TypeScript, JavaScript, MJS, and YAML scripts under `.github/`, `config/`, `scripts/`, `src/`, and `tests/`. Every module begins with at least two complete Chinese sentences that describe its actual responsibility. The guard rejects the former five-part template, English-only explanations, repeated sentences, and duplicate full headers. Third-party sources such as `resources/fuse.min.js`, plus ESLint, TypeScript, and coverage directives intended for tools, are outside that Chinese-comment rewrite.

Icon maintenance sequence:

```bash
node scripts/icons/build-curated-list.js
node scripts/icons/download-extra-icons.js
node scripts/icons/generate-icon-dictionary.js
npm run verify:icons
```

Run `npm run check:release` before publishing. The extension package contains only `out`, `resources`, `package.nls*.json`, all 13 localized README documents, the Chinese and English changelogs, `LICENSE`, and third-party notices and licenses under `docs/legal`. The in-extension help command opens the README matching the current VS Code language, while an unsupported non-Chinese locale falls back to English. The official VS Code packaging tool, `@vscode/vsce`, is pinned in both development dependencies and the lockfile; every GitHub Action is pinned to a full commit SHA. Release accepts only annotated tags that belong to `main` history. The workflow builds the VSIX in remote runner temp, publishes to Marketplace with a short-lived OIDC token, verifies the online package hash, and then creates a GitHub Release carrying only the VSIX, with no SBOM or `SHA256SUMS`. No long-lived publishing credential is stored in the repository, and local release preparation retains no intermediates or deliverables. See the [release guide](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md) for the complete process. The Marketplace Publisher ID is fixed as `realSilasYang`. Project source is under the MIT License; third-party icons and Fuse.js retain their respective licenses.

# Star History

<div align="center">
  <a href="https://www.star-history.com/#realSilasYang/CodeBookmark&amp;Date">
    <img src="https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&amp;type=Date" alt="CodeBookmark star history chart">
  </a>
</div>
