/**
 * 把便携书签对象写成单个标准 ZIP 文件，并在读取时执行大小、名称、摘要和格式校验。
 * 归档只在内存中展开受限条目且从不写出内部路径，因此压缩包无法越过用户选择的目录。
 */
import { strFromU8, strToU8, Unzip, UnzipInflate, zipSync, type Zippable } from 'fflate'
import { sha256Hex } from '../util/Sha256'
import {
	decodePortableLayout,
	decodePortableManifest,
	decodePortableScript,
	MAX_PORTABLE_ARCHIVE_BYTES,
	MAX_PORTABLE_SCRIPTS,
	MAX_PORTABLE_UNCOMPRESSED_BYTES,
	type PortableManifest,
	type PortablePackage,
	type PortableScript,
} from './PortablePackage'

function jsonBytes(value: unknown): Uint8Array {
	return strToU8(`${JSON.stringify(value, null, 2)}\n`)
}

export function createPortableArchive(
	manifest: Omit<PortableManifest, 'scripts' | 'layout' | 'base'>,
	scripts: readonly { index: Omit<PortableManifest['scripts'][number], 'sha256'>, value: PortableScript }[],
	layout?: unknown,
	base?: { revisionId: string, scripts: readonly PortableScript[] },
): Uint8Array {
	const files: Zippable = {}
	const indexedScripts: PortableManifest['scripts'] = []
	for (const script of scripts) {
		const bytes = jsonBytes(script.value)
		files[script.index.entry] = bytes
		indexedScripts.push({ ...script.index, sha256: sha256Hex(bytes) })
	}
	let layoutIndex: PortableManifest['layout']
	if (layout !== undefined) {
		const bytes = jsonBytes(layout)
		files['layout.json'] = bytes
		layoutIndex = { entry: 'layout.json', sha256: sha256Hex(bytes) }
	}
	let baseIndex: PortableManifest['base']
	if (base && base.scripts.length > 0) {
		baseIndex = { revisionId: base.revisionId, scripts: [] }
		for (const script of base.scripts) {
			const entry = `base/scripts/${script.scriptId}.json`
			const bytes = jsonBytes(script)
			files[entry] = bytes
			baseIndex.scripts.push({ scriptId: script.scriptId, entry, sha256: sha256Hex(bytes) })
		}
	}
	files['manifest.json'] = jsonBytes({ ...manifest, scripts: indexedScripts, layout: layoutIndex, base: baseIndex })
	const archive = zipSync(files, { level: 6 })
	if (archive.byteLength > MAX_PORTABLE_ARCHIVE_BYTES) throw new Error('Portable package exceeds the supported archive size')
	return archive
}

function decodeExpandedArchive(files: Readonly<Record<string, Uint8Array>>): PortablePackage {
	const manifestBytes = files['manifest.json']
	if (!manifestBytes) throw new Error('Portable package manifest is missing')
	const manifest = decodePortableManifest(JSON.parse(strFromU8(manifestBytes)))
	const allowedEntries = new Set(['manifest.json'])
	const scripts = new Map<string, PortableScript>()
	for (const index of manifest.scripts) {
		allowedEntries.add(index.entry)
		const bytes = files[index.entry]
		if (!bytes || sha256Hex(bytes) !== index.sha256) throw new Error(`Portable script entry is missing or damaged: ${index.relativePath}`)
		scripts.set(index.scriptId, decodePortableScript(JSON.parse(strFromU8(bytes)), index.scriptId))
	}
	const baseScripts = new Map<string, PortableScript>()
	if (manifest.base) {
		for (const index of manifest.base.scripts) {
			allowedEntries.add(index.entry)
			const bytes = files[index.entry]
			if (!bytes || sha256Hex(bytes) !== index.sha256) throw new Error('Portable package base revision is missing or damaged')
			baseScripts.set(index.scriptId, decodePortableScript(JSON.parse(strFromU8(bytes)), index.scriptId))
		}
	}
	let layout
	if (manifest.layout) {
		allowedEntries.add(manifest.layout.entry)
		const bytes = files[manifest.layout.entry]
		if (!bytes || sha256Hex(bytes) !== manifest.layout.sha256) throw new Error('Portable package layout is missing or damaged')
		layout = decodePortableLayout(JSON.parse(strFromU8(bytes)))
	}
	const unexpected = Object.keys(files).filter(name => !allowedEntries.has(name))
	if (unexpected.length > 0) throw new Error(`Portable package contains unexpected entries: ${unexpected.slice(0, 3).join(', ')}`)
	return { manifest, scripts, baseScripts, layout }
}

export function readPortableArchive(content: Uint8Array): Promise<PortablePackage> {
	if (content.byteLength === 0 || content.byteLength > MAX_PORTABLE_ARCHIVE_BYTES) {
		return Promise.reject(new Error('Portable package size is invalid'))
	}
	return new Promise<PortablePackage>((resolve, reject) => {
		const files: Record<string, Uint8Array> = {}
		const names = new Set<string>()
		const activeFiles: Array<{ terminate(): void }> = []
		let expandedBytes = 0
		let pendingFiles = 0
		let inputFinished = false
		let settled = false
		const fail = (error: unknown): void => {
			if (settled) return
			settled = true
			for (const file of activeFiles) file.terminate()
			reject(error instanceof Error ? error : new Error(String(error)))
		}
		const finish = (): void => {
			if (settled || !inputFinished || pendingFiles !== 0) return
			try {
				const decoded = decodeExpandedArchive(files)
				settled = true
				resolve(decoded)
			} catch (error) { fail(error) }
		}
		const unzip = new Unzip(file => {
			if (settled || file.name.endsWith('/')) return
			if (names.size >= MAX_PORTABLE_SCRIPTS * 2 + 3) return fail(new Error('Portable package contains too many archive entries'))
			if (names.has(file.name) || file.name.includes('\\') || file.name.startsWith('/')
				|| file.name.split('/').some(segment => segment === '..')) {
				return fail(new Error('Portable package contains an unsafe or duplicate archive entry'))
			}
			if (file.originalSize !== undefined && expandedBytes + file.originalSize > MAX_PORTABLE_UNCOMPRESSED_BYTES) {
				return fail(new Error('Portable package expands beyond the supported size'))
			}
			names.add(file.name)
			activeFiles.push(file)
			pendingFiles++
			const chunks: Uint8Array[] = []
			let size = 0
			file.ondata = (error, chunk, final) => {
				if (error) return fail(error)
				size += chunk.byteLength
				expandedBytes += chunk.byteLength
				if (expandedBytes > MAX_PORTABLE_UNCOMPRESSED_BYTES) return fail(new Error('Portable package expands beyond the supported size'))
				chunks.push(chunk)
				if (!final) return
				const value = new Uint8Array(size)
				let offset = 0
				for (const part of chunks) { value.set(part, offset); offset += part.byteLength }
				files[file.name] = value
				pendingFiles--
				finish()
			}
			try { file.start() } catch (error) { fail(error) }
		})
		unzip.register(UnzipInflate)
		try {
			unzip.push(content, true)
			inputFinished = true
			finish()
		} catch (error) { fail(error) }
	})
}
