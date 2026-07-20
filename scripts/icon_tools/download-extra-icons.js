const fs = require('fs');
const path = require('path');
const https = require('https');

const iconsDir = path.join(__dirname, '..', 'resources', 'custom_icons');
const listPath = path.join(__dirname, 'curated_icons.json');

if (!fs.existsSync(listPath)) {
    console.error('curated_icons.json not found! Run build-curated-list.js first.');
    process.exit(1);
}

const curatedData = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const iconList = curatedData.icons;

// Clear existing icons
if (fs.existsSync(iconsDir)) {
    fs.readdirSync(iconsDir).forEach(f => {
        fs.unlinkSync(path.join(iconsDir, f));
    });
} else {
    fs.mkdirSync(iconsDir, { recursive: true });
}

let completed = 0;
let errors = 0;
let queue = [...iconList];
const CONCURRENCY_LIMIT = 20;

function downloadNext() {
    if (queue.length === 0) return;
    const item = queue.shift();
    
    https.get(item.url, (res) => {
        if (res.statusCode !== 200) {
            console.error(`Failed: ${item.name} (${res.statusCode})`);
            errors++;
            checkDone();
            downloadNext();
            return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            fs.writeFileSync(path.join(iconsDir, item.name), data);
            completed++;
            checkDone();
            downloadNext();
        });
    }).on('error', err => {
        console.error(`Error: ${item.name} - ${err.message}`);
        errors++;
        checkDone();
        downloadNext();
    });
}

function checkDone() {
    if (completed + errors === iconList.length) {
        console.log(`Finished downloading. Success: ${completed}, Failed: ${errors}`);
    }
}

console.log(`Starting massive categorized download of ${iconList.length} variants with concurrency ${CONCURRENCY_LIMIT}...`);

for (let i = 0; i < CONCURRENCY_LIMIT && queue.length > 0; i++) {
    downloadNext();
}
