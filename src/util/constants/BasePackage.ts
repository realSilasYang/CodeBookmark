export const basePackage = {
	"name": "codebookmark",
	"displayName": "CodeBookmark",
	"description": "让书签通过粘性引擎持续绑定脚本并跟随代码，支持本地保存、AI 辅助与丰富的书签图标。",
	"version": "1.1.0",
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
		"code-navigation",
		"sticky-bookmark",
		"file-tracking",
		"local-storage",
		"bookmark-icons",
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
		"out/**/*.js",
		"resources",
		"README.md",
		"CHANGELOG.md",
		"LICENSE",
		"THIRD_PARTY_NOTICES.md",
		"THIRD_PARTY_LICENSES"
	],
	"scripts": {
		"generate-package-json": "node generate-package-json.js",
		"vscode:prepublish": "npm run compile",
		"compile": "node scripts/clean-output.js && tsc -p ./ && node generate-package-json.js",
		"watch": "tsc -watch -p ./",
		"lint": "eslint \"src/**/*.ts\" \"generate-package-json.js\" \"scripts/**/*.js\"",
		"verify": "npm run compile && npm run lint && node scripts/verify-all.js",
		"test:integration": "npm run compile && node scripts/run-integration-tests.js",
		"verify:icons": "node scripts/verify-icon-assets.js",
		"package:list": "npx --yes @vscode/vsce@3.9.2 ls --no-dependencies",
		"package:vsix": "npx --yes @vscode/vsce@3.9.2 package --no-dependencies",
		"check:release": "npm run verify && npm run test:integration && npm audit --audit-level=high && npm run package:list"
	}
}
