/**
 * 在编译前清空 out 目录，保证后续验证看到的都是本次源码生成的文件。
 * 清理范围固定在项目输出目录内，不触碰源码、资源或用户书签数据。
 */
const fs = require('node:fs')
const path = require('node:path')

fs.rmSync(path.resolve(__dirname, '../..', 'out'), { recursive: true, force: true })
