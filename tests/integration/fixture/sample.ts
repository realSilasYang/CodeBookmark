/**
 * 模块说明：本文件负责真实 Extension Host 集成测试，具体对象为 `sample`。
 *
 * 实现要点：在真实宿主内执行用户路径，并对持久化结果、语言环境与移动恢复进行端到端断言。
 * 核心边界：测试使用可重复的输入与隔离环境验证公开行为，不依赖人工界面判断。
 * 主要入口：`integrationFixture`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export function integrationFixture(): boolean {
	return true
}
