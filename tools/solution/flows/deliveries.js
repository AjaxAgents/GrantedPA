// F01 Submit request · F04 Review decision · F05 Gate event · F06 Cancel · F10 Emergency pass
'use strict';
const D = require('../dsl');
const C = require('./common');

const UNITS = ['pcs', 'sections', 'reels', 'units', 'LF', 'crates', 'skids', 'boxes', 'load'];
const NL = "decodeUriComponent('%0A')";
const logLine = (existingExpr, textExpr) => `@{concat(coalesce(${existingExpr}, ''), ${C.nowLocal()}, ' ', ${textExpr}, ${NL})}`;

// ------------------------------------------------------------------ F01 Submit request
function F01() {
  D.begin();
  const I = (k) => `outputs('In')?['${k}']`;
  const txt = (k, max) => `substring(trim(string(coalesce(${I(k)}, ''))), 0, min(${max}, length(trim(string(coalesce(${I(k)}, ''))))))`;
  const E = (k) => `variables('Existing')?['${k}']`;
  const R = (k) => `outputs('Result')?['${k}']`;
  const pid = C.pid();
  const today = C.todayLocal();
  const steps = [
    D.initVar('Init_existing', 'Existing', 'object', {}),
    C.start('delivery.request'),
    D.compose('ReqId', `@int(coalesce(${I('id')}, 0))`),
    D.cond('Is_reschedule', "@greater(outputs('ReqId'), 0)", [
      D.spGetById('Get_existing', 'DeliveryRequests', "outputs('ReqId')"),
      D.cond('Can_change', `@and(equals(body('Get_existing')?['ProjectId'], ${pid}), or(equals(body('Get_existing')?['SubcontractorId'], ${C.person('companyKey')}), equals(${C.role()}, 'Admin')), contains(createArray('Approved', 'Needs review', 'Rejected'), body('Get_existing')?['Status']))`,
        [D.setVar('Keep_existing', 'Existing', "@body('Get_existing')")],
        D.fail('Cannot_change', D.lit('That request can’t be changed now.'))),
    ], []),
    D.compose('SubId', `@if(greater(outputs('ReqId'), 0), ${E('SubcontractorId')}, ${C.person('companyKey')})`),
    D.compose('SubName', `@if(greater(outputs('ReqId'), 0), ${E('SubcontractorName')}, ${C.person('company')})`),
    D.compose('Clean', {
      activityId: `@${txt('activityId', 40)}`, gateId: `@${txt('gateId', 40)}`, date: `@${txt('date', 10)}`, slot: `@${txt('slot', 5)}`, zoneId: `@${txt('zoneId', 40)}`,
      material: `@${txt('material', 120)}`, unit: `@if(contains(createArray(${UNITS.map((u) => `'${u}'`).join(', ')}), string(coalesce(${I('unit')}, ''))), string(${I('unit')}), '')`,
      quantity: `@string(coalesce(${I('quantity')}, ''))`, pallets: `@string(coalesce(${I('pallets')}, ''))`, weightLbs: `@coalesce(${I('weightLbs')}, 0)`,
      carrier: `@${txt('carrier', 80)}`, truck: `@${txt('truck', 40)}`, pocName: `@${txt('pocName', 80)}`, pocPhone: `@${txt('pocPhone', 20)}`, justification: `@${txt('justification', 500)}`,
    }),
    D.par(
      [D.spGet('Get_gates', 'Gates', `$filter=ProjectId eq ${D.q(pid)} and Active eq 1&$top=200`)],
      [D.spGet('Get_zones', 'StagingZones', `$filter=ProjectId eq ${D.q(pid)} and Active eq 1&$top=200`)],
      [D.spGet('Get_activities', 'Activities', `$filter=ProjectId eq ${D.q(pid)} and IsCurrent eq 1&$top=2000`)],
      [D.spGet('Get_company', 'Companies', `$filter=ProjectId eq ${D.q(pid)} and CompanyKey eq ${D.q("outputs('SubId')")}&$top=1`)],
      [D.spGet('Get_company_members', 'ProjectMembers', `$filter=ProjectId eq ${D.q(pid)} and CompanyKey eq ${D.q("outputs('SubId')")} and Status eq 'Active'&$select=Trade&$top=500`)],
      [D.spGet('Get_bookings', 'DeliveryRequests', `$filter=ProjectId eq ${D.q(pid)} and DeliveryDayNo ge @{${C.dayNo(`addDays(${today}, -60, 'yyyy-MM-dd')`)}}&$select=ID,SubcontractorId,ActivityId,GateId,DeliveryDate,SlotStart,ZoneId,Pallets,StagedUntil,Status,PassCode&$top=5000`)],
    ),
    D.filter('Trades', "@body('Get_company_members')?['value']", "@not(empty(item()?['Trade']))"),
    D.select('Ctx_gates', "@body('Get_gates')?['value']", { id: "@item()?['GateId']", name: "@item()?['Title']", capacityPerSlot: "@coalesce(item()?['CapacityPerSlot'], 1)" }),
    D.select('Ctx_zones', "@body('Get_zones')?['value']", { id: "@item()?['ZoneId']", name: "@item()?['Title']", capacityPallets: "@coalesce(item()?['CapacityPallets'], 0)" }),
    D.select('Ctx_activities', "@body('Get_activities')?['value']", { id: "@item()?['ActivityId']", name: "@item()?['Title']", trade: "@coalesce(item()?['Trade'], '')", start: "@item()?['StartDate']", finish: "@item()?['FinishDate']" }),
    D.select('Ctx_bookings', "@body('Get_bookings')?['value']", {
      id: "@string(item()?['ID'])", subId: "@coalesce(item()?['SubcontractorId'], '')", activityId: "@coalesce(item()?['ActivityId'], '')", gateId: "@coalesce(item()?['GateId'], '')",
      date: "@coalesce(item()?['DeliveryDate'], '')", slot: "@coalesce(item()?['SlotStart'], '')", zoneId: "@coalesce(item()?['ZoneId'], '')", pallets: "@coalesce(item()?['Pallets'], 0)",
      stagedUntil: "@coalesce(item()?['StagedUntil'], item()?['DeliveryDate'])", status: "@coalesce(item()?['Status'], '')", passCode: "@coalesce(item()?['PassCode'], '')", arrived: false,
    }),
    D.compose('Engine_input', {
      req: {
        id: "@if(greater(outputs('ReqId'), 0), string(outputs('ReqId')), 'NEW')", subId: "@outputs('SubId')",
        activityId: "@outputs('Clean')?['activityId']", gateId: "@outputs('Clean')?['gateId']", date: "@outputs('Clean')?['date']", slot: "@outputs('Clean')?['slot']",
        zoneId: "@outputs('Clean')?['zoneId']", material: "@outputs('Clean')?['material']", quantity: "@outputs('Clean')?['quantity']", unit: "@outputs('Clean')?['unit']",
        pallets: "@outputs('Clean')?['pallets']", pocName: "@outputs('Clean')?['pocName']", pocPhone: "@outputs('Clean')?['pocPhone']", justification: "@outputs('Clean')?['justification']",
      },
      ctx: {
        now: `@${C.nowLocal()}`, settings: `@${C.auth('project.settings')}`, gates: "@body('Ctx_gates')", zones: "@body('Ctx_zones')",
        subs: [{ id: "@outputs('SubId')", name: "@outputs('SubName')", trade: "@coalesce(first(body('Trades'))?['Trade'], '')", suspended: "@equals(first(body('Get_company')?['value'])?['Suspended'], true)" }],
        activities: "@body('Ctx_activities')", requests: "@body('Ctx_bookings')",
      },
    }),
    D.engine('Run_rules', 'evaluate', "@{outputs('Engine_input')}"),
    D.compose('Result', `@${D.engineOut('Run_rules')}`),
    D.filter('Picked_activity', "@body('Ctx_activities')", "@equals(item()?['id'], outputs('Clean')?['activityId'])"),
    D.compose('Fields', {
      ProjectId: `@{${pid}}`, SubcontractorId: "@{outputs('SubId')}", SubcontractorName: "@{outputs('SubName')}",
      ActivityId: "@{outputs('Clean')?['activityId']}", ActivityName: "@{coalesce(first(body('Picked_activity'))?['name'], '')}",
      GateId: "@{outputs('Clean')?['gateId']}", DeliveryDate: "@{outputs('Clean')?['date']}",
      DeliveryDayNo: "@int(concat('0', replace(outputs('Clean')?['date'], '-', '')))", SlotStart: "@{outputs('Clean')?['slot']}",
      DeliveryStart: `@{convertToUtc(concat(if(equals(length(outputs('Clean')?['date']), 10), outputs('Clean')?['date'], '2000-01-01'), 'T', if(equals(length(outputs('Clean')?['slot']), 5), outputs('Clean')?['slot'], '00:00'), ':00'), ${C.tz()})}`,
      ZoneId: "@{outputs('Clean')?['zoneId']}", Material: "@{outputs('Clean')?['material']}",
      Quantity: "@if(empty(outputs('Clean')?['quantity']), null, float(if(empty(outputs('Clean')?['quantity']), '0', outputs('Clean')?['quantity'])))", Unit: "@{outputs('Clean')?['unit']}",
      Pallets: "@if(empty(outputs('Clean')?['pallets']), null, float(if(empty(outputs('Clean')?['pallets']), '0', outputs('Clean')?['pallets'])))", WeightLbs: "@float(coalesce(outputs('Clean')?['weightLbs'], 0))",
      Carrier: "@{outputs('Clean')?['carrier']}", TruckNumber: "@{outputs('Clean')?['truck']}", ContactName: "@{outputs('Clean')?['pocName']}",
      ContactPhone: "@{outputs('Clean')?['pocPhone']}", EarlyJustification: "@{outputs('Clean')?['justification']}",
      Status: `@{${R('status')}}`, ReasonCodes: `@{${R('codes')}}`, ReasonText: `@{${R('reasonText')}}`,
      NextOpenSlot: `@{coalesce(${R('nextOpen')}?['label'], '')}`, StagedUntil: `@{coalesce(${R('stagedUntil')}, outputs('Clean')?['date'])}`,
      SubmittedByEmail: `@{${C.caller()}}`, SubmittedByName: `@{concat(${C.person('first')}, ' ', ${C.person('last')})}`, SubmittedAt: '@utcNow()',
      DecidedBy: 'Rules engine', DecidedAt: '@utcNow()', Maintenance: `@equals(${C.auth('maintenance')}, true)`, IsOverride: false,
      PassCode: "@{if(greater(outputs('ReqId'), 0), '', '')}", PreviousPassCode: `@{if(and(greater(outputs('ReqId'), 0), not(empty(${E('PassCode')}))), ${E('PassCode')}, coalesce(${E('PreviousPassCode')}, ''))}`,
      ReviewAlertSentAt: null, EscalatedAt: null,
      MessageLog: logLine(E('MessageLog'), `concat(if(greater(outputs('ReqId'), 0), 'Rescheduled. ', ''), ${R('status')}, if(empty(${R('reasonText')}), '', concat(': ', ${R('reasonText')})))`),
    }),
    D.initVar('Init_id', 'SavedId', 'integer', 0),
    D.cond('New_request', "@equals(outputs('ReqId'), 0)", [
      D.spHttp('Create_request', 'POST', D.list('DeliveryRequests'), "@{setProperty(outputs('Fields'), 'Title', 'DR-new')}"),
      D.setVar('Keep_new_id', 'SavedId', "@body('Create_request')?['ID']"),
      D.spUpdate('Name_request', 'DeliveryRequests', "variables('SavedId')", { Title: "@{concat('DR-', variables('SavedId'))}" }),
    ], [
      D.spHttp('Update_request', 'POST', `${D.list('DeliveryRequests')}(@{outputs('ReqId')})`, "@{outputs('Fields')}", { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }),
      D.setVar('Keep_old_id', 'SavedId', "@outputs('ReqId')"),
    ]),
    D.select('Reasons_out', `@${R('reasons')}`, { code: "@item()?['reason']", title: "@item()?['title']", remedy: "@item()?['remedy']" }),
    D.okReply('Answer', {
      id: "@variables('SavedId')", outcome: `@${R('outcome')}`, status: `@${R('status')}`, reasons: "@body('Reasons_out')", nextOpen: `@${R('nextOpen')}`,
      checks: `@${R('checks')}`,
    }, false),
    // After answering the app: emails and the pass.
    D.sw('Next', `@${R('status')}`, {
      Rejected: [D.child('Tell_rejected', 'C2', [`@{${pid}}`, 'rejected', "@{variables('SavedId')}", '', ''])],
      'Needs review': [
        D.child('Tell_review', 'C2', [`@{${pid}}`, 'review', "@{variables('SavedId')}", '', '']),
        D.spUpdate('Mark_alerted', 'DeliveryRequests', "variables('SavedId')", { ReviewAlertSentAt: '@utcNow()' }),
      ],
      Approved: [D.child('Issue_pass', 'C5', ["@{variables('SavedId')}"])],
    }, []),
  ];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

// ------------------------------------------------------------------ F04 Review decision
function F04() {
  D.begin();
  const I = (k) => `outputs('In')?['${k}']`;
  const G = (k) => `body('Get_request')?['${k}']`;
  const pid = C.pid();
  const steps = [
    C.start('delivery.review'),
    D.compose('ReqId', `@int(coalesce(${I('requestId')}, 0))`),
    D.spGetById('Get_request', 'DeliveryRequests', "outputs('ReqId')"),
    D.cond('Waiting', `@and(equals(${G('ProjectId')}, ${pid}), equals(${G('Status')}, 'Needs review'))`, [],
      D.fail('Already_decided', D.lit('Someone already decided this request.'))),
    D.compose('Note', `@substring(trim(string(coalesce(${I('note')}, ''))), 0, min(500, length(trim(string(coalesce(${I('note')}, ''))))))`),
    D.cond('Approve', `@equals(${I('decision')}, 'approve')`, [
      ...D.spUpdate('Mark_approved', 'DeliveryRequests', "outputs('ReqId')", {
        Status: 'Approved', DecidedBy: `@{${C.actorName()}}`, DecidedAt: '@utcNow()', ReviewNote: "@{outputs('Note')}",
        MessageLog: logLine(G('MessageLog'), `concat('Approved by ', ${C.actorName()})`),
      }),
      D.okReply('Approved_reply', { outcome: 'Approved', message: 'Approved. The gate pass is on its way.' }, false),
      D.child('Issue_pass', 'C5', ["@{outputs('ReqId')}"]),
      C.audit('Audit_approved', 'delivery.approved', pid, "string(outputs('ReqId'))", "outputs('Note')"),
    ], [
      ...D.spUpdate('Mark_rejected', 'DeliveryRequests', "outputs('ReqId')", {
        Status: 'Rejected', ReasonCodes: 'GC',
        ReasonText: "@{if(empty(outputs('Note')), 'Not approved by the project admin. Contact the project admin for details, then submit a new request.', concat('Not approved by the project admin. ', outputs('Note')))}",
        DecidedBy: `@{${C.actorName()}}`, DecidedAt: '@utcNow()', ReviewNote: "@{outputs('Note')}",
        MessageLog: logLine(G('MessageLog'), `concat('Rejected by ', ${C.actorName()})`),
      }),
      D.okReply('Rejected_reply', { outcome: 'Rejected', message: 'Rejected. The contractor has been told why.' }, false),
      D.child('Tell_rejected', 'C2', [`@{${pid}}`, 'rejected', "@{outputs('ReqId')}", '', '']),
      C.audit('Audit_rejected', 'delivery.rejected', pid, "string(outputs('ReqId'))", "outputs('Note')"),
    ]),
  ];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

// ------------------------------------------------------------------ F05 Gate event
function F05() {
  D.begin();
  const I = (k) => `outputs('In')?['${k}']`;
  const P = (k) => `variables('Pass')?['${k}']`;
  const Q = (k) => `variables('Req')?['${k}']`;
  const pid = C.pid();
  const TZ = C.tz();
  const local = (iso, fmt) => `formatDateTime(convertFromUtc(coalesce(${iso}, '2000-01-01T00:00:00Z'), ${TZ}), '${fmt}')`;
  const words = {
    G00: ['Approved delivery', "Admit the truck and direct it to @{coalesce(variables('Pass')?['ZoneName'], 'staging')}."],
    G01: ['No approved delivery for this code', `The contractor must submit a delivery request with @{${C.S('minNoticeHours')}} hours’ notice, or the project admin can issue an emergency pass.`],
    G02: ['This delivery was cancelled', 'The contractor must submit a new delivery request.'],
    G03: [`Pass already used at @{${local(P('UsedAt'), 'h:mm tt')}}`, 'Each pass admits one truck. A second truck needs its own approved request.'],
    G04: [`Approved for @{formatDateTime(concat(coalesce(${Q('DeliveryDate')}, '2000-01-01'), 'T00:00:00'), 'ddd M/d')}, not today`, `Return on @{formatDateTime(concat(coalesce(${Q('DeliveryDate')}, '2000-01-01'), 'T00:00:00'), 'ddd M/d')} between @{${local(P('WindowOpen'), 'h:mm tt')}} and @{${local(P('WindowClose'), 'h:mm tt')}}, or reschedule in the app.`],
    G05: [`Too early: window opens at @{${local(P('WindowOpen'), 'h:mm tt')}}`, `Wait off-site until @{${local(P('WindowOpen'), 'h:mm tt')}}, or the project admin can approve early entry.`],
    G06: [`Too late: window closed at @{${local(P('WindowClose'), 'h:mm tt')}}`, 'Reschedule in the app, or the project admin can issue an emergency pass.'],
    G07: ['Contractor’s booking privileges are suspended', 'Contact the project admin.'],
  };
  const wordsObj = {}; for (const [k, [t, r]] of Object.entries(words)) wordsObj[k] = { title: t, remedy: r };
  const when = "outputs('When')";
  const steps = [
    D.initVar('Init_pass', 'Pass', 'object', {}),
    D.initVar('Init_req', 'Req', 'object', {}),
    C.start('gate.scan'),
    D.compose('Code', `@toUpper(trim(coalesce(${I('passCode')}, '')))`),
    D.compose('Guard', `@${C.actorName()}`),
    D.compose('When', `@if(and(equals(${I('source')}, 'Offline sync'), not(empty(${I('deviceTime')}))), ${I('deviceTime')}, utcNow())`),
    D.spGet('Get_pass', 'GatePasses', `$filter=Title eq ${D.q("outputs('Code')")} and ProjectId eq ${D.q(pid)}&$top=1`),
    D.cond('Pass_found', "@not(empty(body('Get_pass')?['value']))", [
      D.setVar('Keep_pass', 'Pass', "@first(body('Get_pass')?['value'])"),
      D.spGetById('Get_request', 'DeliveryRequests', "variables('Pass')?['RequestId']"),
      D.setVar('Keep_req', 'Req', "@body('Get_request')"),
      D.spGet('Get_company', 'Companies', `$filter=ProjectId eq ${D.q(pid)} and CompanyKey eq ${D.q(Q('SubcontractorId'))}&$top=1`),
      D.setVar('Keep_suspended', 'Req', `@setProperty(variables('Req'), 'Suspended', equals(first(body('Get_company')?['value'])?['Suspended'], true))`),
    ], []),
    D.compose('Verdict', `@if(or(empty(variables('Pass')), empty(variables('Req'))), 'G01', if(or(equals(${P('Status')}, 'Void'), equals(${Q('Status')}, 'Cancelled')), 'G02', if(equals(${P('Status')}, 'Used'), 'G03', if(and(equals(${Q('Suspended')}, true), not(equals(${P('IsOverride')}, true))), 'G07', if(not(equals(${Q('DeliveryDate')}, convertFromUtc(${when}, ${TZ}, 'yyyy-MM-dd'))), 'G04', if(less(ticks(${when}), ticks(coalesce(${P('WindowOpen')}, '2000-01-01T00:00:00Z'))), 'G05', if(greater(ticks(${when}), ticks(coalesce(${P('WindowClose')}, '2000-01-01T00:00:00Z'))), 'G06', 'G00')))))))`),
    D.compose('Words', wordsObj),
    D.compose('Log_base', {
      Title: "@{outputs('Code')}", ProjectId: `@{${pid}}`, ScannedAt: `@{${when}}`, Guard: "@{outputs('Guard')}", GuardEmail: `@{${C.caller()}}`,
      GateId: `@{coalesce(${I('gateId')}, '')}`, PassId: `@coalesce(${P('ID')}, 0)`, RequestId: `@coalesce(${Q('ID')}, 0)`, SubcontractorId: `@{coalesce(${Q('SubcontractorId')}, '')}`,
      Source: `@{if(contains(createArray('Scan', 'Typed', 'List', 'Offline sync'), ${I('source')}), ${I('source')}, 'Typed')}`,
      DeviceTime: `@{coalesce(${I('deviceTime')}, utcNow())}`, Maintenance: `@equals(${C.auth('maintenance')}, true)`,
    }),
    D.cond('Admit', `@equals(${I('action')}, 'admit')`, [
      D.cond('Checks_pass', "@equals(outputs('Verdict'), 'G00')", [
        ...D.spUpdate('Mark_used', 'GatePasses', P('ID'), { Status: 'Used', UsedAt: `@{${when}}`, UsedBy: "@{outputs('Guard')}" }),
        D.spHttp('Log_green', 'POST', D.list('GateLog'), "@{setProperty(setProperty(setProperty(setProperty(outputs('Log_base'), 'Result', 'Green'), 'ReasonCode', 'G00'), 'Action', 'Admitted'), 'ReasonText', 'Approved delivery')}"),
        ...D.spUpdate('Note_arrival', 'DeliveryRequests', Q('ID'), { MessageLog: logLine(Q('MessageLog'), "concat('Admitted at gate by ', outputs('Guard'))") }),
        D.okReply('Admitted', { message: `@{concat('Admitted ', ${local(when, 'h:mm tt')}, '. Direct the truck to ', coalesce(${P('ZoneName')}, 'staging'), '.')}`, code: 'G00' }),
      ], [
        D.fail('Red', "concat(outputs('Words')?[outputs('Verdict')]?['title'], '. ', outputs('Words')?[outputs('Verdict')]?['remedy'])"),
      ]),
    ], []),
    // Turn away: log it, never change the pass (a truck that came early can come back in its window), tell everyone.
    D.compose('Deny_code', `@coalesce(${I('reasonCode')}, outputs('Verdict'))`),
    D.compose('Deny_title', `@coalesce(${I('reasonTitle')}, outputs('Words')?[outputs('Verdict')]?['title'])`),
    D.compose('Deny_remedy', `@coalesce(${I('remedy')}, outputs('Words')?[outputs('Verdict')]?['remedy'])`),
    D.spHttp('Log_red', 'POST', D.list('GateLog'), "@{setProperty(setProperty(setProperty(setProperty(outputs('Log_base'), 'Result', 'Red'), 'ReasonCode', outputs('Deny_code')), 'Action', 'Turned away'), 'ReasonText', substring(outputs('Deny_title'), 0, min(250, length(outputs('Deny_title')))))}"),
    D.okReply('Logged', { message: `@{concat('Logged ', ${local('utcNow()', 'h:mm tt')}, '. The contractor, gate team and project admins were emailed the reason and what has to happen.')}` }, false),
    D.child('Tell_turned_away', 'C2', [`@{${pid}}`, 'turnedAway', `@{coalesce(${Q('ID')}, 0)}`,
      "@{string(addProperty(addProperty(addProperty(addProperty(json('{}'), 'reasonTitle', outputs('Deny_title')), 'remedy', outputs('Deny_remedy')), 'guard', outputs('Guard')), 'scannedCode', outputs('Code')))}", '']),
  ];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

// ------------------------------------------------------------------ F06 Cancel delivery
function F06() {
  D.begin();
  const G = (k) => `body('Get_request')?['${k}']`;
  const pid = C.pid();
  const steps = [
    C.start('delivery.viewOwn'),
    D.compose('ReqId', "@int(coalesce(outputs('In')?['requestId'], 0))"),
    D.spGetById('Get_request', 'DeliveryRequests', "outputs('ReqId')"),
    D.cond('Mine', `@and(equals(${G('ProjectId')}, ${pid}), or(equals(${G('SubcontractorId')}, ${C.person('companyKey')}), equals(${C.role()}, 'Admin')))`, [],
      D.fail('Not_mine', D.lit('That delivery isn’t yours to cancel.'))),
    D.cond('Cancellable', `@contains(createArray('Approved', 'Needs review'), ${G('Status')})`, [], D.fail('Not_cancellable', D.lit('Only approved or waiting deliveries can be cancelled.'))),
    D.spGet('Get_pass', 'GatePasses', `$filter=Title eq ${D.q(`coalesce(${G('PassCode')}, '-')`)}&$top=1`),
    D.cond('Already_used', "@equals(first(body('Get_pass')?['value'])?['Status'], 'Used')", D.fail('Used', D.lit('This truck was already admitted.')), []),
    D.spUpdate('Mark_cancelled', 'DeliveryRequests', "outputs('ReqId')", {
      Status: 'Cancelled', CancelledAt: '@utcNow()', MessageLog: logLine(G('MessageLog'), `concat('Cancelled by ', ${C.actorName()})`),
    }),
    D.foreach('Void_pass', "@body('Get_pass')?['value']", [
      D.spUpdate('Void_one', 'GatePasses', "items('Void_pass')?['ID']", { Status: 'Void', VoidedAt: '@utcNow()', VoidReason: 'Cancelled' }),
    ]),
    D.okReply('Cancelled', { message: 'Delivery cancelled. The gate team has been told.' }, false),
    D.child('Tell_cancelled', 'C2', [`@{${pid}}`, 'cancelled', "@{outputs('ReqId')}", '', '']),
  ];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

// ------------------------------------------------------------------ F10 Emergency pass
function F10() {
  D.begin();
  const I = (k) => `outputs('In')?['${k}']`;
  const pid = C.pid();
  const today = C.todayLocal();
  const steps = [
    C.start('delivery.emergencyPass'),
    D.par(
      [D.spGet('Get_company_members', 'ProjectMembers', `$filter=ProjectId eq ${D.q(pid)} and CompanyKey eq ${D.q(I('subId'))} and Status eq 'Active'&$top=50`)],
      [D.spGet('Get_gate', 'Gates', `$filter=Key eq '@{encodeUriComponent(concat(${pid}, '|', coalesce(${I('gateId')}, '')))}' and Active eq 1&$top=1`)],
      [D.spGet('Get_zone', 'StagingZones', `$filter=Key eq '@{encodeUriComponent(concat(${pid}, '|', coalesce(${I('zoneId')}, '')))}' and Active eq 1&$top=1`)],
    ),
    D.compose('Contact', "@first(body('Get_company_members')?['value'])"),
    D.cond('Valid', `@and(not(empty(outputs('Contact'))), not(empty(body('Get_gate')?['value'])), not(empty(body('Get_zone')?['value'])), not(empty(trim(coalesce(${I('material')}, '')))), not(empty(${I('slot')})))`, [],
      D.fail('Invalid', D.lit('Pick a company on this project, a gate, a zone, a time and describe the load.'))),
    D.spHttp('Create_request', 'POST', D.list('DeliveryRequests'), `@{outputs('Emergency_fields')}`),
    D.spUpdate('Name_request', 'DeliveryRequests', "body('Create_request')?['ID']", { Title: "@{concat('DR-', body('Create_request')?['ID'])}" }),
    D.okReply('Issued', { requestId: "@body('Create_request')?['ID']", message: 'Emergency pass issued. The code appears here in a moment.' }, false),
    D.child('Issue_pass', 'C5', ["@{body('Create_request')?['ID']}"]),
    C.audit('Audit_emergency', 'delivery.emergencyPass', pid, "string(body('Create_request')?['ID'])", `concat(${I('subId')}, ' ', ${I('slot')})`),
  ];
  // Fields for the request (defined before Create_request).
  const fields = D.compose('Emergency_fields', {
    Title: 'DR-new', ProjectId: `@{${pid}}`, SubcontractorId: `@{${I('subId')}}`, SubcontractorName: "@{coalesce(outputs('Contact')?['Company'], outputs('In')?['subId'])}",
    ActivityId: 'EMERGENCY', ActivityName: 'Emergency pass', GateId: `@{${I('gateId')}}`, DeliveryDate: `@{${today}}`, DeliveryDayNo: `@${C.dayNo(today)}`,
    SlotStart: `@{${I('slot')}}`, DeliveryStart: `@{convertToUtc(concat(${today}, 'T', ${I('slot')}, ':00'), ${C.tz()})}`, ZoneId: `@{${I('zoneId')}}`,
    Material: `@{trim(${I('material')})}`, Quantity: 1, Unit: 'load', Pallets: `@float(coalesce(${I('pallets')}, 0))`,
    ContactName: "@{coalesce(outputs('Contact')?['FullName'], '')}", ContactPhone: "@{coalesce(outputs('Contact')?['Phone'], '')}",
    Status: 'Approved', IsOverride: true, ReasonCodes: 'EM', ReasonText: `@{concat('Emergency pass issued by ', ${C.actorName()})}`,
    DecidedBy: `@{concat(${C.actorName()}, ' (emergency)')}`, DecidedAt: '@utcNow()', StagedUntil: `@{${today}}`,
    SubmittedByEmail: "@{coalesce(outputs('Contact')?['Email'], '')}", SubmittedByName: `@{${C.actorName()}}`, SubmittedAt: '@utcNow()',
    Maintenance: `@equals(${C.auth('maintenance')}, true)`,
  });
  const flatSteps = D.flat(steps);
  flatSteps.splice(flatSteps.findIndex((s) => s[0] === 'Create_request'), 0, fields);
  return D.flow(D.appTrigger(), D.tryCatch(flatSteps));
}

module.exports = { F01, F04, F05, F06, F10 };
