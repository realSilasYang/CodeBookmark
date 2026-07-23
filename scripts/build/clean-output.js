/**
 * 模块说明：本文件负责扩展构建与产物生成，具体对象为 `clean-output`。
 *
 * 实现要点：从源码与稳定清单生成可发布产物，并在覆盖目标前完成确定性整理。
 * 核心边界：生成结果必须确定、可复现，并与源码清单及发布校验保持一致。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const fs = require('node:fs')
const path = require('node:path')

fs.rmSync(path.resolve(__dirname, '../..', 'out'), { recursive: true, force: true })
