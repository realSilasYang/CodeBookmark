const fs = require('fs');
const path = require('path');

const dictPath = path.join(__dirname, '..', 'resources', 'icon_dictionary.json');
const iconsDir = path.join(__dirname, '..', 'resources', 'custom_icons');

if (!fs.existsSync(dictPath)) {
    console.error('icon_dictionary.json not found!');
    process.exit(1);
}

const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
const validNames = new Set(dict.map(item => item.id));

const files = fs.readdirSync(iconsDir);
let deleted = 0;
let deletedList = [];

files.forEach(f => {
    // Only delete SVGs that are not in the validNames set
    if (f.endsWith('.svg') && !validNames.has(f)) {
        fs.unlinkSync(path.join(iconsDir, f));
        deletedList.push(f);
        deleted++;
    }
});

console.log(`Deleted ${deleted} unused, incomplete, or monochrome SVG files.`);
if (deleted > 0) {
    console.log('Examples of deleted files:');
    console.log(deletedList.slice(0, 10).join(', ') + (deleted > 10 ? '...' : ''));
}
