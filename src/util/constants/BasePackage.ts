/**
 * 模块说明：本文件负责跨模块常量与稳定标识符，具体对象为 `BasePackage`。
 *
 * 实现要点：集中维护跨运行时与生成脚本共享的稳定常量，避免字符串和顺序发生漂移。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`basePackage`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import { RESTRICTED_WORKSPACE_CONFIGURATION_KEYS } from '../WorkspaceCapabilities'

export const basePackage = {
	"name": "codebookmark",
	"displayName": "代码书签 - CodeBookmark",
	"description": "为代码智能导航而生，符合你的直觉。粘性引擎让书签持续绑定脚本，随代码编辑、文件改名和目录移动自动追随，无需反复校准；配置本地保存，AI 辅助生成书签、优化标签并匹配丰富图标，让关键逻辑一眼可见、随时直达。",
	"version": "3.0.2",
	"publisher": "realSilasYang",
	"author": "阳熙来",
	"private": true,
	"license": "MIT",
	"repository": {
		"type": "git",
		"url": "https://github.com/realSilasYang/CodeBookmark.git"
	},
	"homepage": "https://github.com/realSilasYang/CodeBookmark#readme",
	"bugs": {
		"url": "https://github.com/realSilasYang/CodeBookmark/issues"
	},
	"keywords": [
		"bookmark",
		"bookmarks",
		"code bookmark",
		"code bookmarks",
		"code-bookmark",
		"书签",
		"代码书签",
		"源码书签",
		"源代码书签",
		"标签",
		"代码标签",
		"源码标签",
		"代码导航",
		"code-navigation",
		"sticky-bookmark",
		"bookmark-manager",
		"file-tracking",
		"local-storage",
		"bookmark-icons",
		"ai-bookmarks",
		"ai",
		"vscode"
	],
	"icon": "resources/bookmark_logo.png",
	"galleryBanner": {
		"color": "#252526",
		"theme": "dark"
	},
	"pricing": "Free",
	"engines": {
		"vscode": "^1.125.0",
		"node": ">=24 <25"
	},
	"extensionKind": [
		"workspace"
	],
	"capabilities": {
		"virtualWorkspaces": {
			"supported": false,
			"description": "代码书签需要本地文件系统来绑定脚本并持久化书签配置。"
		},
		"untrustedWorkspaces": {
			"supported": "limited",
			"description": "未受信任工作区中可使用本地书签功能，但 AI 功能和工作区级敏感配置会停用。",
			"restrictedConfigurations": RESTRICTED_WORKSPACE_CONFIGURATION_KEYS
		}
	},
	"categories": [
		"Other"
	],
	"main": "./out/extension.js",
	"files": [
		"out/extension.js",
		"resources",
		"package.nls*.json",
		"README.md",
		"docs/README.en.md",
		"CHANGELOG.md",
		"docs/CHANGELOG.en.md",
		"LICENSE",
		"docs/legal/THIRD_PARTY_NOTICES.md",
		"docs/legal/licenses"
	],
	"scripts": {
		"generate-package-json": "node scripts/build/generate-package-json.js",
		"vscode:prepublish": "npm run compile",
		"bundle": "node scripts/build/bundle-extension.js",
		"compile": "node scripts/build/clean-output.js && tsc -p config/tsconfig.json && npm run bundle && npm run generate-package-json",
		"watch": "tsc --watch -p config/tsconfig.json",
		"lint": "eslint --config config/eslint.config.mjs --max-warnings=0 \"src/**/*.ts\" \"scripts/**/*.js\" \"tests/**/*.js\"",
		"test:unit": "npm run compile && npm run test:unit:compiled",
		"test:unit:compiled": "node --test --test-reporter=spec \"tests/unit/*.test.js\"",
		"test:contract": "npm run compile && npm run test:contract:compiled",
		"test:contract:compiled": "node --test --test-reporter=spec \"tests/contracts/*.test.js\"",
		"test:coverage": "npm run compile && node --test --experimental-test-coverage --test-coverage-include=out/models/BookmarkCodec.js --test-coverage-include=out/models/WorkspaceOrder.js --test-coverage-include=out/util/PersistenceMigration.js --test-coverage-include=out/util/PersistenceSchema.js --test-coverage-include=out/util/WorkspaceCapabilities.js --test-coverage-lines=90 --test-coverage-branches=75 --test-coverage-functions=85 --test-reporter=spec \"tests/unit/*.test.js\" \"tests/contracts/*.test.js\"",
		"verify": "npm run compile && npm run lint && npm run test:unit:compiled && npm run test:contract:compiled && node scripts/verify-all.js",
		"test:integration": "npm run compile && node scripts/integration/run-integration-tests.js",
		"verify:icons": "node scripts/verify-icon-assets.js",
		"package:list": "vsce ls --no-dependencies",
		"package:vsix": "vsce package --no-dependencies",
		"sbom": "node scripts/release/write-sbom.js",
		"check:release": "npm run verify && npm run test:integration && npm audit --audit-level=low && npm run package:list"
	}
}
