// F00 Session and view: the only way the app reads data.
'use strict';
const D = require('../dsl');
const C = require('./common');

function F00() {
  D.begin();
  const op = "outputs('In')?['op']";
  const pid = C.pid();
  const today = C.todayLocal();
  const isRole = (r) => `equals(${C.role()}, '${r}')`;

  // ---------------------------------------------------------------- op = session
  const session = [
    D.cond('Needs_profile', "@equals(outputs('Auth')?['needsProfile'], true)",
      D.okReply('Profile_first', { needsProfile: true, email: `@${C.caller()}`, isHome: `@${C.isHome(C.caller())}`, settings: "@outputs('Auth')?['settings']" }), []),
    // Invites waiting for this email become memberships now.
    D.spGet('Get_invites', 'Invites', `$filter=Email eq ${D.q(C.caller())} and Status eq 'Pending'&$top=100`),
    D.foreach('Each_invite', "@body('Get_invites')?['value']", [
      D.cond('Invite_expired', "@less(ticks(coalesce(items('Each_invite')?['ExpiresAt'], '2000-01-01T00:00:00Z')), ticks(utcNow()))", [
        D.spUpdate('Expire_invite', 'Invites', "items('Each_invite')?['ID']", { Status: 'Expired' }),
      ], [
        D.spGet('Invite_project', 'Projects', `$filter=ProjectId eq ${D.q("items('Each_invite')?['ProjectId']")} and Deleted eq 0&$select=Title&$top=1`),
        D.cond('Invite_project_live', "@not(empty(body('Invite_project')?['value']))", [
          D.spGet('Existing_member', 'ProjectMembers', `$filter=Title eq '@{encodeUriComponent(concat(items('Each_invite')?['ProjectId'], '|', ${C.caller()}))}'&$select=ID&$top=1`),
          D.compose('Member_fields', {
            Title: `@{concat(items('Each_invite')?['ProjectId'], '|', ${C.caller()})}`, ProjectId: "@{items('Each_invite')?['ProjectId']}", Email: `@{${C.caller()}}`,
            Role: "@{items('Each_invite')?['Role']}", Trade: "@{coalesce(items('Each_invite')?['Trade'], '')}", Status: 'Active', Via: 'Invite',
            AddedBy: "@{coalesce(items('Each_invite')?['InvitedBy'], '')}", AddedAt: '@utcNow()',
            FullName: `@{concat(${C.person('first')}, ' ', ${C.person('last')})}`, Company: `@{${C.person('company')}}`, CompanyKey: `@{${C.person('companyKey')}}`, Phone: `@{${C.person('phone')}}`,
          }),
          D.cond('Member_exists', "@not(empty(body('Existing_member')?['value']))", [
            D.spHttp('Reactivate_member', 'POST', `${D.list('ProjectMembers')}(@{first(body('Existing_member')?['value'])?['ID']})`, "@{outputs('Member_fields')}", { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }),
          ], [
            D.spHttp('Add_member', 'POST', D.list('ProjectMembers'), "@{outputs('Member_fields')}"),
          ]),
          D.spUpdate('Accept_invite', 'Invites', "items('Each_invite')?['ID']", { Status: 'Accepted', AcceptedAt: '@utcNow()' }),
          C.audit('Audit_invite', 'team.inviteAccepted', "items('Each_invite')?['ProjectId']", C.caller(), "concat('Role: ', items('Each_invite')?['Role'])", 'false'),
          D.appendArr('Note_invite', 'Notices', "@{concat('You now have ', items('Each_invite')?['Role'], ' access to ', first(body('Invite_project')?['value'])?['Title'], '.')}"),
        ], []),
      ]),
    ], 1),
    D.par(
      [D.spGet('My_memberships', 'ProjectMembers', `$filter=Email eq ${D.q(C.caller())} and Status eq 'Active'&$select=ProjectId,Role&$top=500`)],
      [D.spGet('My_join_requests', 'JoinRequests', `$filter=Email eq ${D.q(C.caller())} and Status eq 'Pending'&$select=ProjectId&$top=100`)],
      [D.spGet('Live_projects', 'Projects', "$filter=Deleted eq 0&$select=ProjectId,Title,ProjectCode,Location&$top=5000")],
    ),
    D.foreach('Each_membership', "@body('My_memberships')?['value']", [
      D.filter('Find_project', "@body('Live_projects')?['value']", "@equals(item()?['ProjectId'], items('Each_membership')?['ProjectId'])"),
      D.cond('Project_live', "@not(empty(body('Find_project')))", [
        D.appendArr('Add_project', 'Projects', {
          id: "@items('Each_membership')?['ProjectId']", name: "@first(body('Find_project'))?['Title']", code: "@first(body('Find_project'))?['ProjectCode']",
          location: "@coalesce(first(body('Find_project'))?['Location'], '')", role: "@items('Each_membership')?['Role']",
        }),
      ], []),
    ], 20),
    D.foreach('Each_join_request', "@body('My_join_requests')?['value']", [
      D.filter('Find_pending_project', "@body('Live_projects')?['value']", "@equals(item()?['ProjectId'], items('Each_join_request')?['ProjectId'])"),
      D.cond('Pending_live', "@not(empty(body('Find_pending_project')))", [
        D.appendArr('Add_pending', 'Pending', { projectId: "@items('Each_join_request')?['ProjectId']", name: "@first(body('Find_pending_project'))?['Title']" }),
      ], []),
    ], 20),
    D.okReply('Session_reply', {
      me: "@outputs('Auth')?['person']", settings: "@outputs('Auth')?['settings']",
      projects: "@variables('Projects')", pending: "@variables('Pending')", notices: "@variables('Notices')",
    }),
  ];

  // ---------------------------------------------------------------- op = view
  const row = (k) => `item()?['${k}']`;
  const reqShape = {
    id: `@${row('ID')}`, subId: `@coalesce(${row('SubcontractorId')}, '')`, subName: `@coalesce(${row('SubcontractorName')}, '')`,
    activityId: `@coalesce(${row('ActivityId')}, '')`, activityName: `@coalesce(${row('ActivityName')}, '')`, gateId: `@coalesce(${row('GateId')}, '')`,
    date: `@coalesce(${row('DeliveryDate')}, '')`, slot: `@coalesce(${row('SlotStart')}, '')`, zoneId: `@coalesce(${row('ZoneId')}, '')`,
    material: `@coalesce(${row('Material')}, '')`, quantity: `@coalesce(${row('Quantity')}, 0)`, unit: `@coalesce(${row('Unit')}, '')`,
    pallets: `@coalesce(${row('Pallets')}, 0)`, weightLbs: `@coalesce(${row('WeightLbs')}, 0)`, carrier: `@coalesce(${row('Carrier')}, '')`, truck: `@coalesce(${row('TruckNumber')}, '')`,
    pocName: `@coalesce(${row('ContactName')}, '')`, pocPhone: `@coalesce(${row('ContactPhone')}, '')`, status: `@coalesce(${row('Status')}, '')`,
    passCode: `@coalesce(${row('PassCode')}, '')`, reasonText: `@coalesce(${row('ReasonText')}, '')`, nextOpen: `@coalesce(${row('NextOpenSlot')}, '')`,
    submittedBy: `@coalesce(${row('SubmittedByName')}, '')`, decidedBy: `@coalesce(${row('DecidedBy')}, '')`, justification: `@coalesce(${row('EarlyJustification')}, '')`,
    maintenance: `@equals(${row('Maintenance')}, true)`, stagedUntil: `@coalesce(${row('StagedUntil')}, ${row('DeliveryDate')}, '')`, override: `@equals(${row('IsOverride')}, true)`,
  };
  const view = [
    D.compose('Today', `@${today}`),
    D.compose('MySub', `@${C.person('companyKey')}`),
    D.par(
      [D.spGet('Get_gates', 'Gates', `$filter=ProjectId eq ${D.q(pid)} and Active eq 1&$orderby=SortOrder&$top=200`)],
      [D.spGet('Get_zones', 'StagingZones', `$filter=ProjectId eq ${D.q(pid)} and Active eq 1&$top=200`)],
      [D.spGet('Get_activities', 'Activities', `$filter=ProjectId eq ${D.q(pid)} and IsCurrent eq 1&$top=2000`)],
      [D.spGet('Get_companies', 'Companies', `$filter=ProjectId eq ${D.q(pid)}&$top=1000`)],
      [D.spGet('Get_members', 'ProjectMembers', `$filter=ProjectId eq ${D.q(pid)} and Status eq 'Active'&$top=2000`)],
      [D.spGet('Get_requests', 'DeliveryRequests', `$filter=ProjectId eq ${D.q(pid)} and DeliveryDayNo ge @{${C.dayNo(`addDays(${today}, -30, 'yyyy-MM-dd')`)}}&$top=5000`)],
      [D.spGet('Get_passes', 'GatePasses', `$filter=ProjectId eq ${D.q(pid)} and DeliveryDayNo ge @{${C.dayNo(`addDays(${today}, -30, 'yyyy-MM-dd')`)}}&$select=ID,Title,RequestId,Status,UsedAt,UsedBy,WindowOpen,WindowClose,IsOverride,QrSvg,DeliveryDate,ZoneName,GateName&$top=5000`)],
      [D.spGet('Get_gatelog', 'GateLog', `$filter=ProjectId eq ${D.q(pid)} and ScannedAt ge datetime'@{addDays(utcNow(), -7)}'&$orderby=ScannedAt desc&$top=1000`)],
      [D.spGet('Get_mail', 'Notifications', `$filter=ProjectId eq ${D.q(pid)}&$orderby=SentAt desc&$top=300`)],
      [D.spGet('Get_joinreqs', 'JoinRequests', `$filter=ProjectId eq ${D.q(pid)} and Status eq 'Pending'&$top=500`)],
      [D.spGet('Get_invites_view', 'Invites', `$filter=ProjectId eq ${D.q(pid)} and Status eq 'Pending'&$top=500`)],
      [D.spGet('Get_blackouts', 'BlackoutDates', `$filter=ProjectId eq ${D.q(pid)}&$top=500`)],
    ),
    // Companies on the project (contractors and admins), with trade and suspension.
    D.filter('Booking_members', "@body('Get_members')?['value']", "@not(equals(item()?['Role'], 'Access Control'))"),
    D.select('Company_keys', "@body('Booking_members')", "@coalesce(item()?['CompanyKey'], '')"),
    D.select('Suspended_keys', "@body('Get_companies')?['value']", "@if(equals(item()?['Suspended'], true), item()?['CompanyKey'], '')"),
    D.foreach('Each_company', "@union(body('Company_keys'), body('Company_keys'))", [
      D.filter('Company_members', "@body('Booking_members')", "@equals(coalesce(item()?['CompanyKey'], ''), items('Each_company'))"),
      D.filter('Company_trades', "@body('Company_members')", "@not(empty(item()?['Trade']))"),
      D.appendArr('Add_company', 'Subs', {
        id: "@items('Each_company')", name: "@coalesce(first(body('Company_members'))?['Company'], items('Each_company'))",
        trade: "@coalesce(first(body('Company_trades'))?['Trade'], '')", suspended: "@contains(body('Suspended_keys'), items('Each_company'))",
      }),
    ], 20),
    D.filter('Visible_requests', "@body('Get_requests')?['value']",
      `@or(${isRole('Admin')}, and(${isRole('Contractor')}, equals(item()?['SubcontractorId'], outputs('MySub'))), and(${isRole('Access Control')}, equals(item()?['DeliveryDate'], outputs('Today')), or(equals(item()?['Status'], 'Approved'), equals(item()?['Status'], 'Cancelled'))))`),
    D.select('Requests_out', "@body('Visible_requests')", reqShape),
    D.select('Visible_ids', "@body('Visible_requests')", "@item()?['ID']"),
    // Everyone else's bookings, as capacity only (no names, loads or contacts).
    D.filter('Others_active', "@body('Get_requests')?['value']",
      `@and(${isRole('Contractor')}, not(equals(item()?['SubcontractorId'], outputs('MySub'))), or(equals(item()?['Status'], 'Approved'), equals(item()?['Status'], 'Needs review')))`),
    D.select('Occupancy_out', "@body('Others_active')", {
      id: "@item()?['ID']", gateId: "@item()?['GateId']", date: "@item()?['DeliveryDate']", slot: "@item()?['SlotStart']", zoneId: "@item()?['ZoneId']",
      pallets: "@coalesce(item()?['Pallets'], 0)", stagedUntil: "@coalesce(item()?['StagedUntil'], item()?['DeliveryDate'])", status: "@item()?['Status']",
    }),
    D.filter('Visible_passes', "@body('Get_passes')?['value']", "@contains(body('Visible_ids'), item()?['RequestId'])"),
    D.select('Passes_out', "@body('Visible_passes')", {
      code: "@item()?['Title']", requestId: "@item()?['RequestId']", status: "@item()?['Status']", usedAt: "@coalesce(item()?['UsedAt'], '')",
      usedBy: "@coalesce(item()?['UsedBy'], '')", windowOpen: "@item()?['WindowOpen']", windowClose: "@item()?['WindowClose']",
      override: "@equals(item()?['IsOverride'], true)", qrSvg: "@coalesce(item()?['QrSvg'], '')", zoneName: "@coalesce(item()?['ZoneName'], '')", gateName: "@coalesce(item()?['GateName'], '')",
    }),
    D.select('Gates_out', "@body('Get_gates')?['value']", { id: "@item()?['GateId']", name: "@item()?['Title']", capacityPerSlot: "@coalesce(item()?['CapacityPerSlot'], 1)" }),
    D.select('Zones_out', "@body('Get_zones')?['value']", { id: "@item()?['ZoneId']", name: "@item()?['Title']", capacityPallets: "@coalesce(item()?['CapacityPallets'], 0)" }),
    D.select('Activities_out', "@body('Get_activities')?['value']", {
      id: "@item()?['ActivityId']", name: "@item()?['Title']", trade: "@coalesce(item()?['Trade'], '')", start: "@item()?['StartDate']", finish: "@item()?['FinishDate']",
    }),
    D.select('Blackouts_out', "@body('Get_blackouts')?['value']", "@item()?['BlackoutDate']"),
    D.select('Gatelog_out', `@if(or(${isRole('Admin')}, ${isRole('Access Control')}), body('Get_gatelog')?['value'], createArray())`, {
      at: "@item()?['ScannedAt']", code: "@item()?['Title']", result: "@item()?['Result']", reasonCode: "@coalesce(item()?['ReasonCode'], '')",
      reason: "@coalesce(item()?['ReasonText'], '')", action: "@item()?['Action']", guard: "@coalesce(item()?['Guard'], '')", gateId: "@coalesce(item()?['GateId'], '')",
    }),
    D.select('Members_out', `@if(${isRole('Admin')}, body('Get_members')?['value'], createArray())`, {
      id: "@item()?['ID']", email: "@item()?['Email']", name: "@coalesce(item()?['FullName'], item()?['Email'])", company: "@coalesce(item()?['Company'], '')",
      companyKey: "@coalesce(item()?['CompanyKey'], '')", phone: "@coalesce(item()?['Phone'], '')", role: "@item()?['Role']", trade: "@coalesce(item()?['Trade'], '')",
    }),
    D.select('Joinreqs_out', `@if(${isRole('Admin')}, body('Get_joinreqs')?['value'], createArray())`, {
      id: "@item()?['ID']", name: "@item()?['Title']", email: "@item()?['Email']", company: "@coalesce(item()?['Company'], '')", phone: "@coalesce(item()?['Phone'], '')",
      at: "@item()?['RequestedAt']", isHome: "@equals(item()?['IsAjax'], true)",
    }),
    D.select('Invites_out', `@if(${isRole('Admin')}, body('Get_invites_view')?['value'], createArray())`, {
      id: "@item()?['ID']", email: "@item()?['Email']", role: "@item()?['Role']", trade: "@coalesce(item()?['Trade'], '')", expires: "@item()?['ExpiresAt']",
    }),
    D.filter('My_mail', "@body('Get_mail')?['value']", `@or(${isRole('Admin')}, equals(toLower(item()?['RecipientEmail']), ${C.caller()}))`),
    D.select('Mail_out', "@body('My_mail')", {
      at: "@item()?['SentAt']", subject: "@item()?['Title']", body: "@coalesce(item()?['Body'], '')", to: "@coalesce(item()?['RecipientEmail'], '')",
      role: "@coalesce(item()?['RecipientRole'], '')", event: "@coalesce(item()?['Event'], '')",
    }),
    D.filter('My_company', "@variables('Subs')", "@equals(item()?['id'], outputs('MySub'))"),
    D.okReply('View_reply', {
      project: {
        id: `@${pid}`, name: `@${C.auth('project.name')}`, code: `@${C.auth('project.code')}`, location: `@${C.auth('project.location')}`,
        timeZone: `@${C.tz()}`, dutyPhone: `@${C.auth('project.dutyPhone')}`, settings: `@${C.auth('project.settings')}`,
        gates: "@body('Gates_out')", zones: "@body('Zones_out')", activities: "@body('Activities_out')", blackouts: "@body('Blackouts_out')",
      },
      role: `@${C.role()}`, realRole: `@${C.auth('realRole')}`, maintenance: `@${C.auth('maintenance')}`, canMaintain: `@${C.auth('canMaintain')}`,
      mySub: `@coalesce(first(body('My_company')), json(concat('{"id":"', outputs('MySub'), '","name":"', replace(${C.person('company')}, '"', ''), '","trade":"', ${C.auth('trade')}, '","suspended":false}')))`,
      subs: "@variables('Subs')", requests: "@body('Requests_out')", occupancy: "@body('Occupancy_out')", passes: "@body('Passes_out')",
      gatelog: "@body('Gatelog_out')", members: "@body('Members_out')", joinreqs: "@body('Joinreqs_out')", invites: "@body('Invites_out')",
      mail: "@body('Mail_out')", today: "@outputs('Today')", nowLocal: `@${C.nowLocal()}`, serverTime: '@utcNow()',
    }),
  ];

  const steps = [
    D.initVar('Init_notices', 'Notices', 'array', []),
    D.initVar('Init_projects', 'Projects', 'array', []),
    D.initVar('Init_pending', 'Pending', 'array', []),
    D.initVar('Init_subs', 'Subs', 'array', []),
    C.start(`@{if(equals(${op}, 'session'), 'session', 'project.view')}`),
    D.sw('Op', `@coalesce(${op}, 'view')`, { session, view }, D.fail('Unknown_op', D.lit('Unknown request.'))),
  ];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

module.exports = { F00 };
