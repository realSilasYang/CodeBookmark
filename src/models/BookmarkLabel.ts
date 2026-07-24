/**
 * 生成树视图中最终显示的书签标签，并按设置决定是否附带行号或状态提示。
 * 这里只处理展示文本，不改写书签原始标签，避免界面偏好污染持久化数据。
 */
import { isJsonRecord } from '../util/JsonRecord'

export function bookmarkLabelText(label: unknown): string {
	if (typeof label === 'string') return label
	if (isJsonRecord(label) && typeof label.label === 'string') return label.label
	return ''
}
