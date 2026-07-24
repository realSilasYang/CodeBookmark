/**
 * 集中定义书签状态与界面装饰使用的颜色值和 VS Code 主题颜色引用。
 * 调用方按语义取色，不在业务流程里散落难以统一调整的字面颜色。
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
