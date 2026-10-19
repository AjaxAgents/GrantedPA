#!/usr/bin/env node
/*
 * Takes the screenshots for docs/Granted-User-Guide.pdf from the Granted demo (AjaxAgents/Granted,
 * apps/web built and served on http://localhost:4173), using the demo accounts. Writes
 * docs/user-guide/img/<name>.png and docs/user-guide/img/marks.json (where each callout goes, as a
 * percentage of the picture). Which screens and callouts: tools/user-guide/shots.mjs.
 *
 *   PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node tools/user-guide/capture.mjs
 */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '..', 'docs', 'user-guide', 'img');
const BASE = process.env.DEMO_URL || 'http://localhost:4173/';
const pw = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const chromium = pw.chromium || pw.default.chromium;
const plan = (await import(pathToFileURL(join(here, 'shots.mjs')).href)).default;
const fs = await import('node:fs');
const marks = {};
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const emails = { admin: 'alex.morgan@ajaxbuilding.com', gate: 'riley.alvarez@gate.example.com', dana: 'dana.ruiz@northfield.example.com' };
for (const sc of plan) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE); await p.waitForTimeout(1200);
  if (sc.who) {
    await p.fill('input[type=email]', emails[sc.who]); await p.fill('input[type=password]', 'Granted2026');
    await p.click('.auth form button[type=submit]'); await p.waitForTimeout(1800);
  }
  await p.addStyleTag({ content: '*{transition:none!important;animation:none!important} .demo-foot,.foot-demo{display:none}' });
  for (const s of sc.steps || []) { await s(p); await p.waitForTimeout(350); }
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  let clip = null;
  if (Array.isArray(sc.clip)) { const a = await p.locator(sc.clip[0]).first().boundingBox(), z = await p.locator(sc.clip[1]).first().boundingBox(); clip = { x: Math.min(a.x, z.x), y: a.y, width: Math.max(a.x + a.width, z.x + z.width) - Math.min(a.x, z.x), height: z.y + z.height - a.y }; }
  else if (sc.clip) clip = await p.locator(sc.clip).first().boundingBox();
  const box = clip || { x: 0, y: 0, width: 390, height: await p.evaluate(() => document.documentElement.scrollHeight) };
  if (sc.pad) { box.x -= sc.pad; box.y -= sc.pad; box.width += 2 * sc.pad; box.height += 2 * sc.pad; }
  if (sc.maxH) box.height = Math.min(box.height, sc.maxH);
  await p.screenshot({ path: join(OUT, sc.name + '.png'), clip: box, fullPage: true });
  marks[sc.name] = { w: box.width, h: box.height, m: {} };
  for (const [k, sel] of Object.entries(sc.marks || {})) {
    const r = await p.locator(sel).first().boundingBox();
    if (!r) { console.log('NO MARK', sc.name, k, sel); continue; }
    marks[sc.name].m[k] = { x: +((r.x - box.x) / box.width * 100).toFixed(1), y: +((r.y - box.y) / box.height * 100).toFixed(1), w: +(r.width / box.width * 100).toFixed(1), h: +(r.height / box.height * 100).toFixed(1) };
  }
  console.log('ok', sc.name, Math.round(box.width) + 'x' + Math.round(box.height), Object.keys(marks[sc.name].m).join(','));
  if (sc.text) console.log((await p.innerText(typeof sc.clip === 'string' ? sc.clip : 'body')).slice(0, 2500));
  await ctx.close();
}
fs.writeFileSync(join(OUT, 'marks.json'), JSON.stringify(marks, null, 1));
await b.close();
