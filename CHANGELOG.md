# Changelog

本项目的显著变化记录在此文件中，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## 1.0.1 - 2026-07-22

### Changed

- README 增加界面概览截图，并完善安装入口、项目说明、Issue 模板和维护文档。
- 升级开发依赖与 TypeScript 类型库基线，适配更严格的静态检查。
- Marketplace 发布改用 GitHub OIDC 与 Microsoft Entra ID 短期令牌，并与 GitHub Release 共用同一份经过哈希核对的 VSIX。

### Fixed

- 修复重新生成扩展清单时可能丢失 `dependencies` 与 `devDependencies` 的问题。
- 书签配置导入读取失败时保留底层文件系统错误原因，便于定位异常。

## 1.0.0 - 2026-07-21

### Added

- 可拖拽、可嵌套、可排序的分层代码书签树。
- 工作区与独立脚本共享的全局脚本身份和持久化结构。
- 文件、目录和工作区根目录移动后的书签自动恢复。
- TODO、FIXME、BUG 注释自动书签及语言配置发现。
- Markdown、HTML、CSV、纯文本和配置源文件导出，以及按源文件批量导出。
- 单文件或工作区配置导入、撤销重做、图标选择器和行内标签。
- 可配置 Endpoint、Model 与 API Key 的 AI 书签生成、标签优化和语义图标选择。
- 原子保存、外部配置变更合并、存储根目录转移和异常恢复日志。
- TypeScript、ESLint、专项验证和 VS Code Extension Host 集成测试。
- GitHub Issue 与 Pull Request 模板、依赖更新、CI 打包校验和标签驱动的 VSIX Release 流程。
