// Child flows: C1 Authorize, C2 Send notices, C4 Onboard person, C5 Issue gate pass.
'use strict';
const D = require('../dsl');
const C = require('./common');

// ------------------------------------------------------------------ C1 Authorize
function C1() {
  D.begin();
  const caller = `toLower(trim(coalesce(${D.childIn(0)}, '')))`;
  const pidIn = `trim(coalesce(${D.childIn(1)}, ''))`;
  const viewAs = `coalesce(${D.childIn(2)}, '')`;
  const action = `coalesce(${D.childIn(3)}, '')`;
  const setting = (k) => D.filter('Setting_' + k, "@body('Get_settings')?['value']", `@equals(item()?['Title'], '${k}')`);
  const steps = [
    D.par(
      [D.spGet('Get_person', 'People', `$filter=Email eq ${D.q(caller)} and Status ne 'Deleted'&$top=1`)],
      [D.spGet('Get_settings', 'AppSettings', '$select=Title,Value&$top=200')],
    ),
    D.compose('Person', `@${D.firstRow('Get_person')}`),
    setting('AjaxDomain'), setting('SupportEmail'), setting('AppLink'),
    D.compose('Settings', {
      homeDomain: "@toLower(trim(coalesce(first(body('Setting_AjaxDomain'))?['Value'], '')))",
      supportEmail: "@coalesce(first(body('Setting_SupportEmail'))?['Value'], '')",
      appLink: "@coalesce(first(body('Setting_AppLink'))?['Value'], '')",
    }),
    D.cond('Has_profile', "@not(empty(outputs('Person')))", [], [
      D.cond('Profile_optional', `@or(equals(${action}, 'session'), equals(${action}, 'profile.create'))`,
        D.okReply('Needs_profile', { needsProfile: true, email: `@${caller}`, settings: "@outputs('Settings')" }),
        D.fail('No_profile', D.lit('Finish setting up your Granted profile first.'))),
    ]),
    D.cond('Needs_touch', "@or(not(equals(outputs('Person')?['Status'], 'Active')), less(ticks(coalesce(outputs('Person')?['LastSeenAt'], '2000-01-01T00:00:00Z')), ticks(addHours(utcNow(), -1))))",
      D.spUpdate('Touch_person', 'People', "outputs('Person')?['ID']", { Status: 'Active', LastSeenAt: '@utcNow()' }), []),
    D.compose('PersonOut', {
      id: "@outputs('Person')?['ID']", email: `@${caller}`, first: "@coalesce(outputs('Person')?['FirstName'], '')", last: "@coalesce(outputs('Person')?['LastName'], '')",
      phone: "@coalesce(outputs('Person')?['Phone'], '')", company: "@coalesce(outputs('Person')?['Company'], '')", companyKey: "@coalesce(outputs('Person')?['CompanyKey'], '')",
      isHome: `@endsWith(${caller}, concat('@', outputs('Settings')?['homeDomain']))`, isAdminAccount: "@equals(outputs('Person')?['IsAdminAccount'], true)",
    }),
    D.cond('Session_only', `@empty(${pidIn})`, D.okReply('Session_ok', { person: "@outputs('PersonOut')", settings: "@outputs('Settings')" }), []),
    D.par(
      [D.spGet('Get_project', 'Projects', `$filter=ProjectId eq ${D.q(pidIn)} and Deleted eq 0&$top=1`)],
      [D.spGet('Get_member', 'ProjectMembers', `$filter=ProjectId eq ${D.q(pidIn)} and Email eq ${D.q(caller)} and Status eq 'Active'&$top=1`)],
    ),
    D.compose('Project', `@${D.firstRow('Get_project')}`),
    D.compose('Member', `@${D.firstRow('Get_member')}`),
    D.cond('Project_exists', "@empty(outputs('Project'))", D.fail('No_project', D.lit('That project no longer exists.')), []),
    D.cond('Is_member', "@empty(outputs('Member'))", D.fail('Not_member', D.lit('You’re not on this project.')), []),
    D.compose('CanMaintain', "@and(equals(outputs('Person')?['IsAdminAccount'], true), equals(outputs('Member')?['Role'], 'Admin'))"),
    D.compose('Role', `@if(and(outputs('CanMaintain'), contains(createArray('Admin', 'Contractor', 'Access Control'), ${viewAs})), ${viewAs}, outputs('Member')?['Role'])`),
    D.compose('Maintenance', `@and(outputs('CanMaintain'), not(empty(${viewAs})), not(equals(${viewAs}, 'Admin')))`),
    D.compose('Allowed', {
      'delivery.request': ['Contractor', 'Admin'], 'delivery.viewOwn': ['Contractor', 'Admin'], 'delivery.viewAll': ['Admin'],
      'delivery.review': ['Admin'], 'delivery.emergencyPass': ['Admin'], 'gate.scan': ['Access Control', 'Admin'],
      'gate.viewToday': ['Access Control', 'Admin'], 'gate.viewLog': ['Access Control', 'Admin'], 'team.approve': ['Admin'],
      'team.invite': ['Admin'], 'team.remove': ['Admin'], 'team.changeRole': ['Admin'], 'project.settings': ['Admin'],
      'project.delete': ['Admin'], 'project.view': ['Contractor', 'Access Control', 'Admin'],
    }),
    D.cond('Permitted', `@or(equals(${action}, 'session'), contains(coalesce(outputs('Allowed')?[${action}], createArray()), outputs('Role')))`, [],
      D.fail('No_permission', D.lit('You don’t have access to do that on this project.'))),
    D.okReply('Allowed_ok', {
      person: "@outputs('PersonOut')", settings: "@outputs('Settings')",
      project: {
        id: "@outputs('Project')?['ProjectId']", spId: "@outputs('Project')?['ID']", name: "@outputs('Project')?['Title']", code: "@outputs('Project')?['ProjectCode']",
        location: "@coalesce(outputs('Project')?['Location'], '')", timeZone: "@coalesce(outputs('Project')?['TimeZone'], 'Central Standard Time')",
        passPrefix: "@coalesce(outputs('Project')?['PassPrefix'], 'PRJ')", settings: "@json(coalesce(outputs('Project')?['SettingsJson'], '{}'))",
        dutyPhone: "@coalesce(outputs('Project')?['GateDutyPhone'], '')",
      },
      role: "@outputs('Role')", realRole: "@outputs('Member')?['Role']", maintenance: "@outputs('Maintenance')", canMaintain: "@outputs('CanMaintain')",
      memberId: "@outputs('Member')?['ID']", trade: "@coalesce(outputs('Member')?['Trade'], '')",
    }),
  ];
  return D.flow(D.childTrigger(['caller', 'projectId', 'viewAs', 'action']), D.tryCatch(steps, { appFacing: true }));
}

// ------------------------------------------------------------------ C2 Send notices
// Mirrors notices() in rules/rules.js: who gets told, with which words. Every email is sent one per
// person (so outside companies never see each other's addresses) and logged in Notifications.
function C2() {
  D.begin();
  const pidIn = D.childIn(0), event = D.childIn(1), reqId = `int(coalesce(${D.childIn(2)}, '0'))`;
  const extra = `json(if(empty(${D.childIn(3)}), '{}', ${D.childIn(3)}))`;
  const png = D.childIn(4);
  const R = (k) => `variables('Req')?['${k}']`;
  const X = (k) => `outputs('Extra')?['${k}']`;
  const head = "outputs('Head')";
  const when = "outputs('When')";
  const plan = (items) => D.setVar('Plan_' + items.key, 'Plan', items.list.map(([aud, subject, body]) => ({ aud, subject, body })));
  const reasonsHtml = `replace(coalesce(${R('ReasonText')}, ''), decodeUriComponent('%0A'), '<br>')`;
  const link = "if(empty(outputs('AppLink')), '', concat('<p><a href=\"', outputs('AppLink'), '\">Open Granted</a></p>'))";
  const steps = [
    D.initVar('Init_req', 'Req', 'object', {}),
    D.compose('Extra', `@${extra}`),
    D.par(
      [D.cond('Has_request', `@greater(${reqId}, 0)`, [D.spGetById('Get_request', 'DeliveryRequests', reqId), D.setVar('Keep_request', 'Req', "@body('Get_request')")], [])],
      [D.spGet('Get_project', 'Projects', `$filter=ProjectId eq ${D.q(pidIn)}&$top=1`)],
      [C.membersWithRole('Get_security', pidIn, 'Access Control')],
      [C.membersWithRole('Get_admins', pidIn, 'Admin')],
      [D.spGet('Get_link', 'AppSettings', "$filter=Title eq 'AppLink'&$select=Value&$top=1")],
    ),
    D.compose('Project', `@${D.firstRow('Get_project')}`),
    D.compose('AppLink', `@coalesce(${D.firstRow('Get_link')}?['Value'], '')`),
    D.compose('Head', `@if(empty(${R('SubcontractorName')}), 'Unknown truck', concat(${R('SubcontractorName')}, ' – ', coalesce(${R('Material')}, '')))`),
    D.compose('When', `@if(empty(${R('DeliveryDate')}), '', formatDateTime(concat(coalesce(${R('DeliveryDate')}, '2000-01-01'), 'T', coalesce(${R('SlotStart')}, '00:00'), ':00'), 'ddd M/d h:mm tt'))`),
    D.compose('Code', `@coalesce(${X('passCode')}, ${R('PassCode')}, ${X('scannedCode')}, '')`),
    D.compose('Security', "@body('Get_security')?['value']"),
    D.compose('Admins', "@body('Get_admins')?['value']"),
    D.initVar('Init_plan', 'Plan', 'array', []),
    D.sw('Event', `@${event}`, {
      approved: [plan({ key: 'approved', list: [
        ['contractor', "Approved: @{outputs('Code')} for @{outputs('When')}", `<p>@{${head}}</p><p>Gate: @{${R('GateId')}}<br>Arrive @{outputs('When')}</p><p>Show gate pass <b>@{outputs('Code')}</b> (QR attached) to security on arrival.</p>`],
        ['security', "New approved delivery @{outputs('When')}", `<p>@{${head}}</p><p>Pass: @{outputs('Code')}</p>`],
      ] })],
      review: [plan({ key: 'review', list: [
        ['contractor', `Under review: @{${head}}`, `<p>Your request is waiting for the project admin.</p><p>@{${reasonsHtml}}</p>`],
        ['gc', `Review needed: @{${head}} (@{${when}})`, `<p>@{${reasonsHtml}}</p>@{${link}}`],
      ] })],
      rejected: [plan({ key: 'rejected', list: [
        ['contractor', `Not approved: @{${head}}`, `<p>Your request was not approved.</p><p>@{${reasonsHtml}}</p>@{${link}}`],
      ] })],
      cancelled: [plan({ key: 'cancelled', list: [
        ['contractor', "Cancelled: @{outputs('Code')} (@{outputs('When')})", `<p>@{${head}} was cancelled.</p>`],
        ['security', "Cancelled delivery @{outputs('Code')}", `<p>@{${head}} (@{${when}}) is cancelled. <b>Do not admit.</b></p>`],
      ] })],
      emergency: [plan({ key: 'emergency', list: [
        ['contractor', "Emergency pass issued: @{outputs('Code')}", `<p>@{${head}} may enter today @{${when}}. Issued by @{coalesce(${X('by')}, 'the project admin')}.</p><p>QR attached.</p>`],
        ['security', "Emergency pass @{outputs('Code')} (today)", `<p>@{${head}}</p><p>Issued by @{coalesce(${X('by')}, 'the project admin')}.</p>`],
        ['gc', "Emergency pass logged: @{outputs('Code')}", `<p>@{${head}} – counts as an override.</p>`],
      ] })],
      turnedAway: [plan({ key: 'turnedAway', list: [
        ['contractor', `Turned away at gate: @{${head}}`, `<p><b>@{${X('reasonTitle')}}.</b></p><p>What to do: @{${X('remedy')}}</p><p>Code: @{coalesce(outputs('Code'), 'none')} · Logged by @{coalesce(${X('guard')}, 'security')}</p>`],
        ['security', `Turned away at gate: @{${head}}`, `<p><b>@{${X('reasonTitle')}}.</b></p><p>What to do: @{${X('remedy')}}</p><p>Code: @{coalesce(outputs('Code'), 'none')} · Logged by @{coalesce(${X('guard')}, 'security')}</p>`],
        ['gc', `Turned away at gate: @{${head}}`, `<p><b>@{${X('reasonTitle')}}.</b></p><p>What to do: @{${X('remedy')}}</p><p>Code: @{coalesce(outputs('Code'), 'none')} · Logged by @{coalesce(${X('guard')}, 'security')}</p>`],
      ] })],
      noshow: [plan({ key: 'noshow', list: [
        ['contractor', "No-show: @{outputs('Code')}", `<p>@{${head}} did not arrive in its window (@{${when}}). Repeated no-shows can suspend booking.</p>`],
        ['gc', `No-show: @{${head}}`, `<p>Pass @{outputs('Code')}, window @{${when}}.</p>`],
      ] })],
      escalation: [plan({ key: 'escalation', list: [
        ['gc', `Still waiting for review: @{${head}} (@{${when}})`, `<p>This delivery request has been waiting for a decision longer than the project allows.</p><p>@{${reasonsHtml}}</p>@{${link}}`],
      ] })],
    }, []),
    D.initVar('Init_sent', 'Sent', 'integer', 0),
    D.foreach('Each_message', "@variables('Plan')", [
      D.compose('Recipients', `@if(equals(items('Each_message')?['aud'], 'contractor'), if(empty(${R('SubmittedByEmail')}), createArray(), createArray(${R('SubmittedByEmail')})), if(equals(items('Each_message')?['aud'], 'security'), union(body('Pick_security'), body('Pick_security')), union(body('Pick_admins'), body('Pick_admins'))))`),
      D.foreach('Each_recipient', "@outputs('Recipients')", [
        D.mail('Send_one', "@{items('Each_recipient')}", "@{items('Each_message')?['subject']}",
          "@{items('Each_message')?['body']}<hr><p style=\"color:#666;font-size:12px\">Granted · @{outputs('Project')?['Title']}. No approved delivery, no gate access.</p>",
          { 'emailMessage/Attachments': `@if(and(equals(items('Each_message')?['aud'], 'contractor'), not(empty(${png}))), createArray(json(concat('{"Name":"gate-pass-', outputs('Code'), '.png","ContentBytes":"', ${png}, '"}'))), createArray())` }),
        D.spCreate('Log_one', 'Notifications', {
          Title: "@{items('Each_message')?['subject']}", ProjectId: `@{${pidIn}}`, Kind: 'delivery',
          Event: `@{if(contains(createArray('approved','review','rejected','cancelled','emergency','turnedAway','noshow','escalation'), ${event}), ${event}, 'system')}`,
          RecipientRole: "@{if(equals(items('Each_message')?['aud'], 'contractor'), 'Contractor', if(equals(items('Each_message')?['aud'], 'security'), 'Access Control', 'Admin'))}",
          RecipientEmail: "@{toLower(items('Each_recipient'))}", Channels: 'email', Body: "@{items('Each_message')?['body']}",
          RequestId: `@${reqId}`, SubcontractorId: `@{coalesce(${R('SubcontractorId')}, '')}`, SentAt: '@utcNow()',
        }),
        D.incVar('Count_sent', 'Sent'),
      ], 1),
    ], 1),
    D.okReply('Done', { sent: "@variables('Sent')" }),
  ];
  // Email lists for security and the project's admins (computed before the loop).
  steps.splice(steps.findIndex((x) => Array.isArray(x) && x[0] === 'Admins') + 1, 0,
    D.select('Pick_security', "@outputs('Security')", "@toLower(item()?['Email'])"),
    D.select('Pick_admins', "@outputs('Admins')", "@toLower(item()?['Email'])"));
  return D.flow(D.childTrigger(['projectId', 'event', 'requestId', 'extraJson', 'attachPngBase64']), D.tryCatch(steps));
}

// ------------------------------------------------------------------ C4 Onboard person
// Makes sure a person can open the app: outside people become guests (by sharing the site's
// Welcome page, which sends Microsoft's invitation), and everyone is added to Granted Users.
function C4() {
  D.begin();
  const email = `toLower(trim(coalesce(${D.childIn(0)}, '')))`;
  const steps = [
    D.spGet('Get_domain', 'AppSettings', "$filter=Title eq 'AjaxDomain'&$select=Value&$top=1"),
    D.compose('IsHome', `@endsWith(${email}, concat('@', toLower(coalesce(${D.firstRow('Get_domain')}?['Value'], ''))))`),
    D.cond('Outside_person', "@not(outputs('IsHome'))", [
      D.spHttp('Share_welcome', 'POST', '_api/SP.Web.ShareObject',
        `@{string(json(concat('{"url":"', ${D.env('site')}, '/SitePages/Welcome.aspx","peoplePickerInput":"[{\\\\"Key\\\\":\\\\"', ${email}, '\\\\"}]","roleValue":"role:1073741826","groupId":0,"propagateAcl":false,"sendEmail":true,"includeAnonymousLinkInEmail":false,"emailSubject":"You’re invited to Granted","emailBody":"You were invited to Granted for delivery booking and gate access."}')))}`),
    ], []),
    D.spHttp('Ensure_user', 'POST', '_api/web/ensureuser', `@{string(json(concat('{"logonName":"', ${email}, '"}')))}`),
    D.compose('Upn', "@last(split(coalesce(body('Ensure_user')?['LoginName'], ''), '|'))"),
    D.addToGroup('Add_to_group', "@outputs('Upn')"),
    D.okReply('Done', { added: true, upn: "@outputs('Upn')" }),
  ];
  // Already a member, or the guest isn't ready yet: say so instead of failing (F07 tries again).
  const fallback = D.okReply('Not_added', { added: false });
  fallback[0][1].runAfter = { Add_to_group: ['Failed', 'TimedOut'] };
  steps.push(fallback);
  D.useEnv('site');
  return D.flow(D.childTrigger(['email', 'displayName']), D.tryCatch(steps, { appFacing: true }));
}

// ------------------------------------------------------------------ C5 Issue gate pass (spec F02)
function C5() {
  D.begin();
  const reqId = `int(coalesce(${D.childIn(0)}, '0'))`;
  const R = (k) => `body('Get_request')?['${k}']`;
  const P = (k) => `outputs('Project')?['${k}']`;
  const S = (k) => `outputs('S')?['${k}']`;
  const TZ = "outputs('TZ')";
  const steps = [
    D.spGetById('Get_request', 'DeliveryRequests', reqId),
    D.cond('Still_needed', `@and(equals(${R('Status')}, 'Approved'), empty(${R('PassCode')}))`, [], D.okReply('Already_done', { skipped: true })),
    D.par(
      [D.spGet('Get_project', 'Projects', `$filter=ProjectId eq ${D.q(R('ProjectId'))}&$top=1`)],
      [D.spGet('Get_gate', 'Gates', `$filter=Key eq '@{encodeUriComponent(concat(${R('ProjectId')}, '|', ${R('GateId')}))}'&$top=1`)],
      [D.spGet('Get_zone', 'StagingZones', `$filter=Key eq '@{encodeUriComponent(concat(${R('ProjectId')}, '|', ${R('ZoneId')}))}'&$top=1`)],
      [D.spGet('Get_activity', 'Activities', `$filter=Key eq '@{encodeUriComponent(concat(${R('ProjectId')}, '|', ${R('ActivityId')}))}'&$top=1`)],
      [D.spGet('Get_active', 'DeliveryRequests', `$filter=ProjectId eq ${D.q(R('ProjectId'))} and DeliveryDayNo ge @{sub(int(replace(${R('DeliveryDate')}, '-', '')), 100)} and (Status eq 'Approved' or Status eq 'Needs review')&$select=ID,SubcontractorId,ActivityId,GateId,DeliveryDate,SlotStart,ZoneId,Pallets,StagedUntil,Status,PassCode&$top=5000`)],
    ),
    D.compose('Project', `@${D.firstRow('Get_project')}`),
    D.compose('S', `@json(coalesce(${P('SettingsJson')}, '{}'))`),
    D.compose('TZ', `@coalesce(${P('TimeZone')}, 'Central Standard Time')`),
    D.compose('Gate', `@${D.firstRow('Get_gate')}`),
    D.compose('Zone', `@${D.firstRow('Get_zone')}`),
    // Capacity re-check (not for emergency passes): an admin may approve after the slot or zone filled up.
    D.cond('Recheck_capacity', `@not(equals(${R('IsOverride')}, true))`, [
      D.select('Ctx_requests', "@body('Get_active')?['value']", {
        id: "@string(item()?['ID'])", subId: "@coalesce(item()?['SubcontractorId'], '')", activityId: "@coalesce(item()?['ActivityId'], '')",
        gateId: "@coalesce(item()?['GateId'], '')", date: "@coalesce(item()?['DeliveryDate'], '')", slot: "@coalesce(item()?['SlotStart'], '')",
        zoneId: "@coalesce(item()?['ZoneId'], '')", pallets: "@coalesce(item()?['Pallets'], 0)", stagedUntil: "@coalesce(item()?['StagedUntil'], item()?['DeliveryDate'])",
        status: "@if(and(equals(item()?['Status'], 'Approved'), empty(item()?['PassCode'])), 'pending', item()?['Status'])", passCode: "@coalesce(item()?['PassCode'], '')", arrived: false,
      }),
      D.compose('Recheck_input', {
        req: {
          id: `@string(${reqId})`, subId: `@${R('SubcontractorId')}`, activityId: `@${R('ActivityId')}`, gateId: `@${R('GateId')}`, date: `@${R('DeliveryDate')}`,
          slot: `@${R('SlotStart')}`, zoneId: `@${R('ZoneId')}`, material: 'x', quantity: '1', unit: 'x', pallets: `@string(coalesce(${R('Pallets')}, 0))`, pocName: 'x', pocPhone: '2145550100', justification: 'x',
        },
        ctx: {
          now: `@convertFromUtc(utcNow(), ${TZ}, 'yyyy-MM-ddTHH:mm:ss')`, settings: "@outputs('S')",
          gates: [{ id: `@${R('GateId')}`, name: "@coalesce(outputs('Gate')?['Title'], 'that gate')", capacityPerSlot: "@coalesce(outputs('Gate')?['CapacityPerSlot'], 1)" }],
          zones: [{ id: `@${R('ZoneId')}`, name: "@coalesce(outputs('Zone')?['Title'], 'that zone')", capacityPallets: "@coalesce(outputs('Zone')?['CapacityPallets'], 0)" }],
          subs: [], activities: `@if(empty(${D.firstRow('Get_activity')}), createArray(), createArray(json(concat('{"id":"', ${R('ActivityId')}, '","name":"","trade":"","start":"', ${D.firstRow('Get_activity')}?['StartDate'], '","finish":"', ${D.firstRow('Get_activity')}?['FinishDate'], '"}'))))`,
          requests: "@body('Ctx_requests')",
        },
      }),
      D.engine('Recheck', 'recheck', "@{outputs('Recheck_input')}"),
      D.compose('Lost', `@${D.engineOut('Recheck')}`),
      D.cond('Lost_the_race', "@not(empty(outputs('Lost')?['lost']))", [
        D.spUpdate('Mark_rejected', 'DeliveryRequests', reqId, {
          Status: 'Rejected', ReasonCodes: "@{outputs('Lost')?['lost']}", ReasonText: "@{outputs('Lost')?['reasonText']}",
          NextOpenSlot: "@{coalesce(outputs('Lost')?['nextOpen']?['label'], '')}", DecidedBy: 'Rules engine (capacity re-check)', DecidedAt: '@utcNow()',
        }),
        D.child('Tell_rejected', 'C2', [`@{${R('ProjectId')}}`, 'rejected', `@{${reqId}}`, '', '']),
        D.okReply('Lost_reply', { issued: false, reason: "@outputs('Lost')?['lost']" }),
      ], []),
    ], []),
    // A unique pass code: prefix + 6 characters with no look-alikes.
    D.initVar('Init_code', 'Code', 'string', ''),
    D.initVar('Init_unique', 'Unique', 'boolean', false),
    D.until('Find_code', "@equals(variables('Unique'), true)", [
      D.setVar('New_code', 'Code', `@{concat(coalesce(${P('PassPrefix')}, 'PRJ'), '-', ${[1, 2, 3, 4, 5, 6].map(() => "substring('ACDEFGHJKMNPQRTUVWXY34679', rand(0, 25), 1)").join(', ')})}`),
      D.spGet('Check_code', 'GatePasses', "$filter=Title eq '@{variables('Code')}'&$select=ID&$top=1"),
      D.setVar('Set_unique', 'Unique', "@empty(body('Check_code')?['value'])"),
    ], 10),
    D.engine('Make_QR', 'qr', "@{string(json(concat('{\"code\":\"', variables('Code'), '\"}')))}"),
    D.compose('QR', "@json(coalesce(body('Make_QR')?['result'], '{\"svg\":\"\",\"pngBase64\":\"\"}'))"),
    // Arrival window in the project's time zone, clipped to gate hours.
    D.compose('SlotLocal', `@concat(${R('DeliveryDate')}, 'T', ${R('SlotStart')}, ':00')`),
    D.compose('OpenLocal', `@if(greater(ticks(addMinutes(outputs('SlotLocal'), mul(-1, int(coalesce(${S('gateToleranceMinutes')}, 60))))), ticks(concat(${R('DeliveryDate')}, 'T', coalesce(${S('gateOpen')}, '06:00'), ':00'))), addMinutes(outputs('SlotLocal'), mul(-1, int(coalesce(${S('gateToleranceMinutes')}, 60))), 'yyyy-MM-ddTHH:mm:ss'), concat(${R('DeliveryDate')}, 'T', coalesce(${S('gateOpen')}, '06:00'), ':00'))`),
    D.compose('CloseLocal', `@if(less(ticks(addMinutes(outputs('SlotLocal'), add(int(coalesce(${S('slotMinutes')}, 60)), int(coalesce(${S('gateToleranceMinutes')}, 60))))), ticks(concat(${R('DeliveryDate')}, 'T', coalesce(${S('gateClose')}, '16:00'), ':00'))), addMinutes(outputs('SlotLocal'), add(int(coalesce(${S('slotMinutes')}, 60)), int(coalesce(${S('gateToleranceMinutes')}, 60))), 'yyyy-MM-ddTHH:mm:ss'), concat(${R('DeliveryDate')}, 'T', coalesce(${S('gateClose')}, '16:00'), ':00'))`),
    D.spCreate('Create_pass', 'GatePasses', {
      Title: "@{variables('Code')}", ProjectId: `@{${R('ProjectId')}}`, RequestId: `@${reqId}`,
      SubcontractorId: `@{${R('SubcontractorId')}}`, SubcontractorName: `@{${R('SubcontractorName')}}`, Material: `@{${R('Material')}}`,
      QuantityText: `@{${R('Quantity')}} @{${R('Unit')}}`, Pallets: `@coalesce(${R('Pallets')}, 0)`, GateId: `@{${R('GateId')}}`,
      GateName: "@{coalesce(outputs('Gate')?['Title'], '')}", ZoneName: "@{coalesce(outputs('Zone')?['Title'], '')}",
      DeliveryDate: `@{${R('DeliveryDate')}}`, DeliveryDayNo: `@int(replace(${R('DeliveryDate')}, '-', ''))`, SlotStart: `@{${R('SlotStart')}}`,
      WindowOpen: `@{convertToUtc(outputs('OpenLocal'), ${TZ})}`, WindowClose: `@{convertToUtc(outputs('CloseLocal'), ${TZ})}`,
      ContactName: `@{${R('ContactName')}}`, ContactPhone: `@{${R('ContactPhone')}}`, Status: 'Active', IsOverride: `@equals(${R('IsOverride')}, true)`,
      IssuedAt: '@utcNow()', QrSvg: "@{outputs('QR')?['svg']}",
    }),
    D.cond('Had_previous_pass', `@not(empty(${R('PreviousPassCode')}))`, [
      D.spGet('Get_previous', 'GatePasses', `$filter=Title eq ${D.q(R('PreviousPassCode'))}&$select=ID&$top=1`),
      D.foreach('Void_previous', "@body('Get_previous')?['value']", [
        D.spUpdate('Void_one', 'GatePasses', "items('Void_previous')?['ID']", { Status: 'Void', VoidedAt: '@utcNow()', VoidReason: 'Rescheduled' }),
      ]),
    ], []),
    D.spUpdate('Save_code', 'DeliveryRequests', reqId, {
      PassCode: "@{variables('Code')}", QrSvg: "@{outputs('QR')?['svg']}",
      MessageLog: `@{concat(coalesce(${R('MessageLog')}, ''), convertFromUtc(utcNow(), ${TZ}, 'M/d h:mm tt'), ' Gate pass ', variables('Code'), ' issued', decodeUriComponent('%0A'))}`,
    }),
    D.child('Tell_people', 'C2', [`@{${R('ProjectId')}}`, `@{if(equals(${R('IsOverride')}, true), 'emergency', 'approved')}`, `@{${reqId}}`,
      `@{string(json(concat('{"passCode":"', variables('Code'), '","by":"', replace(coalesce(${R('DecidedBy')}, ''), '"', ''), '"}')))}`, "@{outputs('QR')?['pngBase64']}"]),
    D.okReply('Issued', { issued: true, code: "@variables('Code')" }),
  ];
  // The QR step may fail (the typed code still works at the gate): carry on either way.
  const flatSteps = D.flat(steps);
  const qrIdx = flatSteps.findIndex((s) => s[0] === 'QR');
  flatSteps[qrIdx][1].runAfter = { Make_QR: ['Succeeded', 'Failed', 'TimedOut'] };
  return D.flow(D.childTrigger(['requestId']), D.tryCatch(flatSteps));
}

module.exports = { C1, C2, C4, C5 };
