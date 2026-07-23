# Security Policy

[简体中文](./SECURITY.md) · [English](./SECURITY.en.md)

## Supported Versions

Security fixes are released only for the latest current version. The first public version is `1.0.0`.

## Reporting a Vulnerability

Do not disclose unresolved vulnerabilities in a public issue. Use GitHub [Private vulnerability reporting](https://github.com/realSilasYang/CodeBookmark/security/advisories/new) and include reproduction steps, affected versions, impact, and any suggested remediation.

After confirmation, the maintainer will assess impact, prepare a fix, and coordinate disclosure after a secure version is available. Ordinary defects and crashes without a security impact may use public issues.

## Sensitive Data

CodeBookmark stores the AI API key in plain text in the VS Code configuration scope selected by the user. Remote AI endpoints should use HTTPS. Never include real keys, bookmark storage contents, private source code, or personally identifiable local paths in reports, logs, or examples.
