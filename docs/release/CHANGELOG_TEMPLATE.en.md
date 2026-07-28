# 📝 English Changelog Template

[简体中文](./CHANGELOG_TEMPLATE.md) · [English](./CHANGELOG_TEMPLATE.en.md)

When adding a release, copy the block below after the language links in `docs/CHANGELOG.en.md`. Keep only categories that contain actual changes. The template does not generate Important Notes by default; add that section manually only for breaking changes or mandatory upgrade actions. Each entry uses "**Feature name:** user-facing change and benefit" rather than commit messages, internal class names, or unrelated implementation details.

## 🎉 Version X.Y.Z - YYYY-MM-DD

### ✨ Added

- **Feature name:** Explain what was added, where it applies, and what users gain.

---

### 🚀 Improvements

- **Feature name:** Explain how an existing experience improved and the concrete change users can observe.

---

### 🐛 Fixed

- **Issue name:** Explain the observable problem and the correct behavior after the fix.

## 📐 Writing Rules

- Use `🎉 Version X.Y.Z - YYYY-MM-DD`; the version must match the extension manifest.
- `⚠️ Important Notes` is an optional warning section and is omitted by default. Add it only when existing data or configuration is incompatible, data may be lost, minimum-environment or privilege changes are breaking, changed defaults create an upgrade risk, or users must migrate, back up, or replace files.
- Do not classify unchanged compatibility, direct-upgrade availability, portable package recommendations, edition selection, feature summaries, ordinary usage advice, or validation scope as Important Notes. When the section exists, every item states who is affected, the concrete risk, and the required action, and the section precedes standard categories. Remove the heading when no item qualifies.
- Standard categories are `✨ Added`, `🚀 Improvements`, and `🐛 Fixed`; delete empty categories. `🔒 Security` appears only after coordinated disclosure.
- Start each entry with a concise bold phrase, followed by one complete English sentence describing actual impact.
- Combine fragmented commits for one feature. Avoid user-opaque descriptions such as "refactor a file" or "rename a variable."
- Retain the matching emoji on the document title and section headings so GitHub Releases and `docs/CHANGELOG.en.md` remain easy to scan.
