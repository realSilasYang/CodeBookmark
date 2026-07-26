/**
 * 为便携包寻找本机源码时只接受相对路径、内容摘要或书签锚点等可解释的唯一证据。
 * 没有充分证据时返回冲突，宁可要求用户调整工作区，也绝不猜错绑定。
 * 候选扫描和摘要读取均有明确边界，同名发现结果会被复用但不会改变证据优先级。
 */
import * as fs from 'fs'
import * as path from 'path'
import type { PortableScript, PortableScriptIndexEntry } from './PortablePackage'
import { fingerprintPortableSource, normalizePortableSourceText } from './PortableSourceFingerprint'

const EXCLUDED_DIRECTORY_NAMES = new Set([
	'.git', '.hg', '.svn', 'node_modules', 'out', 'dist', 'build', 'coverage', '.next', '.cache',
])
const MAX_DISCOVERY_ENTRIES = 50_000
const MAX_DISCOVERY_CANDIDATES = 64

type PortableTargetMatchKind = 'relative-path' | 'content' | 'normalized-content' | 'anchors' | 'active-script'

export interface PortableTargetCandidate {
	absolutePath: string
	relativePath?: string
	isActive?: boolean
	rootNameMatches?: boolean
}

interface PortableTargetResolution {
	kind: PortableTargetMatchKind | 'conflict'
	targetAbsolutePath?: string
	candidates: string[]
}

function normalizedPath(value: string): string {
	return value.replace(/\\/g, '/').normalize('NFC').toLocaleLowerCase('en-US')
}

function normalizedText(value: string): string {
	return normalizePortableSourceText(value).trim()
}

function collectAnchors(items: readonly unknown[], output = new Set<string>()): Set<string> {
	for (const item of items) {
		if (!item || typeof item !== 'object') continue
		const record = item as { content?: unknown, contextBefore?: unknown, contextAfter?: unknown, subs?: unknown }
		for (const value of [record.content, record.contextBefore, record.contextAfter]) {
			if (typeof value !== 'string') continue
			const anchor = normalizedText(value)
			if (anchor.length >= 8) output.add(anchor.slice(0, 2_000))
		}
		if (Array.isArray(record.subs)) collectAnchors(record.subs, output)
	}
	return output
}

function deduplicateCandidates(candidates: readonly PortableTargetCandidate[]): PortableTargetCandidate[] {
	const unique = new Map<string, PortableTargetCandidate>()
	for (const candidate of candidates) {
		const key = normalizedPath(path.resolve(candidate.absolutePath))
		const existing = unique.get(key)
		unique.set(key, existing ? {
			...existing,
			isActive: existing.isActive || candidate.isActive,
			relativePath: existing.relativePath ?? candidate.relativePath,
			rootNameMatches: existing.rootNameMatches || candidate.rootNameMatches,
		} : candidate)
	}
	return [...unique.values()]
}

async function isFile(filePath: string): Promise<boolean> {
	try { return (await fs.promises.stat(filePath)).isFile() } catch { return false }
}

/** 仅在精确相对路径不存在时调用，扫描范围受限且跳过依赖、构建与版本控制目录。 */
export async function discoverPortableTargetCandidates(
	rootPath: string,
	fileName: string,
): Promise<string[]> {
	const expected = normalizedPath(fileName)
	const matches: string[] = []
	let entries = 0
	async function visit(folder: string): Promise<void> {
		if (entries >= MAX_DISCOVERY_ENTRIES || matches.length >= MAX_DISCOVERY_CANDIDATES) return
		let children: fs.Dirent[]
		try { children = await fs.promises.readdir(folder, { withFileTypes: true }) } catch { return }
		children.sort((left, right) => left.name.localeCompare(right.name))
		for (const child of children) {
			if (++entries > MAX_DISCOVERY_ENTRIES || matches.length >= MAX_DISCOVERY_CANDIDATES) return
			const candidate = path.join(folder, child.name)
			if (child.isDirectory()) {
				if (!EXCLUDED_DIRECTORY_NAMES.has(child.name.toLocaleLowerCase('en-US'))) await visit(candidate)
			} else if (child.isFile() && normalizedPath(child.name) === expected) {
				matches.push(candidate)
			}
		}
	}
	await visit(rootPath)
	return matches
}

export async function resolvePortableScriptTarget(
	index: PortableScriptIndexEntry,
	portable: PortableScript,
	candidates: readonly PortableTargetCandidate[],
	allowActiveScriptFallback: boolean,
): Promise<PortableTargetResolution> {
	const existing = deduplicateCandidates(candidates.filter(candidate => candidate.absolutePath.length > 0))
	const available: PortableTargetCandidate[] = []
	for (const candidate of existing) {
		if (await isFile(candidate.absolutePath)) available.push(candidate)
	}
	if (available.length === 0) return { kind: 'conflict', candidates: [] }

	const relative = normalizedPath(index.relativePath)
	const relativeMatches = available.filter(candidate => candidate.relativePath !== undefined
		&& normalizedPath(candidate.relativePath) === relative)
	const preferredRelativeMatches = relativeMatches.filter(candidate => candidate.rootNameMatches)
	const relativeWinner = preferredRelativeMatches.length === 1 ? preferredRelativeMatches[0]
		: preferredRelativeMatches.length === 0 && relativeMatches.length === 1 ? relativeMatches[0] : undefined
	if (relativeWinner) {
		return { kind: 'relative-path', targetAbsolutePath: relativeWinner.absolutePath, candidates: [relativeWinner.absolutePath] }
	}

	const fingerprints: Array<{ candidate: PortableTargetCandidate, fingerprint: Awaited<ReturnType<typeof fingerprintPortableSource>> }> = []
	for (const candidate of available) {
		fingerprints.push({ candidate, fingerprint: await fingerprintPortableSource(candidate.absolutePath) })
	}
	const rawMatches = portable.fingerprint?.sha256
		? fingerprints.filter(item => item.fingerprint?.sha256 === portable.fingerprint?.sha256) : []
	if (rawMatches.length === 1) {
		return { kind: 'content', targetAbsolutePath: rawMatches[0].candidate.absolutePath, candidates: [rawMatches[0].candidate.absolutePath] }
	}
	const normalizedMatches = portable.fingerprint?.normalizedSha256
		? fingerprints.filter(item => item.fingerprint?.normalizedSha256 === portable.fingerprint?.normalizedSha256) : []
	if (normalizedMatches.length === 1) {
		return { kind: 'normalized-content', targetAbsolutePath: normalizedMatches[0].candidate.absolutePath, candidates: [normalizedMatches[0].candidate.absolutePath] }
	}

	const anchors = [...collectAnchors(portable.bookmarks)]
	if (anchors.length > 0) {
		const scored: Array<{ candidate: PortableTargetCandidate, matched: number }> = []
		for (const candidate of available) {
			try {
				const text = normalizedText(await fs.promises.readFile(candidate.absolutePath, 'utf8'))
				const matched = anchors.filter(anchor => text.includes(anchor)).length
				if (matched > 0) scored.push({ candidate, matched })
			} catch { /* 无法按文本读取的文件不能用锚点作为绑定依据。 */ }
		}
		scored.sort((left, right) => right.matched - left.matched || left.candidate.absolutePath.localeCompare(right.candidate.absolutePath))
		const winner = scored[0]
		if (winner && (winner.matched >= 2 || (anchors.length === 1 && anchors[0].length >= 24))
			&& (!scored[1] || winner.matched > scored[1].matched)) {
			return { kind: 'anchors', targetAbsolutePath: winner.candidate.absolutePath, candidates: [winner.candidate.absolutePath] }
		}
	}

	const active = available.filter(candidate => candidate.isActive)
	if (allowActiveScriptFallback && active.length === 1) {
		return { kind: 'active-script', targetAbsolutePath: active[0].absolutePath, candidates: [active[0].absolutePath] }
	}
	return { kind: 'conflict', candidates: available.map(candidate => candidate.absolutePath) }
}
