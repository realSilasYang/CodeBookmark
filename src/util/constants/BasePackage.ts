export const basePackage = {
	"name": "codebookmark",
	"displayName": "Code Bookmark",
	"description": "Drag and Drop bookmark, group bookmark, watcher bookmark",
	"version": "0.0.7",
	"publisher": "阳熙来",
	"author": "阳熙来",
	"private": true,
	"license": "MIT",
	"icon": "resources/bookmark.svg",
	"engines": {
		"vscode": "^1.125.0"
	},
	"categories": [
		"Other"
	],
	"activationEvents": [
		"*"
	],
	"main": "./out/extension.js",
	"scripts": {
		"generate-package-json": "node generate-package-json.js",
		"build:dev": "npm run compile && cross-env BUILD_ENV=Dev npm run generate-package-json",
		"build:prod": "npm run compile && cross-env npm run generate-package-json",
		"vscode:prepublish": "npm run compile",
		"compile": "tsc -p ./ && node generate-package-json.js",
		"watch": "tsc -watch -p ./",
		"lint": "eslint \"src/**/*.ts\""
	},
	"devDependencies": {
		"@eslint/js": "^9.10.0",
		"@types/node": "^26.1.1",
		"@types/vscode": "^1.125.0",
		"cross-env": "^10.1.0",
		"eslint": "^10.7.0",
		"globals": "^15.11.0",
		"typescript": "~6.0.0",
		"typescript-eslint": "^8.64.0"
	},
	"dependencies": {}
	}
	