const fs = require('fs');
const path = require('path');
const simpleIcons = require('./resources/temp_icons2/node_modules/simple-icons');

const customIconsDir = path.join(__dirname, 'resources', 'custom_icons');
const dictPath = path.join(__dirname, 'resources', 'icon_dictionary.json');
const emojiDir = path.join(__dirname, 'resources', 'temp_icons2', 'node_modules', 'fluentui-emoji', 'icons', 'flat');

let iconDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

// 1. Colorize Brand Icons
const brandFiles = fs.readdirSync(customIconsDir).filter(f => f.startsWith('brand_'));
brandFiles.forEach(file => {
    const slug = file.replace('brand_', '').replace('.svg', '').replace(/_/g, '-');
    let icon = Object.values(simpleIcons).find(i => i.slug === slug);
    if (!icon) {
        icon = Object.values(simpleIcons).find(i => i.slug && i.slug.replace(/-/g, '') === slug.replace(/-/g, ''));
    }
    
    if (icon && icon.hex) {
        let content = fs.readFileSync(path.join(customIconsDir, file), 'utf8');
        if (!content.includes('fill=')) {
            // Some svgs might have multiple paths. In simple-icons, usually it's just one path or we can set fill on the SVG itself.
            content = content.replace('<svg ', `<svg fill="#${icon.hex}" `);
            fs.writeFileSync(path.join(customIconsDir, file), content, 'utf8');
            console.log('Colorized', file, 'with', icon.hex);
        }
    }
});

// 2. Remove Monochrome Fluent Icons
const monochromeFiles = fs.readdirSync(customIconsDir).filter(f => f.includes('_24_regular.svg'));
monochromeFiles.forEach(f => {
    fs.unlinkSync(path.join(customIconsDir, f));
});

iconDict = iconDict.filter(i => !i.id.includes('_24_regular.svg'));

// 3. Add Colorful Emojis
const desiredEmojis = [
    'red-apple', 'green-apple', 'banana', 'tomato', 'grapes', 'melon', 'watermelon', 'tangerine', 'lemon', 'cherries', 'strawberry', 'peach', 'mango', 'pineapple',
    'seedling', 'potted-plant', 'evergreen-tree', 'deciduous-tree', 'palm-tree', 'cactus', 'sheaf-of-rice', 'herb', 'shamrock', 'four-leaf-clover', 'maple-leaf', 'fallen-leaf', 'leaf-fluttering-in-wind',
    'alarm-clock', 'stopwatch', 'timer-clock', 'hourglass-done', 'hourglass-not-done', 'watch', 'calendar', 'tear-off-calendar', 'spiral-calendar', 'spiral-notepad',
    'clipboard', 'check-mark-button', 'check-box-with-check', 'cross-mark-button', 'cross-mark', 'pushpin', 'round-pushpin', 'paperclip',
    'memo', 'pencil', 'black-nib', 'fountain-pen', 'pen', 'paintbrush', 'crayon',
    'open-book', 'green-book', 'blue-book', 'orange-book', 'books', 'bookmark', 'bookmark-tabs',
    'laptop', 'computer-mouse', 'keyboard', 'printer', 'mobile-phone', 'battery', 'electric-plug', 'light-bulb', 'magnifying-glass-tilted-left', 'locked', 'unlocked', 'key', 'gear'
];

if (fs.existsSync(emojiDir)) {
    const existingIds = new Set(iconDict.map(i => i.id));
    const availableEmojis = fs.readdirSync(emojiDir);

    desiredEmojis.forEach(slug => {
        const file = slug + '.svg';
        if (availableEmojis.includes(file)) {
            let prefix = 'fun_';
            if (['alarm-clock', 'stopwatch', 'timer-clock', 'hourglass', 'watch', 'calendar', 'clipboard', 'check', 'cross', 'pushpin', 'memo', 'pencil', 'laptop', 'gear', 'magnifying'].some(k => slug.includes(k))) {
                prefix = 'ui_';
            }
            
            const destName = prefix + file.replace(/-/g, '_');
            if (!existingIds.has(destName)) {
                fs.copyFileSync(path.join(emojiDir, file), path.join(customIconsDir, destName));
                let name = file.replace('.svg', '').replace(/-/g, ' ');
                iconDict.push({
                    id: destName,
                    name: name,
                    keywords: []
                });
                existingIds.add(destName);
            }
        }
    });
} else {
    console.error('Emoji directory not found!');
}

// 4. Synonym Engine (Re-run for the new emojis)
const synonymGroups = [
    ["clipboard", "board", "剪贴板", "剪切板", "粘贴板", "复制", "copy", "paste"],
    ["todo", "task", "checklist", "待办", "任务", "计划", "清单", "打卡", "memo", "calendar"],
    ["timer", "clock", "pomodoro", "番茄钟", "计时器", "时间", "闹钟", "time", "watch", "stopwatch"],
    ["fruit", "food", "apple", "banana", "tomato", "水果", "食物", "餐饮", "苹果", "香蕉", "番茄", "eat"],
    ["plant", "leaf", "tree", "植物", "叶子", "树", "自然", "nature", "seedling", "cactus"],
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
    ["search", "glass", "搜索", "放大镜", "查找", "找", "magnifying"],
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
    ["bell", "notification", "铃铛", "通知", "提醒"]
];

iconDict.forEach(icon => {
    if (!icon.keywords) icon.keywords = [];
    let searchableText = icon.name.toLowerCase() + ' ' + (icon.keywords).join(' ').toLowerCase();
    
    synonymGroups.forEach(group => {
        if (group.some(word => searchableText.includes(word.toLowerCase()))) {
            group.forEach(word => {
                if (!icon.keywords.includes(word)) {
                    icon.keywords.push(word);
                }
            });
        }
    });
});

fs.writeFileSync(dictPath, JSON.stringify(iconDict, null, 4), 'utf8');
console.log('Successfully colorized brands and added colorful emojis.');
