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
