import { isJsonRecord } from '../util/JsonRecord'

export function bookmarkLabelText(label: unknown): string {
	if (typeof label === 'string') return label
	if (isJsonRecord(label) && typeof label.label === 'string') return label.label
	return ''
}
