/**
 * 模块说明：本文件负责跨模块常量与稳定标识符，具体对象为 `Colors`。
 *
 * 实现要点：集中维护跨运行时与生成脚本共享的稳定常量，避免字符串和顺序发生漂移。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`Colors`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */

export class Colors {
	static readonly colors = [
		{
			id: 'codebookmark.color.Lvl1Orange',
			defaults: { dark: '#f76f53', light: '#f76f53' },
			description: '一级书签颜色',
		},
		{
			id: 'codebookmark.color.Lvl2Blue',
			defaults: { dark: '#24acf2', light: '#24acf2' },
			description: '二级书签颜色',
		},
	]
}
