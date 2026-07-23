export const basePackage = {
	"name": "codebookmark",
	"displayName": "代码书签 - CodeBookmark",
	"description": "面向代码阅读与导航的智能书签。粘性引擎让书签持续绑定脚本，随代码编辑、文件改名和目录移动自动追随，无需反复校准；配置本地保存，AI 辅助生成书签、优化标签并匹配丰富图标，让关键逻辑一眼可见、随时直达。",
	"version": "2.0.0",
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
	"categories": [
		"Other"
	],
	"main": "./out/extension.js",
	"files": [
		"out/extension.js",
		"resources",
		"package.nls*.json",
		"README.md",
		"README.en.md",
		"CHANGELOG.md",
		"CHANGELOG.en.md",
		"LICENSE",
		"THIRD_PARTY_NOTICES.md",
		"THIRD_PARTY_LICENSES"
	],
	"scripts": {
		"generate-package-json": "node generate-package-json.js",
		"vscode:prepublish": "npm run compile",
		"bundle": "node scripts/bundle-extension.js",
		"compile": "node scripts/clean-output.js && tsc -p ./ && npm run bundle && node generate-package-json.js",
		"watch": "tsc -watch -p ./",
		"lint": "eslint --max-warnings=0 \"src/**/*.ts\" \"generate-package-json.js\" \"scripts/**/*.js\"",
		"verify": "npm run compile && npm run lint && node scripts/verify-all.js",
		"test:integration": "npm run compile && node scripts/run-integration-tests.js",
		"verify:icons": "node scripts/verify-icon-assets.js",
		"package:list": "npx --yes @vscode/vsce@3.9.2 ls --no-dependencies",
		"package:vsix": "npx --yes @vscode/vsce@3.9.2 package --no-dependencies",
		"check:release": "npm run verify && npm run test:integration && npm audit --audit-level=low && npm run package:list"
	}
}
