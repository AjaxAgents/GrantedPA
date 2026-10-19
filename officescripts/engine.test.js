// Proves officescripts/GrantedEngine.ts (the Office Script the flows run) gives exactly the
// same answers as the reference rules engine, rules/rules.js. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path'); const vm = require('vm'); const crypto = require('crypto');
const ts = require('typescript');
const R = require('../rules/rules.js');

const src = fs.readFileSync(path.join(__dirname, 'GrantedEngine.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2017 } }).outputText;
const box = {}; vm.createContext(box);
vm.runInContext(js + '\nthis.main = main;', box);
const run = (op, input) => JSON.parse(box.main({}, op, JSON.stringify(input)));

const pad = (n) => String(n).padStart(2, '0');
const localIso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());

const NOW = new Date(2026, 9, 12, 8, 0);
const subs = [
  { id: 'S01', name: 'North Field Electrical', trade: 'Electrical' },
  { id: 'S02', name: 'Caliche Mechanical', trade: 'Mechanical' },
  { id: 'S03', name: 'Redbud Fire Protection', trade: 'Fire protection', suspended: true },
  { id: 'S04', name: 'Mesquite Concrete', trade: '' },
];
const gates = [{ id: 'G1', name: 'Gate 1 North', capacityPerSlot: 2 }, { id: 'G2', name: 'Gate 2 South', capacityPerSlot: 1 }];
const zones = [{ id: 'Z1', name: 'South laydown yard', capacityPallets: 60 }, { id: 'Z2', name: 'Hall A staging', capacityPallets: 12 }];
const activities = [
  { id: 'A1', name: 'Hall A busway', trade: 'Electrical', start: '2026-10-16', finish: '2026-10-30' },
  { id: 'A2', name: 'Hall A CRAH set', trade: 'Mechanical', start: '2026-10-14', finish: '2026-10-20' },
  { id: 'A3', name: 'Hall B switchgear', trade: 'Electrical', start: '2026-10-30', finish: '2026-11-10' },
  { id: 'A4', name: 'Hall B sprinkler mains', trade: 'Fire protection', start: '2026-10-15', finish: '2026-10-30' },
];

/** Run both engines on one request and compare everything the flows use. */
function same(req, requests, settings, now) {
  const ref = R.evaluateRequest(req, { now, settings, subs, gates, zones, activities, requests });
  const eng = run('evaluate', {
    req, ctx: { now: localIso(now), settings, subs: subs.map((s) => Object.assign({ suspended: false }, s)), gates, zones, activities,
      requests: requests.map((r) => Object.assign({ stagedUntil: '', passCode: '', arrived: false }, r)) },
  });
  const label = JSON.stringify(req) + ' / ' + requests.length + ' bookings';
  assert.equal(eng.outcome, ref.outcome, label);
  assert.deepEqual(eng.checks.map((c) => [c.id, c.status, c.reason || null, c.title || undefined, c.remedy || undefined]),
    ref.checks.map((c) => [c.id, c.status, c.reason || null, c.title, c.remedy]), label);
  assert.equal(eng.stagedUntil || null, ref.stagedUntil, label);
  assert.deepEqual(eng.nextOpen, ref.nextOpen, label);
  return eng;
}

const base = {
  id: 'NEW', subId: 'S01', activityId: 'A1', gateId: 'G1', date: '2026-10-15', slot: '07:00', zoneId: 'Z1',
  material: 'Busway sections', quantity: 12, unit: 'sections', pallets: 4, pocName: 'J. Smith', pocPhone: '214-555-0100',
};
const booked = (over) => Object.assign({}, base, { status: 'approved', stagedUntil: '2026-10-16' }, over);

test('E01 the rules-test scenarios give identical results', () => {
  const cases = [
    [{}, []], [{ date: '2026-10-13', slot: '09:00' }, []], [{ date: '2026-10-18' }, []], [{ slot: '16:00' }, []],
    [{}, [booked({ id: 'X1', subId: 'S02', activityId: 'A2' }), booked({ id: 'X2', subId: 'S02', activityId: 'A2' })]],
    [{}, [booked({ id: 'X1', status: 'cancelled', subId: 'S02' }), booked({ id: 'X2', status: 'rejected', subId: 'S02' })]],
    [{ zoneId: 'Z2', pallets: 5 }, [booked({ id: 'X1', subId: 'S02', activityId: 'A2', zoneId: 'Z2', pallets: 10, slot: '09:00' })]],
    [{ subId: 'S03', activityId: 'A4' }, []], [{ activityId: 'A9' }, []], [{ activityId: 'A2' }, []],
    [{ date: '2026-11-02', activityId: 'A2' }, []], [{ activityId: 'A3' }, []], [{ activityId: 'A3', justification: 'Long lead' }, []],
    [{ pallets: 25 }, []], [{ material: '', pocPhone: '555-0100' }, []], [{ quantity: 0, pallets: 1.5 }, []],
    [{ subId: 'S04', activityId: 'A2' }, []],
    [{}, [booked({ id: 'X1', date: '2026-10-17', passCode: 'DC2-AAAAAA' })]],
  ];
  for (const [over, reqs] of cases) same(Object.assign({}, base, over), reqs, {}, NOW);
});

test('E02 2,000 random requests and booking sets give identical results', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const dates = []; for (let i = -2; i < 30; i++) dates.push(R.util.addDays('2026-10-12', i));
  const slots = ['05:00', '06:00', '07:00', '09:00', '12:00', '15:00', '15:30', '16:00'];
  for (let n = 0; n < 2000; n++) {
    const requests = [];
    const k = Math.floor(rnd() * 12);
    for (let i = 0; i < k; i++) {
      const date = pick(dates);
      requests.push({ id: 'B' + i, subId: pick(subs).id, activityId: pick(activities).id, gateId: pick(gates).id, date, slot: pick(slots),
        zoneId: pick(zones).id, pallets: Math.floor(rnd() * 15), stagedUntil: R.util.addDays(date, Math.floor(rnd() * 4)),
        status: pick(['approved', 'review', 'cancelled', 'rejected']), passCode: rnd() < 0.5 ? 'DC2-' + i : '' });
    }
    const req = { id: rnd() < 0.2 ? 'B0' : 'NEW', subId: pick(subs).id, activityId: pick(['A1', 'A2', 'A3', 'A4', 'A9', '']), gateId: pick(['G1', 'G2']),
      date: pick(dates), slot: pick(slots), zoneId: pick(['Z1', 'Z2']), material: rnd() < 0.95 ? 'Stuff' : '', quantity: pick([0, 1, 5, 12]),
      unit: 'pcs', pallets: pick([0, 1, 4, 11, 21, 30]), pocName: 'Pat', pocPhone: pick(['214-555-0100', '555-0100']),
      justification: rnd() < 0.3 ? 'Long lead time' : '' };
    const settings = rnd() < 0.3 ? { minNoticeHours: pick([0, 24, 72]), workDays: pick([[1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]]), slotMinutes: pick([30, 60, 120]) } : {};
    const now = new Date(2026, 9, 12, Math.floor(rnd() * 24), Math.floor(rnd() * 60), Math.floor(rnd() * 60));
    same(req, requests, settings, now);
  }
});

test('E03 capacity re-check before a pass: a slot that filled up is reported with the next slot', () => {
  const full = [booked({ id: 'X1', subId: 'S02', activityId: 'A2' }), booked({ id: 'X2', subId: 'S02', activityId: 'A2' })];
  const ctx = { now: localIso(NOW), settings: {}, subs: subs.map((s) => Object.assign({ suspended: false }, s)), gates, zones, activities, requests: full };
  const r = run('recheck', { req: Object.assign({}, base, { id: 'R1' }), ctx });
  assert.equal(r.lost, 'R07'); assert.match(r.reasonText, /full at Gate 1 North/); assert.equal(r.nextOpen.label, 'Wed 10/14 8:00 AM');
  assert.equal(run('recheck', { req: Object.assign({}, base, { id: 'R1' }), ctx: Object.assign({}, ctx, { requests: [] }) }).lost, '');
});

test('E04 QR and admin code operations', () => {
  const q = run('qr', { code: 'dc2-7kqx9m' });
  assert.equal(q.code, 'DC2-7KQX9M'); assert.match(q.svg, /^<svg/); assert.ok(Buffer.from(q.pngBase64, 'base64').subarray(1, 4).toString() === 'PNG');
  let h = crypto.createHash('sha256').update('granted-admin-v1:salt1:TEXAS-SITE-1').digest('hex');
  for (let i = 1; i < 1000; i++) h = crypto.createHash('sha256').update(h).digest('hex');
  const stored = 'sha256i$1000$salt1$' + h;
  assert.equal(run('adminCode', { code: 'texas-site-1', stored }).match, true);
  assert.equal(run('adminCode', { code: 'texas-site-2', stored }).match, false);
  assert.equal(run('ping', {}).ok, true);
  assert.throws(() => run('nope', {}), /Unknown operation/);
});

test('E05 the .osts file holds this exact script and a two-text-input signature', () => {
  const osts = JSON.parse(fs.readFileSync(path.join(__dirname, 'GrantedEngine.osts'), 'utf8'));
  assert.equal(osts.body, src);
  const info = JSON.parse(osts.parameterInfo);
  assert.deepEqual(info.originalParameterOrder.map((p) => p.name), ['op', 'input']);
});
