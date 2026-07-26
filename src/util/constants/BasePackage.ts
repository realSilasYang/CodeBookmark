/**
 * 作为扩展清单的源码真值，集中声明版本、身份、设置、命令、菜单和本地化原文。
 * package.json 由构建脚本生成；直接编辑生成清单会在下一次编译时被覆盖。
 */
import { README_DOCUMENTS } from '../../i18n/ReadmeDocuments'
import { RESTRICTED_WORKSPACE_CONFIGURATION_KEYS } from '../WorkspaceCapabilities'

export const basePackage = {
	"name": "codebookmark",
	"displayName": "代码书签 - CodeBookmark",
	"description": "为代码智能导航而生，符合你的直觉。自研粘性引擎，让书签准确跟随代码并持续绑定脚本。采用本地保存方案，拥有强大的 AI 辅助功能，支持丰富的图标和自定义选项。",
	"version": "3.2.0",
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
		"code bookmark",
		"code navigation",
		"sticky bookmark",
		"bookmark manager",
		"bookmark icons",
		"ai bookmarks",
		"书签",
		"代码书签",
		"标签",
		"代码标签",
		"代码导航",
		"代碼書籤",
		"程式碼書籤",
		"ブックマーク",
		"コードブックマーク",
		"북마크",
		"코드 북마크",
		"dấu trang",
		"dấu trang mã nguồn",
		"marcador",
		"marcadores de código",
		"signet",
		"signets de code",
		"закладка",
		"закладки кода",
		"lesezeichen",
		"code-lesezeichen",
		"segnalibro",
		"segnalibri codice"
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
		...README_DOCUMENTS,
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
		"verify:release": "node scripts/verify-all.js --release-only",
		"test:integration": "npm run compile && node scripts/integration/run-integration-tests.js",
		"benchmark:markers": "npm run compile && node scripts/performance/run-code-marker-benchmark.js",
		"verify:icons": "node scripts/verify-icon-assets.js",
		"package:list": "vsce ls --no-dependencies",
		"package:vsix": "node scripts/release/package-vsix.js",
		"sbom": "node scripts/release/write-sbom.js",
		"check:release": "npm run verify && npm run verify:release && npm run test:integration && npm audit --audit-level=low && npm run package:list"
	},
	"dependencies": {
		"fflate": "0.8.3"
	}
}
