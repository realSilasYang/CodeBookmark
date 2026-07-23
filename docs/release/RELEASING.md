# 发布指南

[简体中文](./RELEASING.md) · [English](./RELEASING.en.md)

本文说明如何维护 CodeBookmark 的公开仓库、生成可安装的 VSIX，并联动发布到 VS Code Marketplace 与 GitHub Release。Marketplace 发布使用 GitHub Actions OIDC 与 Microsoft Entra ID 的短期令牌，仓库不保存长期发布凭据。

## 1. 仓库维护基线

CodeBookmark 的公开仓库固定为：

```text
https://github.com/realSilasYang/CodeBookmark
```

准备发布前，确认当前工作树中的源码、测试、资源重命名和删除项都属于待发布版本：

```bash
git status --short
git diff --check
npm ci
npm run check:release
```

确认改动后再由维护者暂存并提交。仓库设置应持续满足以下要求：

- 确认默认分支名称和仓库可见性。
- 启用 Private vulnerability reporting，使 `.github/SECURITY.md` 中的私密报告入口可用。
- 为默认分支启用保护规则，至少要求 Pull Request 和 CI 通过。
- 开启 Dependabot security updates，并允许 `.github/dependabot.yml` 创建更新请求。
- 设置仓库简介、主页和主题，例如 `vscode-extension`、`bookmark`、`code-navigation`。

## 2. 准备版本

版本号只在 `src/util/constants/BasePackage.ts` 中修改，随后运行 `npm run compile` 生成 `package.json`。同时按照[中文更新日志模板](CHANGELOG_TEMPLATE.md)在 `CHANGELOG.md` 顶部增加对应版本，并确认 README 描述与实际功能一致。版本标题必须使用 `🎉 版本 X.Y.Z - YYYY-MM-DD`；如有 `⚠️ 重要说明`，必须放在版本内容首位，其后再按 `✨ 新增`、`🚀 优化`、`🐛 修复` 分类；没有内容的分类应直接删除。

Marketplace 上的扩展身份已经固定为 Publisher `realSilasYang` 下的 `codebookmark`。不要在普通版本中修改 `publisher`、`name` 或 `displayName`；这类修改会改变扩展身份，必须作为单独迁移评估。

发布候选必须依次通过：

```bash
npm ci
npm run check:release
npm run package:vsix -- --out codebookmark-3.0.0.vsix
```

`package:list` 和 VSIX 打包使用 `devDependencies` 与 `package-lock.json` 中精确固定的 `@vscode/vsce`，发布工作流不临时下载另一份工具。包内只应出现单一打包后的 JavaScript 运行时入口、运行时资源、本地化清单、双语 README/CHANGELOG、主许可证和第三方许可文件，不应出现仓库维护文档、source map、`src`、`scripts`、测试、`.git`、`.env`、本机路径或书签数据。扩展没有运行时依赖或原生模块，生成的 VSIX 是跨平台通用包，不需要 `--target`。

## 3. 联动发布 Marketplace 与 GitHub Release

创建版本标签前，必须先完成第 4 节的 Publisher 注册和 Microsoft Entra ID 联合身份配置。工作流会同时核对 `VSCODE_MARKETPLACE_PUBLISHER` 与 `package.json.publisher`，并检查三个 Azure 标识变量；任何配置缺失时都会在发布前主动失败，防止只发布其中一个平台。

先把发布提交合入 `main`，再在该提交或其 `main` 祖先提交上创建与清单版本完全一致的注解标签。轻量标签和不属于 `main` 历史的标签都会被工作流拒绝：

```bash
git tag -a v3.0.0 -m "CodeBookmark 3.0.0"
git push origin v3.0.0
```

`.github/workflows/release.yml` 会串行执行全量验证、真实扩展宿主测试、标签身份与 `main` 历史核对、中文 Release 正文生成和 VSIX 打包。它还会生成 CycloneDX SBOM 与 `SHA256SUMS`，通过固定提交 SHA 的 GitHub 官方 Action 为 VSIX 写入构建来源和 SBOM 证明。随后工作流通过 GitHub OIDC 登录 Microsoft Entra ID，使用本地锁定的 `vsce publish --azure-credential --skip-duplicate` 发布 Marketplace，并下载线上包做逐字节 SHA-256 比对；全部通过后，GitHub Release 同时附带 VSIX、SBOM 和校验和。Release 正文来自 `CHANGELOG.md` 的对应版本块。已存在的 Release 会更新正文并覆盖同名附件，失败后可安全重跑；全局 `release` 并发组阻止多个版本同时发布。不要手工补发未经验证的包。

## 4. 配置 VS Code Marketplace 自动发布

当前 Marketplace Publisher ID 是 `realSilasYang`，并与 `src/util/constants/BasePackage.ts` 中的 `publisher` 保持一致。Publisher ID 是扩展公开身份的一部分，不应在后续版本中修改。可以在 [Visual Studio Marketplace 管理页](https://marketplace.visualstudio.com/manage)检查 Publisher 与扩展状态；身份方案以 VS Code 官方的[安全自动发布说明](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)为准。

自动发布采用一个用户分配的 Azure 托管身份。该方案需要有效的 Azure 订阅，但不需要单独创建 Azure DevOps 组织，也不需要在 GitHub 保存发布密钥。下列 `az` 命令可在 Azure Cloud Shell 的 Bash 环境中运行。首次配置按以下顺序完成：

1. 在 Azure 订阅中创建资源组和用户分配的托管身份。名称可以自定义，下例使用固定名称，便于后续维护：

```bash
az group create --name CodeBookmark-Publishing --location japaneast
az identity create \
  --resource-group CodeBookmark-Publishing \
  --name CodeBookmarkMarketplacePublisher
```

2. 查询订阅和托管身份标识，并给该身份授予订阅范围的 `Reader` 角色。该角色只允许读取 Azure 资源，不授予修改订阅资源的权限：

```bash
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
IDENTITY_PRINCIPAL_ID=$(az identity show \
  --resource-group CodeBookmark-Publishing \
  --name CodeBookmarkMarketplacePublisher \
  --query principalId \
  --output tsv)
az role assignment create \
  --assignee-object-id "$IDENTITY_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Reader \
  --scope "/subscriptions/$SUBSCRIPTION_ID"
```

3. 查询仓库当前使用的 OIDC Subject 前缀，再为该身份创建 GitHub Environment 专用的联合凭据。Issuer、Subject 和 Audience 必须与 GitHub 实际签发的断言逐字一致；本仓库使用包含组织与仓库数字 ID 的稳定前缀，Environment 名称固定为 `marketplace-release`：

```bash
gh api repos/realSilasYang/CodeBookmark/actions/oidc/customization/sub

az identity federated-credential create \
  --name GitHub-CodeBookmark-marketplace-release \
  --identity-name CodeBookmarkMarketplacePublisher \
  --resource-group CodeBookmark-Publishing \
  --issuer https://token.actions.githubusercontent.com \
  --subject repo:realSilasYang@64590265/CodeBookmark@1308408396:environment:marketplace-release \
  --audiences api://AzureADTokenExchange
```

不要根据仓库显示名称自行拼接 Subject。若 GitHub 返回的 `sub_claim_prefix` 与上例不同，应以实际返回值加上 `:environment:marketplace-release`；Azure 登录错误中的 `presented assertion subject` 也可以用于逐字核对。

4. 在 GitHub 仓库创建名为 `marketplace-release` 的 Environment。工作流将发布 Job 绑定到此 Environment，因而 OIDC 令牌的 Subject 只能匹配上面的联合凭据：

```bash
gh api --method PUT repos/realSilasYang/CodeBookmark/environments/marketplace-release
```

5. 查询托管身份的客户端与租户 ID，并将三个非机密标识保存为 GitHub 仓库变量：

```bash
az identity show \
  --resource-group CodeBookmark-Publishing \
  --name CodeBookmarkMarketplacePublisher \
  --query "{clientId:clientId,tenantId:tenantId}" \
  --output table
az account show --query id --output tsv

gh variable set VSCODE_MARKETPLACE_PUBLISHER --repo realSilasYang/CodeBookmark --body "realSilasYang"
gh variable set AZURE_CLIENT_ID --repo realSilasYang/CodeBookmark --body "<托管身份 clientId>"
gh variable set AZURE_TENANT_ID --repo realSilasYang/CodeBookmark --body "<托管身份 tenantId>"
gh variable set AZURE_SUBSCRIPTION_ID --repo realSilasYang/CodeBookmark --body "<Azure subscriptionId>"
```

6. 在 GitHub Actions 中手动运行 `Resolve Marketplace Identity` 工作流。它只登录 Entra、调用 Azure DevOps Profile API，并把非机密的 Marketplace identity resource ID 写入运行摘要，不会构建或发布扩展。首次运行不启用权限验证，也可以从终端触发：

```bash
gh workflow run marketplace-identity.yml \
  --repo realSilasYang/CodeBookmark \
  -f verify_marketplace_access=false
```

7. 从该工作流的 Summary 复制 identity resource ID，在 [Visual Studio Marketplace 管理页](https://marketplace.visualstudio.com/manage)打开 Publisher `realSilasYang`，使用这个 ID 添加成员并授予 `Contributor` 角色。这里不能使用 Azure 门户中的资源名称、客户端 ID 或对象 ID 代替。只有该身份已经加入 Marketplace Publisher，`--azure-credential` 才有发布权限。

8. 再次运行同一工作流并启用权限验证。它会调用 `vsce verify-pat --azure-credential` 验证托管身份确实具有 Publisher 发布权限，但不会上传或修改扩展；只有本次运行完整成功后，才创建正式版本标签：

```bash
gh workflow run marketplace-identity.yml \
  --repo realSilasYang/CodeBookmark \
  -f verify_marketplace_access=true
```

`AZURE_CLIENT_ID`、`AZURE_TENANT_ID` 和 `AZURE_SUBSCRIPTION_ID` 是资源标识，不是凭据。`azure/login` 在每次运行时使用 GitHub OIDC 换取短期令牌，`vsce` 再从已登录的 Azure CLI 会话取得该令牌。仓库不需要 Actions Secret；不要添加长期发布令牌或客户端密钥作为兼容路径。

配置完成后，可在创建正式标签前从 Actions 页面手动检查 Release 工作流配置，但不要用虚假版本标签测试发布。正式发布失败时先修正身份、变量或 Publisher 权限，再重新运行原工作流。

本项目的版本事实源是 `src/util/constants/BasePackage.ts`，因此不要使用会直接改写 `package.json` 并创建提交、标签的 `vsce publish major|minor|patch`。始终先修改事实源、生成清单、验证 VSIX，再使用 `--packagePath` 发布。

联动发布后核对 Marketplace 与 GitHub Release 的版本和 VSIX 是否一致，并检查 Marketplace 页面中的名称、Publisher、README、CHANGELOG、许可证、仓库链接和安装结果。Azure 标识可以公开记录，但任何短期令牌都不得出现在命令历史共享内容、Issue、日志、配置示例或 GitHub Release 中。

## 5. 发布后检查

- 从 GitHub Release 安装 VSIX，重新验证激活、设置、书签读写、移动追随、导入导出、撤销重做和 AI 配置入口。
- 从 Marketplace 安装正式版本并确认 Publisher ID。
- 确认 GitHub Actions 全部通过，Release 附件版本与标签一致。
- 对公开 Issue、Dependabot 和安全报告建立维护节奏。
