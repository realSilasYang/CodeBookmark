/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `InlineBookmarkDecorationCoordinator`。
 *
 * 实现要点：协调多个端口、状态与异步阶段，明确事件顺序、取消点和最终提交时机。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`InlineBookmarkDecorationPort`、`InlineBookmarkDecorationCoordinator`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export interface InlineBookmarkDecorationPort<Editor, Candidate, Decoration> {
	isEligible(editor: Editor): boolean
	labelsEnabled(): boolean
	documentKey(editor: Editor): string
	documentVersion(editor: Editor): number
	cursorLine(editor: Editor): number
	candidatesForEditor(editor: Editor): readonly Candidate[]
	candidateLine(candidate: Candidate): number
	candidateLabel(candidate: Candidate): unknown
	isInvalidCandidate(candidate: Candidate): boolean
	createDecoration(editor: Editor, line: number, label: unknown): Decoration
	setDecorations(editor: Editor, decorations: readonly Decoration[]): void
}

export class InlineBookmarkDecorationCoordinator<Editor extends object, Candidate, Decoration> {
	private decorationKeys = new WeakMap<Editor, string>()
	private generation = 0

	invalidate(): void {
		this.generation++
	}

	update(
		editor: Editor,
		port: InlineBookmarkDecorationPort<Editor, Candidate, Decoration>,
	): void {
		if (!port.isEligible(editor) || !port.labelsEnabled()) {
			this.clear(editor, port)
			return
		}

		const cursorLine = port.cursorLine(editor)
		const decorationKey = [
			port.documentKey(editor),
			port.documentVersion(editor),
			cursorLine,
			this.generation,
		].join('\0')
		if (this.decorationKeys.get(editor) === decorationKey) return

		const decorations: Decoration[] = []
		for (const candidate of port.candidatesForEditor(editor)) {
			const label = port.candidateLabel(candidate)
			if (port.candidateLine(candidate) !== cursorLine || !label || port.isInvalidCandidate(candidate)) continue
			decorations.push(port.createDecoration(editor, cursorLine, label))
			break
		}

		port.setDecorations(editor, decorations)
		this.decorationKeys.set(editor, decorationKey)
	}

	private clear(
		editor: Editor,
		port: InlineBookmarkDecorationPort<Editor, Candidate, Decoration>,
	): void {
		if (this.decorationKeys.get(editor) === 'clear') return
		port.setDecorations(editor, [])
		this.decorationKeys.set(editor, 'clear')
	}
}
