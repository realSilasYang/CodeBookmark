const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'resources', 'custom_icons');

const icons = {
    'status_bug.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<!-- Minimalist Flat Code Bug -->
<path d="M64 24C48 24 40 36 40 56V80C40 100 48 112 64 112C80 112 88 100 88 80V56C88 36 80 24 64 24Z" fill="#F03E3E"/>
<path d="M40 56H88" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>
<path d="M40 80H88" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>
<path d="M64 24V112" stroke="#FFFFFF" stroke-width="8"/>
<circle cx="52" cy="40" r="4" fill="#FFFFFF"/>
<circle cx="76" cy="40" r="4" fill="#FFFFFF"/>
<path d="M30 46L40 50" stroke="#F03E3E" stroke-width="8" stroke-linecap="round"/>
<path d="M98 46L88 50" stroke="#F03E3E" stroke-width="8" stroke-linecap="round"/>
<path d="M26 68H40" stroke="#F03E3E" stroke-width="8" stroke-linecap="round"/>
<path d="M102 68H88" stroke="#F03E3E" stroke-width="8" stroke-linecap="round"/>
<path d="M30 90L40 86" stroke="#F03E3E" stroke-width="8" stroke-linecap="round"/>
<path d="M98 90L88 86" stroke="#F03E3E" stroke-width="8" stroke-linecap="round"/>
<path d="M52 16L56 24" stroke="#F03E3E" stroke-width="8" stroke-linecap="round"/>
<path d="M76 16L72 24" stroke="#F03E3E" stroke-width="8" stroke-linecap="round"/>
</svg>`,

    'status_debug.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<!-- Bug Base -->
<path d="M60 28C46.66 28 40 38 40 54.67V74.67C40 91.33 46.66 101.33 60 101.33C73.33 101.33 80 91.33 80 74.67V54.67C80 38 73.33 28 60 28Z" fill="#F08C00"/>
<path d="M40 54.67H80" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
<path d="M40 74.67H80" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
<path d="M60 28V101.33" stroke="#FFFFFF" stroke-width="6"/>
<circle cx="50" cy="41.33" r="3.33" fill="#FFFFFF"/>
<circle cx="70" cy="41.33" r="3.33" fill="#FFFFFF"/>
<path d="M31.67 44.67L40 48" stroke="#F08C00" stroke-width="6" stroke-linecap="round"/>
<path d="M88.33 44.67L80 48" stroke="#F08C00" stroke-width="6" stroke-linecap="round"/>
<path d="M28.33 63H40" stroke="#F08C00" stroke-width="6" stroke-linecap="round"/>
<path d="M91.67 63H80" stroke="#F08C00" stroke-width="6" stroke-linecap="round"/>
<path d="M31.67 81.33L40 78" stroke="#F08C00" stroke-width="6" stroke-linecap="round"/>
<path d="M88.33 81.33L80 78" stroke="#F08C00" stroke-width="6" stroke-linecap="round"/>
<!-- Play/Debug Icon Overlay -->
<circle cx="88" cy="88" r="28" fill="#51CF66" stroke="#FFFFFF" stroke-width="6"/>
<path d="M78 74L104 88L78 102V74Z" fill="#FFFFFF"/>
</svg>`,

    'status_patch.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<!-- Minimalist Flat Band-Aid / Patch -->
<rect x="24" y="52" width="80" height="24" rx="12" transform="rotate(-45 64 64)" fill="#FFD43B"/>
<rect x="48" y="48" width="32" height="32" rx="4" transform="rotate(-45 64 64)" fill="#F59F00"/>
<circle cx="56" cy="64" r="3" fill="#FFFFFF"/>
<circle cx="72" cy="64" r="3" fill="#FFFFFF"/>
<circle cx="64" cy="56" r="3" fill="#FFFFFF"/>
<circle cx="64" cy="72" r="3" fill="#FFFFFF"/>
</svg>`,

    'status_security_bug.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<!-- Security Bug / Vulnerability -->
<path d="M64 16L24 32V64C24 88 40 108 64 116C88 108 104 88 104 64V32L64 16Z" fill="#4C6EF5"/>
<!-- Small Bug Inside -->
<path d="M64 48C56 48 52 54 52 64V76C52 86 56 92 64 92C72 92 76 86 76 76V64C76 54 72 48 64 48Z" fill="#FFFFFF"/>
<path d="M52 64H76" stroke="#4C6EF5" stroke-width="4" stroke-linecap="round"/>
<path d="M52 76H76" stroke="#4C6EF5" stroke-width="4" stroke-linecap="round"/>
<path d="M64 48V92" stroke="#4C6EF5" stroke-width="4"/>
</svg>`,

    'status_diagnostic.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<!-- Diagnostic / Wrench -->
<path d="M84 24C73 24 64 33 64 44C64 46.5 64.5 49 65.5 51.2L24.8 91.8C23.2 93.4 23.2 96 24.8 97.6L30.4 103.2C32 104.8 34.6 104.8 36.2 103.2L76.8 62.5C79 63.5 81.5 64 84 64C95 64 104 55 104 44C104 33 95 24 84 24ZM84 32C90.6 32 96 37.4 96 44C96 46.8 95 49.3 93.3 51.3L77 35L71.3 40.7L87.7 57C85.6 58.7 83 59.7 80 59.7C73.4 59.7 68 54.3 68 47.7C68 41.1 73.4 35.7 80 35.7C81.3 35.7 82.6 35.9 83.8 36.4L84 32Z" fill="#868E96"/>
<path d="M72 72L104 104M104 72L72 104" stroke="#FA5252" stroke-width="12" stroke-linecap="round"/>
</svg>`,

    'status_crash.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<!-- Crash / Exception -->
<rect x="24" y="24" width="80" height="80" rx="8" fill="#343A40"/>
<path d="M64 40L48 64H72L56 88" stroke="#FCC419" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="36" cy="36" r="4" fill="#FA5252"/>
<circle cx="48" cy="36" r="4" fill="#FCC419"/>
<circle cx="60" cy="36" r="4" fill="#51CF66"/>
</svg>`
};

for (const [filename, svg] of Object.entries(icons)) {
    fs.writeFileSync(path.join(targetDir, filename), svg, 'utf8');
}
console.log('Created minimalist flat SVGs.');
