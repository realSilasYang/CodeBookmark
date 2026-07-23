# 📝 English Changelog Template

[简体中文](./CHANGELOG_TEMPLATE.md) · [English](./CHANGELOG_TEMPLATE.en.md)

When adding a release, copy the block below after the introduction in `CHANGELOG.en.md`. Keep only categories that contain actual changes. Each entry uses "**Feature name:** user-facing change and benefit" rather than commit messages, internal class names, or unrelated implementation details.

## 🎉 Version X.Y.Z - YYYY-MM-DD

### ✨ Added

- **Feature name:** Explain what was added, where it applies, and what users gain.

---

### 🚀 Improvements

- **Feature name:** Explain how an existing experience improved and the concrete change users can observe.

---

### 🐛 Fixed

- **Issue name:** Explain the observable problem and the correct behavior after the fix.

---

### ⚠️ Important Notes

- **Upgrade notice:** Keep this section only for configuration migration, incompatible behavior, or required user action, and state the exact procedure.

## 📐 Writing Rules

- Use `🎉 Version X.Y.Z - YYYY-MM-DD`; the version must match the extension manifest.
- Standard categories are `✨ Added`, `🚀 Improvements`, and `🐛 Fixed`; delete empty categories.
- Use `⚠️ Important Notes` only for upgrade actions, compatibility changes, or other information users must see in advance.
- Start each entry with a concise bold phrase, followed by one complete English sentence describing actual impact.
- Combine fragmented commits for one feature. Avoid user-opaque descriptions such as "refactor a file" or "rename a variable."
- Retain the matching emoji on the document title and section headings so GitHub Releases and `CHANGELOG.en.md` remain easy to scan.
