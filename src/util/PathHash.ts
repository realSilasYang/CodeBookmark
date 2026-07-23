/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `PathHash`。
 *
 * 实现要点：集中实现 `PathHash` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`stableWorkspacePathHash`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as crypto from 'crypto'
import * as path from 'path'

export function stableWorkspacePathHash(input: string): string {
	const normalized = path.resolve(input).replace(/\\/g, '/')
	return crypto
		.createHash('sha256')
		.update(normalized)
		.digest('hex')
		.slice(0, 16)
}
