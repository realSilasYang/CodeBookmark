import * as https from 'https';
import * as http from 'http';
import * as vscode from 'vscode';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { logger } from './Logger';

interface AIBookmark {
	id: string;
	label: string;
	path: string;
	line: number;
	opened: number;
	content: string;
	subs: any[];
	params: string;
}

export class AIService {
	/**
	 * Send the request to the AI Endpoint
	 */
	private static async sendRequest(messages: any[], onProgress?: (msg: string) => void, token?: vscode.CancellationToken): Promise<any> {
		onProgress?.('正在构建与大模型的网络请求参数...');
		const endpoint = ExtensionConfig.aiEndpoint;
		const apiKey = ExtensionConfig.aiApiKey;
		const model = ExtensionConfig.aiModel;

		if (!apiKey) {
			throw new Error('未配置 AI 接口密钥 (API Key)。请在设置中配置 `codebookmark.ai.apiKey`');
		}

		return new Promise((resolve, reject) => {
			try {
				const url = new URL(endpoint);
				const isHttps = url.protocol === 'https:';
				const reqModule = isHttps ? https : http;

				const payload = JSON.stringify({
					model: model,
					messages: messages,
					temperature: 0.1,
				});

				const options = {
					hostname: url.hostname,
					port: url.port,
					path: url.pathname + url.search,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${apiKey}`,
						'Content-Length': Buffer.byteLength(payload)
					}
				};

				onProgress?.('正在发起网络连接，等待大模型推理响应 (这可能需要几秒到十几秒)...');

				const req = reqModule.request(options, (res) => {
					const chunks: Buffer[] = [];
					let isFirst = true;
					
					res.on('data', (chunk: Buffer) => {
						if (isFirst) {
							isFirst = false;
							onProgress?.('已收到大模型首字节响应，正在持续接收数据流...');
						}
						chunks.push(chunk);
					});
					res.on('end', () => {
						const data = Buffer.concat(chunks).toString('utf8');
						if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
							try {
								const json = JSON.parse(data);
								resolve(json);
							} catch {
								reject(new Error(`无法解析 AI 响应数据: `));
							}
						} else {
							reject(new Error(`AI 接口返回错误 [${res.statusCode}]: ${data}`));
						}
					});
				});

				req.on('error', (e) => {
					reject(new Error(`网络请求失败: ${e.message}`));
				});

				if (token) {
					token.onCancellationRequested(() => {
						req.destroy(new Error('用户主动取消了 AI 任务'));
					});
				}

				req.write(payload);
				req.end();
			} catch (err) {
				reject(new Error(`请求构建失败: ${err}`));
			}
		});
	}

	/**
	 * Test the API connection
	 */
	public static async testConnection(): Promise<boolean> {
		try {
			await this.sendRequest([
				{ role: 'user', content: 'hello' }
			]);
			return true;
		} catch (error) {
			logger.error(error);
			throw error;
		}
	}

	/**
	 * Generate bookmarks for a given code block
	 */
	public static async generateBookmarks(codeContent: string, filePath: string, onProgress?: (msg: string) => void, token?: vscode.CancellationToken): Promise<AIBookmark[]> {
		onProgress?.('正在提取源码及文件路径环境信息...');
		const prompt = ExtensionConfig.aiPrompt;

		const messages = [
			{ role: 'system', content: prompt },
			{ role: 'user', content: `请分析以下文件中的代码并生成书签。\n当前文件路径: ${filePath}\n\n${codeContent}` }
		];

		const response = await this.sendRequest(messages, onProgress, token);
		
		onProgress?.('正在解析并校验大模型返回的智能语料结构...');

		if (response.choices && response.choices.length > 0) {
			const reply = response.choices[0].message?.content || '';
			// Basic JSON extraction (in case AI outputs markdown blocks)
			let jsonStr = reply.trim();
			if (jsonStr.startsWith('```json')) {
				jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
			} else if (jsonStr.startsWith('```')) {
				jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
			}
			
			try {
				const parsed = JSON.parse(jsonStr);
				const bookmarks: AIBookmark[] = Array.isArray(parsed) ? parsed : (parsed.bookmarks || []);
				return bookmarks;
			} catch {
				logger.error(`Failed to parse stream chunk`);
				throw new Error('AI 未能返回合法的 JSON 数组，请检查提示词或重试。');
			}
		}

		throw new Error('AI 返回内容为空。');
	}

	/**
	 * Optimize existing bookmark titles
	 */
	public static async optimizeBookmarkTitles(codeContent: string, filePath: string, existingBookmarks: any[], onProgress?: (msg: string) => void, token?: vscode.CancellationToken): Promise<{ id: string, new_label: string }[]> {
		onProgress?.('正在提取源码及现有书签特征...');
		
		const prompt = ExtensionConfig.aiOptimizePrompt || `你是一个专业的高级工程师。请根据提供的文件源码上下文，优化以下提供的现有书签的标签（label）。
要求：
1. 深刻理解源码逻辑，返回优化后的标签。
2. 标签必须极其简练（尽量控制在15个字以内），直击核心逻辑。
3. 不要包含特殊符号。
4. 绝对不能修改或提议修改书签的其他任何配置部分。
5. 返回格式必须是合法的纯 JSON 数组，对象字段仅包含 \`id\` 和 \`new_label\`，不包含任何 Markdown 标记。
示例：
[
  { "id": "vp8kipq", "new_label": "系统初始化" }
]`;

		const bookmarksJson = JSON.stringify(existingBookmarks.map((b: any) => ({
			id: b.Id,
			label: b.label,
			content: b.content
		})));

		const messages = [
			{ role: 'system', content: prompt },
			{ role: 'user', content: `请优化以下书签的标签。\n\n当前文件路径: ${filePath}\n\n文件源码:\n${codeContent}\n\n现有书签列表:\n${bookmarksJson}` }
		];

		const response = await this.sendRequest(messages, onProgress, token);
		
		onProgress?.('正在解析并校验大模型返回的优化结果...');

		if (response.choices && response.choices.length > 0) {
			const reply = response.choices[0].message?.content || '';
			let jsonStr = reply.trim();
			if (jsonStr.startsWith('```json')) {
				jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
			} else if (jsonStr.startsWith('```')) {
				jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
			}
			
			try {
				const parsed = JSON.parse(jsonStr);
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				logger.error(`AI 响应非标准JSON: ${reply}`);
				throw new Error('AI 未能返回合法的 JSON 数组，请重试。');
			}
		}

		throw new Error('AI 返回内容为空。');
	}
}
