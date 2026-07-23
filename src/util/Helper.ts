/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `Helper`。
 *
 * 实现要点：集中实现 `Helper` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`Helper`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */

import { ExtensionConfig } from '../config/ExtensionConfig'

export class Helper {
	static formatLabelSpacing(label: string): string {
		if (!label || !ExtensionConfig.autoSpace) return label;
		return label
			.replace(/([\p{Script=Han}])([a-zA-Z0-9_$])/gu, '$1 $2')
			.replace(/([a-zA-Z0-9_$])([\p{Script=Han}])/gu, '$1 $2');
	}
}
