/**
 * 模块说明：本文件负责图标选择界面与资源检索，具体对象为 `IconDictionaryCatalog`。
 *
 * 实现要点：维护经过审计的静态条目与查找元数据，使展示和语义匹配保持稳定。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`IconDictionaryEntry`、`iconDictionaryCatalog`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { normalizeBookmarkIconName } from '../BookmarkIconName'

export interface IconDictionaryEntry {
	id: string
	name: string
	keywords?: string[]
}

const ICON_DICTIONARY_ID_PATTERN = /^(status|arch|ui|fun|brand)_[a-z0-9][a-z0-9_-]*\.svg$/

function isSafeDisplayText(value: unknown): value is string {
	return typeof value === 'string'
		&& value.length > 0
		&& value.length <= 120
		&& !/[<>&"']/.test(value)
		&& !Array.from(value).some(character => character.charCodeAt(0) < 32)
}

class IconDictionaryCatalog {
	private entries: IconDictionaryEntry[] | undefined
	private entriesById = new Map<string, IconDictionaryEntry>()
	private loading: Promise<IconDictionaryEntry[]> | undefined

	get isLoaded(): boolean {
		return this.entries !== undefined
	}

	has(iconId: string): boolean {
		return this.entriesById.has(iconId)
	}

	get(iconId: string): IconDictionaryEntry | undefined {
		return this.entriesById.get(iconId)
	}

	load(context: vscode.ExtensionContext): Promise<IconDictionaryEntry[]> {
		if (this.entries) return Promise.resolve(this.entries)
		if (!this.loading) {
			const jsonPath = path.join(context.extensionPath, 'resources', 'icon_dictionary.json')
			this.loading = fs.promises.readFile(jsonPath, 'utf8').then(content => {
				const parsed: unknown = JSON.parse(content)
				const icons = Array.isArray(parsed)
					? parsed.filter((entry): entry is IconDictionaryEntry => {
						if (typeof entry !== 'object' || entry === null) return false
						const icon = entry as Record<string, unknown>
						return normalizeBookmarkIconName(icon.id) !== ''
							&& ICON_DICTIONARY_ID_PATTERN.test(String(icon.id))
							&& isSafeDisplayText(icon.name)
							&& (icon.keywords === undefined
								|| (Array.isArray(icon.keywords) && icon.keywords.every(isSafeDisplayText)))
					})
					: []
				this.entriesById = new Map(icons.map(icon => [icon.id, icon]))
				this.entries = icons
				return icons
			}).finally(() => {
				this.loading = undefined
			})
		}
		return this.loading
	}
}

export const iconDictionaryCatalog = new IconDictionaryCatalog()
