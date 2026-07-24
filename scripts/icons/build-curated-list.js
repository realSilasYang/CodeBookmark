/**
 * 汇总经过人工挑选的图标来源、分类和下载地址，生成稳定且去重的候选清单。
 * 分类顺序决定最终词典的可读结构，但同一输出文件只安排一次下载任务。
 */
const fs = require('fs');
const path = require('path');

// 一个概念往往有多套图标风格。这里先保留各来源，最后再按输出文件名去重，
// 既能挑选更合适的外观，也不会重复下载同一资源。
const emojiSources = ['fluent-emoji-flat', 'twemoji', 'noto-v1', 'fxemoji'];
const sourceLabels = new Map([
    ['fluent-emoji-flat', 'fluent'],
    ['twemoji', 'twitter'],
    ['noto-v1', 'google_noto'],
    ['fxemoji', 'mozilla'],
    ['flat-color-icons', 'flat_color'],
    ['vscode-icons', 'vscode'],
    ['logos', 'logo'],
]);

function sourceLabel(source) {
    return sourceLabels.get(source) || source.replace(/-/g, '_');
}

// Emoji 只需填写 CLDR 名称；下载地址和落盘名称在这里统一补齐，
// 后面的分类清单便能专注表达“需要哪些图标”。
function generateEmojiSources(prefix, cldrNames) {
    let results = [];
    cldrNames.forEach(name => {
        emojiSources.forEach(source => {
            results.push({
                url: `https://api.iconify.design/${source}/${name}.svg`,
                name: `${prefix}_${name.replace(/-/g, '_')}_${sourceLabel(source)}.svg`,
                concept: name.replace(/-/g, '_')
            });
        });
    });
    return results;
}

// 少数精选资源不属于通用 Emoji 集合，允许直接给出来源地址和输出名称。
function generateExplicitSources(prefix, urls) {
    let results = [];
    urls.forEach(url => {
// 像 logos/javascript 这样的 Iconify 路径在这里展开成实际下载地址。
        const [source, rawName] = url.split('/');
        const baseName = rawName.replace(/-/g, '_');
        results.push({
            url: `https://api.iconify.design/${url}.svg`,
            name: `${prefix}_${baseName}_${sourceLabel(source)}.svg`,
            concept: baseName
        });
    });
    return results;
}

// 代码状态类：错误、通过、警告、调试等一眼即可辨认的开发信号。
const statusEmojis = [
    'bug', 'beetle', 'lady-beetle', 'caterpillar', 'ant', 'spider', 'spider-web', 'cockroach', 'mosquito', 'cricket', 'microbe',
    'check-mark-button', 'check-box-with-check', 'white-heavy-check-mark', 'ok-hand', 'thumbs-up', 'clapping-hands',
    'cross-mark', 'cross-mark-button', 'warning', 'no-entry', 'stop-sign', 'thumbs-down', 'prohibited',
    'alarm-clock', 'hourglass-done', 'hourglass-not-done', 'stopwatch', 'timer-clock', 'calendar',
    'trophy', 'sports-medal', 'military-medal', 'star', 'glowing-star', 'crown', '1st-place-medal',
    'plus', 'minus', 'multiply', 'divide', 'exclamation-mark', 'question-mark', 'red-circle', 'green-circle', 'blue-circle', 'yellow-circle', 'white-circle', 'black-circle',
    'bullseye', 'pushpin', 'round-pushpin', 'triangular-flag', 'checkered-flag', 'crossed-flags'
];

const statusExplicit = [
    'flat-color-icons/inspection', 'flat-color-icons/high-priority', 'flat-color-icons/ok', 'flat-color-icons/cancel',
    'flat-color-icons/clock', 'flat-color-icons/approval', 'flat-color-icons/disapprove', 'flat-color-icons/expired',
    'flat-color-icons/good-decision', 'flat-color-icons/bad-decision', 'flat-color-icons/info', 'flat-color-icons/idea'
];

// 核心架构类：模块、数据、服务、安全与部署等工程概念。
const archEmojis = [
    'shield', 'locked', 'unlocked', 'key', 'locked-with-key', 'locked-with-pen', 'old-key',
    'electric-plug', 'antenna-bars', 'satellite-antenna', 'globe-showing-americas', 'globe-with-meridians', 'globe-showing-asia-australia', 'satellite',
    'cloud', 'open-file-folder', 'toolbox', 'bar-chart', 'chart-increasing', 'chart-decreasing', 'direct-hit', 'spiral-notepad',
    'gear', 'hammer', 'hammer-and-wrench', 'wrench', 'nut-and-bolt', 'magnet', 'microscope', 'telescope', 'brain', 'puzzle-piece', 'balance-scale', 'abacus', 'gear',
    'factory', 'construction', 'brick', 'hook', 'building-construction', 'chains', 'link'
];

const archExplicit = [
    'flat-color-icons/database', 'flat-color-icons/server', 'flat-color-icons/cloud', 'flat-color-icons/lock', 'flat-color-icons/unlock',
    'flat-color-icons/key', 'flat-color-icons/settings', 'flat-color-icons/puzzle', 'flat-color-icons/combo-chart', 'flat-color-icons/line-chart',
    'flat-color-icons/flow-chart', 'flat-color-icons/data-encryption', 'flat-color-icons/data-protection', 'flat-color-icons/data-backup',
    'flat-color-icons/data-recovery', 'flat-color-icons/network', 'flat-color-icons/mind-map', 'flat-color-icons/tree-structure',
    'vscode-icons/file-type-sqlite', 'vscode-icons/file-type-sql', 'vscode-icons/file-type-mysql', 'vscode-icons/file-type-mongo'
];

// 界面资源类：文件、编辑、导航、媒体和常用工具。
const uiEmojis = [
    'house', 'magnifying-glass-tilted-left', 'magnifying-glass-tilted-right', 'compass', 'map', 'world-map',
    'file-folder', 'open-file-folder', 'page-facing-up', 'page-with-curl', 'folded-bookmark', 'bookmark', 'scroll', 'card-index', 'card-index-dividers',
    'clipboard', 'pencil', 'memo', 'pen', 'briefcase', 'books', 'ledger', 'notebook', 'open-book', 'green-book', 'blue-book', 'orange-book',
    
    // 补上办公、效率和学习场景中常用但前面尚未覆盖的物件。
    'calendar', 'tear-off-calendar', 'calculator', 'paperclip', 'linked-paperclips', 'straight-ruler', 'triangular-ruler', 'scissors', 
    'envelope', 'e-mail', 'inbox-tray', 'outbox-tray', 'pushpin', 'round-pushpin', 
    'graduation-cap', 'backpack', 'light-bulb', 'microscope', 'telescope', 'test-tube', 'petri-dish', 'dna', 'atom-symbol',

    'camera', 'movie-camera', 'videocassette', 'television', 'radio', 'microphone', 'headphone', 'musical-note', 'musical-notes', 'clapper-board', 'framed-picture', 'artist-palette', 'film-frames',
    'desktop-computer', 'laptop-computer', 'mobile-phone', 'mobile-phone-with-arrow', 'telephone', 'printer', 'keyboard', 'computer-mouse', 'trackball', 'optical-disk', 'floppy-disk',
    'up-arrow', 'down-arrow', 'left-arrow', 'right-arrow', 'back-arrow', 'end-arrow', 'on-arrow', 'soon-arrow', 'top-arrow', 'up-down-arrow', 'left-right-arrow', 'counterclockwise-arrows-button', 'clockwise-vertical-arrows', 'repeat-button', 'repeat-single-button'
];

const uiExplicit = [
    'flat-color-icons/home', 'flat-color-icons/search', 'flat-color-icons/opened-folder', 'flat-color-icons/folder', 'flat-color-icons/document',
    'flat-color-icons/picture', 'flat-color-icons/video-file', 'flat-color-icons/music', 'flat-color-icons/bookmark', 'flat-color-icons/manager',
    'flat-color-icons/display', 'flat-color-icons/smartphone', 'flat-color-icons/print', 'flat-color-icons/camera', 'flat-color-icons/gallery',
    'flat-color-icons/list', 'flat-color-icons/grid', 'flat-color-icons/menu', 'flat-color-icons/template', 'flat-color-icons/view-details',
    'vscode-icons/default-folder', 'vscode-icons/default-folder-opened', 'vscode-icons/default-file', 'vscode-icons/default-root-folder',
    'vscode-icons/folder-type-src', 'vscode-icons/folder-type-test', 'vscode-icons/folder-type-dist', 'vscode-icons/folder-type-docs',
    'vscode-icons/folder-type-images', 'vscode-icons/folder-type-scripts', 'vscode-icons/folder-type-styles', 'vscode-icons/folder-type-components',
    'vscode-icons/folder-type-api', 'vscode-icons/folder-type-config', 'vscode-icons/folder-type-tools', 'vscode-icons/folder-type-core',
    'vscode-icons/folder-type-app', 'vscode-icons/folder-type-public', 'vscode-icons/folder-type-node', 'vscode-icons/folder-type-github'
];

// 趣味标签类：适合给个人书签增加辨识度的物品、活动和表情。
const funEmojis = [
    'grinning-face', 'smiling-face-with-sunglasses', 'exploding-head', 'face-screaming-in-fear', 'face-vomiting', 'clown-face', 'alien', 'ghost', 'skull', 'robot', 'goblin', 'ogre', 'poop', 'pile-of-poo', 'space-invader', 'skull-and-crossbones',
    'waving-hand', 'raised-hand', 'victory-hand', 'folded-hands', 'flexing-biceps', 'handshake', 'eyes', 'anatomical-heart', 'red-heart', 'sparkling-heart',
    'cat', 'dog', 'fox', 'bear', 'panda', 'tiger', 'lion', 'cow', 'pig', 'frog', 'monkey', 'chicken', 'penguin', 'turtle', 'snake', 'dinosaur', 't-rex', 'sauropod', 'dragon', 'unicorn', 'rabbit', 'mouse', 'hamster', 'koala', 'boar', 'owl', 'bat', 'wolf',
    'hamburger', 'pizza', 'hot-dog', 'taco', 'burrito', 'sushi', 'bento-box', 'rice-cracker', 'rice-ball', 'cooked-rice', 'curry-rice', 'steaming-bowl', 'spaghetti', 'roasted-sweet-potato', 'oden', 'fried-shrimp', 'fish-cake-with-swirl', 'moon-cake', 'dango', 'dumpling', 'fortune-cookie', 'takeout-box', 'crab', 'lobster', 'squid', 'oyster', 'coffee', 'hot-beverage', 'beer-mug', 'clinking-beer-mugs', 'wine-glass', 'cocktail-glass', 'tropical-drink', 'tumbler-glass', 'cup-with-straw', 'bubble-tea', 'beverage-box', 'mate', 'ice-cream', 'doughnut', 'cookie', 'chocolate-bar', 'candy', 'lollipop',
    'fire', 'droplet', 'water-wave', 'sparkles', 'shooting-star', 'comet', 'sun', 'moon', 'crescent-moon', 'tornado', 'cyclone', 'rainbow', 'umbrella-with-rain-drops', 'zap', 'snowflake', 'snowman', 'high-voltage',
    'rocket', 'flying-saucer', 'helicopter', 'small-airplane', 'airplane', 'high-speed-train', 'bullet-train', 'tractor', 'racing-car', 'police-car', 'fire-engine', 'ambulance', 'red-paper-lantern', 'jack-o-lantern', 'balloon', 'party-popper', 'confetti-ball', 'magic-wand', 'crossed-swords', 'shield', 'bow-and-arrow', 'crystal-ball', 'teddy-bear', 'joystick', 'video-game'
];

// 品牌徽标类：开发工具、平台、在线服务和常见产品。
const brandExplicit = [
    'logos/javascript', 'logos/typescript-icon', 'logos/html-5', 'logos/css-3', 'logos/react', 'logos/vue', 'logos/angular-icon', 'logos/svelte-icon', 'logos/ember',
    'logos/nodejs-icon', 'logos/deno', 'logos/bun', 'logos/php', 'logos/python', 'logos/ruby', 'logos/java', 'logos/kotlin-icon', 'logos/swift', 'logos/c', 'logos/c-plusplus', 'logos/c-sharp', 'logos/go', 'logos/rust', 'logos/haskell-icon', 'logos/scala', 'logos/elixir', 'logos/erlang', 'logos/dart', 'logos/lua', 'logos/perl', 'logos/r-lang', 'logos/bash-icon',
    'logos/docker-icon', 'logos/kubernetes', 'logos/terraform-icon', 'logos/ansible', 'logos/chef', 'logos/puppet-icon', 'logos/vagrant-icon',
    'logos/git-icon', 'logos/github-icon', 'logos/gitlab', 'logos/bitbucket', 'logos/subversion', 'logos/mercurial',
    'logos/aws', 'logos/google-cloud', 'logos/microsoft-azure', 'logos/digital-ocean', 'logos/heroku-icon', 'logos/vercel-icon', 'logos/netlify-icon', 'logos/cloudflare-icon',
    'logos/mysql-icon', 'logos/postgresql', 'logos/sqlite', 'logos/mongodb-icon', 'logos/redis', 'logos/cassandra', 'logos/neo4j', 'logos/elasticsearch', 'logos/couchbase', 'logos/mariadb-icon',
    'logos/apple', 'logos/android-icon', 'logos/microsoft-windows-icon', 'logos/linux-tux', 'logos/ubuntu', 'logos/debian', 'logos/centos-icon', 'logos/fedora', 'logos/redhat-icon', 'logos/alpine-linux',
    'logos/chrome', 'logos/firefox', 'logos/safari', 'logos/microsoft-edge', 'logos/opera', 'logos/brave',
    'logos/visual-studio-code', 'logos/intellij-idea', 'logos/webstorm', 'logos/pycharm', 'logos/eclipse-icon', 'logos/vim', 'logos/emacs', 'logos/sublime-text-icon', 'logos/atom-icon',
    'logos/slack-icon', 'logos/discord-icon', 'logos/microsoft-teams', 'logos/trello', 'logos/jira', 'logos/confluence', 'logos/asana-icon', 'logos/notion-icon',
    'logos/webpack', 'logos/rollupjs', 'logos/vitejs', 'logos/parcel-icon', 'logos/babel', 'logos/eslint', 'logos/prettier', 'logos/jest', 'logos/mocha', 'logos/cypress-icon', 'logos/selenium', 'logos/puppeteer',
    
    // 办公、效率和学习领域中常见的产品品牌。
    'logos/microsoft-word', 'logos/microsoft-excel', 'logos/microsoft-powerpoint', 'logos/microsoft-outlook', 
    'logos/zoom', 'logos/google-drive', 'logos/google-gmail', 'logos/wikipedia', 'logos/stackoverflow-icon', 'logos/figma', 'logos/sketch', 'logos/invision-icon',

    // vscode-icons 提供更清晰的扁平技术徽标；输出名称仍沿用本项目规则，
    // 因此替换来源不会影响已经保存的图标 ID。
    'vscode-icons/file-type-js-official', 'vscode-icons/file-type-typescript-official', 'vscode-icons/file-type-python', 'vscode-icons/file-type-java', 'vscode-icons/file-type-cpp3', 'vscode-icons/file-type-csharp2', 'vscode-icons/file-type-go-gopher', 'vscode-icons/file-type-rust', 'vscode-icons/file-type-reactjs', 'vscode-icons/file-type-vue', 'vscode-icons/file-type-angular', 'vscode-icons/file-type-node', 'vscode-icons/file-type-docker', 'vscode-icons/file-type-git'
];

// 先完整汇总再去重，避免某个概念跨分类出现时因遍历顺序改变最终下载集合。
const generatedIcons = [
    ...generateEmojiSources('status', statusEmojis),
    ...generateExplicitSources('status', statusExplicit),
    
    ...generateEmojiSources('arch', archEmojis),
    ...generateExplicitSources('arch', archExplicit),
    
    ...generateEmojiSources('ui', uiEmojis),
    ...generateExplicitSources('ui', uiExplicit),
    
    ...generateEmojiSources('fun', funEmojis),
    
    ...generateExplicitSources('brand', brandExplicit)
];

// 跨分类重复是有意的，但同一个落盘文件只安排一次下载。
const allCuratedIcons = [...new Map(generatedIcons.map(icon => [icon.name, icon])).values()];

const outputData = {
    total: allCuratedIcons.length,
    icons: allCuratedIcons
};

const outputPath = path.join(__dirname, 'curated_icons.json');
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
try {
    fs.writeFileSync(temporaryPath, JSON.stringify(outputData, null, 2));
    fs.renameSync(temporaryPath, outputPath);
} catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch {}
    throw error;
}
console.log(`Curated list built with ${allCuratedIcons.length} unique source-backed icons.`);
