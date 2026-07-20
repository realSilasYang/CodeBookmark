const fs = require('fs');
const path = require('path');

const customIconsDir = path.join(__dirname, 'resources', 'custom_icons');
const dictPath = path.join(__dirname, 'resources', 'icon_dictionary.json');

const tempIconsDir = path.join(__dirname, 'resources', 'temp_icons', 'node_modules');
const simpleIconsDir = path.join(tempIconsDir, 'simple-icons', 'icons');
const fluentIconsDir = path.join(tempIconsDir, '@fluentui', 'svg-icons', 'icons');

let iconDict = [];
try {
    iconDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
} catch (e) {
    console.error('Failed to load dictionary', e);
    process.exit(1);
}

// Ensure iconDict entries have keywords array
iconDict.forEach(i => {
    if (!i.keywords) i.keywords = [];
});

const existingIds = new Set(iconDict.map(i => i.id));

// 1. Copy Brand Icons
const brandSlugs = [
    'apple', 'google', 'windows', 'android', 'linux', 'ubuntu', 'centos',
    'x', 'twitter', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'snapchat', 'discord', 'twitch', 'wechat', 'tencentqq', 'bilibili',
    'amazon', 'ebay', 'paypal', 'mastercard', 'visa', 'alipay', 'stripe', 'taobao',
    'github', 'gitlab', 'bitbucket', 'stackoverflow',
    'react', 'vue-dot-js', 'vuedotjs', 'angular', 'nodedotjs', 'python', 'javascript', 'typescript', 'java', 'cplusplus', 'csharp', 'go', 'rust',
    'netflix', 'spotify', 'hbo', 'disneyplus',
    'mcdonalds', 'starbucks', 'kfc',
    'nike', 'adidas',
    'nintendo', 'playstation', 'xbox',
    'docker', 'kubernetes', 'amazonaws', 'googlecloud', 'microsoftazure', 'vercel', 'netlify'
];

if (fs.existsSync(simpleIconsDir)) {
    const files = fs.readdirSync(simpleIconsDir);
    brandSlugs.forEach(slug => {
        // Try exact match or close match
        const file = files.find(f => f === slug + '.svg' || f.replace(/-/g, '') === slug + '.svg');
        if (file) {
            const destName = 'brand_' + file.replace(/-/g, '_');
            if (!existingIds.has(destName)) {
                fs.copyFileSync(path.join(simpleIconsDir, file), path.join(customIconsDir, destName));
                let name = file.replace('.svg', '');
                iconDict.push({
                    id: destName,
                    name: name,
                    keywords: [name, 'brand', 'logo', '徽标', '品牌', '公司']
                });
                existingIds.add(destName);
            }
        }
    });
} else {
    console.warn('simple-icons directory not found');
}

// 2. Copy Fluent Icons for ToDo, Food, Plants, Pomodoro, etc.
const keywordsToFind = ['task', 'todo', 'timer', 'clock', 'food', 'fruit', 'apple', 'plant', 'leaf', 'time'];
if (fs.existsSync(fluentIconsDir)) {
    const files = fs.readdirSync(fluentIconsDir);
    const toCopy = files.filter(f => f.endsWith('_24_regular.svg') && keywordsToFind.some(kw => f.includes(kw)));
    
    toCopy.forEach(file => {
        // Classify based on keyword
        let prefix = 'ui_';
        if (file.includes('food') || file.includes('fruit') || file.includes('apple') || file.includes('plant') || file.includes('leaf')) {
            prefix = 'fun_';
        }
        
        const destName = prefix + file;
        if (!existingIds.has(destName)) {
            fs.copyFileSync(path.join(fluentIconsDir, file), path.join(customIconsDir, destName));
            let name = file.replace('_24_regular.svg', '').replace(/_/g, ' ');
            iconDict.push({
                id: destName,
                name: name,
                keywords: []
            });
            existingIds.add(destName);
        }
    });
} else {
    console.warn('fluent icons directory not found');
}

// 3. Synonym Engine
const synonymGroups = [
    ["clipboard", "board", "剪贴板", "剪切板", "粘贴板", "复制", "copy", "paste"],
    ["todo", "task", "checklist", "待办", "任务", "计划", "清单", "打卡"],
    ["timer", "clock", "pomodoro", "番茄钟", "计时器", "时间", "闹钟", "time"],
    ["fruit", "food", "apple", "banana", "水果", "食物", "餐饮", "苹果", "香蕉", "餐饮", "eat"],
    ["plant", "leaf", "tree", "植物", "叶子", "树", "自然", "nature"],
    ["book", "bookmark", "书", "书签", "阅读", "read"],
    ["home", "house", "主页", "首页", "家", "房子"],
    ["star", "星星", "收藏", "重点", "favorite"],
    ["bug", "error", "issue", "虫子", "缺陷", "错误", "问题", "报错"],
    ["heart", "love", "心", "喜欢", "爱心"],
    ["check", "checkmark", "tick", "done", "ok", "勾", "完成", "确认", "对"],
    ["cross", "dismiss", "cancel", "close", "x", "叉", "取消", "关闭"],
    ["warning", "alert", "警告", "注意", "提醒", "感叹号"],
    ["info", "information", "信息", "提示", "详情", "关于"],
    ["settings", "gear", "设置", "齿轮", "配置", "选项"],
    ["user", "person", "用户", "人", "账号", "账户"],
    ["search", "glass", "搜索", "放大镜", "查找", "找"],
    ["edit", "pencil", "pen", "编辑", "笔", "修改", "写"],
    ["delete", "trash", "remove", "删除", "垃圾桶", "移除", "清空"],
    ["save", "disk", "保存", "磁盘", "存储"],
    ["folder", "directory", "文件夹", "目录"],
    ["file", "document", "文件", "文档"],
    ["image", "picture", "photo", "图片", "照片", "图像"],
    ["video", "movie", "视频", "电影", "影像"],
    ["music", "audio", "sound", "音乐", "音频", "声音"],
    ["lock", "security", "锁", "安全", "密码", "加密"],
    ["unlock", "解锁", "解密", "公开"],
    ["link", "chain", "链接", "链条", "网址"],
    ["cloud", "云", "云端", "网络"],
    ["download", "下载", "下"],
    ["upload", "上传", "上"],
    ["share", "分享", "共享", "转发"],
    ["send", "mail", "发送", "邮件", "信封", "发"],
    ["chat", "message", "comment", "聊天", "消息", "评论", "留言"],
    ["bell", "notification", "铃铛", "通知", "提醒"],
    ["react", "reactjs"],
    ["vue", "vuejs"],
    ["node", "nodejs"],
    ["wechat", "微信"],
    ["alipay", "支付宝"],
    ["taobao", "淘宝"],
    ["bilibili", "b站", "哔哩哔哩"],
    ["tencent", "腾讯", "qq"],
    ["apple", "苹果"],
    ["windows", "win", "微软", "microsoft"],
    ["linux", "企鹅", "penguin"],
    ["github", "git", "代码托管"],
    ["youtube", "油管"]
];

iconDict.forEach(icon => {
    let searchableText = icon.name.toLowerCase() + ' ' + (icon.keywords || []).join(' ').toLowerCase();
    
    synonymGroups.forEach(group => {
        // If the icon already contains any word in this group
        if (group.some(word => searchableText.includes(word.toLowerCase()))) {
            // Add all words from the group
            group.forEach(word => {
                if (!icon.keywords.includes(word)) {
                    icon.keywords.push(word);
                }
            });
        }
    });
});

// Write back
fs.writeFileSync(dictPath, JSON.stringify(iconDict, null, 4), 'utf8');
console.log('Successfully expanded icons and generated synonyms.');
