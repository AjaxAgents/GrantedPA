// The generated solution: every flow passes the static checks, child-flow and app references
// resolve, GUIDs are stable, and the checker itself catches mistakes. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
process.env.GRANTED_SKIP_PACK = '1';
const { build, FLOWS, stableGuid } = require('./build-solution');
const { checkFlow } = require('./check-flow');
const root = path.join(__dirname, '..', '..');

test('S01 the solution builds: 17 flows, all checks clean, every child flow found', () => {
  const { ids } = build();
  assert.equal(FLOWS.length, 17);
  const wf = fs.readdirSync(path.join(root, 'solution/src/Workflows')).filter((f) => f.endsWith('.json'));
  assert.equal(wf.length, 17);
  const known = new Set(Object.values(ids));
  for (const f of wf) {
    const text = fs.readFileSync(path.join(root, 'solution/src/Workflows', f), 'utf8');
    assert.ok(!text.includes('{{FLOW:'), f + ' has an unresolved child flow');
    for (const m of text.matchAll(/"workflowReferenceName": "([0-9a-f-]+)"/g)) assert.ok(known.has(m[1]), f + ' calls an unknown flow');
    assert.deepEqual(checkFlow(f, JSON.parse(text)), []);
  }
});

test('S02 flow ids are stable between builds (re-import updates, never duplicates)', () => {
  assert.equal(stableGuid('flow:Granted F01 Submit request'), stableGuid('flow:Granted F01 Submit request'));
  assert.match(stableGuid('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('S03 the app calls only flows that are in the solution', () => {
  const ds = fs.readdirSync(path.join(root, 'solution/app-src/DataSources'));
  const wf = new Set(fs.readdirSync(path.join(root, 'solution/src/Workflows')).map((f) => (f.match(/-([0-9A-F-]{36})\.json$/) || [])[1]).filter(Boolean).map((x) => x.toLowerCase()));
  assert.equal(ds.length, 11);
  for (const f of ds) {
    const [d] = JSON.parse(fs.readFileSync(path.join(root, 'solution/app-src/DataSources', f), 'utf8'));
    assert.ok(wf.has(d.WorkflowEntityId), f + ' points at a flow that is not in the solution');
  }
  const screens = fs.readdirSync(path.join(root, 'solution/app-src/Src')).filter((f) => f.startsWith('scr'));
  assert.equal(screens.length, 17);
});

test('S04 the flow checker catches broken expressions and bad references', () => {
  const bad = { properties: { definition: { parameters: {}, triggers: {}, actions: {
    A: { type: 'Compose', inputs: "@concat('x', outputs('Nope'))", runAfter: {} },
    B: { type: 'Compose', inputs: "@{toLower('x'}", runAfter: { Missing: ['Succeeded'] } },
    C: { type: 'Compose', inputs: "@variables('Never')", runAfter: {} },
  } } } };
  const errs = checkFlow('bad', bad).join('\n');
  assert.match(errs, /outputs\('Nope'\) names no action/);
  assert.match(errs, /runs after Missing/);
  assert.match(errs, /variable Never is never initialised/);
  assert.match(errs, /expected \)|unclosed/);
});
