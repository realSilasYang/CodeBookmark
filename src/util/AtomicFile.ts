import * as fs from 'fs'
import * as path from 'path'

export function temporarySiblingPath(target: string): string {
	return `${target}.${process.pid}.${Date.now()}.tmp`
}

async function removeTemporaryFile(temporaryPath: string): Promise<void> {
	try {
		await fs.promises.unlink(temporaryPath)
	} catch {
		// The temporary file may not have been created yet.
	}
}

export async function atomicWriteFile(target: string, content: string | Buffer): Promise<void> {
	const temporaryPath = temporarySiblingPath(target)
	await fs.promises.mkdir(path.dirname(target), { recursive: true })
	try {
		await fs.promises.writeFile(temporaryPath, content)
		await fs.promises.rename(temporaryPath, target)
	} catch (error) {
		await removeTemporaryFile(temporaryPath)
		throw error
	}
}

export async function atomicCopyFile(source: string, target: string): Promise<void> {
	const temporaryPath = temporarySiblingPath(target)
	await fs.promises.mkdir(path.dirname(target), { recursive: true })
	try {
		await fs.promises.copyFile(source, temporaryPath)
		await fs.promises.rename(temporaryPath, target)
	} catch (error) {
		await removeTemporaryFile(temporaryPath)
		throw error
	}
}
