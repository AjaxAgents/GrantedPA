// F07 Hourly sweep · F08 Morning gate list · F09 Look-ahead upload
'use strict';
const D = require('../dsl');
const C = require('./common');

// ------------------------------------------------------------------ F07 Hourly sweep
function F07() {
  D.begin();
  const P = (k) => `items('Each_project')?['${k}']`;
  const S = (k) => `json(coalesce(${P('SettingsJson')}, '{}'))?['${k}']`;
  const steps = [
    D.spGet('Live_projects', 'Projects', '$filter=Deleted eq 0&$select=ProjectId,TimeZone,SettingsJson&$top=5000'),
    D.foreach('Each_project', "@body('Live_projects')?['value']", [
      // No-shows: active passes whose window closed more than the grace period ago.
      D.spGet('Late_passes', 'GatePasses', `$filter=ProjectId eq ${D.q(P('ProjectId'))} and Status eq 'Active' and WindowClose lt datetime'@{addMinutes(utcNow(), mul(-1, int(coalesce(${S('noShowGraceMinutes')}, 60))))}'&$select=ID,RequestId&$top=500`),
      D.foreach('Each_late_pass', "@body('Late_passes')?['value']", [
        D.spGetById('Late_request', 'DeliveryRequests', "items('Each_late_pass')?['RequestId']"),
        D.cond('Not_told_yet', "@and(equals(body('Late_request')?['Status'], 'Approved'), empty(body('Late_request')?['NoShowNotifiedAt']))", [
          D.child('Tell_noshow', 'C2', [`@{${P('ProjectId')}}`, 'noshow', "@{items('Each_late_pass')?['RequestId']}", '', '']),
          D.spUpdate('Mark_noshow', 'DeliveryRequests', "items('Each_late_pass')?['RequestId']", { NoShowNotifiedAt: '@utcNow()' }),
        ], []),
      ], 1),
      // Reviews waiting longer than the project allows: remind the project's admins once.
      D.spGet('Slow_reviews', 'DeliveryRequests', `$filter=ProjectId eq ${D.q(P('ProjectId'))} and Status eq 'Needs review' and ReviewAlertSentAt lt datetime'@{addHours(utcNow(), mul(-1, int(coalesce(${S('reviewEscalationHours')}, 4))))}' and EscalatedAt eq null&$select=ID&$top=200`),
      D.foreach('Each_slow_review', "@body('Slow_reviews')?['value']", [
        D.child('Tell_escalation', 'C2', [`@{${P('ProjectId')}}`, 'escalation', "@{items('Each_slow_review')?['ID']}", '', '']),
        D.spUpdate('Mark_escalated', 'DeliveryRequests', "items('Each_slow_review')?['ID']", { EscalatedAt: '@utcNow()' }),
      ], 1),
    ], 1),
    D.spGet('Old_invites', 'Invites', "$filter=Status eq 'Pending' and ExpiresAt lt datetime'@{utcNow()}'&$select=ID&$top=1000"),
    D.foreach('Each_old_invite', "@body('Old_invites')?['value']", [D.spUpdate('Expire', 'Invites', "items('Each_old_invite')?['ID']", { Status: 'Expired' })], 10),
  ];
  return D.flow(D.recurrence('Hour', 1), D.tryCatch(steps, { appFacing: false }));
}

// ------------------------------------------------------------------ F08 Morning gate list
// Runs every hour; each project gets its list once, in the 5 AM hour of its own time zone, on work days.
function F08() {
  D.begin();
  const P = (k) => `items('Each_project')?['${k}']`;
  const TZ = `coalesce(${P('TimeZone')}, 'Central Standard Time')`;
  const today = `convertFromUtc(utcNow(), ${TZ}, 'yyyy-MM-dd')`;
  const steps = [
    D.spGet('Live_projects', 'Projects', '$filter=Deleted eq 0&$select=ProjectId,Title,TimeZone,SettingsJson,GateDutyPhone&$top=5000'),
    D.foreach('Each_project', "@body('Live_projects')?['value']", [
      D.cond('Five_AM_on_a_work_day', `@and(equals(convertFromUtc(utcNow(), ${TZ}, 'HH'), '05'), contains(coalesce(json(coalesce(${P('SettingsJson')}, '{}'))?['workDays'], createArray(1, 2, 3, 4, 5, 6)), dayOfWeek(convertFromUtc(utcNow(), ${TZ}))))`, [
        D.spGet('Todays_passes', 'GatePasses', `$filter=ProjectId eq ${D.q(P('ProjectId'))} and DeliveryDate eq '@{${today}}' and Status ne 'Void'&$orderby=SlotStart&$top=500`),
        D.select('Rows', "@body('Todays_passes')?['value']", {
          Slot: "@item()?['SlotStart']", Company: "@item()?['SubcontractorName']", Load: "@item()?['Material']", Pallets: "@item()?['Pallets']",
          Gate: "@item()?['GateName']", Zone: "@item()?['ZoneName']", Pass: "@item()?['Title']", Contact: "@concat(item()?['ContactName'], ' ', item()?['ContactPhone'])",
        }),
        D.A('Table', { type: 'Table', inputs: { from: "@body('Rows')", format: 'HTML' } }),
        D.spGet('Gate_team', 'ProjectMembers', `$filter=ProjectId eq ${D.q(P('ProjectId'))} and Status eq 'Active' and (Role eq 'Access Control' or Role eq 'Admin')&$select=Email&$top=500`),
        D.foreach('Each_reader', "@body('Gate_team')?['value']", [
          D.mail('Send_list', "@{items('Each_reader')?['Email']}",
            `@{${P('Title')}} deliveries for @{formatDateTime(${today}, 'ddd M/d')}: @{length(body('Rows'))} trucks`,
            `<p><b>Not on this list = do not admit.</b></p>@{if(empty(body('Rows')), '<p>No deliveries booked today.</p>', body('Table'))}<p>Gate duty phone: @{coalesce(${P('GateDutyPhone')}, '—')}</p>`),
        ], 5),
      ], []),
    ], 1),
  ];
  return D.flow(D.recurrence('Hour', 1), D.tryCatch(steps, { appFacing: false }));
}

// ------------------------------------------------------------------ F09 Look-ahead upload
// The app reads the CSV and sends clean rows: [{id, name, trade, start, finish}] with YYYY-MM-DD dates.
function F09() {
  D.begin();
  const pid = C.pid();
  const row = (k) => `items('Each_row')?['${k}']`;
  const steps = [
    C.start('project.settings'),
    D.compose('Batch', `@concat(convertFromUtc(utcNow(), ${C.tz()}, 'yyyyMMdd-HHmm'), '-', ${C.caller()})`),
    D.filter('Rows', "@coalesce(outputs('In')?['rows'], createArray())",
      "@and(not(empty(trim(string(coalesce(item()?['id'], ''))))), not(empty(trim(string(coalesce(item()?['name'], ''))))), equals(length(string(coalesce(item()?['start'], ''))), 10), equals(length(string(coalesce(item()?['finish'], ''))), 10))"),
    D.cond('Has_rows', "@greater(length(body('Rows')), 0)", [], D.fail('No_rows', D.lit('No valid rows found. The CSV needs the columns ID, Activity, Trade, Start, Finish.'))),
    D.spGet('All_activities', 'Activities', `$filter=ProjectId eq ${D.q(pid)}&$select=ID,ActivityId,IsCurrent,ImportBatch&$top=5000`),
    D.foreach('Each_row', "@body('Rows')", [
      D.filter('Existing', "@body('All_activities')?['value']", `@equals(item()?['ActivityId'], trim(string(${row('id')})))`),
      D.compose('Activity_fields', {
        Title: `@{substring(trim(string(${row('name')})), 0, min(120, length(trim(string(${row('name')})))))}`, Key: `@{concat(${pid}, '|', trim(string(${row('id')})))}`,
        ProjectId: `@{${pid}}`, ActivityId: `@{trim(string(${row('id')}))}`, Trade: `@{trim(string(coalesce(${row('trade')}, '')))}`,
        StartDate: `@{${row('start')}}`, FinishDate: `@{${row('finish')}}`, IsCurrent: true, ImportBatch: "@{outputs('Batch')}",
      }),
      D.cond('Known_activity', "@not(empty(body('Existing')))", [
        D.spHttp('Update_activity', 'POST', `${D.list('Activities')}(@{first(body('Existing'))?['ID']})`, "@{outputs('Activity_fields')}", { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }),
      ], [D.spHttp('Create_activity', 'POST', D.list('Activities'), "@{outputs('Activity_fields')}")]),
    ], 10),
    // Activities not in this upload leave the look-ahead (their bookings keep their data).
    D.select('Uploaded_ids', "@body('Rows')", "@trim(string(item()?['id']))"),
    D.filter('Dropped', "@body('All_activities')?['value']", "@and(equals(item()?['IsCurrent'], true), not(contains(body('Uploaded_ids'), item()?['ActivityId'])))"),
    D.foreach('Each_dropped', "@body('Dropped')", [D.spUpdate('Not_current', 'Activities', "items('Each_dropped')?['ID']", { IsCurrent: false })], 10),
    C.audit('Audit_lookahead', 'project.settings', pid, "outputs('Batch')", "concat('Look-ahead: ', string(length(body('Rows'))), ' activities')"),
    D.okReply('Loaded', { loaded: "@length(body('Rows'))", message: "@{concat('Look-ahead updated: ', length(body('Rows')), ' activities.')}" }),
  ];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

module.exports = { F07, F08, F09 };
