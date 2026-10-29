import type { BuilderContext } from '@/dev-seed/types';

/**
 * A tiny inline SVG rather than an Amazon image URL: the catalog grid renders
 * a real thumbnail, and a seeded dashboard makes no outbound image request.
 * It draws what a Merch cutout looks like (the Explore mock's tee): a shirt in
 * a garment colour on a transparent ground, a sunset mark and the title set
 * on it. One random draw picks the look, so the rest of the seed is unchanged.
 */
export const buildThumbnailDataUri = (context: BuilderContext, title: string) => {
    const pick = context.random.int(0, 359);
    const shirt = garmentColors[pick % garmentColors.length] ?? garmentColors[0];
    const accent = accentColors[pick % accentColors.length] ?? accentColors[0];
    const ink = shirt.light ? '#1f1f22' : '#f6eedd';
    const words = title
        .split(' ')
        .filter(word => /^[A-Za-z]/u.test(word))
        .map(word => escapeXml(word.toUpperCase()));
    const top = fitLine(words.slice(0, 2));
    const bottom = fitLine(words.slice(2, 4));
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="250" viewBox="0 0 240 250">` +
        '<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0.3">' +
        '<stop offset="0" stop-color="#fff" stop-opacity="0.14"/>' +
        '<stop offset="0.5" stop-color="#fff" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity="0.16"/></linearGradient></defs>' +
        `<path d="${teePath}" fill="${shirt.hex}"/><path d="${teePath}" fill="url(#s)"/>` +
        '<path d="M100 8 Q120 28 140 8" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="3"/>' +
        `<circle cx="120" cy="128" r="30" fill="${accent}"/>` +
        `<rect x="86" y="132" width="68" height="3" fill="${shirt.hex}"/>` +
        `<rect x="86" y="140" width="68" height="4" fill="${shirt.hex}"/>` +
        `<rect x="86" y="149" width="68" height="5" fill="${shirt.hex}"/>` +
        `<text x="120" y="88" font-family="Impact, 'Arial Black', sans-serif" ` +
        `font-size="${lineSize(top, 20)}" letter-spacing="1" fill="${ink}" ` +
        `text-anchor="middle">${top}</text>` +
        `<text x="120" y="186" font-family="Impact, 'Arial Black', sans-serif" ` +
        `font-size="${lineSize(bottom, 17)}" letter-spacing="2" fill="${ink}" ` +
        `text-anchor="middle">${bottom}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
};

const teePath =
    'M84 14 L100 8 Q120 28 140 8 L156 14 L214 46 L196 94 L174 86 L174 238 Q120 246 66 238 L66 86 L44 94 L26 46 Z';

/** Merch garment colours (the Explore mock's shirts); light ones take dark ink. */
const garmentColors = [
    { hex: '#263354', light: false },
    { hex: '#1e1e20', light: false },
    { hex: '#2c4fa3', light: false },
    { hex: '#2f4a3a', light: false },
    { hex: '#4a3a78', light: false },
    { hex: '#5f6138', light: false },
    { hex: '#5a3f30', light: false },
    { hex: '#3a3c40', light: false },
    { hex: '#c9c7c1', light: true },
    { hex: '#f7f5f1', light: true },
    { hex: '#2e8a4c', light: false },
    { hex: '#5a2331', light: false },
    { hex: '#e27b3c', light: false },
    { hex: '#48525c', light: false },
    { hex: '#f2e08a', light: true },
    { hex: '#f3bccb', light: true },
] as const;

const accentColors = ['#f08a3c', '#e8a24a', '#f2c14e', '#e0533a', '#5fb3a1', '#7aa7e8', '#c86fd0'];

/** Two words when they fit the chest, else the first alone. */
const fitLine = (words: readonly string[]) => {
    const both = words.join(' ');
    return both.length <= 12 ? both : (words[0] ?? '');
};

/** Shrinks a long line so it stays inside the 100px print area. */
const lineSize = (line: string, max: number) =>
    Math.min(max, Math.floor(100 / (0.55 * Math.max(line.length, 1))));

const escapeXml = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
