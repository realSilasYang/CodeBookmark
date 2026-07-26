/**
 * 优先从已打开文档读取源码；关闭文件先做无损关键词预筛，再按需解码为行数组。
 * 大文件采用流式预筛和流式解码，既不跳过有效标记，也不把整份文本同时留在内存。
 */
import type { CodeMarkerSource } from './CodeMarkerDocumentSync'
import { performance } from 'node:perf_hooks'

interface CodeMarkerSourceFile {
	stat(): Promise<{ isFile: boolean, size: number }>
	readBytes(): Promise<Uint8Array>
	readChunks(): AsyncIterable<Uint8Array>
	close(): Promise<void>
}

export interface CodeMarkerSourceReaderPort<Document, Uri> {
	openDocuments(): readonly Document[]
	documentUri(document: Document): Uri
	isFileUri(uri: Uri): boolean
	filePath(uri: Uri): string
	sameFilePath(left: string, right: string): boolean
	documentLines(document: Document): string[]
	documentLanguage(document: Document): string | undefined
	profilesInitialized(): boolean
	supportsFile(filePath: string): boolean
	openFile(filePath: string): Promise<CodeMarkerSourceFile>
}

const CODE_MARKER_KEYWORDS = [
	[0x54, 0x4f, 0x44, 0x4f], // 关键字 TODO 的 ASCII 字节
	[0x46, 0x49, 0x58, 0x4d, 0x45], // 关键字 FIXME 的 ASCII 字节
	[0x42, 0x55, 0x47], // 关键字 BUG 的 ASCII 字节
] as const

function asciiUpper(value: number): number {
	return value >= 0x61 && value <= 0x7a ? value - 0x20 : value
}

class CodeMarkerKeywordStreamMatcher {
	private readonly header: number[] = []
	private readonly recent: number[] = []
	private encoding: 'bytes' | 'utf16le' | 'utf16be' | undefined
	private pendingUtf16Byte: number | undefined
	private matched = false

	write(bytes: Uint8Array): void {
		if (this.matched) return
		let index = 0
		while (!this.encoding && index < bytes.length && this.header.length < 2) this.header.push(bytes[index++])
		if (!this.encoding && this.header.length === 2) this.initializeEncoding()
		if (!this.encoding) return
		if (this.encoding === 'bytes') {
			for (; index < bytes.length && !this.matched; index++) this.pushUnit(bytes[index])
			return
		}
		for (; index < bytes.length && !this.matched; index++) {
			if (this.pendingUtf16Byte === undefined) {
				this.pendingUtf16Byte = bytes[index]
				continue
			}
			const unit = this.encoding === 'utf16le'
				? this.pendingUtf16Byte | (bytes[index] << 8)
				: (this.pendingUtf16Byte << 8) | bytes[index]
			this.pendingUtf16Byte = undefined
			this.pushUnit(unit)
		}
	}

	finish(): boolean {
		if (!this.encoding) {
			this.encoding = 'bytes'
			for (const value of this.header) this.pushUnit(value)
		}
		return this.matched
	}

	private initializeEncoding(): void {
		if (this.header[0] === 0xff && this.header[1] === 0xfe) this.encoding = 'utf16le'
		else if (this.header[0] === 0xfe && this.header[1] === 0xff) this.encoding = 'utf16be'
		else {
			this.encoding = 'bytes'
			for (const value of this.header) this.pushUnit(value)
		}
	}

	private pushUnit(value: number): void {
		this.recent.push(asciiUpper(value))
		if (this.recent.length > 5) this.recent.shift()
		this.matched = CODE_MARKER_KEYWORDS.some(keyword => keyword.length <= this.recent.length
			&& keyword.every((expected, offset) => this.recent[this.recent.length - keyword.length + offset] === expected))
	}
}

function decodeText(bytes: Uint8Array): string {
	const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
		return buffer.subarray(3).toString('utf8')
	}
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		return buffer.subarray(2).toString('utf16le')
	}
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		const swapped = Buffer.from(buffer.subarray(2))
		if (swapped.length % 2 !== 0) return swapped.toString('utf8')
		swapped.swap16()
		return swapped.toString('utf16le')
	}
	return buffer.toString('utf8')
}

function isBinary(bytes: Uint8Array): boolean {
	if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
		return false
	}
	return bytes.subarray(0, 8192).includes(0)
}

function textEncoding(bytes: Uint8Array): 'utf-8' | 'utf-16le' | 'utf-16be' {
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
	return 'utf-8'
}

async function decodeLines(chunks: AsyncIterable<Uint8Array>): Promise<{ lines: string[], bytesRead: number }> {
	const lines: string[] = []
	let decoder: TextDecoder | undefined
	let undecodedPrefix = Buffer.alloc(0)
	let pending = ''
	let bytesRead = 0
	const append = (value: string, final: boolean): void => {
		pending += value
		let lineStart = 0
		for (let index = 0; index < pending.length; index++) {
			const current = pending[index]
			if (current !== '\n' && current !== '\r') continue
			if (current === '\r' && index + 1 === pending.length && !final) break
			lines.push(pending.slice(lineStart, index))
			if (current === '\r' && pending[index + 1] === '\n') index++
			lineStart = index + 1
		}
		pending = pending.slice(lineStart)
	}
	for await (const chunk of chunks) {
		bytesRead += chunk.byteLength
		if (!decoder) {
			undecodedPrefix = Buffer.concat([
				undecodedPrefix,
				Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength),
			])
			if (undecodedPrefix.length < 2) continue
			decoder = new TextDecoder(textEncoding(undecodedPrefix))
			append(decoder.decode(undecodedPrefix, { stream: true }), false)
			undecodedPrefix = Buffer.alloc(0)
			continue
		}
		append(decoder.decode(chunk, { stream: true }), false)
	}
	if (!decoder) {
		decoder = new TextDecoder(textEncoding(undecodedPrefix))
		append(decoder.decode(undecodedPrefix, { stream: true }), false)
	}
	append(decoder.decode(), true)
	lines.push(pending)
	return { lines, bytesRead }
}

export class CodeMarkerSourceReader<Document, Uri> {
	constructor(private readonly largeFileThresholdBytes = 2 * 1024 * 1024) {}

	async read(
		uri: Uri,
		knownMarkerFile: boolean,
		port: CodeMarkerSourceReaderPort<Document, Uri>,
	): Promise<CodeMarkerSource | undefined> {
		const filePath = port.filePath(uri)
		const openDocument = port.openDocuments().find(document => {
			const documentUri = port.documentUri(document)
			return port.isFileUri(documentUri)
				&& port.sameFilePath(port.filePath(documentUri), filePath)
		})
		if (openDocument) {
			const startedAt = performance.now()
			const lines = port.documentLines(openDocument)
			return {
				lines,
				languageId: port.documentLanguage(openDocument),
				readMetrics: {
					origin: 'document',
					openMs: 0,
					readMs: performance.now() - startedAt,
					bytesRead: 0,
					prefilteredEmpty: false,
				},
			}
		}
		if (!knownMarkerFile && port.profilesInitialized() && !port.supportsFile(filePath)) return undefined
		let file: CodeMarkerSourceFile | undefined
		try {
			const openStartedAt = performance.now()
			file = await port.openFile(filePath)
			const openMs = performance.now() - openStartedAt
			const readStartedAt = performance.now()
			const stat = await file.stat()
			if (!stat.isFile) return undefined
			let bytesRead = 0
			let prefilteredEmpty = false
			let lines: string[] = []
			if (stat.size > this.largeFileThresholdBytes) {
				const matcher = new CodeMarkerKeywordStreamMatcher()
				const prefixChunks: Uint8Array[] = []
				let prefixBytes = 0
				for await (const chunk of file.readChunks()) {
					bytesRead += chunk.byteLength
					matcher.write(chunk)
					if (prefixBytes < 8192) {
						const prefix = chunk.subarray(0, Math.min(chunk.length, 8192 - prefixBytes))
						prefixChunks.push(prefix)
						prefixBytes += prefix.byteLength
					}
				}
				const prefix = Buffer.concat(prefixChunks.map(chunk => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)))
				if (isBinary(prefix)) return undefined
				prefilteredEmpty = !matcher.finish()
				if (!prefilteredEmpty) {
					const decoded = await decodeLines(file.readChunks())
					lines = decoded.lines
					bytesRead += decoded.bytesRead
				}
			} else {
				const bytes = await file.readBytes()
				bytesRead = bytes.byteLength
				if (isBinary(bytes)) return undefined
				const matcher = new CodeMarkerKeywordStreamMatcher()
				matcher.write(bytes)
				prefilteredEmpty = !matcher.finish()
				if (!prefilteredEmpty) lines = decodeText(bytes).split(/\r\n|\n|\r/)
			}
			return {
				lines,
				readMetrics: {
					origin: 'file',
					openMs,
					readMs: performance.now() - readStartedAt,
					bytesRead,
					prefilteredEmpty,
				},
			}
		} catch {
			return undefined
		} finally {
			await file?.close().catch(() => undefined)
		}
	}
}
