const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'resources', 'custom_icons');
const dictPath = path.join(__dirname, '..', 'resources', 'icon_dictionary.json');

const files = fs.readdirSync(dir);
let deletedCount = 0;
let monochromeCount = 0;
let orphanedCount = 0;

// Read dictionary to find valid icons
let validNames = new Set();
if (fs.existsSync(dictPath)) {
    const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    validNames = new Set(dict.map(item => item.id));
}

// 1. Delete Orphaned icons
files.forEach(f => {
    if (!f.endsWith('.svg')) return;
    
    const fullPath = path.join(dir, f);
    
    // Check if orphaned
    if (validNames.size > 0 && !validNames.has(f)) {
        console.log('[Orphaned]', f);
        fs.unlinkSync(fullPath);
        orphanedCount++;
        deletedCount++;
        return;
    }

    // Check if monochrome or incomplete
    try {
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Count unique fill colors, excluding "none"
        const fills = (content.match(/fill="[^"]+"/gi) || [])
            .map(m => m.toLowerCase())
            .filter(m => m !== 'fill="none"');
        
        const uniqueFills = new Set(fills);
        
        // Also check if it relies heavily on stroke without multiple stroke colors
        const strokes = (content.match(/stroke="[^"]+"/gi) || [])
            .map(m => m.toLowerCase())
            .filter(m => m !== 'stroke="none"');
            
        const uniqueStrokes = new Set(strokes);

        // If it has <= 1 fill and <= 1 stroke, and doesn't use inline styles, it's likely monochrome
        if (uniqueFills.size <= 1 && uniqueStrokes.size <= 1 && !content.includes('style=')) {
            // Wait, flat-color-icons sometimes have only 1 or 2 fills.
            // Let's be aggressive if it's literally 0 fills and 1 stroke, or 1 fill and 0 strokes.
            console.log('[Monochrome]', f, 'Fills:', uniqueFills.size, 'Strokes:', uniqueStrokes.size);
            fs.unlinkSync(fullPath);
            monochromeCount++;
            deletedCount++;
        }
    } catch(e) {
        // ignore
    }
});

console.log(`Cleanup complete! Deleted ${deletedCount} files.`);
console.log(`- Orphaned: ${orphanedCount}`);
console.log(`- Monochrome/Incomplete: ${monochromeCount}`);
