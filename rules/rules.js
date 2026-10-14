/*
 * Granted — reference rules engine (delivery and gate rules)
 *
 * This file is the single source of truth for every yes/no decision the
 * system makes. It is plain JavaScript with no dependencies and no AI.
 *
 *  - The prototype runs it directly in the browser.
 *  - The Power Automate flows re-implement the same checks, in the same
 *    order, with the same reason codes (see powerautomate/F01-submit-check.md).
 *  - rules.test.js proves each rule with a fixed scenario.
 *
 * Times are "site local". In production the flows convert everything to
 * the site time zone (America/Chicago) before running these checks.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DCRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------
  // Settings (mirrors config/settings.json and the SharePoint Settings list)
  // ------------------------------------------------------------------
  const DEFAULT_SETTINGS = Object.freeze({
    project: 'Sample project',
    timeZone: 'America/Chicago',
    passPrefix: 'DC2',
    minNoticeHours: 48,          // contract: requests need 48 hours' notice
    maxDaysBeforeInstall: 7,     // contract: only that week's material onsite
    gateToleranceMinutes: 60,    // how early/late a truck may arrive vs. its slot
    noShowGraceMinutes: 60,      // after slot end + grace, an unscanned pass is a no-show
    maxPalletsPerRequest: 20,    // above this, a person reviews the request
    duplicateWindowDays: 7,      // same sub + same activity within this many days -> review
    slotMinutes: 60,
    gateOpen: '06:00',
    gateClose: '16:00',
    workDays: [1, 2, 3, 4, 5, 6], // 0 = Sunday ... 6 = Saturday
    blackoutDates: [],            // 'YYYY-MM-DD'
    searchDaysForNextSlot: 21,
    reviewEscalationHours: 4,     // F07 escalates reviews older than this to the backup reviewer
  });

  // ------------------------------------------------------------------
  // Reason codes. Wording is fixed text, never generated.
  // {placeholders} are filled from the request / context.
  // ------------------------------------------------------------------
  const REASONS = Object.freeze({
    // Request checks (R = reject, F = flag for review)
    R01: { key: 'REQUIRED_FIELDS', outcome: 'reject', title: 'Required information missing',
      remedy: 'Fill in: {missing}.' },
    R02: { key: 'SUB_SUSPENDED', outcome: 'reject', title: 'Booking privileges suspended',
      remedy: 'Contact the GC project manager to restore booking privileges.' },
    R03: { key: 'ACTIVITY_NOT_IN_LOOKAHEAD', outcome: 'reject', title: 'Activity is not in the current 3-week look-ahead',
      remedy: 'Pick an activity from the look-ahead list. If your work is missing, ask the GC scheduler to add it.' },
    R04: { key: 'ACTIVITY_WRONG_TRADE', outcome: 'reject', title: 'Activity belongs to another trade',
      remedy: 'Pick one of your own activities ({trade}).' },
    R05: { key: 'NOTICE_TOO_SHORT', outcome: 'reject', title: 'Less than {minNoticeHours} hours’ notice',
      remedy: 'Pick a time at least {minNoticeHours} hours from now. Next open slot: {nextOpen}.' },
    R06: { key: 'GATE_CLOSED', outcome: 'reject', title: 'The gate is closed at that time',
      remedy: 'Deliveries run {gateOpen}–{gateClose}, {workDays}. Next open slot: {nextOpen}.' },
    R07: { key: 'SLOT_FULL', outcome: 'reject', title: 'That time slot is full at {gateName}',
      remedy: 'Next open slot at {gateName}: {nextOpen}.' },
    R08: { key: 'ZONE_FULL', outcome: 'reject', title: '{zoneName} has no room for {pallets} pallets',
      remedy: 'Room left in {zoneName} on those days: {zoneLeft} pallets. Pick another zone or split the delivery.' },
    R09: { key: 'AFTER_ACTIVITY_FINISH', outcome: 'reject', title: 'Delivery is after the activity finishes ({activityFinish})',
      remedy: 'Pick a date on or before {activityFinish}, or ask the scheduler to update the look-ahead.' },
    R10: { key: 'EARLY_NO_JUSTIFICATION', outcome: 'reject', title: 'More than {maxDaysBeforeInstall} days before install, with no justification',
      remedy: 'Deliver on or after {earliestDate}, or add a justification for early delivery so the GC can review it.' },
    F01: { key: 'EARLY_DELIVERY', outcome: 'review', title: 'Early delivery ({daysEarly} days before install)',
      remedy: 'A GC reviewer will approve or reject. Justification given: “{justification}”' },
    F02: { key: 'LARGE_DELIVERY', outcome: 'review', title: 'Large delivery ({pallets} pallets)',
      remedy: 'A GC reviewer will confirm the staging plan for more than {maxPalletsPerRequest} pallets.' },
    F03: { key: 'POSSIBLE_DUPLICATE', outcome: 'review', title: 'Possible duplicate of {otherCode}',
      remedy: 'A GC reviewer will check whether this material is already onsite or booked.' },
    // Gate checks
    G00: { key: 'ADMIT', outcome: 'green', title: 'Approved delivery', remedy: 'Admit the truck and direct it to {zoneName}.' },
    G01: { key: 'NO_PASS', outcome: 'red', title: 'No approved delivery for this code',
      remedy: 'The contractor must submit a delivery request with {minNoticeHours} hours’ notice, or the GC superintendent can issue an emergency pass.' },
    G02: { key: 'PASS_CANCELLED', outcome: 'red', title: 'This delivery was cancelled',
      remedy: 'The contractor must submit a new delivery request.' },
    G03: { key: 'PASS_USED', outcome: 'red', title: 'Pass already used at {usedAt}',
      remedy: 'Each pass admits one truck. A second truck needs its own approved request.' },
    G04: { key: 'WRONG_DAY', outcome: 'red', title: 'Approved for {deliveryDate}, not today',
      remedy: 'Return on {deliveryDate} between {windowOpen} and {windowClose}, or reschedule in the app.' },
    G05: { key: 'TOO_EARLY', outcome: 'red', title: 'Too early: window opens at {windowOpen}',
      remedy: 'Wait off-site until {windowOpen}, or the GC superintendent can approve early entry.' },
    G06: { key: 'TOO_LATE', outcome: 'red', title: 'Too late: window closed at {windowClose}',
      remedy: 'Reschedule in the app, or the GC superintendent can issue an emergency pass.' },
    G07: { key: 'GATE_SUB_SUSPENDED', outcome: 'red', title: 'Contractor’s booking privileges are suspended',
      remedy: 'Contact the GC project manager.' },
  });

  // ------------------------------------------------------------------
  // Date helpers (all "site local")
  // ------------------------------------------------------------------
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = (n) => String(n).padStart(2, '0');
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function toMinutes(hhmm) { const p = String(hhmm).split(':').map(Number); return p[0] * 60 + p[1]; }
  function fromMinutes(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function at(dateStr, hhmm) { const d = parseYmd(dateStr); const m = toMinutes(hhmm); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; }
  function addDays(dateStr, n) { const d = parseYmd(dateStr); d.setDate(d.getDate() + n); return ymd(d); }
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
  function fmtTime(hhmm) {
    const m = toMinutes(hhmm); let h = Math.floor(m / 60); const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; return h + ':' + pad(m % 60) + ' ' + ap;
  }
  function fmtClock(d) { return fmtTime(pad(d.getHours()) + ':' + pad(d.getMinutes())); }
  function fmtDate(dateStr) { const d = parseYmd(dateStr); return DAY_NAMES[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate(); }
  function fmtWorkDays(days) {
    const s = [...days].sort((a, b) => a - b);
    const contiguous = s.every((v, i) => i === 0 || v === s[i - 1] + 1);
    return contiguous && s.length > 1 ? DAY_NAMES[s[0]] + '–' + DAY_NAMES[s[s.length - 1]] : s.map((d) => DAY_NAMES[d]).join(', ');
  }

  function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  }

  // ------------------------------------------------------------------
  // Calendar / capacity helpers
  // ------------------------------------------------------------------
  function slotsForDay(settings) {
    const s = settings; const out = [];
    for (let m = toMinutes(s.gateOpen); m + s.slotMinutes <= toMinutes(s.gateClose); m += s.slotMinutes) out.push(fromMinutes(m));
    return out;
  }
  function isWorkDay(dateStr, settings) {
    settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    return settings.workDays.includes(parseYmd(dateStr).getDay()) && !settings.blackoutDates.includes(dateStr);
  }
  function isActive(r) { return r && (r.status === 'approved' || r.status === 'review'); }

  function slotLoad(requests, gateId, date, slot, excludeId) {
    return requests.filter((r) => isActive(r) && r.id !== excludeId && r.gateId === gateId && r.date === date && r.slot === slot).length;
  }

  /** The days a delivery occupies its staging zone: delivery day through the day install starts. */
  function stagingDays(date, activity) {
    const until = activity && activity.start > date ? activity.start : date;
    const days = []; for (let d = date; d <= until; d = addDays(d, 1)) days.push(d);
    return { from: date, until, days };
  }

  /** Highest pallet count already booked in a zone on any of the given days. */
  function zonePeak(requests, zoneId, days, excludeId) {
    let peak = 0;
    for (const day of days) {
      let sum = 0;
      for (const r of requests) {
        if (!isActive(r) || r.id === excludeId || r.zoneId !== zoneId) continue;
        if (r.date <= day && day <= (r.stagedUntil || r.date)) sum += Number(r.pallets) || 0;
      }
      peak = Math.max(peak, sum);
    }
    return peak;
  }

  function earliestAllowed(now, settings) { return new Date(now.getTime() + settings.minNoticeHours * 3600000); }

  /** First slot at a gate that is open, has room and meets the notice rule. */
  function settingsOf(ctx) { return Object.assign({}, DEFAULT_SETTINGS, (ctx && ctx.settings) || {}); }

  function nextOpenSlot(ctx, gateId, excludeId) {
    const s = settingsOf(ctx); ctx = Object.assign({}, ctx, { settings: s }); const gate = ctx.gates.find((g) => g.id === gateId); if (!gate) return null;
    const earliest = earliestAllowed(ctx.now, s); let day = ymd(earliest);
    for (let i = 0; i < s.searchDaysForNextSlot; i++, day = addDays(day, 1)) {
      if (!isWorkDay(day, s)) continue;
      for (const slot of slotsForDay(s)) {
        if (at(day, slot) < earliest) continue;
        if (slotLoad(ctx.requests, gateId, day, slot, excludeId) < gate.capacityPerSlot) return { date: day, slot, label: fmtDate(day) + ' ' + fmtTime(slot) };
      }
    }
    return null;
  }

  /** Every slot for one gate and day, with how many trucks it can still take. */
  function slotBoard(ctx, gateId, date, excludeId) {
    const s = settingsOf(ctx); const gate = ctx.gates.find((g) => g.id === gateId); if (!gate || !date) return [];
    const earliest = earliestAllowed(ctx.now, s); const work = isWorkDay(date, s);
    return slotsForDay(s).map((slot) => {
      const used = slotLoad(ctx.requests, gateId, date, slot, excludeId);
      const left = Math.max(0, gate.capacityPerSlot - used);
      const tooSoon = at(date, slot) < earliest;
      return { slot, label: fmtTime(slot), left, capacity: gate.capacityPerSlot, open: work && !tooSoon && left > 0, tooSoon, closedDay: !work };
    });
  }

  // ------------------------------------------------------------------
  // Request evaluation
  // ------------------------------------------------------------------
  const REQUIRED = [
    ['subId', 'company'], ['activityId', 'look-ahead activity'], ['gateId', 'gate'], ['date', 'delivery date'],
    ['slot', 'time slot'], ['zoneId', 'staging zone'], ['material', 'material description'],
    ['quantity', 'quantity'], ['unit', 'unit'], ['pallets', 'pallet count'], ['pocName', 'onsite contact name'], ['pocPhone', 'onsite contact phone'],
  ];

  function missingFields(req) {
    const miss = [];
    for (const [k, label] of REQUIRED) {
      const v = req[k];
      if (v === undefined || v === null || String(v).trim() === '') miss.push(label);
    }
    if (req.quantity !== undefined && req.quantity !== '' && !(Number(req.quantity) > 0)) miss.push('quantity above zero');
    if (req.pallets !== undefined && req.pallets !== '' && !(Number.isInteger(Number(req.pallets)) && Number(req.pallets) >= 0)) miss.push('whole number of pallets');
    if (req.pocPhone && String(req.pocPhone).replace(/\D/g, '').length !== 10) miss.push('10-digit phone number');
    return [...new Set(miss)];
  }

  /**
   * Run every check on a request. Returns:
   *  outcome: 'approved' | 'review' | 'rejected'
   *  checks:  one entry per rule, in order, each { id, label, status: 'pass'|'fail'|'flag'|'skip', reason?, title?, remedy? }
   *  reasons: the reason codes that failed or flagged
   *  stagedUntil, nextOpen
   * ctx = { now, settings, gates, zones, subs, activities, requests }
   */
  function evaluateRequest(req, ctx) {
    const s = settingsOf(ctx);
    ctx = Object.assign({}, ctx, { settings: s });
    const checks = []; const vars = Object.assign({}, s, { workDays: fmtWorkDays(s.workDays), gateOpen: fmtTime(s.gateOpen), gateClose: fmtTime(s.gateClose) });
    const sub = ctx.subs.find((x) => x.id === req.subId);
    const gate = ctx.gates.find((x) => x.id === req.gateId);
    const zone = ctx.zones.find((x) => x.id === req.zoneId);
    const act = ctx.activities.find((x) => x.id === req.activityId);
    Object.assign(vars, {
      pallets: req.pallets, justification: (req.justification || '').trim(),
      gateName: gate ? gate.name : 'that gate', zoneName: zone ? zone.name : 'that zone', trade: sub ? sub.trade : '',
      activityFinish: act ? fmtDate(act.finish) : '',
    });
    const add = (id, label, status, code) => {
      const c = { id, label, status };
      if (code) { c.reason = code; c.title = fill(REASONS[code].title, vars); c.remedy = fill(REASONS[code].remedy, vars); }
      checks.push(c); return c;
    };
    const needNext = () => { if (vars.nextOpen === undefined) { const n = gate ? nextOpenSlot(ctx, gate.id, req.id) : null; vars.nextOpen = n ? n.label : 'none in the next 3 weeks'; vars._next = n; } };

    // 1. Required information
    const miss = missingFields(req); vars.missing = miss.join(', ');
    add('required', 'Required information', miss.length ? 'fail' : 'pass', miss.length ? 'R01' : null);
    const basicsOk = !miss.length && sub && gate && zone;

    // 2. Contractor active
    add('subActive', 'Contractor can book', sub && sub.suspended ? 'fail' : (sub ? 'pass' : 'skip'), sub && sub.suspended ? 'R02' : null);

    // 3-4. Look-ahead activity
    if (!req.activityId) { add('lookahead', 'Activity is in the look-ahead', 'skip'); add('trade', 'Activity matches your trade', 'skip'); }
    else {
      add('lookahead', 'Activity is in the look-ahead', act ? 'pass' : 'fail', act ? null : 'R03');
      // Trade is checked only when the project admin has set a trade for the company.
      if (act && sub && sub.trade) add('trade', 'Activity matches your trade', act.trade === sub.trade ? 'pass' : 'fail', act.trade === sub.trade ? null : 'R04');
      else add('trade', 'Activity matches your trade', act && sub ? 'pass' : 'skip');
    }

    // 5. Notice
    if (req.date && req.slot) {
      const ok = at(req.date, req.slot) >= earliestAllowed(ctx.now, s);
      if (!ok) needNext();
      add('notice', s.minNoticeHours + '-hour notice', ok ? 'pass' : 'fail', ok ? null : 'R05');
    } else add('notice', s.minNoticeHours + '-hour notice', 'skip');

    // 6. Gate hours
    if (req.date && req.slot) {
      const ok = isWorkDay(req.date, s) && slotsForDay(s).includes(req.slot);
      if (!ok) needNext();
      add('hours', 'Gate open at that time', ok ? 'pass' : 'fail', ok ? null : 'R06');
    } else add('hours', 'Gate open at that time', 'skip');

    // 7. Slot capacity
    if (gate && req.date && req.slot) {
      const ok = slotLoad(ctx.requests, gate.id, req.date, req.slot, req.id) < gate.capacityPerSlot;
      if (!ok) needNext();
      add('slot', 'Time slot has room', ok ? 'pass' : 'fail', ok ? null : 'R07');
    } else add('slot', 'Time slot has room', 'skip');

    // 8. Staging zone capacity
    const staging = req.date ? stagingDays(req.date, act) : null;
    if (zone && staging && req.pallets !== '' && req.pallets !== undefined) {
      const peak = zonePeak(ctx.requests, zone.id, staging.days, req.id);
      const left = Math.max(0, zone.capacityPallets - peak); vars.zoneLeft = left;
      const ok = Number(req.pallets) <= left;
      add('zone', 'Staging zone has room', ok ? 'pass' : 'fail', ok ? null : 'R08');
    } else add('zone', 'Staging zone has room', 'skip');

    // 9. Not after the activity finishes
    if (act && req.date) {
      const ok = req.date <= act.finish;
      add('finish', 'Delivery before activity finishes', ok ? 'pass' : 'fail', ok ? null : 'R09');
    } else add('finish', 'Delivery before activity finishes', 'skip');

    // 10. Within N days of install (soft, with justification)
    if (act && req.date) {
      const daysEarly = daysBetween(req.date, act.start); vars.daysEarly = daysEarly;
      vars.earliestDate = fmtDate(addDays(act.start, -s.maxDaysBeforeInstall));
      if (daysEarly <= s.maxDaysBeforeInstall) add('early', 'Within ' + s.maxDaysBeforeInstall + ' days of install', 'pass');
      else if (!vars.justification) add('early', 'Within ' + s.maxDaysBeforeInstall + ' days of install', 'fail', 'R10');
      else add('early', 'Within ' + s.maxDaysBeforeInstall + ' days of install', 'flag', 'F01');
    } else add('early', 'Within ' + s.maxDaysBeforeInstall + ' days of install', 'skip');

    // 11. Pallet limit (soft)
    if (req.pallets !== '' && req.pallets !== undefined && !isNaN(Number(req.pallets))) {
      const ok = Number(req.pallets) <= s.maxPalletsPerRequest;
      add('size', 'Normal size (' + s.maxPalletsPerRequest + ' pallets or fewer)', ok ? 'pass' : 'flag', ok ? null : 'F02');
    } else add('size', 'Normal size (' + s.maxPalletsPerRequest + ' pallets or fewer)', 'skip');

    // 12. Possible duplicate (soft)
    if (req.subId && req.activityId && req.date) {
      const other = ctx.requests.find((r) => r.id !== req.id && (isActive(r) || r.arrived) && r.subId === req.subId && r.activityId === req.activityId &&
        Math.abs(daysBetween(r.date, req.date)) <= s.duplicateWindowDays);
      vars.otherCode = other ? (other.passCode || other.id) : '';
      add('duplicate', 'Not a repeat of another delivery', other ? 'flag' : 'pass', other ? 'F03' : null);
    } else add('duplicate', 'Not a repeat of another delivery', 'skip');

    const fails = checks.filter((c) => c.status === 'fail');
    const flags = checks.filter((c) => c.status === 'flag');
    const outcome = fails.length ? 'rejected' : flags.length ? 'review' : 'approved';
    return {
      outcome, checks, ready: basicsOk,
      reasons: fails.concat(flags).map((c) => c.reason),
      stagedUntil: staging ? staging.until : null,
      nextOpen: vars._next || null,
    };
  }

  // ------------------------------------------------------------------
  // Gate check
  // ------------------------------------------------------------------
  function normalizeCode(raw, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    let c = String(raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!c.includes('-') && c.length === 6) c = s.passPrefix + '-' + c;
    if (c.startsWith(s.passPrefix) && !c.startsWith(s.passPrefix + '-')) c = s.passPrefix + '-' + c.slice(s.passPrefix.length);
    return c;
  }

  function passWindow(req, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const start = at(req.date, req.slot); const end = new Date(start.getTime() + s.slotMinutes * 60000);
    // Arrival window: the slot plus the tolerance either side, but never outside gate hours.
    const gateOpen = at(req.date, s.gateOpen); const gateClose = at(req.date, s.gateClose);
    return {
      start, end,
      open: new Date(Math.max(start.getTime() - s.gateToleranceMinutes * 60000, gateOpen.getTime())),
      close: new Date(Math.min(end.getTime() + s.gateToleranceMinutes * 60000, gateClose.getTime())),
    };
  }

  /**
   * ctx = { now, settings, passes, requests, subs, zones }
   * Returns { color: 'green'|'red', reason, title, remedy, pass, request }
   */
  function checkPass(rawCode, ctx) {
    const s = Object.assign({}, DEFAULT_SETTINGS, ctx.settings || {});
    const code = normalizeCode(rawCode, s);
    const pass = ctx.passes.find((p) => p.code === code);
    const req = pass ? ctx.requests.find((r) => r.id === pass.requestId) : null;
    const vars = Object.assign({}, s);
    const out = (reason, extra) => Object.assign({
      color: REASONS[reason].outcome, reason, code,
      title: fill(REASONS[reason].title, vars), remedy: fill(REASONS[reason].remedy, vars), pass, request: req,
    }, extra || {});
    if (!pass || !req) return out('G01');
    const zone = (ctx.zones || []).find((z) => z.id === req.zoneId);
    const sub = ctx.subs.find((x) => x.id === req.subId);
    const w = passWindow(req, s);
    Object.assign(vars, {
      zoneName: zone ? zone.name : req.zoneId, deliveryDate: fmtDate(req.date),
      windowOpen: fmtClock(w.open), windowClose: fmtClock(w.close),
      usedAt: pass.usedAt ? fmtClock(new Date(pass.usedAt)) : '',
    });
    if (pass.status === 'void' || req.status === 'cancelled') return out('G02');
    if (pass.status === 'used') return out('G03');
    if (sub && sub.suspended && !pass.override) return out('G07');
    if (req.date !== ymd(ctx.now)) return out('G04');
    if (ctx.now < w.open) return out('G05');
    if (ctx.now > w.close) return out('G06');
    return out('G00');
  }

  // ------------------------------------------------------------------
  // Display status for a request
  // ------------------------------------------------------------------
  function deliveryStatus(req, pass, now, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    if (req.status === 'cancelled') return 'cancelled';
    if (req.status === 'rejected') return 'rejected';
    if (req.status === 'review') return 'review';
    if (pass && pass.status === 'used') return 'arrived';
    if (pass && req.status === 'approved') {
      const w = passWindow(req, s);
      if (now.getTime() > w.end.getTime() + s.noShowGraceMinutes * 60000) return 'noshow';
    }
    return 'approved';
  }

  const PASS_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679'; // no 0/O, 1/I/L, 2/Z, 5/S, 8/B
  function newPassCode(existing, settings, rand) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const r = rand || Math.random; const taken = new Set(existing || []);
    for (let tries = 0; tries < 1000; tries++) {
      let c = ''; for (let i = 0; i < 6; i++) c += PASS_ALPHABET[Math.floor(r() * PASS_ALPHABET.length)];
      const code = s.passPrefix + '-' + c; if (!taken.has(code)) return code;
    }
    throw new Error('Could not create a unique pass code');
  }

  // ------------------------------------------------------------------
  // Notification templates (fixed text). Who gets what, on which channel.
  // ------------------------------------------------------------------
  const CHANNELS = { contractor: ['email', 'app'], security: ['email', 'app'], gc: ['email', 'teams', 'app'] };
  function notices(event, d) {
    const when = d.date ? fmtDate(d.date) + ' ' + fmtTime(d.slot) : '';
    const head = d.subName + ' – ' + d.material;
    const reasonsText = (d.reasons || []).map((r) => '• ' + r.title + '. ' + r.remedy).join('\n');
    const list = [];
    const to = (who, subject, body) => list.push({ to: who, channels: CHANNELS[who], subject, body, event, subId: d.subId, requestId: d.requestId || null, passCode: d.passCode || null });
    switch (event) {
      case 'approved':
        to('contractor', 'Approved: ' + d.passCode + ' for ' + when, head + '\nGate: ' + d.gateName + '\nStaging: ' + d.zoneName + '\nShow gate pass ' + d.passCode + ' (QR attached) to security on arrival.');
        to('security', 'New approved delivery ' + when, head + '\nPass: ' + d.passCode + '\nGate: ' + d.gateName);
        break;
      case 'review':
        to('contractor', 'Under review: ' + head, 'Your request is waiting for a GC reviewer.\n' + reasonsText);
        to('gc', 'Review needed: ' + head + ' (' + when + ')', reasonsText);
        break;
      case 'rejected':
        to('contractor', 'Not approved: ' + head, 'Your request was not approved.\n' + reasonsText);
        break;
      case 'cancelled':
        to('contractor', 'Cancelled: ' + d.passCode + ' (' + when + ')', head + ' was cancelled.');
        to('security', 'Cancelled delivery ' + d.passCode, head + ' (' + when + ') is cancelled. Do not admit.');
        break;
      case 'emergency':
        to('contractor', 'Emergency pass issued: ' + d.passCode, head + ' may enter today ' + when + ' at ' + d.gateName + '. Issued by ' + (d.by || 'GC') + '.');
        to('security', 'Emergency pass ' + d.passCode + ' (today ' + fmtTime(d.slot) + ')', head + '\nIssued by ' + (d.by || 'GC') + '.');
        to('gc', 'Emergency pass logged: ' + d.passCode, head + ' – counts as an override against ' + d.subName + '.');
        break;
      case 'turnedAway':
        for (const who of ['contractor', 'security', 'gc']) to(who, 'Turned away at gate: ' + head, d.reasonTitle + '.\nWhat to do: ' + d.remedy + '\nCode: ' + (d.passCode || d.scannedCode || 'none') + ' • Logged by ' + (d.guard || 'security'));
        break;
      case 'noshow':
        to('contractor', 'No-show: ' + d.passCode, head + ' did not arrive in its window (' + when + '). Repeated no-shows can suspend booking.');
        to('gc', 'No-show: ' + head, 'Pass ' + d.passCode + ', window ' + when + '.');
        break;
      default: break;
    }
    return list;
  }

  return {
    DEFAULT_SETTINGS, REASONS, PASS_ALPHABET,
    evaluateRequest, checkPass, deliveryStatus, nextOpenSlot, slotBoard, slotsForDay, isWorkDay,
    stagingDays, zonePeak, slotLoad, passWindow, normalizeCode, newPassCode, notices, missingFields,
    util: { ymd, parseYmd, at, addDays, daysBetween, fmtTime, fmtClock, fmtDate, fmtWorkDays, toMinutes, fill },
  };
});
