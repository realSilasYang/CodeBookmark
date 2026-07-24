/**
 * 保存书签视图当前排序方式，区分自定义顺序、时间顺序与行号顺序。
 * 该值只控制展示和拖拽策略，不改变磁盘中书签节点本身的语义。
 */

export class SortModeBookmark {
	static readonly Custom = 0;
	static readonly TimeAsc = 1;
	static readonly TimeDesc = 2;
	static readonly LineAsc = 3;
	static readonly LineDesc = 4;
	static mode = SortModeBookmark.Custom;
}
