// ---------------------------------------------------------------------------
// Granted rules engine, typed for Office Scripts.
//
// A line-for-line port of evaluateRequest() and its helpers in rules/rules.js,
// written to the Office Scripts subset of TypeScript (no `any`, no classes,
// no imports). officescripts/engine.test.js runs this file and rules.js side
// by side over every scenario in rules/rules.test.js plus thousands of random
// requests, and they must agree exactly.
//
// Times are site-local wall-clock times ("YYYY-MM-DDTHH:mm:ss"). The flow
// converts UTC to the project's time zone before calling, so the script's own
// time zone never matters.
// ---------------------------------------------------------------------------

interface EngSettings {
  minNoticeHours: number; maxDaysBeforeInstall: number; gateToleranceMinutes: number; noShowGraceMinutes: number;
  maxPalletsPerRequest: number; duplicateWindowDays: number; slotMinutes: number; gateOpen: string; gateClose: string;
  workDays: number[]; blackoutDates: string[]; searchDaysForNextSlot: number; passPrefix: string;
}
interface EngGate { id: string; name: string; capacityPerSlot: number }
interface EngZone { id: string; name: string; capacityPallets: number }
interface EngSub { id: string; name: string; trade: string; suspended: boolean }
interface EngActivity { id: string; name: string; trade: string; start: string; finish: string }
interface EngBooking {
  id: string; subId: string; activityId: string; gateId: string; date: string; slot: string; zoneId: string;
  pallets: number; stagedUntil: string; status: string; passCode: string; arrived: boolean;
}
interface EngRequest {
  id: string; subId: string; activityId: string; gateId: string; date: string; slot: string; zoneId: string;
  material: string; quantity: string; unit: string; pallets: string; pocName: string; pocPhone: string; justification: string;
}
interface EngContext { now: string; settings: EngSettings; gates: EngGate[]; zones: EngZone[]; subs: EngSub[]; activities: EngActivity[]; requests: EngBooking[] }
interface EngCheck { id: string; label: string; status: string; reason: string; title: string; remedy: string }
interface EngSlot { date: string; slot: string; label: string }
interface EngResult {
  outcome: string; status: string; ready: boolean; codes: string; reasonText: string;
  reasons: EngCheck[]; checks: EngCheck[]; stagedUntil: string; nextOpen: EngSlot | null;
}
interface EngReason { outcome: string; title: string; remedy: string }

const ENG_DEFAULTS: EngSettings = {
  minNoticeHours: 48, maxDaysBeforeInstall: 7, gateToleranceMinutes: 60, noShowGraceMinutes: 60, maxPalletsPerRequest: 20,
  duplicateWindowDays: 7, slotMinutes: 60, gateOpen: '06:00', gateClose: '16:00', workDays: [1, 2, 3, 4, 5, 6],
  blackoutDates: [], searchDaysForNextSlot: 21, passPrefix: 'DC2',
};

const ENG_REASONS: { [code: string]: EngReason } = {
  R01: { outcome: 'reject', title: 'Required information missing', remedy: 'Fill in: {missing}.' },
  R02: { outcome: 'reject', title: 'Booking privileges suspended', remedy: 'Contact the GC project manager to restore booking privileges.' },
  R03: { outcome: 'reject', title: 'Activity is not in the current 3-week look-ahead', remedy: 'Pick an activity from the look-ahead list. If your work is missing, ask the GC scheduler to add it.' },
  R04: { outcome: 'reject', title: 'Activity belongs to another trade', remedy: 'Pick one of your own activities ({trade}).' },
  R05: { outcome: 'reject', title: 'Less than {minNoticeHours} hours’ notice', remedy: 'Pick a time at least {minNoticeHours} hours from now. Next open slot: {nextOpen}.' },
  R06: { outcome: 'reject', title: 'The gate is closed at that time', remedy: 'Deliveries run {gateOpen}–{gateClose}, {workDays}. Next open slot: {nextOpen}.' },
  R07: { outcome: 'reject', title: 'That time slot is full at {gateName}', remedy: 'Next open slot at {gateName}: {nextOpen}.' },
  R08: { outcome: 'reject', title: '{zoneName} has no room for {pallets} pallets', remedy: 'Room left in {zoneName} on those days: {zoneLeft} pallets. Pick another zone or split the delivery.' },
  R09: { outcome: 'reject', title: 'Delivery is after the activity finishes ({activityFinish})', remedy: 'Pick a date on or before {activityFinish}, or ask the scheduler to update the look-ahead.' },
  R10: { outcome: 'reject', title: 'More than {maxDaysBeforeInstall} days before install, with no justification', remedy: 'Deliver on or after {earliestDate}, or add a justification for early delivery so the GC can review it.' },
  F01: { outcome: 'review', title: 'Early delivery ({daysEarly} days before install)', remedy: 'A GC reviewer will approve or reject. Justification given: “{justification}”' },
  F02: { outcome: 'review', title: 'Large delivery ({pallets} pallets)', remedy: 'A GC reviewer will confirm the staging plan for more than {maxPalletsPerRequest} pallets.' },
  F03: { outcome: 'review', title: 'Possible duplicate of {otherCode}', remedy: 'A GC reviewer will check whether this material is already onsite or booked.' },
};

const ENG_DAYS: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function engPad(n: number): string { return (n < 10 ? '0' : '') + String(n); }
/** Day number since 1970-01-01 for a YYYY-MM-DD date (calendar arithmetic, no time zones). */
function engDayNo(ymd: string): number { const p = ymd.split('-'); return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000); }
function engFromDayNo(n: number): string { const d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + engPad(d.getUTCMonth() + 1) + '-' + engPad(d.getUTCDate()); }
function engAddDays(ymd: string, n: number): string { return engFromDayNo(engDayNo(ymd) + n); }
function engDaysBetween(a: string, b: string): number { return engDayNo(b) - engDayNo(a); }
function engWeekday(ymd: string): number { return (engDayNo(ymd) + 4) % 7; } // 1970-01-01 was a Thursday
function engToMinutes(hhmm: string): number { const p = String(hhmm).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function engFromMinutes(m: number): string { return engPad(Math.floor(m / 60)) + ':' + engPad(m % 60); }
/** Minutes since 1970-01-01 00:00 site time. */
function engAt(ymd: string, hhmm: string): number { return engDayNo(ymd) * 1440 + engToMinutes(hhmm); }
function engNowMinutes(now: string): number { return engAt(now.substring(0, 10), now.substring(11, 16)) + (Number(now.substring(17, 19)) || 0) / 60; }
function engFmtTime(hhmm: string): string {
  const m = engToMinutes(hhmm); let h = Math.floor(m / 60); const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12; return h + ':' + engPad(m % 60) + ' ' + ap;
}
function engFmtDate(ymd: string): string { const p = ymd.split('-'); return ENG_DAYS[engWeekday(ymd)] + ' ' + Number(p[1]) + '/' + Number(p[2]); }
function engFmtWorkDays(days: number[]): string {
  const s = days.slice().sort((a, b) => a - b);
  let contiguous = true;
  for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1] + 1) contiguous = false;
  return contiguous && s.length > 1 ? ENG_DAYS[s[0]] + '–' + ENG_DAYS[s[s.length - 1]] : s.map((d) => ENG_DAYS[d]).join(', ');
}
function engFill(template: string, vars: { [k: string]: string }): string {
  return template.replace(/\{(\w+)\}/g, (m: string, k: string) => (vars[k] !== undefined ? vars[k] : m));
}

function engSettings(s: EngSettings | null): EngSettings {
  const out: EngSettings = JSON.parse(JSON.stringify(ENG_DEFAULTS)) as EngSettings;
  if (s) {
    const src = s as unknown as { [k: string]: number | string | number[] | string[] };
    const dst = out as unknown as { [k: string]: number | string | number[] | string[] };
    for (const k of Object.keys(dst)) if (src[k] !== undefined && src[k] !== null) dst[k] = src[k];
  }
  out.workDays = out.workDays.map((d) => Number(d));
  return out;
}

function engSlotsForDay(s: EngSettings): string[] {
  const out: string[] = [];
  for (let m = engToMinutes(s.gateOpen); m + s.slotMinutes <= engToMinutes(s.gateClose); m += s.slotMinutes) out.push(engFromMinutes(m));
  return out;
}
function engIsWorkDay(ymd: string, s: EngSettings): boolean { return s.workDays.indexOf(engWeekday(ymd)) >= 0 && s.blackoutDates.indexOf(ymd) < 0; }
function engStatus(status: string): string {
  const t = String(status || '').toLowerCase();
  return t === 'needs review' ? 'review' : t;
}
function engIsActive(r: EngBooking): boolean { const t = engStatus(r.status); return t === 'approved' || t === 'review'; }
function engSlotLoad(reqs: EngBooking[], gateId: string, date: string, slot: string, excludeId: string): number {
  return reqs.filter((r) => engIsActive(r) && String(r.id) !== excludeId && r.gateId === gateId && r.date === date && r.slot === slot).length;
}
function engStagingDays(date: string, act: EngActivity | null): string[] {
  const until = act && act.start > date ? act.start : date;
  const days: string[] = [];
  for (let d = date; d <= until; d = engAddDays(d, 1)) days.push(d);
  return days;
}
function engZonePeak(reqs: EngBooking[], zoneId: string, days: string[], excludeId: string): number {
  let peak = 0;
  for (const day of days) {
    let sum = 0;
    for (const r of reqs) {
      if (!engIsActive(r) || String(r.id) === excludeId || r.zoneId !== zoneId) continue;
      if (r.date <= day && day <= (r.stagedUntil || r.date)) sum += Number(r.pallets) || 0;
    }
    peak = Math.max(peak, sum);
  }
  return peak;
}
function engNextOpenSlot(ctx: EngContext, s: EngSettings, gateId: string, excludeId: string): EngSlot | null {
  let gate: EngGate | null = null;
  for (const g of ctx.gates) if (g.id === gateId) gate = g;
  if (!gate) return null;
  const earliest = engNowMinutes(ctx.now) + s.minNoticeHours * 60;
  let day = engFromDayNo(Math.floor(earliest / 1440));
  for (let i = 0; i < s.searchDaysForNextSlot; i++, day = engAddDays(day, 1)) {
    if (!engIsWorkDay(day, s)) continue;
    for (const slot of engSlotsForDay(s)) {
      if (engAt(day, slot) < earliest) continue;
      if (engSlotLoad(ctx.requests, gateId, day, slot, excludeId) < gate.capacityPerSlot) return { date: day, slot: slot, label: engFmtDate(day) + ' ' + engFmtTime(slot) };
    }
  }
  return null;
}

function engBlank(v: string | number | null | undefined): boolean { return v === undefined || v === null || String(v).trim() === ''; }

function engMissing(req: EngRequest): string[] {
  const required: string[][] = [
    ['subId', 'company'], ['activityId', 'look-ahead activity'], ['gateId', 'gate'], ['date', 'delivery date'],
    ['slot', 'time slot'], ['zoneId', 'staging zone'], ['material', 'material description'],
    ['quantity', 'quantity'], ['unit', 'unit'], ['pallets', 'pallet count'], ['pocName', 'onsite contact name'], ['pocPhone', 'onsite contact phone'],
  ];
  const r = req as unknown as { [k: string]: string };
  const miss: string[] = [];
  for (const pair of required) if (engBlank(r[pair[0]])) miss.push(pair[1]);
  if (!engBlank(req.quantity) && !(Number(req.quantity) > 0)) miss.push('quantity above zero');
  const pal = Number(req.pallets);
  if (!engBlank(req.pallets) && !(Math.floor(pal) === pal && pal >= 0)) miss.push('whole number of pallets');
  if (!engBlank(req.pocPhone) && String(req.pocPhone).replace(/\D/g, '').length !== 10) miss.push('10-digit phone number');
  const out: string[] = [];
  for (const m of miss) if (out.indexOf(m) < 0) out.push(m);
  return out;
}

/** evaluateRequest() from rules/rules.js. */
function engEvaluate(req: EngRequest, ctxIn: EngContext): EngResult {
  const s = engSettings(ctxIn.settings);
  const ctx = ctxIn;
  const id = String(req.id || '');
  const checks: EngCheck[] = [];
  const vars: { [k: string]: string } = {
    minNoticeHours: String(s.minNoticeHours), maxDaysBeforeInstall: String(s.maxDaysBeforeInstall), maxPalletsPerRequest: String(s.maxPalletsPerRequest),
    workDays: engFmtWorkDays(s.workDays), gateOpen: engFmtTime(s.gateOpen), gateClose: engFmtTime(s.gateClose),
  };
  let sub: EngSub | null = null; let gate: EngGate | null = null; let zone: EngZone | null = null; let act: EngActivity | null = null;
  for (const x of ctx.subs) if (x.id === req.subId) sub = x;
  for (const x of ctx.gates) if (x.id === req.gateId) gate = x;
  for (const x of ctx.zones) if (x.id === req.zoneId) zone = x;
  for (const x of ctx.activities) if (x.id === req.activityId) act = x;
  vars.pallets = engBlank(req.pallets) ? '' : String(req.pallets);
  vars.justification = String(req.justification || '').trim();
  vars.gateName = gate ? gate.name : 'that gate';
  vars.zoneName = zone ? zone.name : 'that zone';
  vars.trade = sub ? sub.trade : '';
  vars.activityFinish = act ? engFmtDate(act.finish) : '';
  let next: EngSlot | null = null; let haveNext = false;
  const add = (cid: string, label: string, status: string, code: string) => {
    const c: EngCheck = { id: cid, label: label, status: status, reason: code, title: '', remedy: '' };
    if (code) { c.title = engFill(ENG_REASONS[code].title, vars); c.remedy = engFill(ENG_REASONS[code].remedy, vars); }
    checks.push(c);
  };
  const needNext = () => {
    if (haveNext) return;
    haveNext = true;
    next = gate ? engNextOpenSlot(ctx, s, gate.id, id) : null;
    vars.nextOpen = next ? next.label : 'none in the next 3 weeks';
  };

  // 1. Required information
  const miss = engMissing(req); vars.missing = miss.join(', ');
  add('required', 'Required information', miss.length ? 'fail' : 'pass', miss.length ? 'R01' : '');
  const basicsOk = !miss.length && !!sub && !!gate && !!zone;

  // 2. Contractor active
  add('subActive', 'Contractor can book', sub && sub.suspended ? 'fail' : (sub ? 'pass' : 'skip'), sub && sub.suspended ? 'R02' : '');

  // 3-4. Look-ahead activity
  if (engBlank(req.activityId)) { add('lookahead', 'Activity is in the look-ahead', 'skip', ''); add('trade', 'Activity matches your trade', 'skip', ''); }
  else {
    add('lookahead', 'Activity is in the look-ahead', act ? 'pass' : 'fail', act ? '' : 'R03');
    if (act && sub && sub.trade) add('trade', 'Activity matches your trade', act.trade === sub.trade ? 'pass' : 'fail', act.trade === sub.trade ? '' : 'R04');
    else add('trade', 'Activity matches your trade', act && sub ? 'pass' : 'skip', '');
  }

  const haveWhen = !engBlank(req.date) && !engBlank(req.slot);
  // 5. Notice
  if (haveWhen) {
    const ok = engAt(req.date, req.slot) >= engNowMinutes(ctx.now) + s.minNoticeHours * 60;
    if (!ok) needNext();
    add('notice', s.minNoticeHours + '-hour notice', ok ? 'pass' : 'fail', ok ? '' : 'R05');
  } else add('notice', s.minNoticeHours + '-hour notice', 'skip', '');

  // 6. Gate hours
  if (haveWhen) {
    const ok = engIsWorkDay(req.date, s) && engSlotsForDay(s).indexOf(req.slot) >= 0;
    if (!ok) needNext();
    add('hours', 'Gate open at that time', ok ? 'pass' : 'fail', ok ? '' : 'R06');
  } else add('hours', 'Gate open at that time', 'skip', '');

  // 7. Slot capacity
  if (gate && haveWhen) {
    const ok = engSlotLoad(ctx.requests, gate.id, req.date, req.slot, id) < gate.capacityPerSlot;
    if (!ok) needNext();
    add('slot', 'Time slot has room', ok ? 'pass' : 'fail', ok ? '' : 'R07');
  } else add('slot', 'Time slot has room', 'skip', '');

  // 8. Staging zone capacity
  const staging: string[] = engBlank(req.date) ? [] : engStagingDays(req.date, act);
  if (zone && staging.length && !engBlank(req.pallets)) {
    const peak = engZonePeak(ctx.requests, zone.id, staging, id);
    const left = Math.max(0, zone.capacityPallets - peak); vars.zoneLeft = String(left);
    const ok = Number(req.pallets) <= left;
    add('zone', 'Staging zone has room', ok ? 'pass' : 'fail', ok ? '' : 'R08');
  } else add('zone', 'Staging zone has room', 'skip', '');

  // 9. Not after the activity finishes
  if (act && !engBlank(req.date)) {
    const ok = req.date <= act.finish;
    add('finish', 'Delivery before activity finishes', ok ? 'pass' : 'fail', ok ? '' : 'R09');
  } else add('finish', 'Delivery before activity finishes', 'skip', '');

  // 10. Within N days of install (soft, with justification)
  const earlyLabel = 'Within ' + s.maxDaysBeforeInstall + ' days of install';
  if (act && !engBlank(req.date)) {
    const daysEarly = engDaysBetween(req.date, act.start); vars.daysEarly = String(daysEarly);
    vars.earliestDate = engFmtDate(engAddDays(act.start, -s.maxDaysBeforeInstall));
    if (daysEarly <= s.maxDaysBeforeInstall) add('early', earlyLabel, 'pass', '');
    else if (!vars.justification) add('early', earlyLabel, 'fail', 'R10');
    else add('early', earlyLabel, 'flag', 'F01');
  } else add('early', earlyLabel, 'skip', '');

  // 11. Pallet limit (soft)
  const sizeLabel = 'Normal size (' + s.maxPalletsPerRequest + ' pallets or fewer)';
  if (!engBlank(req.pallets) && !isNaN(Number(req.pallets))) {
    const ok = Number(req.pallets) <= s.maxPalletsPerRequest;
    add('size', sizeLabel, ok ? 'pass' : 'flag', ok ? '' : 'F02');
  } else add('size', sizeLabel, 'skip', '');

  // 12. Possible duplicate (soft)
  if (!engBlank(req.subId) && !engBlank(req.activityId) && !engBlank(req.date)) {
    let other: EngBooking | null = null;
    for (const r of ctx.requests) {
      if (other) break;
      if (String(r.id) !== id && (engIsActive(r) || r.arrived) && r.subId === req.subId && r.activityId === req.activityId &&
        Math.abs(engDaysBetween(r.date, req.date)) <= s.duplicateWindowDays) other = r;
    }
    vars.otherCode = other ? (other.passCode || String(other.id)) : '';
    add('duplicate', 'Not a repeat of another delivery', other ? 'flag' : 'pass', other ? 'F03' : '');
  } else add('duplicate', 'Not a repeat of another delivery', 'skip', '');

  const fails = checks.filter((c) => c.status === 'fail');
  const flags = checks.filter((c) => c.status === 'flag');
  const reasons = fails.concat(flags);
  const outcome = fails.length ? 'rejected' : flags.length ? 'review' : 'approved';
  return {
    outcome: outcome,
    status: outcome === 'rejected' ? 'Rejected' : outcome === 'review' ? 'Needs review' : 'Approved',
    ready: basicsOk,
    codes: reasons.map((c) => c.reason).join(';'),
    reasonText: reasons.map((c) => c.title + '. ' + c.remedy).join('\n'),
    reasons: reasons, checks: checks,
    stagedUntil: staging.length ? staging[staging.length - 1] : '',
    nextOpen: next,
  };
}

/** The capacity re-check made just before a pass is issued (an admin may approve after the slot filled). */
function engRecheck(req: EngRequest, ctx: EngContext): { lost: string; reasonText: string; nextOpen: EngSlot | null } {
  const r = engEvaluate(req, ctx);
  for (const c of r.checks) {
    if (c.status === 'fail' && (c.reason === 'R07' || c.reason === 'R08')) {
      const s = engSettings(ctx.settings);
      const n = engNextOpenSlot(ctx, s, req.gateId, String(req.id || ''));
      return { lost: c.reason, reasonText: c.title + '. ' + c.remedy, nextOpen: n };
    }
  }
  return { lost: '', reasonText: '', nextOpen: null };
}
