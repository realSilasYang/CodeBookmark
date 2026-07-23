# 参与贡献

[简体中文](./CONTRIBUTING.md) · [English](./CONTRIBUTING.en.md)

感谢你为 CodeBookmark 提交问题、文档或代码改进。

提交普通缺陷、功能建议或改进建议时，请使用仓库提供的 Issue 模板；使用问题请先阅读 [SUPPORT.md](SUPPORT.md)。尚未修复的安全漏洞必须按照 [SECURITY.md](SECURITY.md) 私密报告。

## 开发环境

- Node.js 24
- VS Code 1.125.0 或更高版本
- npm 11 或兼容版本

首次检出后执行：

```bash
npm ci
npm run compile
```

按 `F5` 可以启动扩展开发宿主。提交前必须运行：

```bash
npm run verify
npm run test:integration
npm audit --audit-level=low
```

## 修改约定

- 扩展元数据和 npm 脚本以 `src/util/constants/BasePackage.ts` 为事实源。
- 命令、菜单、快捷键和设置以 `src/util/constants/Commands.ts` 为事实源。
- 修改上述文件后运行 `npm run compile`，让 `package.json` 与源码保持一致。
- 新增行为应补充对应的 `scripts/verify-*.js`；涉及 VS Code 生命周期时再补集成测试。
- 新增第三方资源前必须核对再分发许可，并更新 `docs/legal/THIRD_PARTY_NOTICES.md`。
- 不要提交 API Key、用户路径、书签数据、构建产物或本地工具配置。
- 发布与版本维护流程见 [发布指南](../docs/release/RELEASING.md)；普通 Pull Request 不应创建版本标签或修改已发布版本。

## 提交与 Pull Request

每个提交应只表达一个完整意图，并包含必要的测试。Pull Request 请说明问题、行为变化、验证命令，以及可能影响的配置或持久化格式。用户可见变化还应更新 README 和 CHANGELOG。
