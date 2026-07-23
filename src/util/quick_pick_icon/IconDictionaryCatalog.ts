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
