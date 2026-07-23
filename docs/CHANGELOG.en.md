# 📋 Changelog

[简体中文](https://github.com/realSilasYang/CodeBookmark/blob/main/CHANGELOG.md) · [English](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/CHANGELOG.en.md)

## 🎉 Version 3.0.0 - 2026-07-23

### ⚠️ Important Notes

- **Persisted-format upgrade:** Script configurations, workspace order, relocation recovery, storage transfer, undo sessions, and recent-icon records now carry explicit format identities and schema versions. Existing data with no version header is migrated once with the necessary type-specific backup; partial headers, foreign identities, and future versions are rejected safely instead of being guessed.

---

### ✨ Added

- **Workspace capability declaration:** Local, remote, and multi-root workspaces are explicitly supported, while virtual workspaces are not. Local bookmarks remain available in untrusted workspaces, but AI features and related sensitive settings are disabled.
- **Standard tests and coverage gates:** Added the Node.js standard test runner with separate unit and contract suites, plus line, branch, and function coverage thresholds for persistence, workspace capabilities, and core models.
- **Verifiable release artifacts:** Formal releases now include a CycloneDX SBOM, SHA-256 checksums, build-provenance attestation, and SBOM attestation so GitHub Release assets can be independently verified.

---

### 🚀 Improvements

- **Real Extension Host coverage:** Chinese and English VS Code Extension Host tests now cover activation, commands and settings, bookmark creation, undo and redo, persistence reload, VS Code file moves, and identity tracking after external file moves.
- **Decoupled core modules:** AI workflows, code markers, configuration management and import, script codecs, relocation candidate indexing, the icon catalog, and recent-icon state were extracted from oversized modules while preserving their existing behavioral boundaries.
- **Architecture regression protection:** Added guards for production-module reachability, runtime dependency cycles, and core-file size so responsibilities cannot silently collapse back into monoliths.
- **Hardened release supply chain:** The VSIX publisher and third-party GitHub Actions are pinned exactly, release tags must be annotated tags on `main` history, and checkout credential persistence is disabled.

## 🎉 Version 2.0.1 - 2026-07-23

### 🚀 Improvements

- **Repository structure:** Build configuration, bilingual documentation, third-party licenses, maintenance scripts, and integration tests are grouped by responsibility, leaving only essential entry files at the repository root.
- **Build and package boundaries:** Manifest generation, runtime bundling, integration tests, and the Release workflow now use the organized paths. Localization catalogs are generated during compilation and remain fully included in the VSIX.
- **Documentation entry points:** Installation instructions now link directly to Marketplace, GitHub Releases, Node.js, VS Code, and the source repository. Chinese and English documentation, changelog, and release-guide links are aligned with the new layout.
- **Structure regression protection:** A dedicated repository-structure contract and shared VS Code file-nesting rules prevent obsolete paths, machine-specific settings, and miscellaneous root files from returning.

---

### 🐛 Fixed

- **Configuration path resolution:** Fixed TypeScript source inputs and module-graph verification resolving relative paths from the wrong base after the configuration move, keeping local, CI, and release builds on the same input set.

## 🎉 Version 2.0.0 - 2026-07-23

### ⚠️ Important Notes

- **AI setting-key upgrade:** Version 2.0.0 no longer reads the old `codebookmark.AI.endpoint` and `codebookmark.AI.apiKey` keys. Re-enter the values under `codebookmark.AI.address` and `codebookmark.AI.APIKey` after upgrading. The API key remains stored as plain text at the selected VS Code configuration scope.

---

### ✨ Added

- **Complete Chinese and English localization:** Commands, menus, settings, notifications, logs, webviews, the extension manifest, and maintenance documentation now have Chinese and English versions. Chinese VS Code environments use Chinese; every other language environment uses English.
- **Multi-protocol AI address engine:** AI addresses may be resource endpoints, API base URLs, or complete request URLs, with automatic recognition for OpenAI Responses, Chat Completions, Azure OpenAI, Anthropic Messages, native or compatible Gemini APIs, and Ollama.
- **Semantic AI icon system:** 99 high-signal concepts are curated from 1,499 icon assets, each with explicit evidence, conflict, and priority rules. A specialized icon is used only when the bookmark meaning clearly supports it.
- **Recent-icon synchronization:** Recently used icons now participate in VS Code Settings Sync, preserving icon-selection habits across devices signed in to the same account.

---

### 🚀 Improvements

- **Context-aware AI menus:** Generation and optimization actions now reflect whether a folder is open, whether a current script exists, and whether the script or folder already contains bookmarks. A submenu is removed automatically when only one action remains.
- **AI configuration experience:** Incomplete AI configuration opens the relevant settings automatically. A successful connection test writes the working complete address back to the same configuration scope, while failure or cancellation keeps the original value.
- **Reliable AI requests:** Explicit protocol choices are preserved, compatible same-origin routes may be retried, remote HTTP transmission requires confirmation, requests have an absolute timeout and classified response failures, and stale results are rejected after workspace or source changes.
- **Operation summaries:** Completion messages for generation, optimization, deletion, and import now report total and per-level bookmark counts, with batch results also identifying successful, skipped, and failed scopes.
- **Runtime and package:** 113 runtime modules are bundled into one JavaScript entry point while all 1,499 icons and four localization catalogs remain available in the VSIX.
- **Release and maintenance documentation:** Changelogs, release guides, contribution, security, support, and pull-request documentation now use structured Chinese and English editions. GitHub Releases are generated from the matching Chinese changelog entry.

---

### 🐛 Fixed

- **AI address completion:** Fixed Azure `/openai/v1/` bases receiving an incorrect fixed route, Gemini OpenAI-compatible addresses receiving a duplicate `/chat`, and partially complete request paths being normalized incorrectly.
- **Irrelevant AI icons:** Fixed broad keywords forcing unrelated icons. Equal-priority ambiguity or insufficient semantic evidence now consistently falls back to the default icon.
- **Deactivation persistence:** Fixed unchanged undo state being written again during deactivation and prevented a secondary failure when VS Code had already closed the output channel.
- **Localization behavior boundaries:** Command IDs, setting keys, persisted fields, webview messages, and AI protocols remain language-neutral so translated text cannot alter behavior or data compatibility.

## 🎉 Version 1.1.1 - 2026-07-23

### 🚀 Improvements

- **Extension search terms:** Expanded English and Chinese Marketplace keywords so users can find the extension through terms such as bookmark, 书签, 代码书签, 标签, and 代码标签.
- **Marketplace summary:** Reworked the extension summary to state the CodeBookmark and bookmark-label use cases more clearly.

## 🎉 Version 1.1.0 - 2026-07-22

### ✨ Added

- **Bookmark configuration manager:** Added one interface for inspecting script configurations, workspace order records, and storage transfer journals.
- **Configuration statistics:** Shows total and per-level bookmark counts, automatic or abnormal counts, transfer source and target, times, and file totals.
- **Safe configuration cleanup:** Supports removal of configurations and historical metadata while preventing path traversal, stale-revision deletion, and same-name record collisions.

---

### 🚀 Improvements

- **Configuration record identity:** The manager now identifies records by storage-relative path, so workspace order records with identical file names no longer overwrite one another in the interface.
- **Deletion confirmation:** Replaced the confirmation with an in-page dialog supporting VS Code light, dark, and high-contrast themes, impact details, focus management, and explicit confirmation.
- **Storage-folder transfer:** After a successful transfer, CodeBookmark data is removed from the source folder while the result journal remains visible in the manager.

---

### 🐛 Fixed

- **Historical record management:** Fixed workspace order records and storage transfer journals being unavailable for inspection or cleanup.
- **Bookmark totals:** Fixed historical metadata being incorrectly included in total bookmark counts in the manager.

## 🎉 Version 1.0.1 - 2026-07-22

### 🚀 Improvements

- **Project documentation:** Added an interface overview screenshot to README and expanded installation, project, issue-template, and maintenance documentation.
- **Development toolchain:** Upgraded development dependencies and the TypeScript type baseline for stricter static checking.
- **Automated publication:** Marketplace publication now uses short-lived GitHub OIDC and Microsoft Entra ID credentials, with Marketplace and GitHub Release sharing the exact same hash-verified VSIX.

---

### 🐛 Fixed

- **Manifest generation:** Fixed regeneration potentially dropping `dependencies` and `devDependencies` from the extension manifest.
- **Import errors:** Configuration import now preserves the underlying file-system error when reading fails.

## 🎉 Version 1.0.0 - 2026-07-21

### ✨ Added

- **Hierarchical bookmark tree:** Hierarchical code bookmarks with dragging, nesting, and sorting.
- **Global script identity:** Workspaces and standalone scripts share one global script identity and persistence structure.
- **Automatic move following:** Bookmark bindings recover after file, folder, and workspace-root moves.
- **Automatic comment bookmarks:** TODO, FIXME, and BUG comments become automatic bookmarks using discovered language configurations.
- **Multiple export formats:** Markdown, HTML, CSV, Plain Text, configuration-source export, and per-source-file batch export.
- **Complete bookmark workflow:** Single-file or workspace import, undo/redo, icon selection, and inline labels.
- **AI assistance:** Configure an address, model, and API key for AI generation, label improvement, and semantic icon selection.
- **Reliable persistence:** Atomic saves, external configuration merge, storage-root transfer, and recovery journals.
- **Quality assurance:** TypeScript, ESLint, focused contract tests, and VS Code Extension Host integration tests.
- **Open-source release infrastructure:** GitHub issue and pull-request templates, dependency updates, CI package checks, and tag-driven VSIX releases.
