// F11 Enter a code · F12 Team · F13 Projects · F14 Profile
'use strict';
const D = require('../dsl');
const C = require('./common');

const secure = (step) => { step[1].runtimeConfiguration = { secureData: { properties: ['inputs', 'outputs'] } }; return step; };
const ROLES = "createArray('Contractor', 'Access Control', 'Admin')";
const cap = (expr, max) => `substring(trim(string(coalesce(${expr}, ''))), 0, min(${max}, length(trim(string(coalesce(${expr}, ''))))))`;
const digits = (expr) => `replace(replace(replace(replace(replace(replace(string(coalesce(${expr}, '')), '-', ''), ' ', ''), '(', ''), ')', ''), '.', ''), '+', '')`;
const slug = (expr) => `replace(replace(toLower(replace(replace(replace(replace(replace(replace(replace(replace(trim(string(coalesce(${expr}, ''))), '&', 'and'), '.', ''), ',', ''), '''', ''), '(', ''), ')', ''), '/', '-'), ' ', '-')), '--', '-'), '--', '-')`;
const appLink = () => C.auth('settings.appLink');
const linkHtml = () => `if(empty(${appLink()}), '', concat('<p><a href="', ${appLink()}, '">Open Granted</a></p>'))`;

/** Email everyone in a list of member rows (foreach, one email each). */
const mailEach = (name, rowsExpr, subject, html) => D.foreach(name, rowsExpr, [D.mail(name + '_send', `@{items('${name}')?['Email']}`, subject, html)], 5);

/** Steps that pick an unused project code into variables('NewCode'): <prefix>-XXXX. */
function newProjectCode(prefixExpr, tag) {
  return [
    D.setVar('Code_not_free_' + tag, 'CodeFree', false),
    D.until('Find_free_code_' + tag, "@equals(variables('CodeFree'), true)", [
      D.setVar('Try_code_' + tag, 'NewCode', `@{concat(${prefixExpr}, '-', ${[1, 2, 3, 4].map(() => "substring('ACDEFGHJKMNPQRTUVWXY34679', rand(0, 25), 1)").join(', ')})}`),
      D.spGet('Code_in_use_' + tag, 'Projects', "$filter=ProjectCode eq '@{variables('NewCode')}'&$select=ID&$top=1"),
      D.setVar('Code_free_' + tag, 'CodeFree', `@empty(body('Code_in_use_${tag}')?['value'])`),
    ], 20),
  ];
}

/** Add or reactivate a project membership (Title = projectId|email). fields: values for the row. */
function upsertMember(name, projectIdExpr, emailExpr, fields) {
  return [
    D.spGet(name + '_find', 'ProjectMembers', `$filter=Title eq '@{encodeUriComponent(concat(${projectIdExpr}, '|', toLower(${emailExpr})))}'&$select=ID&$top=1`),
    D.compose(name + '_fields', Object.assign({ Title: `@{concat(${projectIdExpr}, '|', toLower(${emailExpr}))}`, ProjectId: `@{${projectIdExpr}}`, Email: `@{toLower(${emailExpr})}`, Status: 'Active', AddedAt: '@utcNow()' }, fields)),
    D.cond(name + '_exists', `@not(empty(body('${name}_find')?['value']))`, [
      D.spHttp(name + '_update', 'POST', `${D.list('ProjectMembers')}(@{first(body('${name}_find')?['value'])?['ID']})`, `@{outputs('${name}_fields')}`, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }),
    ], [
      D.spHttp(name + '_create', 'POST', D.list('ProjectMembers'), `@{outputs('${name}_fields')}`),
    ]),
  ];
}

// ------------------------------------------------------------------ F11 Enter a code
function F11() {
  D.begin();
  const pidOf = "outputs('Found')?['ProjectId']";
  const name = "outputs('Found')?['Title']";
  const steps = [
    C.start('session'),
    D.cond('Has_profile', "@not(equals(outputs('Auth')?['needsProfile'], true))", [], D.fail('No_profile', D.lit('Finish setting up your Granted profile first.'))),
    D.compose('Code', "@toUpper(replace(trim(string(coalesce(outputs('In')?['code'], ''))), ' ', ''))"),
    D.cond('Code_given', "@not(empty(outputs('Code')))", [], D.fail('No_code', D.lit('Enter a project code.'))),
    D.spGet('Recent_failures', 'AuditLog', `$filter=ActorEmail eq ${D.q(C.caller())} and Title eq 'account.codeFailed' and At ge datetime'@{addHours(utcNow(), -1)}'&$select=ID&$top=10`),
    D.cond('Too_many', "@greaterOrEquals(length(body('Recent_failures')?['value']), 5)", D.fail('Slow_down', D.lit('Too many project code attempts. Try again in an hour.')), []),
    // The admin set-up code: compared as a hash, inside the Office Script, with secure inputs and outputs.
    secure(D.spGet('Get_admin_hash', 'SecureSettings', "$filter=Title eq 'AdminCodeHash'&$select=Value&$top=1")),
    secure(D.engine('Check_admin_code', 'adminCode', "@{string(addProperty(addProperty(json('{}'), 'code', outputs('Code')), 'stored', coalesce(first(body('Get_admin_hash')?['value'])?['Value'], '')))}", true)),
    D.cond('Is_admin_code', `@and(equals(${D.engineOut('Check_admin_code')}?['match'], true), ${C.isHome(C.caller())})`, [
      D.cond('Already_admin', `@equals(${C.person('isAdminAccount')}, true)`,
        D.okReply('Was_admin', { message: 'This account already has Admin access.' }), []),
      ...D.spUpdate('Make_admin', 'People', C.person('id'), { IsAdminAccount: true }),
      C.audit('Audit_admin', 'account.adminGranted', "''", C.caller(), "'Admin set-up code accepted'", 'false'),
      D.okReply('Now_admin', { message: 'Admin access is set up for this account. You can create projects now.', admin: true }),
    ], []),
    D.spGet('Find_project', 'Projects', "$filter=ProjectCode eq '@{encodeUriComponent(outputs('Code'))}' and Deleted eq 0&$top=1"),
    D.cond('Code_known', "@not(empty(body('Find_project')?['value']))", [], [
      C.audit('Audit_failed', 'account.codeFailed', "''", "outputs('Code')", "''", 'false'),
      D.fail('Unknown_code', D.lit('That project code was not found. Check it with your project admin.')),
    ]),
    D.compose('Found', "@first(body('Find_project')?['value'])"),
    D.par(
      [D.spGet('My_membership', 'ProjectMembers', `$filter=Title eq '@{encodeUriComponent(concat(${pidOf}, '|', ${C.caller()}))}' and Status eq 'Active'&$select=ID&$top=1`)],
      [D.spGet('My_invite', 'Invites', `$filter=ProjectId eq ${D.q(pidOf)} and Email eq ${D.q(C.caller())} and Status eq 'Pending'&$top=1`)],
      [D.spGet('My_request', 'JoinRequests', `$filter=ProjectId eq ${D.q(pidOf)} and Email eq ${D.q(C.caller())} and Status eq 'Pending'&$select=ID&$top=1`)],
    ),
    D.cond('Already_member', "@not(empty(body('My_membership')?['value']))",
      D.okReply('Was_member', { projectId: `@${pidOf}`, message: `@{concat('You’re already on ', ${name}, '.')}` }), []),
    D.cond('Has_invite', "@not(empty(body('My_invite')?['value']))", [
      D.compose('Invite', "@first(body('My_invite')?['value'])"),
      upsertMember('Join_by_invite', pidOf, C.caller(), {
        Role: "@{outputs('Invite')?['Role']}", Trade: "@{coalesce(outputs('Invite')?['Trade'], '')}", Via: 'Invite', AddedBy: "@{coalesce(outputs('Invite')?['InvitedBy'], '')}",
        FullName: `@{concat(${C.person('first')}, ' ', ${C.person('last')})}`, Company: `@{${C.person('company')}}`, CompanyKey: `@{${C.person('companyKey')}}`, Phone: `@{${C.person('phone')}}`,
      }),
      ...D.spUpdate('Accept_invite', 'Invites', "outputs('Invite')?['ID']", { Status: 'Accepted', AcceptedAt: '@utcNow()' }),
      C.audit('Audit_invite', 'team.inviteAccepted', pidOf, C.caller(), "outputs('Invite')?['Role']", 'false'),
      D.okReply('Invite_used', { projectId: `@${pidOf}`, message: `@{concat('Invite accepted. You have ', outputs('Invite')?['Role'], ' access to ', ${name}, '.')}` }),
    ], []),
    D.cond('Already_requested', "@not(empty(body('My_request')?['value']))",
      D.okReply('Still_waiting', { message: `@{concat('Your request to join ', ${name}, ' is still waiting for an admin.')}` }), []),
    D.spCreate('Create_request', 'JoinRequests', {
      Title: `@{concat(${C.person('first')}, ' ', ${C.person('last')})}`, ProjectId: `@{${pidOf}}`, Email: `@{${C.caller()}}`,
      FirstName: `@{${C.person('first')}}`, LastName: `@{${C.person('last')}}`, Company: `@{${C.person('company')}}`, Phone: `@{${C.person('phone')}}`,
      IsAjax: `@${C.isHome(C.caller())}`, Status: 'Pending', Source: 'App', RequestedAt: '@utcNow()',
    }),
    C.audit('Audit_join', 'team.joinRequested', pidOf, C.caller(), "''", 'false'),
    D.okReply('Requested', { message: `@{concat('Request sent. The ', ${name}, ' admins will choose your access.')}` }, false),
    C.membersWithRole('Project_admins', pidOf, 'Admin'),
    mailEach('Tell_admins', "@body('Project_admins')?['value']", `Join request: @{${C.person('first')}} @{${C.person('last')}} (@{${C.person('company')}}) for @{${name}}`,
      `<p>@{${C.person('first')}} @{${C.person('last')}} (@{${C.person('company')}}, @{${C.caller()}}) asked to join <b>@{${name}}</b>.</p><p>Open Granted → Approvals to choose their access.</p>@{${linkHtml()}}`),
  ];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

// ------------------------------------------------------------------ F12 Team
function F12() {
  D.begin();
  const op = "outputs('In')?['op']";
  const I = (k) => `outputs('In')?['${k}']`;
  const pid = C.pid();
  const projectName = C.auth('project.name');
  const adminCount = (name) => D.spGet(name, 'ProjectMembers', `$filter=ProjectId eq ${D.q(pid)} and Role eq 'Admin' and Status eq 'Active'&$select=ID&$top=10`);
  const J = (k) => `body('Get_join')?['${k}']`;
  let memberStep = 'Get_member_change';
  const M = (k) => `body('${memberStep}')?['${k}']`;

  const decideJoin = [
    D.spGetById('Get_join', 'JoinRequests', `int(coalesce(${I('joinId')}, 0))`),
    D.cond('Join_waiting', `@and(equals(${J('ProjectId')}, ${pid}), equals(${J('Status')}, 'Pending'))`, [], D.fail('Join_decided', D.lit('Someone already decided this request.'))),
    D.cond('Join_approve', `@equals(${I('approve')}, true)`, [
      D.cond('Role_ok', `@contains(${ROLES}, ${I('role')})`, [], D.fail('Pick_role', D.lit('Choose Contractor, Access Control or Admin.'))),
      upsertMember('Add_member', pid, J('Email'), {
        Role: `@{${I('role')}}`, Trade: `@{${cap(I('trade'), 60)}}`, Via: 'Request', AddedBy: `@{${C.actorName()}}`,
        FullName: `@{${J('Title')}}`, Company: `@{coalesce(${J('Company')}, '')}`, CompanyKey: `@{${slug(J('Company'))}}`, Phone: `@{coalesce(${J('Phone')}, '')}`,
      }),
      ...D.spUpdate('Mark_join_approved', 'JoinRequests', J('ID'), { Status: 'Approved', Role: `@{${I('role')}}`, Trade: `@{${cap(I('trade'), 60)}}`, DecidedBy: `@{${C.actorName()}}`, DecidedAt: '@utcNow()' }),
      C.audit('Audit_join_approved', 'team.joinApproved', pid, J('Email'), I('role')),
      D.okReply('Join_approved_reply', { message: `@{concat(${J('Title')}, ' was added as ', ${I('role')}, '.')}` }, false),
      D.child('Onboard_joiner', 'C4', [`@{${J('Email')}}`, `@{${J('Title')}}`]),
      D.mail('Tell_joiner', `@{${J('Email')}}`, `You’re on @{${projectName}}`,
        `<p>You now have <b>@{${I('role')}}</b> access to @{${projectName}} on Granted.</p><p>If you’re outside the company, accept the Microsoft invitation email first, then open Granted.</p>@{${linkHtml()}}`),
    ], [
      ...D.spUpdate('Mark_join_declined', 'JoinRequests', J('ID'), { Status: 'Declined', DecidedBy: `@{${C.actorName()}}`, DecidedAt: '@utcNow()' }),
      C.audit('Audit_join_declined', 'team.joinDeclined', pid, J('Email'), "''"),
      D.okReply('Join_declined_reply', { message: 'Request declined.' }, false),
      D.mail('Tell_declined', `@{${J('Email')}}`, `Request to join @{${projectName}}`, `<p>Your request to join @{${projectName}} on Granted wasn’t approved. Contact the project admin if you think this is a mistake.</p>`),
    ]),
  ];

  const invite = [
    D.compose('Invite_email', `@toLower(trim(string(coalesce(${I('email')}, ''))))`),
    D.cond('Email_ok', "@and(contains(outputs('Invite_email'), '@'), contains(last(split(outputs('Invite_email'), '@')), '.'), not(contains(outputs('Invite_email'), ' ')))", [], D.fail('Bad_email', D.lit('Enter a valid email address.'))),
    D.cond('Invite_role_ok', `@contains(${ROLES}, ${I('role')})`, [], D.fail('Invite_pick_role', D.lit('Choose Contractor, Access Control or Admin.'))),
    D.par(
      [D.spGet('Is_member', 'ProjectMembers', `$filter=Title eq '@{encodeUriComponent(concat(${pid}, '|', outputs('Invite_email')))}' and Status eq 'Active'&$select=ID&$top=1`)],
      [D.spGet('Has_invite', 'Invites', `$filter=ProjectId eq ${D.q(pid)} and Email eq ${D.q("outputs('Invite_email')")} and Status eq 'Pending'&$select=ID&$top=1`)],
    ),
    D.cond('Not_member_yet', "@empty(body('Is_member')?['value'])", [], D.fail('Already_on', D.lit('That person is already on this project.'))),
    D.cond('Not_invited_yet', "@empty(body('Has_invite')?['value'])", [], D.fail('Already_invited', D.lit('That person already has an invite waiting.'))),
    D.spCreate('Create_invite', 'Invites', {
      Title: "@{outputs('Invite_email')}", ProjectId: `@{${pid}}`, Email: "@{outputs('Invite_email')}", Role: `@{${I('role')}}`, Trade: `@{${cap(I('trade'), 60)}}`,
      InvitedBy: `@{${C.actorName()}}`, InvitedAt: '@utcNow()', ExpiresAt: '@{addDays(utcNow(), 7)}', Status: 'Pending',
    }),
    C.audit('Audit_invite', 'team.invited', pid, "outputs('Invite_email')", I('role')),
    D.okReply('Invited_reply', { message: `@{concat('Invite sent to ', outputs('Invite_email'), '.')}` }, false),
    D.child('Onboard_invitee', 'C4', ["@{outputs('Invite_email')}", "@{outputs('Invite_email')}"]),
    D.mail('Tell_invitee', "@{outputs('Invite_email')}", `@{${C.person('first')}} @{${C.person('last')}} invited you to @{${projectName}} on Granted`,
      `<p>You’re invited to <b>@{${projectName}}</b> as <b>@{${I('role')}}</b>. Granted is how deliveries are booked and checked in at the gate.</p><p>If you’re outside the company you’ll also get a Microsoft invitation email: accept it first. Then open Granted and set up your profile. The invite lasts 7 days.</p>@{${linkHtml()}}`),
  ];

  const revokeInvite = [
    D.spGetById('Get_invite', 'Invites', `int(coalesce(${I('inviteId')}, 0))`),
    D.cond('Invite_pending', `@and(equals(body('Get_invite')?['ProjectId'], ${pid}), equals(body('Get_invite')?['Status'], 'Pending'))`, [], D.fail('Invite_gone', D.lit('That invite was already used or revoked.'))),
    ...D.spUpdate('Revoke', 'Invites', "body('Get_invite')?['ID']", { Status: 'Revoked' }),
    C.audit('Audit_revoke', 'team.inviteRevoked', pid, "body('Get_invite')?['Email']", "''"),
    D.okReply('Revoked_reply', { message: 'Invite revoked.' }),
  ];

  const memberChecks = (prefix) => [
    D.cond(prefix + '_on_project', `@and(equals(${M('ProjectId')}, ${pid}), equals(${M('Status')}, 'Active'))`, [], D.fail(prefix + '_gone', D.lit('That person is no longer on this project.'))),
    D.cond(prefix + '_not_self', `@not(equals(toLower(${M('Email')}), ${C.caller()}))`, [], D.fail(prefix + '_self', D.lit(prefix === 'Remove' ? 'Use Leave project to remove yourself.' : 'You can’t change your own access.'))),
  ];

  memberStep = 'Get_member_change';
  const changeRole = [
    D.spGetById('Get_member_change', 'ProjectMembers', `int(coalesce(${I('memberId')}, 0))`),
    ...memberChecks('Change'),
    D.cond('New_role_ok', `@contains(${ROLES}, ${I('role')})`, [], D.fail('Change_pick_role', D.lit('Choose Contractor, Access Control or Admin.'))),
    adminCount('Admins_now'),
    D.cond('Keeps_an_admin', `@or(not(equals(${M('Role')}, 'Admin')), equals(${I('role')}, 'Admin'), greater(length(body('Admins_now')?['value']), 1))`, [], D.fail('Last_admin', D.lit('A project needs at least one admin.'))),
    ...D.spUpdate('Change', 'ProjectMembers', M('ID'), { Role: `@{${I('role')}}`, Trade: `@{${cap(I('trade'), 60)}}` }),
    C.audit('Audit_change', 'team.roleChanged', pid, M('Email'), `concat(${M('Role')}, ' → ', ${I('role')})`),
    D.okReply('Changed_reply', { message: `@{concat(coalesce(${M('FullName')}, ${M('Email')}), ' now has ', ${I('role')}, ' access.')}` }, false),
    D.mail('Tell_changed', `@{${M('Email')}}`, `Your access on @{${projectName}} changed`, `<p>You now have <b>@{${I('role')}}</b> access to @{${projectName}} on Granted.</p>@{${linkHtml()}}`),
  ];

  memberStep = 'Get_member_remove';
  const remove = [
    D.spGetById('Get_member_remove', 'ProjectMembers', `int(coalesce(${I('memberId')}, 0))`),
    ...memberChecks('Remove'),
    adminCount('Admins_before_remove'),
    D.cond('Not_last_admin', `@or(not(equals(${M('Role')}, 'Admin')), greater(length(body('Admins_before_remove')?['value']), 1))`, [], D.fail('Remove_last_admin', D.lit('A project needs at least one admin.'))),
    ...D.spUpdate('Remove', 'ProjectMembers', M('ID'), { Status: 'Removed', RemovedBy: `@{${C.actorName()}}`, RemovedAt: '@utcNow()' }),
    C.audit('Audit_remove', 'team.removed', pid, M('Email'), "''"),
    D.okReply('Removed_reply', { message: `@{concat(coalesce(${M('FullName')}, ${M('Email')}), ' was removed.')}` }, false),
    D.mail('Tell_removed', `@{${M('Email')}}`, `Removed from @{${projectName}}`, `<p>Your access to @{${projectName}} on Granted has ended. Contact the project admin if you think this is a mistake.</p>`),
  ];

  const leave = [
    adminCount('Admins_before_leave'),
    D.cond('Can_leave', `@or(not(equals(${C.auth('realRole')}, 'Admin')), greater(length(body('Admins_before_leave')?['value']), 1))`, [], D.fail('Only_admin', D.lit('You’re the only admin. Make someone else an admin first.'))),
    ...D.spUpdate('Leave', 'ProjectMembers', C.auth('memberId'), { Status: 'Removed', RemovedBy: `@{${C.actorName()}}`, RemovedAt: '@utcNow()' }),
    C.audit('Audit_leave', 'team.left', pid, C.caller(), "''"),
    D.okReply('Left_reply', { message: `@{concat('You left ', ${projectName}, '.')}` }),
  ];

  const perm = `@{if(equals(${op}, 'decideJoin'), 'team.approve', if(or(equals(${op}, 'invite'), equals(${op}, 'revokeInvite')), 'team.invite', if(equals(${op}, 'changeRole'), 'team.changeRole', if(equals(${op}, 'remove'), 'team.remove', 'project.view'))))}`;
  const steps = [C.start(perm), D.sw('Op', `@${op}`, { decideJoin, invite, revokeInvite, changeRole, remove, leave }, D.fail('Unknown_op', D.lit('Unknown request.')))];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

// ------------------------------------------------------------------ F13 Projects
function F13() {
  D.begin();
  const op = "outputs('In')?['op']";
  const I = (k) => `outputs('In')?['${k}']`;
  const pid = C.pid();
  const ALNUM = "'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'";
  const needAdminAccount = (n) => D.cond(n, `@and(equals(${C.person('isAdminAccount')}, true), ${C.isHome(C.caller())})`, [], D.fail(n + '_no', D.lit('Only admin accounts can do that.')));
  const DEFAULT_GATES = [['G1', 'Gate 1', 2, 1], ['G2', 'Gate 2', 1, 2]];
  const DEFAULT_ZONES = [['Z1', 'Laydown yard', 40], ['Z2', 'Building staging', 12]];

  const create = [
    needAdminAccount('Can_create'),
    D.compose('Name', `@${cap(I('name'), 80)}`),
    D.cond('Name_given', "@not(empty(outputs('Name')))", [], D.fail('No_name', D.lit('Enter a project name.'))),
    D.filter('Words', "@split(toUpper(outputs('Name')), ' ')", "@not(empty(item()))"),
    D.select('Initials', "@body('Words')", "@substring(item(), 0, 1)"),
    D.filter('Initials_ok', "@body('Initials')", `@greaterOrEquals(indexOf(${ALNUM}, item()), 0)`),
    D.compose('Prefix', `@if(greaterOrEquals(length(body('Initials_ok')), 2), substring(join(body('Initials_ok'), ''), 0, min(5, length(body('Initials_ok')))), 'PRJ')`),
    ...newProjectCode("outputs('Prefix')", 'new'),
    D.compose('NewProjectId', "@concat('p-', toLower(substring(replace(guid(), '-', ''), 0, 8)))"),
    D.compose('Zone', `@if(empty(trim(coalesce(${I('timeZone')}, ''))), 'Central Standard Time', trim(${I('timeZone')}))`),
    D.compose('Check_zone', "@convertFromUtc(utcNow(), outputs('Zone'), 'HH:mm')"),
    D.spGet('Get_defaults', 'AppSettings', "$filter=Title eq 'DefaultSettingsJson'&$select=Value&$top=1"),
    D.compose('Settings', "@setProperty(setProperty(setProperty(json(coalesce(first(body('Get_defaults')?['value'])?['Value'], '{}')), 'passPrefix', outputs('Prefix')), 'project', outputs('Name')), 'timeZone', outputs('Zone'))"),
    D.spCreate('Create_project', 'Projects', {
      Title: "@{outputs('Name')}", ProjectId: "@{outputs('NewProjectId')}", ProjectCode: "@{variables('NewCode')}", PassPrefix: "@{outputs('Prefix')}",
      Location: `@{${cap(I('location'), 120)}}`, TimeZone: "@{outputs('Zone')}", SettingsJson: "@{string(outputs('Settings'))}", Deleted: false,
      CreatedByEmail: `@{${C.caller()}}`, CreatedAtUtc: '@utcNow()',
    }),
    D.foreach('Default_gates', `@json('${JSON.stringify(DEFAULT_GATES.map(([id, name, cap2, sort]) => ({ id, name, cap: cap2, sort })))}')`, [
      D.spCreate('Add_gate', 'Gates', {
        Title: "@{items('Default_gates')?['name']}", Key: "@{concat(outputs('NewProjectId'), '|', items('Default_gates')?['id'])}", ProjectId: "@{outputs('NewProjectId')}",
        GateId: "@{items('Default_gates')?['id']}", CapacityPerSlot: "@items('Default_gates')?['cap']", Active: true, SortOrder: "@items('Default_gates')?['sort']",
      }),
    ], 5),
    D.foreach('Default_zones', `@json('${JSON.stringify(DEFAULT_ZONES.map(([id, name, cap2]) => ({ id, name, cap: cap2 })))}')`, [
      D.spCreate('Add_zone', 'StagingZones', {
        Title: "@{items('Default_zones')?['name']}", Key: "@{concat(outputs('NewProjectId'), '|', items('Default_zones')?['id'])}", ProjectId: "@{outputs('NewProjectId')}",
        ZoneId: "@{items('Default_zones')?['id']}", CapacityPallets: "@items('Default_zones')?['cap']", Active: true,
      }),
    ], 5),
    upsertMember('Add_creator', "outputs('NewProjectId')", C.caller(), {
      Role: 'Admin', Via: 'Creator', AddedBy: `@{concat(${C.person('first')}, ' ', ${C.person('last')})}`,
      FullName: `@{concat(${C.person('first')}, ' ', ${C.person('last')})}`, Company: `@{${C.person('company')}}`, CompanyKey: `@{${C.person('companyKey')}}`, Phone: `@{${C.person('phone')}}`,
    }),
    C.audit('Audit_create', 'project.created', "outputs('NewProjectId')", "variables('NewCode')", "outputs('Name')", 'false'),
    D.okReply('Created_reply', { projectId: "@outputs('NewProjectId')", code: "@variables('NewCode')", name: "@outputs('Name')",
      message: "@{concat(outputs('Name'), ' is ready. Project code ', variables('NewCode'), '. Share it, or invite people from Team & Invites.')}" }, false),
    D.mail('Tell_creator', `@{${C.caller()}}`, "Project created: @{outputs('Name')} (@{variables('NewCode')})",
      "<p><b>@{outputs('Name')}</b> is ready on Granted.</p><p>Project code: <b>@{variables('NewCode')}</b>. Share it with the team, or invite people from Team &amp; Invites.</p><p>Next: check the gates, zones and rules in Project Settings, and upload the look-ahead.</p>"),
  ];

  const num = (k, lo, hi, dflt) => `max(${lo}, min(${hi}, int(coalesce(${I('settings')}?['${k}'], ${C.S(k)}, ${dflt}))))`;
  const settings = [
    D.compose('New_name', `@if(empty(${cap(I('name'), 80)}), ${C.auth('project.name')}, ${cap(I('name'), 80)})`),
    D.compose('New_zone', `@if(empty(trim(coalesce(${I('timeZone')}, ''))), ${C.tz()}, trim(${I('timeZone')}))`),
    D.compose('Check_new_zone', "@convertFromUtc(utcNow(), outputs('New_zone'), 'HH:mm')"),
    D.compose('Open', `@coalesce(${I('settings')}?['gateOpen'], ${C.S('gateOpen')}, '06:00')`),
    D.compose('Close', `@coalesce(${I('settings')}?['gateClose'], ${C.S('gateClose')}, '16:00')`),
    D.cond('Hours_ok', "@and(equals(length(outputs('Open')), 5), equals(length(outputs('Close')), 5), less(ticks(concat('2000-01-01T', outputs('Open'), ':00')), ticks(concat('2000-01-01T', outputs('Close'), ':00'))))", [],
      D.fail('Bad_hours', D.lit('Gate hours must be HH:MM, and the gate must open before it closes.'))),
    D.compose('New_settings', `@setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(${C.auth('project.settings')}, 'minNoticeHours', ${num('minNoticeHours', 0, 336, 48)}), 'maxDaysBeforeInstall', ${num('maxDaysBeforeInstall', 0, 60, 7)}), 'gateToleranceMinutes', ${num('gateToleranceMinutes', 0, 240, 60)}), 'maxPalletsPerRequest', ${num('maxPalletsPerRequest', 1, 500, 20)}), 'slotMinutes', ${num('slotMinutes', 15, 240, 60)}), 'gateOpen', outputs('Open')), 'gateClose', outputs('Close')), 'workDays', coalesce(${I('settings')}?['workDays'], ${C.S('workDays')}, createArray(1, 2, 3, 4, 5, 6))), 'timeZone', outputs('New_zone'))`),
    ...D.spUpdate('Save_project', 'Projects', C.auth('project.spId'), {
      Title: "@{outputs('New_name')}", Location: `@{if(empty(${cap(I('location'), 120)}), ${C.auth('project.location')}, ${cap(I('location'), 120)})}`,
      TimeZone: "@{outputs('New_zone')}", SettingsJson: "@{string(outputs('New_settings'))}",
    }),
    // Gates and zones: upsert by key; anything left out is switched off, never deleted.
    D.par(
      [D.spGet('All_gates', 'Gates', `$filter=ProjectId eq ${D.q(pid)}&$top=500`)],
      [D.spGet('All_zones', 'StagingZones', `$filter=ProjectId eq ${D.q(pid)}&$top=500`)],
    ),
    D.foreach('Each_gate', `@coalesce(${I('gates')}, createArray())`, [
      D.filter('Gate_row', "@body('All_gates')?['value']", "@equals(item()?['GateId'], items('Each_gate')?['id'])"),
      D.compose('Gate_fields', {
        Title: `@{${cap("items('Each_gate')?['name']", 60)}}`, Key: `@{concat(${pid}, '|', items('Each_gate')?['id'])}`, ProjectId: `@{${pid}}`, GateId: "@{items('Each_gate')?['id']}",
        CapacityPerSlot: "@max(1, min(20, int(coalesce(items('Each_gate')?['capacityPerSlot'], 1))))", Active: true, SortOrder: "@add(int(coalesce(items('Each_gate')?['sort'], 0)), 0)",
      }),
      D.cond('Gate_exists', "@not(empty(body('Gate_row')))", [
        D.spHttp('Update_gate', 'POST', `${D.list('Gates')}(@{first(body('Gate_row'))?['ID']})`, "@{outputs('Gate_fields')}", { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }),
      ], [D.spHttp('Create_gate', 'POST', D.list('Gates'), "@{outputs('Gate_fields')}")]),
    ], 1),
    D.select('Kept_gate_ids', `@coalesce(${I('gates')}, createArray())`, "@item()?['id']"),
    D.filter('Dropped_gates', "@body('All_gates')?['value']", "@and(equals(item()?['Active'], true), not(contains(body('Kept_gate_ids'), item()?['GateId'])))"),
    D.foreach('Each_dropped_gate', "@body('Dropped_gates')", [D.spUpdate('Gate_off', 'Gates', "items('Each_dropped_gate')?['ID']", { Active: false })], 5),
    D.foreach('Each_zone', `@coalesce(${I('zones')}, createArray())`, [
      D.filter('Zone_row', "@body('All_zones')?['value']", "@equals(item()?['ZoneId'], items('Each_zone')?['id'])"),
      D.compose('Zone_fields', {
        Title: `@{${cap("items('Each_zone')?['name']", 60)}}`, Key: `@{concat(${pid}, '|', items('Each_zone')?['id'])}`, ProjectId: `@{${pid}}`, ZoneId: "@{items('Each_zone')?['id']}",
        CapacityPallets: "@max(0, min(10000, int(coalesce(items('Each_zone')?['capacityPallets'], 0))))", Active: true,
      }),
      D.cond('Zone_exists', "@not(empty(body('Zone_row')))", [
        D.spHttp('Update_zone', 'POST', `${D.list('StagingZones')}(@{first(body('Zone_row'))?['ID']})`, "@{outputs('Zone_fields')}", { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }),
      ], [D.spHttp('Create_zone', 'POST', D.list('StagingZones'), "@{outputs('Zone_fields')}")]),
    ], 1),
    D.select('Kept_zone_ids', `@coalesce(${I('zones')}, createArray())`, "@item()?['id']"),
    D.filter('Dropped_zones', "@body('All_zones')?['value']", "@and(equals(item()?['Active'], true), not(contains(body('Kept_zone_ids'), item()?['ZoneId'])))"),
    D.foreach('Each_dropped_zone', "@body('Dropped_zones')", [D.spUpdate('Zone_off', 'StagingZones', "items('Each_dropped_zone')?['ID']", { Active: false })], 5),
    C.audit('Audit_settings', 'project.settings', pid, pid, "string(outputs('New_settings'))"),
    D.okReply('Saved_reply', { message: 'Project settings saved.' }),
  ];

  const regenerateCode = [
    needAdminAccount('Can_regenerate'),
    ...newProjectCode(`coalesce(${C.auth('project.passPrefix')}, 'PRJ')`, 'again'),
    ...D.spUpdate('Save_code', 'Projects', C.auth('project.spId'), { ProjectCode: "@{variables('NewCode')}" }),
    C.audit('Audit_code', 'project.codeReplaced', pid, "variables('NewCode')", `concat(${C.auth('project.code')}, ' → ', variables('NewCode'))`),
    D.okReply('Code_reply', { code: "@variables('NewCode')", message: "@{concat('New project code: ', variables('NewCode'), '. The old code no longer works.')}" }),
  ];

  const suspend = [
    D.spGet('Get_company', 'Companies', `$filter=ProjectId eq ${D.q(pid)} and CompanyKey eq ${D.q(I('subId'))}&$top=1`),
    D.compose('Company_fields', {
      Title: `@{coalesce(${I('subName')}, ${I('subId')})}`, ProjectId: `@{${pid}}`, CompanyKey: `@{${I('subId')}}`, Suspended: `@equals(${I('suspended')}, true)`,
      SuspendedBy: `@{${C.actorName()}}`, SuspendedAt: '@utcNow()',
    }),
    D.cond('Company_exists', "@not(empty(body('Get_company')?['value']))", [
      D.spHttp('Update_company', 'POST', `${D.list('Companies')}(@{first(body('Get_company')?['value'])?['ID']})`, "@{outputs('Company_fields')}", { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }),
    ], [D.spHttp('Create_company', 'POST', D.list('Companies'), "@{outputs('Company_fields')}")]),
    C.audit('Audit_suspend', 'project.companySuspended', pid, I('subId'), `string(${I('suspended')})`),
    D.okReply('Suspend_reply', { message: `@{if(equals(${I('suspended')}, true), 'Company suspended. Its passes turn red at the gate.', 'Company restored.')}` }),
  ];

  const del = [
    needAdminAccount('Can_delete'),
    D.cond('Code_matches', `@equals(toUpper(trim(string(coalesce(${I('confirmCode')}, '')))), ${C.auth('project.code')})`, [], D.fail('Wrong_code', D.lit('Type the project code exactly to confirm.'))),
    ...D.spUpdate('Mark_deleted', 'Projects', C.auth('project.spId'), { Deleted: true, DeletedAt: '@utcNow()', DeletedBy: `@{${C.caller()}}` }),
    C.audit('Audit_delete', 'project.deleted', pid, pid, C.auth('project.name')),
    D.okReply('Deleted_reply', { message: 'Project deleted. Its records are kept for the audit trail.' }),
  ];

  const perm = `@{if(equals(${op}, 'create'), 'session', if(equals(${op}, 'delete'), 'project.delete', 'project.settings'))}`;
  const steps = [
    D.initVar('Init_code', 'NewCode', 'string', ''),
    D.initVar('Init_free', 'CodeFree', 'boolean', false),
    C.start(perm),
    D.sw('Op', `@${op}`, { create, settings, regenerateCode, suspend, delete: del }, D.fail('Unknown_op', D.lit('Unknown request.'))),
  ];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

// ------------------------------------------------------------------ F14 Profile
function F14() {
  D.begin();
  const op = "outputs('In')?['op']";
  const I = (k) => `outputs('In')?['${k}']`;
  const validate = (prefix) => [
    D.compose(prefix + '_first', `@${cap(I('first'), 50)}`),
    D.compose(prefix + '_last', `@${cap(I('last'), 50)}`),
    D.compose(prefix + '_company', `@${cap(I('company'), 80)}`),
    D.compose(prefix + '_digits', `@${digits(I('phone'))}`),
    D.compose(prefix + '_phone', `@if(and(equals(length(outputs('${prefix}_digits')), 11), startsWith(outputs('${prefix}_digits'), '1')), substring(outputs('${prefix}_digits'), 1, 10), outputs('${prefix}_digits'))`),
    D.cond(prefix + '_valid', `@and(not(empty(outputs('${prefix}_first'))), not(empty(outputs('${prefix}_last'))), not(empty(outputs('${prefix}_company'))), equals(length(outputs('${prefix}_phone')), 10))`, [],
      D.fail(prefix + '_invalid', D.lit('Enter your first and last name, a 10-digit phone number and your company.'))),
  ];
  const v = (prefix, k) => `outputs('${prefix}_${k}')`;
  const fmtPhone = (prefix) => `concat(substring(${v(prefix, 'phone')}, 0, 3), '-', substring(${v(prefix, 'phone')}, 3, 3), '-', substring(${v(prefix, 'phone')}, 6, 4))`;

  const create = [
    D.cond('New_person', "@equals(outputs('Auth')?['needsProfile'], true)", [], D.fail('Exists', D.lit('Your profile is already set up.'))),
    ...validate('New'),
    D.spCreate('Create_person', 'People', {
      Title: `@{concat(${v('New', 'first')}, ' ', ${v('New', 'last')})}`, Email: `@{${C.caller()}}`, FirstName: `@{${v('New', 'first')}}`, LastName: `@{${v('New', 'last')}}`,
      Phone: `@{${fmtPhone('New')}}`, Company: `@{${v('New', 'company')}}`, CompanyKey: `@{${slug(v('New', 'company'))}}`,
      IsAjax: `@endsWith(${C.caller()}, concat('@', ${C.auth('settings.homeDomain')}))`, IsAdminAccount: false, Status: 'Active', Source: 'App', CreatedAtUtc: '@utcNow()',
    }),
    C.audit('Audit_profile', 'account.profileCreated', "''", C.caller(), "''", 'false'),
    D.okReply('Created_reply', { message: 'Your Granted profile is ready.' }),
  ];

  const save = [
    ...validate('Edit'),
    ...D.spUpdate('Save_person', 'People', C.person('id'), {
      Title: `@{concat(${v('Edit', 'first')}, ' ', ${v('Edit', 'last')})}`, FirstName: `@{${v('Edit', 'first')}}`, LastName: `@{${v('Edit', 'last')}}`,
      Phone: `@{${fmtPhone('Edit')}}`, Company: `@{${v('Edit', 'company')}}`, CompanyKey: `@{${slug(v('Edit', 'company'))}}`,
    }),
    D.spGet('My_rows', 'ProjectMembers', `$filter=Email eq ${D.q(C.caller())}&$select=ID&$top=500`),
    D.foreach('Each_row', "@body('My_rows')?['value']", [
      D.spUpdate('Row_update', 'ProjectMembers', "items('Each_row')?['ID']", {
        FullName: `@{concat(${v('Edit', 'first')}, ' ', ${v('Edit', 'last')})}`, Phone: `@{${fmtPhone('Edit')}}`, Company: `@{${v('Edit', 'company')}}`, CompanyKey: `@{${slug(v('Edit', 'company'))}}`,
      }),
    ], 10),
    D.okReply('Saved_reply', { message: 'Profile saved.' }),
  ];

  const del = [
    D.spGet('My_active', 'ProjectMembers', `$filter=Email eq ${D.q(C.caller())} and Status eq 'Active'&$top=500`),
    D.filter('My_admin_rows', "@body('My_active')?['value']", "@equals(item()?['Role'], 'Admin')"),
    D.foreach('Each_admin_row', "@body('My_admin_rows')", [
      C.membersWithRole('Admins_here', "items('Each_admin_row')?['ProjectId']", 'Admin'),
      D.cond('Only_admin_here', "@lessOrEquals(length(body('Admins_here')?['value']), 1)", [D.appendArr('Note_blocked', 'Blocked', "@items('Each_admin_row')?['ProjectId']")], []),
    ], 1),
    D.cond('Blocked', "@empty(variables('Blocked'))", [], D.fail('Sole_admin', D.lit('You’re the only admin on one of your projects. Make someone else an admin first, or delete the project.'))),
    D.foreach('Leave_all', "@body('My_active')?['value']", [D.spUpdate('Leave_one', 'ProjectMembers', "items('Leave_all')?['ID']", { Status: 'Removed', RemovedBy: 'Account deleted', RemovedAt: '@utcNow()' })], 10),
    D.par(
      [D.spGet('My_join_requests', 'JoinRequests', `$filter=Email eq ${D.q(C.caller())} and Status eq 'Pending'&$select=ID&$top=500`)],
      [D.spGet('My_bookings', 'DeliveryRequests', `$filter=SubmittedByEmail eq ${D.q(C.caller())}&$select=ID&$top=5000`)],
      [D.spGet('My_messages', 'Notifications', `$filter=RecipientEmail eq ${D.q(C.caller())}&$select=ID&$top=5000`)],
    ),
    D.foreach('Decline_all', "@body('My_join_requests')?['value']", [D.spUpdate('Decline_one', 'JoinRequests', "items('Decline_all')?['ID']", { Status: 'Declined', DecidedBy: 'Account deleted' })], 10),
    D.foreach('Anonymise_bookings', "@body('My_bookings')?['value']", [D.spUpdate('Anonymise_one', 'DeliveryRequests', "items('Anonymise_bookings')?['ID']", { SubmittedByName: 'Deleted user', SubmittedByEmail: '' })], 10),
    D.foreach('Delete_messages', "@body('My_messages')?['value']", [D.spDelete('Delete_one', 'Notifications', "items('Delete_messages')?['ID']")], 10),
    ...D.spUpdate('Close_person', 'People', C.person('id'), {
      Title: 'Deleted user', Email: `@{concat('deleted-', ${C.person('id')}, '@deleted.invalid')}`, FirstName: '', LastName: '', Phone: '', Company: '', Status: 'Deleted', IsAdminAccount: false,
    }),
    C.audit('Audit_deleted', 'account.deleted', "''", `concat('person ', ${C.person('id')})`, "''", 'false'),
    D.okReply('Deleted_reply', { message: 'Your Granted profile was deleted.' }, false),
    D.cond('Was_guest', `@and(not(${C.isHome(C.caller())}), not(empty(${C.auth('settings.supportEmail')})))`, [
      D.mail('Ask_IT', `@{${C.auth('settings.supportEmail')}}`, 'Granted: remove a guest account',
        `<p>A guest deleted their Granted profile. Please remove their guest account from Microsoft Entra ID and from the Granted Users group: <b>@{${C.caller()}}</b>.</p>`),
    ], []),
  ];

  const perm = `@{if(equals(${op}, 'create'), 'profile.create', 'session')}`;
  const steps = [
    D.initVar('Init_blocked', 'Blocked', 'array', []),
    C.start(perm),
    D.cond('Profile_needed', `@and(equals(outputs('Auth')?['needsProfile'], true), not(equals(${op}, 'create')))`, D.fail('Set_up_first', D.lit('Finish setting up your Granted profile first.')), []),
    D.sw('Op', `@${op}`, { create, save, delete: del }, D.fail('Unknown_op', D.lit('Unknown request.'))),
  ];
  return D.flow(D.appTrigger(), D.tryCatch(steps));
}

module.exports = { F11, F12, F13, F14 };
