'use strict'

import * as vscode from 'vscode'

import { fileEditorSubscriber } from './subscriptions/fileEditorSubscriber'

import { configurationSubscriber } from './subscriptions/configurationSubscriber'

import { CodeBookmarksViewProvider } from './providers/CodeBookmarkViewProvider'
import { createCodeBookmarkView } from './providers/createCodeBookmarkView'
import { bookmarkCommands } from './commands/bookmarkCommands'
import { openNodeCommand } from './commands/openNodeCommand'
import { statusBarSubscriber } from './subscriptions/statusBarSubscriber'
import { registerExportCommand } from './commands/exportCommand'
import { CodeBookmarkDecorationProvider } from './providers/CodeBookmarkDecorationProvider'

export function activate(context: vscode.ExtensionContext) {
	// bookmark
	const codeBookmarkProvider = new CodeBookmarksViewProvider(context)
	
	context.subscriptions.push(
		vscode.window.registerFileDecorationProvider(new CodeBookmarkDecorationProvider())
	)

	// bookmark list
	const viewCodeBookmark = createCodeBookmarkView(context, codeBookmarkProvider)
	bookmarkCommands(context, codeBookmarkProvider)
	openNodeCommand(context)
	statusBarSubscriber(context, codeBookmarkProvider)
	registerExportCommand(context, codeBookmarkProvider)



	// register common
	fileEditorSubscriber(context,
		codeBookmarkProvider
	)
	configurationSubscriber(context)

	// init data
	codeBookmarkProvider.init(viewCodeBookmark).then(() => {
	})
}

export function deactivate() {
}

