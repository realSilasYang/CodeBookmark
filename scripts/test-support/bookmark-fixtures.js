/**
 * 构造仓库迁移专项验证共用的源码指纹和最小脚本配置。
 * 默认值贴合真实持久化字段，同时允许测试覆盖书签身份和标签，不隐藏各场景特有断言。
 */
const crypto = require('node:crypto')
const path = require('node:path')

function sourceFingerprint(content) {
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    size: Buffer.byteLength(content),
  }
}

function scriptEnvelope({
  scriptId,
  sourcePath,
  content,
  bookmarkId = `bookmark-${scriptId}`,
  label = path.basename(sourcePath),
}) {
  return {
    script: {
      id: scriptId,
      path: sourcePath,
      fingerprint: sourceFingerprint(content),
      lastSeenAt: Date.now(),
    },
    bookmarks: [{
      id: bookmarkId,
      createdAt: Date.now(),
      label,
      path: sourcePath,
      collapsibleState: 0,
      pinned: false,
      content: content.trim(),
      iconName: '',
      isInvalid: false,
      params: '0,0,0,0',
      subs: [],
    }],
  }
}

module.exports = { scriptEnvelope, sourceFingerprint }
