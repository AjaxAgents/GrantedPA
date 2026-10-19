#!/usr/bin/env node
/*
 * Builds docs/Granted-Setup-Guide.pdf from docs/setup-guide/guide.html.
 * Fills in the QR codes (made with this repository's own encoder, qr/qr-core.js), the logos and
 * the fonts, then prints the page with Chromium through Playwright.
 *
 *   npm i --no-save playwright && npx playwright install chromium   (once)
 *   node tools/build-setup-guide.mjs [--html-only]
 *
 * Set CHROMIUM_PATH to use an installed Chromium instead of Playwright's download.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'docs', 'setup-guide');
const out = join(root, 'docs', 'Granted-Setup-Guide.pdf');

const box = {}; vm.createContext(box);
vm.runInContext(readFileSync(join(root, 'qr', 'qr-core.js'), 'utf8') + '\nthis.api={qrEncode,qrToSvg};', box);
const { qrEncode, qrToSvg } = box.api;
const LINKS = {
  start: 'https://github.com/AjaxAgents/GrantedPA/blob/main/START-HERE.md',
  demo: 'https://ajaxagents.github.io/Granted/',
  pa: 'https://github.com/AjaxAgents/GrantedPA',
  azure: 'https://github.com/AjaxAgents/Granted',
};
const dataUri = (file, type) => `data:${type};base64,${readFileSync(join(dir, file)).toString('base64')}`;
const FONTS = {
  plex400: 'ibm-plex-sans-latin-400-normal.woff2', plex400i: 'ibm-plex-sans-latin-400-italic.woff2',
  plex500: 'ibm-plex-sans-latin-500-normal.woff2', plex600: 'ibm-plex-sans-latin-600-normal.woff2',
  plex700: 'ibm-plex-sans-latin-700-normal.woff2', barlow600: 'barlow-semi-condensed-latin-600-normal.woff2',
  barlow700: 'barlow-semi-condensed-latin-700-normal.woff2', mono500: 'ibm-plex-mono-latin-500-normal.woff2',
};

let html = readFileSync(join(dir, 'guide.html'), 'utf8');
for (const [k, f] of Object.entries(FONTS)) html = html.replaceAll(`{{FONT_${k}}}`, dataUri('fonts/' + f, 'font/woff2'));
html = html.replaceAll('{{LOGO_white}}', dataUri('logo-white-400.png', 'image/png')).replaceAll('{{LOGO_blue}}', dataUri('logo-blue-400.png', 'image/png'));
for (const [k, url] of Object.entries(LINKS)) html = html.replaceAll(`{{QR_${k}}}`, qrToSvg(qrEncode(url), 2).replace('<svg ', `<svg role="img" aria-label="QR code: ${url}" `));
const left = html.match(/\{\{[A-Za-z_0-9]+\}\}/g);
if (left) throw new Error('Unfilled placeholders: ' + [...new Set(left)].join(', '));

const built = join(dir, '.guide.built.html');
writeFileSync(built, html);
if (process.argv.includes('--html-only')) { console.log('Wrote ' + built); process.exit(0); }

const pw = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const chromium = pw.chromium || pw.default.chromium;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
await page.goto(pathToFileURL(built).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();
console.log('Wrote ' + out);
