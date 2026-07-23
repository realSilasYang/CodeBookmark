# 安全策略

[简体中文](./SECURITY.md) · [English](./SECURITY.en.md)

## 支持范围

安全修复仅发布到当前最新版本。首个公开版本为 `1.0.0`。

## 报告漏洞

请不要在公开 Issue 中披露尚未修复的漏洞。请使用 GitHub 仓库的 [Private vulnerability reporting](https://github.com/realSilasYang/CodeBookmark/security/advisories/new) 提交复现步骤、受影响版本、影响范围和建议修复方式。

维护者确认后会评估影响、准备修复，并在发布安全版本后协调公开披露。一般功能缺陷和不包含安全影响的崩溃可以直接提交公开 Issue。

## 敏感数据说明

CodeBookmark 的 AI API Key 明文保存在用户选择的 VS Code 设置作用域中。远程 AI Endpoint 应使用 HTTPS；用户不应在问题报告、日志或示例配置中提交真实密钥和书签存储内容。
