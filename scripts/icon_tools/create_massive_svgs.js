const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'resources', 'custom_icons');

const colors = {
    red: '#FA5252',
    blue: '#339AF0',
    green: '#51CF66',
    yellow: '#FCC419',
    purple: '#BE4BDB'
};

// Outline color
const outlineStroke = '#E9ECEF';

// Helper to generate SVG wrapper
const svgWrap = (content) => `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">\n${content}\n</svg>`;

const concepts = {
    'star': {
        keywords: ['star', 'favorite', '星标', '收藏', '关注', '重点'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline 
            ? `<path d="M64 16L78.68 45.75L111.53 50.52L87.76 73.66L93.37 106.39L64 90.96L34.63 106.39L40.24 73.66L16.47 50.52L49.32 45.75L64 16Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/>`
            : `<path d="M64 16L78.68 45.75L111.53 50.52L87.76 73.66L93.37 106.39L64 90.96L34.63 106.39L40.24 73.66L16.47 50.52L49.32 45.75L64 16Z" fill="${c}"/>`
    },
    'heart': {
        keywords: ['heart', 'love', 'favorite', 'like', '心', '收藏', '喜欢', '爱心'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<path d="M64 112L24 64C12 48 20 20 44 20C56 20 64 32 64 32C64 32 72 20 84 20C108 20 116 48 104 64L64 112Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/>`
            : `<path d="M64 112L24 64C12 48 20 20 44 20C56 20 64 32 64 32C64 32 72 20 84 20C108 20 116 48 104 64L64 112Z" fill="${c}"/>`
    },
    'tag': {
        keywords: ['tag', 'label', 'category', '标签', '分类', '标记'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<path d="M20 20H56L104 68L68 104L20 56V20Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><circle cx="40" cy="40" r="8" stroke="${outlineStroke}" stroke-width="6"/>`
            : `<path d="M20 20H56L104 68L68 104L20 56V20Z" fill="${c}"/><circle cx="40" cy="40" r="8" fill="#FFFFFF"/>`
    },
    'idea': {
        keywords: ['idea', 'lightbulb', 'thought', 'tip', '想法', '灯泡', '提示', '灵感', '点子'],
        prefix: 'status',
        render: (c, isOutline) => isOutline
            ? `<path d="M44 96H84M52 108H76M64 16C41.9 16 24 33.9 24 56C24 70 33.5 82.2 46.4 86.8L48 90H80L81.6 86.8C94.5 82.2 104 70 104 56C104 33.9 86.1 16 64 16Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/>`
            : `<path d="M44 96H84M52 108H76" stroke="${c}" stroke-width="8" stroke-linecap="round"/><path d="M64 16C41.9 16 24 33.9 24 56C24 70 33.5 82.2 46.4 86.8L48 90H80L81.6 86.8C94.5 82.2 104 70 104 56C104 33.9 86.1 16 64 16Z" fill="${c}"/>`
    },
    'flame': {
        keywords: ['flame', 'fire', 'hot', 'important', '重要', '火焰', '热门', '紧急', '火'],
        prefix: 'status',
        render: (c, isOutline) => isOutline
            ? `<path d="M64 112C86.09 112 104 94.09 104 72C104 44 80 16 64 16C48 16 24 44 24 72C24 94.09 41.91 112 64 112Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><path d="M64 112C72 112 80 104 80 92C80 80 64 64 64 64C64 64 48 80 48 92C48 104 56 112 64 112Z" stroke="${outlineStroke}" stroke-width="6"/>`
            : `<path d="M64 112C86.09 112 104 94.09 104 72C104 44 80 16 64 16C48 16 24 44 24 72C24 94.09 41.91 112 64 112Z" fill="${c}"/><path d="M64 112C72 112 80 104 80 92C80 80 64 64 64 64C64 64 48 80 48 92C48 104 56 112 64 112Z" fill="#FFFFFF"/>`
    },
    'done': {
        keywords: ['done', 'check', 'success', 'complete', '完成', '成功', '勾', '对号', '完毕'],
        prefix: 'status',
        render: (c, isOutline) => isOutline
            ? `<path d="M24 64L52 92L104 36" stroke="${outlineStroke}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`
            : `<path d="M24 64L52 92L104 36" stroke="${c}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`
    },
    'alert': {
        keywords: ['alert', 'warning', 'danger', 'caution', '警告', '危险', '注意', '提示'],
        prefix: 'status',
        render: (c, isOutline) => isOutline
            ? `<path d="M64 20L20 100H108L64 20Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><path d="M64 48V76M64 88V92" stroke="${outlineStroke}" stroke-width="8" stroke-linecap="round"/>`
            : `<path d="M64 20L20 100H108L64 20Z" fill="${c}"/><path d="M64 48V76M64 88V92" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>`
    },
    'pin': {
        keywords: ['pin', 'pushpin', 'fixed', '固定', '图钉', '置顶', '钉住'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<path d="M80 24H48L56 56L40 72H88L72 56L80 24ZM64 72V108" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>`
            : `<path d="M80 24H48L56 56L40 72H88L72 56L80 24Z" fill="${c}"/><path d="M64 72V108" stroke="${c}" stroke-width="8" stroke-linecap="round"/>`
    },
    'location': {
        keywords: ['location', 'map', 'pin', 'marker', '位置', '坐标', '地图', '地点', '定位'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<path d="M64 16C41.9 16 24 33.9 24 56C24 88 64 112 64 112C64 112 104 88 104 56C104 33.9 86.1 16 64 16Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><circle cx="64" cy="52" r="12" stroke="${outlineStroke}" stroke-width="6"/>`
            : `<path d="M64 16C41.9 16 24 33.9 24 56C24 88 64 112 64 112C64 112 104 88 104 56C104 33.9 86.1 16 64 16Z" fill="${c}"/><circle cx="64" cy="52" r="16" fill="#FFFFFF"/>`
    },
    'code': {
        keywords: ['code', 'script', 'brackets', '代码', '源码', '脚本', '括号'],
        prefix: 'arch',
        render: (c, isOutline) => isOutline
            ? `<path d="M40 32L16 64L40 96M88 32L112 64L88 96M76 20L52 108" stroke="${outlineStroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`
            : `<path d="M40 32L16 64L40 96M88 32L112 64L88 96M76 20L52 108" stroke="${c}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`
    },
    'source_file': {
        keywords: ['file', 'source', 'document', 'page', '源文件', '文件', '页面', '文档'],
        prefix: 'arch',
        render: (c, isOutline) => isOutline
            ? `<path d="M32 16H68L96 44V112H32V16Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><path d="M68 16V44H96" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/>`
            : `<path d="M32 16H68L96 44V112H32V16Z" fill="${c}"/><path d="M68 16V44H96" fill="rgba(0,0,0,0.2)"/>`
    },
    'database': {
        keywords: ['database', 'db', 'storage', 'sql', '数据库', '存储', '数据'],
        prefix: 'arch',
        render: (c, isOutline) => isOutline
            ? `<ellipse cx="64" cy="32" rx="40" ry="16" stroke="${outlineStroke}" stroke-width="8"/><path d="M24 32V96C24 104.8 41.9 112 64 112C86.1 112 104 104.8 104 96V32" stroke="${outlineStroke}" stroke-width="8"/><path d="M24 64C24 72.8 41.9 80 64 80C86.1 80 104 72.8 104 64" stroke="${outlineStroke}" stroke-width="8"/>`
            : `<path d="M24 32V96C24 104.8 41.9 112 64 112C86.1 112 104 104.8 104 96V32" fill="${c}"/><ellipse cx="64" cy="32" rx="40" ry="16" fill="${c}"/><path d="M24 64C24 72.8 41.9 80 64 80C86.1 80 104 72.8 104 64" stroke="#FFFFFF" stroke-width="4"/><path d="M24 32C24 40.8 41.9 48 64 48C86.1 48 104 40.8 104 32" stroke="#FFFFFF" stroke-width="4"/>`
    },
    'server': {
        keywords: ['server', 'backend', 'host', 'rack', '服务器', '后端', '主机', '机架'],
        prefix: 'arch',
        render: (c, isOutline) => isOutline
            ? `<rect x="24" y="16" width="80" height="24" rx="4" stroke="${outlineStroke}" stroke-width="8"/><rect x="24" y="52" width="80" height="24" rx="4" stroke="${outlineStroke}" stroke-width="8"/><rect x="24" y="88" width="80" height="24" rx="4" stroke="${outlineStroke}" stroke-width="8"/><circle cx="84" cy="28" r="4" fill="${outlineStroke}"/><circle cx="84" cy="64" r="4" fill="${outlineStroke}"/><circle cx="84" cy="100" r="4" fill="${outlineStroke}"/>`
            : `<rect x="24" y="16" width="80" height="24" rx="4" fill="${c}"/><rect x="24" y="52" width="80" height="24" rx="4" fill="${c}"/><rect x="24" y="88" width="80" height="24" rx="4" fill="${c}"/><circle cx="84" cy="28" r="4" fill="#FFFFFF"/><circle cx="84" cy="64" r="4" fill="#FFFFFF"/><circle cx="84" cy="100" r="4" fill="#FFFFFF"/>`
    },
    'terminal': {
        keywords: ['terminal', 'console', 'cli', 'bash', '终端', '控制台', '命令行'],
        prefix: 'arch',
        render: (c, isOutline) => isOutline
            ? `<rect x="16" y="24" width="96" height="80" rx="8" stroke="${outlineStroke}" stroke-width="8"/><path d="M32 48L48 64L32 80M56 80H80" stroke="${outlineStroke}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
            : `<rect x="16" y="24" width="96" height="80" rx="8" fill="${c}"/><path d="M32 48L48 64L32 80M56 80H80" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
    },
    'git_branch': {
        keywords: ['git', 'branch', 'fork', 'vcs', 'git分支', '分支', '版本控制', '分叉'],
        prefix: 'arch',
        render: (c, isOutline) => isOutline
            ? `<circle cx="36" cy="96" r="12" stroke="${outlineStroke}" stroke-width="8"/><circle cx="36" cy="32" r="12" stroke="${outlineStroke}" stroke-width="8"/><circle cx="92" cy="32" r="12" stroke="${outlineStroke}" stroke-width="8"/><path d="M36 84V44M36 84C36 60 92 76 92 44" stroke="${outlineStroke}" stroke-width="8" fill="none"/>`
            : `<path d="M36 84V44M36 84C36 60 92 76 92 44" stroke="${c}" stroke-width="12" fill="none"/><circle cx="36" cy="96" r="16" fill="${c}"/><circle cx="36" cy="32" r="16" fill="${c}"/><circle cx="92" cy="32" r="16" fill="${c}"/>`
    },
    'search': {
        keywords: ['search', 'find', 'magnify', '搜索', '查找', '放大镜', '寻找'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<circle cx="56" cy="56" r="32" stroke="${outlineStroke}" stroke-width="10"/><path d="M80 80L108 108" stroke="${outlineStroke}" stroke-width="12" stroke-linecap="round"/>`
            : `<circle cx="56" cy="56" r="32" stroke="${c}" stroke-width="12"/><path d="M80 80L108 108" stroke="${c}" stroke-width="16" stroke-linecap="round"/>`
    },
    'test': {
        keywords: ['test', 'experiment', 'beaker', 'flask', '测试', '实验', '烧杯', '检验'],
        prefix: 'status',
        render: (c, isOutline) => isOutline
            ? `<path d="M48 24H80M64 24V40L32 104H96L64 40" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><path d="M40 88H88" stroke="${outlineStroke}" stroke-width="6"/>`
            : `<path d="M32 104H96L64 40V24H48M80 24H64M64 40L32 104" fill="${c}"/><path d="M48 24H80" stroke="${c}" stroke-width="8" stroke-linecap="round"/><path d="M40 88H88" stroke="#FFFFFF" stroke-width="6"/>`
    },
    'deploy': {
        keywords: ['deploy', 'rocket', 'launch', 'ship', '部署', '火箭', '发射', '发布', '上线'],
        prefix: 'arch',
        render: (c, isOutline) => isOutline
            ? `<path d="M56 104L40 88C40 88 40 40 88 40C88 40 88 88 40 88Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><path d="M40 88L24 72L32 56M88 40V24H104V40H88ZM40 88L56 96L72 104" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><circle cx="64" cy="64" r="8" stroke="${outlineStroke}" stroke-width="6"/>`
            : `<path d="M56 104L40 88C40 88 40 40 88 40C88 40 88 88 40 88Z" fill="${c}"/><path d="M40 88L24 72L32 56L44 68" fill="${c}"/><path d="M40 88L56 96L72 104L60 84" fill="${c}"/><circle cx="64" cy="64" r="10" fill="#FFFFFF"/>`
    },
    'settings': {
        keywords: ['settings', 'config', 'gear', 'options', '设置', '配置', '选项', '齿轮'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<path d="M64 80C72.8 80 80 72.8 80 64C80 55.2 72.8 48 64 48C55.2 48 48 55.2 48 64C48 72.8 55.2 80 64 80Z" stroke="${outlineStroke}" stroke-width="8"/><path d="M64 20V32M64 96V108M20 64H32M96 64H108M32.8 32.8L41.4 41.4M86.6 86.6L95.2 95.2M32.8 95.2L41.4 86.6M86.6 41.4L95.2 32.8" stroke="${outlineStroke}" stroke-width="8" stroke-linecap="round"/>`
            : `<circle cx="64" cy="64" r="24" fill="#FFFFFF" stroke="${c}" stroke-width="16"/><path d="M64 16V32M64 96V112M16 64H32M96 64H112M30 30L42 42M86 86L98 98M30 98L42 86M86 42L98 30" stroke="${c}" stroke-width="16" stroke-linecap="round"/>`
    },
    'tools': {
        keywords: ['tools', 'wrench', 'repair', 'utility', '工具', '扳手', '维修', '组件'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<path d="M84 24C73 24 64 33 64 44C64 46.5 64.5 49 65.5 51.2L24.8 91.8C23.2 93.4 23.2 96 24.8 97.6L30.4 103.2C32 104.8 34.6 104.8 36.2 103.2L76.8 62.5C79 63.5 81.5 64 84 64C95 64 104 55 104 44C104 33 95 24 84 24ZM84 32C90.6 32 96 37.4 96 44C96 46.8 95 49.3 93.3 51.3L77 35L71.3 40.7L87.7 57C85.6 58.7 83 59.7 80 59.7C73.4 59.7 68 54.3 68 47.7C68 41.1 73.4 35.7 80 35.7C81.3 35.7 82.6 35.9 83.8 36.4L84 32Z" fill="${outlineStroke}"/>`
            : `<path d="M84 24C73 24 64 33 64 44C64 46.5 64.5 49 65.5 51.2L24.8 91.8C23.2 93.4 23.2 96 24.8 97.6L30.4 103.2C32 104.8 34.6 104.8 36.2 103.2L76.8 62.5C79 63.5 81.5 64 84 64C95 64 104 55 104 44C104 33 95 24 84 24ZM84 32C90.6 32 96 37.4 96 44C96 46.8 95 49.3 93.3 51.3L77 35L71.3 40.7L87.7 57C85.6 58.7 83 59.7 80 59.7C73.4 59.7 68 54.3 68 47.7C68 41.1 73.4 35.7 80 35.7C81.3 35.7 82.6 35.9 83.8 36.4L84 32Z" fill="${c}"/>`
    },
    'document': {
        keywords: ['document', 'book', 'read', 'docs', '文档', '书籍', '阅读', '文案'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<path d="M64 24C48 24 24 32 24 32V104C24 104 48 96 64 96C80 96 104 104 104 104V32C104 32 80 24 64 24Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><path d="M64 24V96" stroke="${outlineStroke}" stroke-width="8"/>`
            : `<path d="M64 24C48 24 24 32 24 32V104C24 104 48 96 64 96C80 96 104 104 104 104V32C104 32 80 24 64 24Z" fill="${c}"/><path d="M64 24V96" stroke="#FFFFFF" stroke-width="8"/>`
    },
    'notes': {
        keywords: ['notes', 'memo', 'write', 'pencil', '笔记', '备忘录', '书写', '记录'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<path d="M24 24H80L104 48V104H24V24Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><path d="M80 24V48H104" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/><path d="M48 64H80M48 80H72" stroke="${outlineStroke}" stroke-width="6" stroke-linecap="round"/>`
            : `<path d="M24 24H80L104 48V104H24V24Z" fill="${c}"/><path d="M80 24V48H104" fill="rgba(0,0,0,0.15)"/><path d="M48 64H80M48 80H72" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>`
    },
    'question': {
        keywords: ['question', 'help', 'unknown', 'faq', '问题', '帮助', '疑问', '未知', '问号'],
        prefix: 'status',
        render: (c, isOutline) => isOutline
            ? `<circle cx="64" cy="64" r="44" stroke="${outlineStroke}" stroke-width="8"/><path d="M52 52C52 46 58 40 64 40C70 40 76 46 76 52C76 60 64 64 64 72" stroke="${outlineStroke}" stroke-width="8" stroke-linecap="round"/><circle cx="64" cy="88" r="4" fill="${outlineStroke}"/>`
            : `<circle cx="64" cy="64" r="48" fill="${c}"/><path d="M52 52C52 46 58 40 64 40C70 40 76 46 76 52C76 60 64 64 64 72" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/><circle cx="64" cy="88" r="6" fill="#FFFFFF"/>`
    },
    'info': {
        keywords: ['info', 'information', 'about', 'detail', '信息', '详情', '关于', '提示'],
        prefix: 'status',
        render: (c, isOutline) => isOutline
            ? `<circle cx="64" cy="64" r="44" stroke="${outlineStroke}" stroke-width="8"/><path d="M64 56V88" stroke="${outlineStroke}" stroke-width="8" stroke-linecap="round"/><circle cx="64" cy="40" r="4" fill="${outlineStroke}"/>`
            : `<circle cx="64" cy="64" r="48" fill="${c}"/><path d="M64 56V88" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/><circle cx="64" cy="40" r="6" fill="#FFFFFF"/>`
    },
    'security': {
        keywords: ['security', 'shield', 'protect', 'safe', '安全', '盾牌', '保护', '防范'],
        prefix: 'status',
        render: (c, isOutline) => isOutline
            ? `<path d="M64 16L24 32V64C24 88 40 108 64 116C88 108 104 88 104 64V32L64 16Z" stroke="${outlineStroke}" stroke-width="8" stroke-linejoin="round"/>`
            : `<path d="M64 16L24 32V64C24 88 40 108 64 116C88 108 104 88 104 64V32L64 16Z" fill="${c}"/><path d="M64 48V84M46 66L64 84L82 66" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
    },
    'key': {
        keywords: ['key', 'auth', 'password', 'point', '关键点', '钥匙', '密码', '认证', '核心'],
        prefix: 'ui',
        render: (c, isOutline) => isOutline
            ? `<circle cx="48" cy="80" r="24" stroke="${outlineStroke}" stroke-width="8"/><path d="M65 63L104 24M96 32L108 44M84 44L96 56" stroke="${outlineStroke}" stroke-width="8" stroke-linecap="round"/>`
            : `<path d="M65 63L104 24M96 32L108 44M84 44L96 56" stroke="${c}" stroke-width="12" stroke-linecap="round"/><circle cx="48" cy="80" r="28" fill="${c}"/><circle cx="48" cy="80" r="8" fill="#FFFFFF"/>`
    }
};

const dictionaryEntries = [];

for (const [name, meta] of Object.entries(concepts)) {
    // Outline version
    const outlineId = `${meta.prefix}_${name}_outline.svg`;
    fs.writeFileSync(path.join(targetDir, outlineId), svgWrap(meta.render(outlineStroke, true)), 'utf8');
    dictionaryEntries.push({
        id: outlineId,
        name: `${name}_outline`,
        keywords: [...meta.keywords, 'outline', '线框', '单色']
    });

    // Colored versions
    for (const [colorName, hexCode] of Object.entries(colors)) {
        const colorId = `${meta.prefix}_${name}_${colorName}.svg`;
        fs.writeFileSync(path.join(targetDir, colorId), svgWrap(meta.render(hexCode, false)), 'utf8');
        dictionaryEntries.push({
            id: colorId,
            name: `${name}_${colorName}`,
            keywords: [...meta.keywords, 'color', colorName, '彩色']
        });
    }
}

// Update Dictionary
const dictPath = path.join(__dirname, 'resources', 'icon_dictionary.json');
let dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

dictionaryEntries.forEach(newIcon => {
    const existingIndex = dict.findIndex(i => i.id === newIcon.id);
    if (existingIndex > -1) {
        dict[existingIndex] = newIcon;
    } else {
        dict.push(newIcon);
    }
});

fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2), 'utf8');

console.log(`Generated ${dictionaryEntries.length} new icons and updated dictionary.`);
