#!/usr/bin/env node
/*
 * Makes the value for SecureSettings > AdminCodeHash. The code is read from the keyboard
 * (not the command line), so it never lands in shell history, and only the hash is printed.
 *   node tools/admin-code-hash.mjs
 * Format: sha256i$<iterations>$<salt>$<hex>, checked by officescripts/CheckAdminCode.ts.
 */
import { createHash, randomBytes } from 'node:crypto';
const ITER = 100000;
const piped = []; let pipedRead = false;
async function ask(q) {
  if (!process.stdin.isTTY) {
    if (!pipedRead) { pipedRead = true; let t = ''; for await (const c of process.stdin) t += c; piped.push(...t.split(/\r?\n/)); }
    return piped.shift() || '';
  }
  process.stderr.write(q);
  return new Promise((res) => {
    let v = ''; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const on = (ch) => {
      if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', on); process.stderr.write('\n'); res(v); }
      else if (ch === '\u0003') process.exit(1); else if (ch === '\u007f') v = v.slice(0, -1); else v += ch;
    };
    process.stdin.on('data', on);
  });
}
const norm = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
const a = norm(await ask('Admin set-up code: ')); const b = norm(await ask('Type it again: '));
if (!a || a !== b) { console.error('The codes did not match.'); process.exit(1); }
if (a.length < 12) console.error('Warning: codes shorter than 12 characters can be guessed from a hash. Keep SecureSettings locked down.');
const salt = randomBytes(12).toString('base64url');
let h = createHash('sha256').update('granted-admin-v1:' + salt + ':' + a).digest('hex');
for (let i = 1; i < ITER; i++) h = createHash('sha256').update(h).digest('hex');
console.log(`sha256i$${ITER}$${salt}$${h}`);
