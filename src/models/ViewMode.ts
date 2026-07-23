/**
 * 模块说明：本文件负责书签领域模型与展示投影，具体对象为 `ViewMode`。
 *
 * 实现要点：定义书签领域数据、父子关系和展示投影，并在对象内部维护不变量。
 * 核心边界：领域对象负责维持自身不变量；序列化字段、父子关系和展示状态不得被调用方绕过。
 * 主要入口：`SortModeBookmark`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */

export class SortModeBookmark {
	static readonly Custom = 0;
	static readonly TimeAsc = 1;
	static readonly TimeDesc = 2;
	static readonly LineAsc = 3;
	static readonly LineDesc = 4;
	static mode = SortModeBookmark.Custom;
}
