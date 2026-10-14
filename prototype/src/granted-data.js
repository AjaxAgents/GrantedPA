/*
 * Granted — project data helpers and the demo project.
 * Shared by the prototype (browser) and the seeding script (node).
 * Every person, company and phone number here is invented. Demo emails use example.com
 * addresses, except the sample Ajax admin, which needs an Ajax address to show admin features.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GrantedData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_GATES = [
    { id: 'G1', name: 'Gate 1 · North', capacityPerSlot: 2 },
    { id: 'G2', name: 'Gate 2 · South heavy haul', capacityPerSlot: 1 },
  ];
  const DEFAULT_ZONES = [
    { id: 'Z-SLY', name: 'South laydown yard', capacityPallets: 60 },
    { id: 'Z-NLY', name: 'North laydown yard', capacityPallets: 40 },
    { id: 'Z-HA', name: 'Data Hall A staging', capacityPallets: 12 },
    { id: 'Z-HB', name: 'Data Hall B staging', capacityPallets: 12 },
    { id: 'Z-EY', name: 'Electrical yard', capacityPallets: 8 },
  ];
  const TRADES = ['Electrical', 'Mechanical', 'Fire protection', 'Controls', 'Glazing', 'General'];
  const UNITS = ['pcs', 'sections', 'reels', 'units', 'LF', 'crates', 'skids', 'boxes', 'load'];

  // Sample 3-week look-ahead, as day offsets from the day the project is created.
  const ACTIVITY_DEFS = [
    { id: 'A1200', name: 'Hall A busway install', trade: 'Electrical', s: 1, f: 12 },
    { id: 'A1215', name: 'Hall B switchgear set', trade: 'Electrical', s: 16, f: 24 },
    { id: 'A1230', name: 'Hall A L1 cable pull', trade: 'Electrical', s: -3, f: 9 },
    { id: 'A1240', name: 'Hall B grounding and bonding', trade: 'Electrical', s: 3, f: 11 },
    { id: 'A1320', name: 'Hall A CRAH units set', trade: 'Mechanical', s: 1, f: 6 },
    { id: 'A1335', name: 'Level 2 chilled water piping', trade: 'Mechanical', s: -2, f: 15 },
    { id: 'A1340', name: 'Hall B CRAH piping connections', trade: 'Mechanical', s: 4, f: 12 },
    { id: 'A1410', name: 'Hall B sprinkler mains', trade: 'Fire protection', s: 2, f: 14 },
    { id: 'A1420', name: 'Hall A preaction valves', trade: 'Fire protection', s: 3, f: 10 },
    { id: 'A1520', name: 'Hall A BMS panels', trade: 'Controls', s: 2, f: 10 },
    { id: 'A1530', name: 'Hall B controls cabling', trade: 'Controls', s: 9, f: 18 },
    { id: 'A1610', name: 'Office curtain wall', trade: 'Glazing', s: 5, f: 20 },
    { id: 'A1900', name: 'Site logistics and general', trade: 'General', s: -5, f: 20 },
  ];
  function sampleActivities(anchor, R) {
    return ACTIVITY_DEFS.map((a) => ({ id: a.id, name: a.name, trade: a.trade, start: R.util.addDays(anchor, a.s), finish: R.util.addDays(anchor, a.f) }));
  }

  function companyKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company'; }

  /** Companies that book on a project, built from its contractor members, in the shape the rules engine expects. */
  function subsForProject(project, members, users) {
    const out = new Map();
    for (const m of members) {
      if (m.projectId !== project.id || m.status !== 'active' || m.role === 'access') continue;
      const u = users.find((x) => x.id === m.userId); if (!u) continue;
      const key = companyKey(u.company);
      const cur = out.get(key) || { id: key, name: u.company, trade: '', suspended: !!(project.suspended && project.suspended[key]) };
      if (!cur.trade && m.trade) cur.trade = m.trade;
      out.set(key, cur);
    }
    return [...out.values()];
  }

  /**
   * Turns rules-engine notices (to: contractor | security | gc) into emails for real people on the project.
   * contractor -> the person who submitted; security -> Access Control members; gc -> project admins.
   */
  function routeNotices(list, project, members, users, request) {
    const active = members.filter((m) => m.projectId === project.id && m.status === 'active');
    const emailsFor = (role) => active.filter((m) => m.role === role).map((m) => (users.find((u) => u.id === m.userId) || {}).email).filter(Boolean);
    const out = [];
    for (const n of list) {
      let to = [];
      if (n.to === 'contractor') to = request && request.submitterEmail ? [request.submitterEmail] : [];
      else if (n.to === 'security') to = emailsFor('access');
      else if (n.to === 'gc') to = emailsFor('admin');
      for (const email of [...new Set(to)]) out.push({ to: email, role: n.to, subject: n.subject, body: n.body, kind: 'delivery', event: n.event, projectId: project.id, requestId: n.requestId || null });
    }
    return out;
  }

  function defaultSettings(R, passPrefix) {
    return Object.assign({}, R.DEFAULT_SETTINGS, { passPrefix });
  }

  function idMaker(prefix, rand) {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    return () => { let s = ''; for (let i = 0; i < 10; i++) s += abc[Math.floor(rand() * abc.length)]; return prefix + s; };
  }

  const DEMO_PASSWORD_HINT = 'Granted2026';
  const DEMO_USERS = [
    { key: 'admin', first: 'Alex', last: 'Morgan', email: 'alex.morgan@ajaxbuilding.com', phone: '214-555-0110', company: 'Ajax Building Company', isAdminAccount: true, role: 'admin' },
    { key: 'gate', first: 'Riley', last: 'Alvarez', email: 'riley.alvarez@gate.example.com', phone: '214-555-0122', company: 'SiteMetric', role: 'access' },
    { key: 'dana', first: 'Dana', last: 'Ruiz', email: 'dana.ruiz@northfield.example.com', phone: '214-555-0141', company: 'North Field Electrical', role: 'contractor', trade: 'Electrical' },
    { key: 'marcus', first: 'Marcus', last: 'Hale', email: 'marcus.hale@caliche.example.com', phone: '972-555-0188', company: 'Caliche Mechanical', role: 'contractor', trade: 'Mechanical' },
    { key: 'tess', first: 'Tess', last: 'Okafor', email: 'tess.okafor@redbud.example.com', phone: '817-555-0123', company: 'Redbud Fire Protection', role: 'contractor', trade: 'Fire protection' },
    { key: 'lee', first: 'Lee', last: 'Park', email: 'lee.park@mesquite.example.com', phone: '469-555-0177', company: 'Mesquite Controls', role: 'contractor', trade: 'Controls' },
    { key: 'sam', first: 'Sam', last: 'Ortiz', email: 'sam.ortiz@prairieglass.example.com', phone: '214-555-0160', company: 'Prairie Glass', pending: true },
  ];

  /**
   * Builds a complete demo: one project with members, a pending join request, pending invites,
   * and a day of deliveries around `anchor`. Passwords are added by the caller (hashing is async in the browser).
   */
  function buildDemo(anchor, R, A, rand) {
    rand = rand || Math.random;
    const uid = idMaker('u-', rand); const rid = idMaker('r-', rand); const lid = idMaker('l-', rand); const mid = idMaker('m-', rand);
    const createdAt = R.util.at(R.util.addDays(anchor, -20), '08:00').toISOString();
    const project = {
      id: 'p-dfw2dc2', name: 'DFW2 Data Center 2', location: 'Dallas–Fort Worth, TX', code: 'DDC2-7HKQ', createdBy: null, createdAt, deleted: false,
      suspended: {}, gates: DEFAULT_GATES, zones: DEFAULT_ZONES, activities: sampleActivities(anchor, R), demoAnchor: anchor,
    };
    project.settings = defaultSettings(R, A.passPrefixFromCode(project.code));
    const users = []; const members = []; const joinreqs = []; const invites = []; const mail = [];
    for (const d of DEMO_USERS) {
      const u = { id: uid(), email: d.email, first: d.first, last: d.last, phone: d.phone, company: d.company, isAjax: A.isAjaxEmail(d.email), isAdminAccount: !!d.isAdminAccount, verified: true, createdAt, failures: [], demo: true, key: d.key };
      users.push(u);
      if (d.role) members.push({ id: project.id + '__' + u.id, projectId: project.id, userId: u.id, role: d.role, trade: d.trade || '', status: 'active', addedAt: createdAt, addedBy: d.isAdminAccount ? 'creator' : 'demo', via: d.isAdminAccount ? 'creator' : 'request' });
    }
    const admin = users.find((u) => u.key === 'admin'); project.createdBy = admin.id;
    const sam = users.find((u) => u.key === 'sam');
    const reqAt = R.util.at(anchor, '06:20').toISOString();
    joinreqs.push({ id: 'j-' + sam.id, projectId: project.id, userId: sam.id, at: reqAt, status: 'pending' });
    mail.push({ id: mid(), to: admin.email, subject: 'Join request: Sam Ortiz (Prairie Glass) for DFW2 Data Center 2', body: 'Sam Ortiz from Prairie Glass asked to join DFW2 Data Center 2 with project code DDC2-7HKQ.\nOpen Granted → Approvals to approve them as Contractor, Access Control or Admin, or to decline.', ts: reqAt, kind: 'team', projectId: project.id });
    invites.push({ id: 'i-' + mid().slice(2), projectId: project.id, email: 'jordan.lee@hilltop.example.com', role: 'contractor', trade: 'General', by: admin.id, at: R.util.at(R.util.addDays(anchor, -1), '15:10').toISOString(), status: 'pending' });

    // ---- deliveries ----
    const subs = subsForProject(project, members, users);
    const s = project.settings;
    const ctxBase = { settings: s, gates: project.gates, zones: project.zones, subs, activities: project.activities };
    const D = (n) => { let d = anchor; let k = 0; const step = n < 0 ? -1 : 1; while (k < Math.abs(n)) { d = R.util.addDays(d, step); if (step < 0 || R.isWorkDay(d, s)) k++; } return d; };
    const by = (key) => users.find((u) => u.key === key);
    const specs = [
      { who: 'dana', activityId: 'A1230', gateId: 'G1', date: D(0), slot: '06:00', zoneId: 'Z-NLY', material: 'Cable reels, 500 kcmil', quantity: 6, unit: 'reels', pallets: 6, weightLbs: 9000, carrier: 'Southwire freight', truck: 'TX 4471', used: '06:12' },
      { who: 'dana', activityId: 'A1200', gateId: 'G1', date: D(0), slot: '07:00', zoneId: 'Z-HA', material: 'Busway sections, 4000A', quantity: 12, unit: 'sections', pallets: 6, weightLbs: 7200, carrier: 'Lone Oak Trucking', truck: '118' },
      { who: 'marcus', activityId: 'A1320', gateId: 'G2', date: D(0), slot: '08:00', zoneId: 'Z-SLY', material: 'CRAH units', quantity: 4, unit: 'units', pallets: 4, weightLbs: 14800, carrier: 'Big Sky Heavy Haul', truck: 'Lowboy 7' },
      { who: 'tess', activityId: 'A1410', gateId: 'G1', date: D(0), slot: '10:00', zoneId: 'Z-HB', material: 'Sprinkler pipe, 4 in. Sch 10', quantity: 1200, unit: 'LF', pallets: 8, weightLbs: 6100, carrier: 'Redbud fleet', truck: 'RB-12' },
      { who: 'lee', activityId: 'A1520', gateId: 'G1', date: D(0), slot: '13:00', zoneId: 'Z-HB', material: 'BMS sensors and wiring', quantity: 40, unit: 'boxes', pallets: 2, weightLbs: 900, carrier: 'UPS Freight', truck: '', cancelled: true },
      { who: 'lee', activityId: 'A1520', gateId: 'G1', date: D(1), slot: '09:00', zoneId: 'Z-HA', material: 'BMS controller panels', quantity: 6, unit: 'crates', pallets: 3, weightLbs: 1400, carrier: 'Mesquite van', truck: 'MC-3' },
      { who: 'marcus', activityId: 'A1335', gateId: 'G2', date: D(2), slot: '07:00', zoneId: 'Z-SLY', material: 'Chilled water pipe and fittings', quantity: 1800, unit: 'LF', pallets: 26, weightLbs: 21000, carrier: 'Big Sky Heavy Haul', truck: 'Flatbed 3' },
      { who: 'dana', activityId: 'A1215', gateId: 'G2', date: D(3), slot: '10:00', zoneId: 'Z-EY', material: 'Switchgear lineup sections', quantity: 5, unit: 'sections', pallets: 5, weightLbs: 18500, carrier: 'OEM direct', truck: 'Air-ride 22', justification: 'Factory ships once; crane booked for this week' },
      { who: 'lee', activityId: 'A1530', gateId: 'G1', date: D(3), slot: '08:00', zoneId: 'Z-HB', material: 'Plenum Cat 6A cable', quantity: 60, unit: 'boxes', pallets: 3, weightLbs: 1500, carrier: 'Mesquite van', truck: 'MC-3' },
      { who: 'tess', activityId: 'A1410', gateId: 'G1', date: D(1), slot: '13:00', zoneId: 'Z-HB', material: 'Sprinkler heads and fittings', quantity: 30, unit: 'boxes', pallets: 2, weightLbs: 800, carrier: 'UPS Freight', truck: '', late: true },
    ];
    const requests = []; const passes = []; const gatelog = []; const codes = [];
    const pushMail = (event, r, ts, extra) => {
      const sub = subs.find((x) => x.id === r.subId);
      const d = Object.assign({ subId: r.subId, subName: sub.name, material: r.material, date: r.date, slot: r.slot, gateName: project.gates.find((g) => g.id === r.gateId).name,
        zoneName: project.zones.find((z) => z.id === r.zoneId).name, passCode: r.passCode, requestId: r.id, reasons: r.reasons }, extra || {});
      for (const m of routeNotices(R.notices(event, d), project, members, users, r)) mail.push(Object.assign({ id: mid(), ts }, m));
    };
    for (const sp of specs) {
      const u = by(sp.who);
      const r = { id: rid(), projectId: project.id, subId: companyKey(u.company), subName: u.company, userId: u.id, submitterEmail: u.email, submittedBy: u.first + ' ' + u.last,
        activityId: sp.activityId, gateId: sp.gateId, date: sp.date, slot: sp.slot, zoneId: sp.zoneId, material: sp.material, quantity: sp.quantity, unit: sp.unit,
        pallets: sp.pallets, weightLbs: sp.weightLbs || '', carrier: sp.carrier, truck: sp.truck, pocName: u.first + ' ' + u.last, pocPhone: u.phone, justification: sp.justification || '', demo: true };
      const submittedAt = sp.late ? new Date(R.util.at(sp.date, sp.slot).getTime() - 30 * 3600000) : R.util.at(D(sp.date === D(0) ? -3 : -2), '15:30');
      r.submittedAt = submittedAt.toISOString();
      const ev = R.evaluateRequest(r, Object.assign({ now: submittedAt, requests }, ctxBase));
      r.status = ev.outcome; r.stagedUntil = ev.stagedUntil; r.decidedBy = 'Rules engine'; r.decidedAt = r.submittedAt;
      r.reasons = ev.checks.filter((c) => c.reason).map((c) => ({ code: c.reason, title: c.title, remedy: c.remedy }));
      if (r.status === 'approved') {
        r.passCode = R.newPassCode(codes, s, rand); codes.push(r.passCode);
        const p = { id: r.passCode, code: r.passCode, projectId: project.id, requestId: r.id, status: 'active', issuedAt: r.submittedAt, override: false, demo: true };
        if (sp.used) { p.status = 'used'; p.usedAt = R.util.at(sp.date, sp.used).toISOString(); p.usedBy = 'Riley Alvarez'; }
        if (sp.cancelled) { p.status = 'void'; r.status = 'cancelled'; r.cancelledAt = R.util.at(D(-1), '16:05').toISOString(); }
        passes.push(p);
        pushMail('approved', r, r.submittedAt);
        if (sp.cancelled) pushMail('cancelled', r, r.cancelledAt);
        if (sp.used) gatelog.push({ id: lid(), projectId: project.id, ts: p.usedAt, code: r.passCode, color: 'green', reason: 'G00', title: 'Approved delivery', action: 'admitted', guard: 'Riley Alvarez', requestId: r.id, subId: r.subId, demo: true });
      } else pushMail(r.status, r, r.submittedAt);
      requests.push(r);
    }
    const strayTs = R.util.at(D(0), '06:40').toISOString();
    gatelog.push({ id: lid(), projectId: project.id, ts: strayTs, code: s.passPrefix + '-HKT4WA', color: 'red', reason: 'G01', title: 'No approved delivery for this code', action: 'turned away', guard: 'Riley Alvarez', requestId: null, subId: null, demo: true });
    const stray = R.notices('turnedAway', { subName: 'Unknown carrier', material: 'load with no approved pass', reasonTitle: 'No approved delivery for this code', remedy: R.util.fill(R.REASONS.G01.remedy, s), scannedCode: s.passPrefix + '-HKT4WA', guard: 'Riley Alvarez' }).filter((n) => n.to !== 'contractor');
    for (const m of routeNotices(stray, project, members, users, null)) mail.push(Object.assign({ id: mid(), ts: strayTs }, m));

    return { meta: { anchor, createdAt: new Date().toISOString(), demo: true }, users, projects: [project], members, joinreqs, invites, requests, passes, gatelog, mail };
  }

  return { DEFAULT_GATES, DEFAULT_ZONES, TRADES, UNITS, ACTIVITY_DEFS, DEMO_USERS, DEMO_PASSWORD_HINT, sampleActivities, companyKey, subsForProject, routeNotices, defaultSettings, buildDemo };
});
