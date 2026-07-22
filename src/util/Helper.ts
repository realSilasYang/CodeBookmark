
import { ExtensionConfig } from '../config/ExtensionConfig'

export class Helper {
	static formatLabelSpacing(label: string): string {
		if (!label || !ExtensionConfig.autoSpace) return label;
		return label
			.replace(/([\p{Script=Han}])([a-zA-Z0-9_$])/gu, '$1 $2')
			.replace(/([a-zA-Z0-9_$])([\p{Script=Han}])/gu, '$1 $2');
	}
}
