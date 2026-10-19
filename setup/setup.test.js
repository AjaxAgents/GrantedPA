// The PowerShell set-up makes the same admin-code hash as the Office Script checks. Run: npm test
// Needs PowerShell 7 (pwsh, or set PWSH=<path>); skipped if it isn't installed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ts = require('typescript');

const pwsh = process.env.PWSH || 'pwsh';
let havePwsh = true;
try { execFileSync(pwsh, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { stdio: 'pipe' }); } catch { havePwsh = false; }
const ps = (cmd) => execFileSync(pwsh, ['-NoProfile', '-Command', `. '${path.join(__dirname, 'AdminCodeHash.ps1')}'; ${cmd}`], { encoding: 'utf8' }).trim();

const src = fs.readFileSync(path.join(__dirname, '..', 'officescripts', 'CheckAdminCode.ts'), 'utf8');
const box = {}; vm.createContext(box);
vm.runInContext(ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2017 } }).outputText + '\nthis.main = main;', box);

test('P01 PowerShell hash = Node hash for a fixed salt', { skip: !havePwsh && 'pwsh not installed' }, () => {
  let h = crypto.createHash('sha256').update('granted-admin-v1:Zx81aQ:TEST-CODE1234').digest('hex');
  for (let i = 1; i < 3000; i++) h = crypto.createHash('sha256').update(h).digest('hex');
  assert.equal(ps("New-GrantedAdminCodeHash -Code 'test-code 1234' -Salt Zx81aQ -Iterations 3000"), 'sha256i$3000$Zx81aQ$' + h);
});

test('P02 a hash from the set-up script is accepted by CheckAdminCode, typed loosely', { skip: !havePwsh && 'pwsh not installed' }, () => {
  const stored = ps("New-GrantedAdminCodeHash -Code 'Texas-Jobsite-2026' -Iterations 2000");
  assert.match(stored, /^sha256i\$2000\$[A-Za-z0-9_-]{16}\$[0-9a-f]{64}$/);
  assert.equal(box.main(null, 'texas-jobsite-2026 ', stored), true);
  assert.equal(box.main(null, 'TEXAS-JOBSITE-2027', stored), false);
});
