const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'resources', 'custom_icons');

const icons = {
    // === 代码状态 (status_) ===
    'status_sphere_red.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="64" cy="64" r="56" fill="url(#paint0_radial)"/>
<circle cx="64" cy="64" r="56" fill="url(#paint1_radial)" fill-opacity="0.6"/>
<defs>
<radialGradient id="paint0_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(48 32) scale(80)">
<stop stop-color="#FF6B6B"/>
<stop offset="1" stop-color="#C92A2A"/>
</radialGradient>
<radialGradient id="paint1_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(64 110) scale(50)">
<stop stop-color="#3B0000"/>
<stop offset="1" stop-color="#3B0000" stop-opacity="0"/>
</radialGradient>
</defs>
</svg>`,
    'status_sphere_green.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="64" cy="64" r="56" fill="url(#paint0_radial)"/>
<circle cx="64" cy="64" r="56" fill="url(#paint1_radial)" fill-opacity="0.6"/>
<defs>
<radialGradient id="paint0_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(48 32) scale(80)">
<stop stop-color="#51CF66"/>
<stop offset="1" stop-color="#2B8A3E"/>
</radialGradient>
<radialGradient id="paint1_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(64 110) scale(50)">
<stop stop-color="#002b00"/>
<stop offset="1" stop-color="#002b00" stop-opacity="0"/>
</radialGradient>
</defs>
</svg>`,
    'status_sphere_blue.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="64" cy="64" r="56" fill="url(#paint0_radial)"/>
<circle cx="64" cy="64" r="56" fill="url(#paint1_radial)" fill-opacity="0.6"/>
<defs>
<radialGradient id="paint0_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(48 32) scale(80)">
<stop stop-color="#339AF0"/>
<stop offset="1" stop-color="#1864AB"/>
</radialGradient>
<radialGradient id="paint1_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(64 110) scale(50)">
<stop stop-color="#001d3b"/>
<stop offset="1" stop-color="#001d3b" stop-opacity="0"/>
</radialGradient>
</defs>
</svg>`,
    'status_sphere_yellow.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="64" cy="64" r="56" fill="url(#paint0_radial)"/>
<circle cx="64" cy="64" r="56" fill="url(#paint1_radial)" fill-opacity="0.6"/>
<defs>
<radialGradient id="paint0_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(48 32) scale(80)">
<stop stop-color="#FCC419"/>
<stop offset="1" stop-color="#E67700"/>
</radialGradient>
<radialGradient id="paint1_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(64 110) scale(50)">
<stop stop-color="#4d2700"/>
<stop offset="1" stop-color="#4d2700" stop-opacity="0"/>
</radialGradient>
</defs>
</svg>`,
    'status_beaker.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M40 24H88V32H40V24Z" fill="#E9ECEF"/>
<path d="M44 32H84V80L96 104H32L44 80V32Z" fill="#F8F9FA"/>
<path d="M36 92L44 76V88L36 104V92Z" fill="#E9ECEF"/>
<path d="M32 104H96V108C96 112.418 92.4183 116 88 116H40C35.5817 116 32 112.418 32 108V104Z" fill="#CED4DA"/>
<path d="M44 64H84V80L94.5 101H33.5L44 80V64Z" fill="url(#paint0_linear)"/>
<circle cx="56" cy="88" r="4" fill="#FFFFFF" fill-opacity="0.8"/>
<circle cx="68" cy="76" r="3" fill="#FFFFFF" fill-opacity="0.6"/>
<circle cx="76" cy="92" r="5" fill="#FFFFFF" fill-opacity="0.7"/>
<defs>
<linearGradient id="paint0_linear" x1="64" y1="64" x2="64" y2="101" gradientUnits="userSpaceOnUse">
<stop stop-color="#339AF0"/>
<stop offset="1" stop-color="#51CF66"/>
</linearGradient>
</defs>
</svg>`,
    'status_flask.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M52 24H76V48L96 96H32L52 48V24Z" fill="#F8F9FA"/>
<path d="M48 20H80V28H48V20Z" fill="#DEE2E6"/>
<path d="M38 81.6L52 48V60L36.6 96.8C35.8 98.4 37.6 100 39.4 100H88.6C90.4 100 92.2 98.4 91.4 96.8L84 80H44L38 81.6Z" fill="url(#paint0_linear)"/>
<circle cx="52" cy="76" r="4" fill="#FFFFFF" fill-opacity="0.8"/>
<circle cx="64" cy="88" r="6" fill="#FFFFFF" fill-opacity="0.6"/>
<circle cx="76" cy="72" r="3" fill="#FFFFFF" fill-opacity="0.7"/>
<path d="M32 96H96V100C96 104.418 92.4183 108 88 108H40C35.5817 108 32 104.418 32 100V96Z" fill="#CED4DA"/>
<defs>
<linearGradient id="paint0_linear" x1="64" y1="48" x2="64" y2="100" gradientUnits="userSpaceOnUse">
<stop stop-color="#845EF7"/>
<stop offset="1" stop-color="#FCC419"/>
</linearGradient>
</defs>
</svg>`,

    // === 核心架构 (arch_) ===
    'arch_terminal.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="16" y="24" width="96" height="80" rx="8" fill="#212529"/>
<rect x="16" y="24" width="96" height="20" rx="8" fill="#343A40"/>
<circle cx="28" cy="34" r="4" fill="#FA5252"/>
<circle cx="44" cy="34" r="4" fill="#FCC419"/>
<circle cx="60" cy="34" r="4" fill="#51CF66"/>
<path d="M32 56L48 68L32 80" stroke="#51CF66" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M56 80H72" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
    'arch_server.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="24" y="20" width="80" height="24" rx="4" fill="#343A40"/>
<rect x="24" y="52" width="80" height="24" rx="4" fill="#343A40"/>
<rect x="24" y="84" width="80" height="24" rx="4" fill="#343A40"/>
<circle cx="36" cy="32" r="4" fill="#51CF66"/>
<circle cx="36" cy="64" r="4" fill="#FA5252"/>
<circle cx="36" cy="96" r="4" fill="#51CF66"/>
<rect x="84" y="30" width="12" height="4" rx="2" fill="#868E96"/>
<rect x="84" y="62" width="12" height="4" rx="2" fill="#868E96"/>
<rect x="84" y="94" width="12" height="4" rx="2" fill="#868E96"/>
<rect x="68" y="30" width="12" height="4" rx="2" fill="#868E96"/>
<rect x="68" y="62" width="12" height="4" rx="2" fill="#868E96"/>
<rect x="68" y="94" width="12" height="4" rx="2" fill="#868E96"/>
</svg>`,
    'arch_framework.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M64 16L104 36V76L64 96L24 76V36L64 16Z" fill="url(#paint0_linear)"/>
<path d="M64 16L104 36V76L64 56V16Z" fill="#FFFFFF" fill-opacity="0.2"/>
<path d="M24 36L64 56V96L24 76V36Z" fill="#000000" fill-opacity="0.1"/>
<path d="M64 112L104 92L64 72L24 92L64 112Z" fill="url(#paint1_linear)"/>
<defs>
<linearGradient id="paint0_linear" x1="64" y1="16" x2="64" y2="96" gradientUnits="userSpaceOnUse">
<stop stop-color="#339AF0"/>
<stop offset="1" stop-color="#748FFC"/>
</linearGradient>
<linearGradient id="paint1_linear" x1="64" y1="72" x2="64" y2="112" gradientUnits="userSpaceOnUse">
<stop stop-color="#748FFC"/>
<stop offset="1" stop-color="#5C7CFA"/>
</linearGradient>
</defs>
</svg>`,
    'arch_fullstack.svg': `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="24" y="24" width="80" height="80" rx="16" fill="url(#paint0_linear)"/>
<path d="M44 48H84" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>
<path d="M44 64H72" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>
<path d="M44 80H84" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>
<circle cx="84" cy="80" r="8" fill="#FCC419"/>
<circle cx="84" cy="48" r="8" fill="#51CF66"/>
<defs>
<linearGradient id="paint0_linear" x1="24" y1="24" x2="104" y2="104" gradientUnits="userSpaceOnUse">
<stop stop-color="#20C997"/>
<stop offset="1" stop-color="#0B7285"/>
</linearGradient>
</defs>
</svg>`
};

for (const [filename, svg] of Object.entries(icons)) {
    fs.writeFileSync(path.join(targetDir, filename), svg, 'utf8');
}

console.log('Created high-quality SVGs:', Object.keys(icons).join(', '));
