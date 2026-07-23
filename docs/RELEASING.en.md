# Release Guide

[简体中文](./RELEASING.md) · [English](./RELEASING.en.md)

This guide covers maintenance of the public CodeBookmark repository, generation of an installable VSIX, and coordinated publication to VS Code Marketplace and GitHub Releases. Marketplace publication uses short-lived GitHub Actions OIDC and Microsoft Entra ID credentials; the repository stores no long-lived publishing credential.

## 1. Repository Maintenance Baseline

The public repository is fixed at:

```text
https://github.com/realSilasYang/CodeBookmark
```

Before release, confirm that source changes, tests, asset renames, and deletions in the worktree all belong to the intended version:

```bash
git status --short
git diff --check
npm ci
npm run check:release
```

Stage and commit only after reviewing the changes. Repository settings should continue to meet these requirements:

- Confirm the default branch name and public visibility.
- Enable Private vulnerability reporting so `.github/SECURITY.md` can route private reports.
- Protect the default branch with at least required pull requests and passing CI.
- Enable Dependabot security updates and allow `.github/dependabot.yml` to open updates.
- Maintain the repository description, homepage, and topics such as `vscode-extension`, `bookmark`, and `code-navigation`.

## 2. Prepare a Version

Change the version only in `src/util/constants/BasePackage.ts`, then run `npm run compile` to regenerate `package.json`. Add the corresponding version to both `CHANGELOG.md` and `CHANGELOG.en.md` using the structured [Chinese](CHANGELOG_TEMPLATE.md) and [English](CHANGELOG_TEMPLATE.en.md) templates, and confirm that both README files describe actual behavior.

Chinese headings use `🎉 版本 X.Y.Z - YYYY-MM-DD`; English headings use `🎉 Version X.Y.Z - YYYY-MM-DD`. Keep only applicable `✨ Added`, `🚀 Improvements`, `🐛 Fixed`, and optional `⚠️ Important Notes` sections.

The Marketplace identity is fixed as extension `codebookmark` under Publisher `realSilasYang`. Do not change `publisher`, `name`, or `displayName` in a routine release. Such changes affect extension identity and require a separate migration review.

A release candidate must pass:

```bash
npm ci
npm run check:release
npm run package:vsix -- --out codebookmark-2.0.0.vsix
```

`package:list` and VSIX packaging use a pinned `@vscode/vsce` version. The package may contain one bundled JavaScript runtime entry point, runtime resources, localization catalogs, both README and CHANGELOG languages, the main license, and third-party notices/licenses. It must not contain maintenance-only docs, source maps, `src`, scripts, tests, `.git`, `.env`, local paths, or bookmark data. The extension has no runtime dependencies or native modules, so the VSIX is cross-platform and requires no `--target`.

## 3. Coordinate Marketplace and GitHub Release

Complete the Publisher and Microsoft Entra ID setup in section 4 before creating a tag. The workflow verifies `VSCODE_MARKETPLACE_PUBLISHER` against `package.json.publisher` and checks all three Azure identifiers. Missing configuration fails before publication, preventing a one-sided release.

After committing the release version, create a tag that exactly matches the manifest:

```bash
git tag -a v2.0.0 -m "CodeBookmark 2.0.0"
git push origin v2.0.0
```

`.github/workflows/release.yml` runs verification, Extension Host integration in Chinese and English, tag/version checks, release-note generation, and VSIX packaging in sequence. It then signs in to Microsoft Entra ID through GitHub OIDC, uses `vsce publish --azure-credential --skip-duplicate` to publish that VSIX to Marketplace, and creates the GitHub Release.

Release notes are extracted from the matching `CHANGELOG.md` block and converted to a Chinese structure headed `🎉 CodeBookmark vX.Y.Z 更新日志`. The workflow downloads the Marketplace package and compares its SHA-256 with the build artifact before continuing. If a GitHub Release already exists, its title and notes are updated and the same-named VSIX is added or replaced, so a failed run can be rerun safely. A global `release` concurrency group blocks overlapping versions. Never manually publish an unverified package to compensate for a failed workflow.

## 4. Configure Automatic Marketplace Publication

Publisher ID `realSilasYang` must remain consistent with `src/util/constants/BasePackage.ts`. Verify it in the [Visual Studio Marketplace publisher portal](https://marketplace.visualstudio.com/manage). The identity design follows the official [secure automated publishing guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).

Automatic publication uses a user-assigned Azure managed identity. It requires an active Azure subscription but no Azure DevOps organization and no publishing key in GitHub. Run the following commands in Azure Cloud Shell Bash.

1. Create a resource group and managed identity. Names are customizable; fixed names simplify maintenance:

```bash
az group create --name CodeBookmark-Publishing --location japaneast
az identity create \
  --resource-group CodeBookmark-Publishing \
  --name CodeBookmarkMarketplacePublisher
```

2. Read subscription and principal IDs, then grant the identity subscription-level `Reader`. This role can read Azure resources but cannot modify them:

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

3. Query the repository's current OIDC subject prefix, then create a federated credential restricted to GitHub Environment `marketplace-release`. Issuer, subject, and audience must exactly match GitHub's assertion:

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

Do not construct the subject from display names. If GitHub reports a different `sub_claim_prefix`, append `:environment:marketplace-release` to that exact value. Azure login errors also show the presented assertion subject for exact comparison.

4. Create the GitHub Environment. The publishing job is bound to it, so the OIDC subject can match only that environment:

```bash
gh api --method PUT repos/realSilasYang/CodeBookmark/environments/marketplace-release
```

5. Query client, tenant, and subscription IDs and save the non-secret values as GitHub repository variables:

```bash
az identity show \
  --resource-group CodeBookmark-Publishing \
  --name CodeBookmarkMarketplacePublisher \
  --query "{clientId:clientId,tenantId:tenantId}" \
  --output table
az account show --query id --output tsv

gh variable set VSCODE_MARKETPLACE_PUBLISHER --repo realSilasYang/CodeBookmark --body "realSilasYang"
gh variable set AZURE_CLIENT_ID --repo realSilasYang/CodeBookmark --body "<managed-identity-clientId>"
gh variable set AZURE_TENANT_ID --repo realSilasYang/CodeBookmark --body "<managed-identity-tenantId>"
gh variable set AZURE_SUBSCRIPTION_ID --repo realSilasYang/CodeBookmark --body "<Azure-subscriptionId>"
```

6. Manually run `Resolve Marketplace Identity`. It only signs in, calls the Azure DevOps Profile API, and writes the non-secret Marketplace identity resource ID to the run summary. The first run may omit access verification:

```bash
gh workflow run marketplace-identity.yml \
  --repo realSilasYang/CodeBookmark \
  -f verify_marketplace_access=false
```

7. Copy the identity resource ID from the run Summary. In the [Marketplace publisher portal](https://marketplace.visualstudio.com/manage), open Publisher `realSilasYang`, add that ID as a member, and grant Contributor. Do not substitute the Azure resource name, client ID, or object ID. `--azure-credential` can publish only after the Marketplace Publisher contains this identity.

8. Run the identity workflow again with access verification. It calls `vsce verify-pat --azure-credential` without uploading or changing an extension. Create a release tag only after this run passes completely:

```bash
gh workflow run marketplace-identity.yml \
  --repo realSilasYang/CodeBookmark \
  -f verify_marketplace_access=true
```

`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` identify resources and are not credentials. `azure/login` exchanges GitHub OIDC for a short-lived token on each run; `vsce` obtains that token from the signed-in Azure CLI session. No Actions Secret, PAT, or client secret is required or retained.

Before a real tag, inspect the Release workflow in Actions, but do not create a fake version tag to test publication. On failure, fix identity, variables, or Publisher membership, then rerun the original workflow.

`src/util/constants/BasePackage.ts` is the version source of truth. Do not use `vsce publish major|minor|patch`, which directly edits `package.json` and creates version-control state. Update the source, regenerate the manifest, verify the VSIX, then publish by `--packagePath`.

After a coordinated release, compare Marketplace and GitHub versions and VSIX files, and inspect the Marketplace name, Publisher, README, CHANGELOG, license, repository link, and installation. Azure identifiers may be documented publicly, but short-lived tokens must never appear in shared shell history, issues, logs, examples, or release notes.

## 5. Post-release Checks

- Install the GitHub Release VSIX and retest activation, settings, bookmark read/write, move following, import/export, undo/redo, and AI settings.
- Install the Marketplace version and confirm the Publisher ID.
- Confirm that every GitHub Actions job passed and the Release attachment version matches the tag.
- Establish a maintenance rhythm for public issues, Dependabot updates, and security reports.
