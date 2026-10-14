// Proves CheckAdminCode.ts (the Office Script) against Node's own SHA-256. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const vm = require('vm'); const path = require('path'); const crypto = require('crypto');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, 'CheckAdminCode.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2017 } }).outputText;
const box = {}; vm.createContext(box); vm.runInContext(js + '\nthis.api={main,sha256Hex,utf8Bytes,adminCodeHash};', box);
const { main, sha256Hex, utf8Bytes } = box.api;

const nodeHash = (code, salt, n) => { let h = crypto.createHash('sha256').update('granted-admin-v1:' + salt + ':' + code).digest('hex'); for (let i = 1; i < n; i++) h = crypto.createHash('sha256').update(h).digest('hex'); return h; };

test('H01 SHA-256 matches Node for many lengths and non-ASCII text', () => {
  for (const s of ['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(200), 'Andrés — Hall B · 🚚']) {
    assert.equal(sha256Hex(utf8Bytes(s)), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s));
  }
});
test('H02 the right code matches, typed loosely; wrong codes and bad formats do not', () => {
  const stored = 'sha256i$5000$Zx81aQ$' + nodeHash('TEST-CODE-1234', 'Zx81aQ', 5000);
  assert.equal(main(null, 'test-code-1234 ', stored), true);
  assert.equal(main(null, 'TEST-CODE-1235', stored), false);
  assert.equal(main(null, '', stored), false);
  assert.equal(main(null, 'TEST-CODE-1234', 'plain-text'), false);
  assert.equal(main(null, 'TEST-CODE-1234', ''), false);
});
