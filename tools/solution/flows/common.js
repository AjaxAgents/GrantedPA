// Steps shared by the Granted flows.
'use strict';
const D = require('../dsl');

/** Start of every app-facing flow: parse the payload, read the caller, run C1 Authorize for `action`. */
function start(action) {
  return [
    D.compose('In', "@json(if(empty(triggerBody()?['text_2']), '{}', triggerBody()?['text_2']))"),
    D.compose('Caller', "@toLower(triggerOutputs()?['headers']?['x-ms-user-email'])"),
    D.compose('ProjectIdIn', "@trim(coalesce(triggerBody()?['text'], ''))"),
    D.child('Authorize', 'C1', ["@{outputs('Caller')}", "@{outputs('ProjectIdIn')}", "@{coalesce(triggerBody()?['text_1'], '')}", typeof action === 'string' && !action.startsWith('@') ? action : action]),
    D.compose('Auth', '@' + D.childOut('Authorize')),
    D.cond('Is_allowed', "@equals(outputs('Auth')?['ok'], true)", [], D.respond('Not_allowed', "@{outputs('Auth')}")),
  ];
}

// Values from C1's answer.
const auth = (path) => `outputs('Auth')?${path.split('.').map((p) => `['${p}']`).join('?')}`;
const pid = () => auth('project.id');
const tz = () => auth('project.timeZone');
const S = (k) => `${auth('project.settings')}?['${k}']`;
const role = () => auth('role');
const person = (k) => auth('person.' + k);
const caller = () => "outputs('Caller')";
const nowLocal = (tzExpr) => `convertFromUtc(utcNow(), ${tzExpr || tz()}, 'yyyy-MM-ddTHH:mm:ss')`;
const todayLocal = (tzExpr) => `convertFromUtc(utcNow(), ${tzExpr || tz()}, 'yyyy-MM-dd')`;
const dayNo = (ymdExpr) => `int(replace(${ymdExpr}, '-', ''))`;
const actorName = () => `concat(${person('first')}, ' ', ${person('last')}, if(equals(${auth('maintenance')}, true), ' (maintenance)', ''))`;
const homeDomain = () => auth('settings.homeDomain');
const isHome = (emailExpr) => `endsWith(toLower(${emailExpr}), concat('@', toLower(${homeDomain()})))`;

/** One AuditLog row. */
function audit(name, action, projectIdExpr, targetExpr, detailsExpr, maintenanceExpr) {
  return D.spCreate(name, 'AuditLog', {
    Title: action, ActorEmail: `@{${caller()}}`, ProjectId: `@{${projectIdExpr || "''"}}`, Target: `@{${targetExpr || "''"}}`,
    Details: `@{${detailsExpr || "''"}}`, At: '@utcNow()', Maintenance: maintenanceExpr ? `@${maintenanceExpr}` : `@equals(${auth('maintenance')}, true)`,
  });
}

/** Read every active member of a project with a given role; result: body('<name>')?['value']. */
const membersWithRole = (name, projectIdExpr, roleName) =>
  D.spGet(name, 'ProjectMembers', `$filter=ProjectId eq ${D.q(projectIdExpr)} and Role eq '${roleName}' and Status eq 'Active'&$select=Email,FullName&$top=500`);

module.exports = { start, auth, pid, tz, S, role, person, caller, nowLocal, todayLocal, dayNo, actorName, homeDomain, isHome, audit, membersWithRole };
