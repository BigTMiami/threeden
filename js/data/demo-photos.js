// @ts-check
/**
 * demo-photos.js — simple drawn pictures for the demo blogs' galleries and
 * carousels, so the demo has "photos" without downloading anything.
 *
 *   demoPhoto('sunset')          → 'data:image/svg+xml,…' (800 × 560)
 *   demoPhoto('choir', 'tall')   → the same drawing cropped upright
 *                                  ('wide', 'tall', 'square' or 'panorama')
 *
 * Real photos people upload are stored as JPEG data URLs instead (see
 * js/ui/image-upload.js).
 */

const WIDTH = 800;
const HEIGHT = 560;

/** Picture shapes: 'wide' is the drawing as made; the others crop it. */
const SHAPES = { wide: [WIDTH, HEIGHT], tall: [450, 800], square: [600, 600], panorama: [1000, 420] };

const SCENES = {
  sunset: `
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6a35c"/><stop offset="1" stop-color="#fbe3b5"/></linearGradient></defs>
    <rect width="800" height="560" fill="url(#s)"/>
    <circle cx="400" cy="330" r="80" fill="#f47a3a"/>
    <rect y="330" width="800" height="230" fill="#4a6d8c"/>
    <path d="M120 380h140M330 410h200M560 370h120M200 450h160M480 480h180" stroke="#f6c08a" stroke-width="6" stroke-linecap="round"/>
    <path d="M0 330l140-60 120 40 160-70 150 50 230-40v80H0z" fill="#2f4a5f"/>`,
  tomatoes: `
    <rect width="800" height="560" fill="#5c8a4a"/>
    <path d="M0 0h800v560H0z" fill="#6f9c55" opacity=".5"/>
    <g fill="#d9472b"><circle cx="230" cy="250" r="70"/><circle cx="390" cy="320" r="85"/><circle cx="560" cy="240" r="65"/><circle cx="300" cy="420" r="55"/><circle cx="520" cy="420" r="60"/></g>
    <g fill="#f08a6c" opacity=".7"><circle cx="210" cy="225" r="16"/><circle cx="365" cy="290" r="18"/><circle cx="540" cy="215" r="14"/></g>
    <g fill="#2f5d2a"><path d="M230 182l-20 18 20-6 20 6z"/><path d="M390 237l-24 20 24-7 24 7z"/><path d="M560 177l-18 16 18-5 18 5z"/></g>`,
  beds: `
    <rect width="800" height="560" fill="#cfe6c3"/>
    <rect y="0" width="800" height="150" fill="#bcdcf0"/>
    <g fill="#8a5a3c"><rect x="60" y="200" width="300" height="110" rx="8"/><rect x="440" y="200" width="300" height="110" rx="8"/><rect x="60" y="370" width="300" height="110" rx="8"/><rect x="440" y="370" width="300" height="110" rx="8"/></g>
    <g fill="#3f8a3a"><circle cx="110" cy="240" r="20"/><circle cx="170" cy="250" r="22"/><circle cx="240" cy="238" r="19"/><circle cx="300" cy="252" r="21"/><circle cx="500" cy="415" r="24"/><circle cx="580" cy="405" r="20"/><circle cx="660" cy="418" r="23"/><circle cx="130" cy="420" r="18"/></g>
    <path d="M0 150h800" stroke="#9cc28a" stroke-width="4"/>`,
  bike: `
    <rect width="800" height="560" fill="#e9e4da"/>
    <rect y="420" width="800" height="140" fill="#b8a588"/>
    <g fill="none" stroke="#2b2b2b" stroke-width="12"><circle cx="250" cy="380" r="100"/><circle cx="560" cy="380" r="100"/></g>
    <path d="M250 380l120-150h160l30 150M370 230l70 150h120M520 230l-20-50h-50M370 230l-20-40h-50" fill="none" stroke="#3366cc" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>`,
  stage: `
    <rect width="800" height="560" fill="#1d1f2b"/>
    <path d="M160 0l-90 420h220zM400 0l-110 420h220zM640 0l-90 420h220z" fill="#f5e7a8" opacity=".18"/>
    <rect y="420" width="800" height="140" fill="#3b2e2a"/>
    <g fill="#0e0f16"><circle cx="270" cy="300" r="34"/><rect x="235" y="330" width="70" height="95" rx="20"/><circle cx="410" cy="290" r="36"/><rect x="372" y="322" width="76" height="103" rx="20"/><circle cx="550" cy="305" r="32"/><rect x="518" y="333" width="64" height="92" rx="20"/></g>
    <path d="M440 330l110 -90" stroke="#c9a46a" stroke-width="10" stroke-linecap="round"/>`,
  choir: `
    <rect width="800" height="560" fill="#f1ece4"/>
    <rect y="390" width="800" height="170" fill="#9c7a5b"/>
    <g fill="#7b3fa0"><circle cx="150" cy="250" r="34"/><circle cx="260" cy="230" r="34"/><circle cx="370" cy="250" r="34"/><circle cx="480" cy="230" r="34"/><circle cx="590" cy="250" r="34"/><circle cx="700" cy="232" r="32"/></g>
    <g fill="#3366cc"><rect x="115" y="282" width="70" height="110" rx="24"/><rect x="225" y="262" width="70" height="130" rx="24"/><rect x="335" y="282" width="70" height="110" rx="24"/><rect x="445" y="262" width="70" height="130" rx="24"/><rect x="555" y="282" width="70" height="110" rx="24"/><rect x="666" y="262" width="68" height="130" rx="24"/></g>
    <path d="M80 120c80-40 160 40 240 0s160 40 240 0 120 30 160 10" fill="none" stroke="#c9b48f" stroke-width="5"/>`,
  skyline: `
    <defs><linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3c6b"/><stop offset="1" stop-color="#e79f74"/></linearGradient></defs>
    <rect width="800" height="560" fill="url(#k)"/>
    <g fill="#1b2238"><rect x="40" y="300" width="90" height="260"/><rect x="140" y="240" width="70" height="320"/><rect x="220" y="330" width="110" height="230"/><rect x="340" y="200" width="80" height="360"/><rect x="430" y="280" width="120" height="280"/><rect x="560" y="230" width="70" height="330"/><rect x="640" y="310" width="120" height="250"/></g>
    <g fill="#f3d27a"><rect x="160" y="270" width="10" height="14"/><rect x="185" y="300" width="10" height="14"/><rect x="360" y="230" width="10" height="14"/><rect x="390" y="280" width="10" height="14"/><rect x="460" y="320" width="10" height="14"/><rect x="510" y="350" width="10" height="14"/><rect x="580" y="260" width="10" height="14"/><rect x="680" y="340" width="10" height="14"/></g>`,
  seeds: `
    <rect width="800" height="560" fill="#f4efe2"/>
    <g stroke="#8a7a5a" stroke-width="3"><rect x="90" y="110" width="170" height="240" fill="#fde6cc" transform="rotate(-6 175 230)"/><rect x="310" y="90" width="170" height="240" fill="#d5f0e2"/><rect x="530" y="120" width="170" height="240" fill="#eadff5" transform="rotate(5 615 240)"/></g>
    <g fill="#6b4a2a"><circle cx="160" cy="420" r="9"/><circle cx="200" cy="440" r="8"/><circle cx="250" cy="425" r="9"/><circle cx="420" cy="450" r="8"/><circle cx="460" cy="430" r="9"/><circle cx="600" cy="445" r="8"/><circle cx="640" cy="425" r="9"/></g>
    <g fill="#14866d"><path d="M175 180c-30-40 0-70 0-70s30 30 0 70z"/><path d="M395 170c-30-40 0-70 0-70s30 30 0 70z"/></g>
    <circle cx="615" cy="190" r="30" fill="#ac6600"/>`,
  feast: `
    <rect width="800" height="560" fill="#f3e3c8"/>
    <rect y="300" width="800" height="260" fill="#8a5a3c"/>
    <ellipse cx="400" cy="380" rx="330" ry="120" fill="#f8f4ec"/>
    <ellipse cx="400" cy="360" rx="120" ry="70" fill="#c9782f"/>
    <ellipse cx="380" cy="340" rx="60" ry="26" fill="#e09a52" opacity=".8"/>
    <g fill="#f8f4ec" stroke="#d9cbb3" stroke-width="4"><circle cx="160" cy="400" r="50"/><circle cx="640" cy="400" r="50"/><circle cx="260" cy="460" r="40"/><circle cx="540" cy="460" r="40"/></g>
    <g fill="#b32424"><circle cx="160" cy="400" r="20"/></g><g fill="#3f8a3a"><circle cx="640" cy="400" r="22"/></g>
    <g fill="#ac6600"><rect x="90" y="150" width="14" height="120"/><rect x="696" y="150" width="14" height="120"/></g>
    <g fill="#f2c94c"><ellipse cx="97" cy="140" rx="9" ry="16"/><ellipse cx="703" cy="140" rx="9" ry="16"/></g>`,
  leaves: `
    <rect width="800" height="560" fill="#f0e6d2"/>
    <g fill="#c9782f"><path d="M150 140c60-40 120 0 90 70-50 20-110-10-90-70z"/><path d="M520 90c70-20 110 40 70 100-60 10-100-40-70-100z"/></g>
    <g fill="#b32424"><path d="M330 260c60-50 130-10 110 60-50 30-120 0-110-60z"/><path d="M620 330c60-30 110 20 80 80-60 20-100-20-80-80z"/></g>
    <g fill="#d9a43a"><path d="M120 380c60-40 120 10 90 70-60 20-110-20-90-70z"/><path d="M420 430c50-40 110 0 90 60-50 20-100-10-90-60z"/></g>
    <path d="M195 175l60 60M555 140l40 60M385 290l50 40M660 370l40 40M165 415l50 40M465 460l40 30" stroke="#6b4a2a" stroke-width="4"/>`,
  pie: `
    <rect width="800" height="560" fill="#e8eef3"/>
    <ellipse cx="400" cy="330" rx="270" ry="150" fill="#d9cbb3"/>
    <ellipse cx="400" cy="310" rx="240" ry="125" fill="#c98a3a"/>
    <ellipse cx="400" cy="305" rx="205" ry="100" fill="#a8562a"/>
    <g fill="#6b3a1a"><ellipse cx="330" cy="280" rx="26" ry="14"/><ellipse cx="420" cy="260" rx="26" ry="14"/><ellipse cx="480" cy="310" rx="26" ry="14"/><ellipse cx="370" cy="335" rx="26" ry="14"/><ellipse cx="300" cy="320" rx="22" ry="12"/></g>`,
  porch: `
    <rect width="800" height="560" fill="#2b3a66"/>
    <rect x="80" y="120" width="640" height="300" fill="#e2c48f"/>
    <path d="M60 130L400 20l340 110z" fill="#8a5a3c"/>
    <g fill="#f5e7a8"><circle cx="200" cy="170" r="14"/><circle cx="400" cy="160" r="14"/><circle cx="600" cy="170" r="14"/></g>
    <path d="M120 160Q400 220 680 160" fill="none" stroke="#54595d" stroke-width="3"/>
    <rect y="420" width="800" height="140" fill="#5c4033"/>
    <g fill="#1d1f2b"><circle cx="260" cy="300" r="30"/><rect x="230" y="328" width="60" height="92" rx="18"/><circle cx="400" cy="290" r="32"/><rect x="368" y="320" width="64" height="100" rx="18"/><circle cx="540" cy="300" r="30"/><rect x="510" y="328" width="60" height="92" rx="18"/></g>
    <path d="M300 360l70 -50" stroke="#c9a46a" stroke-width="10" stroke-linecap="round"/>`,
  pantry: `
    <rect width="800" height="560" fill="#eef7f2"/>
    <rect y="380" width="800" height="180" fill="#9cc28a"/>
    <g fill="#ffffff" stroke="#c8ccd1" stroke-width="3"><rect x="80" y="260" width="280" height="120"/><rect x="440" y="260" width="280" height="120"/></g>
    <g fill="#d9472b"><circle cx="130" cy="240" r="22"/><circle cx="175" cy="245" r="22"/></g>
    <g fill="#f2c94c"><rect x="220" y="200" width="40" height="60" rx="6"/><rect x="270" y="210" width="40" height="50" rx="6"/></g>
    <g fill="#8a5a3c"><rect x="470" y="210" width="90" height="50"/><rect x="580" y="200" width="100" height="60"/></g>
    <g fill="#14866d"><circle cx="300" cy="420" r="26"/><rect x="278" y="444" width="44" height="80" rx="14"/><circle cx="500" cy="420" r="26"/><rect x="478" y="444" width="44" height="80" rx="14"/></g>`,
};

/** A demo picture as a data URL. Unknown names get a plain gray placeholder. */
export function demoPhoto(name, shape = 'wide') {
  const body = SCENES[name] ?? '<rect width="800" height="560" fill="#c8ccd1"/>';
  const [width, height] = SHAPES[shape] ?? SHAPES.wide;
  // Other shapes crop the same drawing from the middle, like a phone
  // photo taken upright or square.
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice">${body}</svg></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(markup.replace(/\s+/g, ' '))}`;
}

/**
 * A shape for a sample photo, from its id: about two in five upright (as
 * phones take them), and the rest split between square and wide. The same
 * id always gets the same shape.
 */
export function mixedShape(id) {
  const n = [...String(id)].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 9973, 7);
  return ['tall', 'square', 'wide', 'tall', 'wide'][n % 5];
}
