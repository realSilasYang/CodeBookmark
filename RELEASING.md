# 发布指南

本文说明如何把 CodeBookmark 源码公开到 GitHub、生成可安装的 VSIX，并在取得 Marketplace Publisher ID 后发布扩展。任何访问令牌都只能保存在本机凭据管理器或受控发布环境中，严禁写入仓库。

## 1. 首次公开仓库

公开前确认当前工作树中的源码、测试、图标重命名和删除项都属于待发布版本：

```bash
git status --short
git diff --check
npm ci
npm run check:release
```

确认改动后再由维护者暂存并提交。当前仓库元数据使用以下 GitHub 地址：

```text
https://github.com/realSilasYang/CodeBookmark
```

仓库尚未创建时，可以在 GitHub 网页中创建空仓库，或在已登录 GitHub CLI 后执行：

```bash
gh repo create realSilasYang/CodeBookmark --public --source=. --remote=origin --push
```

不要让 GitHub 自动生成 README、许可证或 `.gitignore`，这些文件已经由本项目维护。首次推送后，在仓库设置中完成以下操作：

- 确认默认分支名称和仓库可见性。
- 启用 Private vulnerability reporting，使 `SECURITY.md` 中的私密报告入口可用。
- 为默认分支启用保护规则，至少要求 Pull Request 和 CI 通过。
- 开启 Dependabot security updates，并允许 `.github/dependabot.yml` 创建更新请求。
- 设置仓库简介、主页和主题，例如 `vscode-extension`、`bookmark`、`code-navigation`。

## 2. 准备版本

版本号只在 `src/util/constants/BasePackage.ts` 中修改，随后运行 `npm run compile` 生成 `package.json`。同时更新 `CHANGELOG.md`，并确认 README 描述与实际功能一致。

Marketplace 要求扩展 `name` 和 `displayName` 唯一。首次发布前应重新搜索 `CodeBookmark`，确认没有同名扩展；不要改回已经被其他扩展占用的 `Code Bookmarks`：

```bash
npx --yes @vscode/vsce@3.9.2 search CodeBookmark
```

发布候选必须依次通过：

```bash
npm ci
npm run check:release
npm run package:vsix -- --out codebookmark-1.0.0.vsix
```

`package:list` 和 VSIX 打包会使用固定版本的 `@vscode/vsce`。包内只应出现 JavaScript 编译输出、运行时资源、README、CHANGELOG、SUPPORT、主许可证和第三方许可文件，不应出现 source map、`src`、`scripts`、测试、`.git`、`.env`、本机路径或书签数据。项目没有原生依赖，生成的 VSIX 是跨平台通用包，不需要 `--target`。

## 3. 创建 GitHub Release

创建版本标签前，必须先完成第 4 节的 Publisher 注册，并在 GitHub 仓库的 Actions variables 中设置 `VSCODE_MARKETPLACE_PUBLISHER`。该值必须与 `package.json.publisher` 完全一致；未设置或不一致时，Release 工作流会主动失败，防止发布无法延续升级的错误扩展身份。

提交发布版本后创建与清单版本完全一致的标签：

```bash
git tag -a v1.0.0 -m "CodeBookmark 1.0.0"
git push origin v1.0.0
```

`.github/workflows/release.yml` 会在 Windows Runner 上重新执行验证和扩展宿主集成测试，检查标签与 `package.json` 版本一致，生成 VSIX，并创建 GitHub Release。不要在失败的工作流上手工补发未经验证的包。

## 4. 发布到 VS Code Marketplace

Marketplace 发布前必须先在 [Visual Studio Marketplace 管理页](https://marketplace.visualstudio.com/manage)创建 Publisher，并确认 Publisher ID。ID 是扩展公开身份的一部分，创建后不能修改。当前清单中的候选值是 `realSilasYang`；只有成功注册该 ID 后才能保留。若实际 ID 不同，应修改 `src/util/constants/BasePackage.ts` 的 `publisher`、重新编译并重新执行全部发布检查。

注册成功后，在 GitHub 仓库中设置公开的确认变量：

```bash
gh variable set VSCODE_MARKETPLACE_PUBLISHER --body "<Publisher-ID>"
```

首次发布最稳妥的方式是先用 `npm run package:vsix` 生成并验证 VSIX，再从 Marketplace 管理页手工上传。这样不需要把 Marketplace 凭据交给 GitHub Actions。当前 `.github/workflows/release.yml` 只创建 GitHub Release，不会自动发布到 Marketplace。

如需在 2026 年 12 月 1 日前临时使用 CLI 发布，PAT 必须选择 `All accessible organizations` 和 `Marketplace: Manage`，并尽量设置短有效期：

```bash
npx --yes @vscode/vsce@3.9.2 login <Publisher-ID>
npx --yes @vscode/vsce@3.9.2 publish --packagePath codebookmark-1.0.0.vsix
```

Azure DevOps 全局 PAT 将在 2026 年 12 月 1 日退役。长期自动发布应使用 Azure DevOps Service Connection、Microsoft Entra ID 工作负载身份联合和用户分配的 Managed Identity，授予该身份 Publisher 的 Contributor 角色，再通过 `vsce publish --azure-credential` 发布。不要把长期 PAT 迁移成另一个 GitHub Secret。

本项目的版本事实源是 `src/util/constants/BasePackage.ts`，因此不要使用会直接改写 `package.json` 并创建提交、标签的 `vsce publish major|minor|patch`。始终先修改事实源、生成清单、验证 VSIX，再使用 `--packagePath` 发布。

发布后核对 Marketplace 页面中的名称、Publisher、版本、README、CHANGELOG、SUPPORT、许可证、仓库链接和安装结果。令牌不得出现在命令历史共享内容、Issue、日志、配置示例或 GitHub Release 中。

## 5. 发布后检查

- 从 GitHub Release 安装 VSIX，重新验证激活、设置、书签读写、移动追随、导入导出、撤销重做和 AI 配置入口。
- 从 Marketplace 安装正式版本并确认 Publisher ID。
- 确认 GitHub Actions 全部通过，Release 附件版本与标签一致。
- 对公开 Issue、Dependabot 和安全报告建立维护节奏。
