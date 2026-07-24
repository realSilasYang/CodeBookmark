/**
 * 收纳少量跨界面复用的 VS Code 辅助操作，包括路径展示、输入框与消息处理。
 * 领域判断不放在这里；调用方仍需在自己的工作流中决定何时保存或修改书签。
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
