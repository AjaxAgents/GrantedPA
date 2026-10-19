// A small builder for Power Automate (Logic Apps) flow definitions, so each Granted flow
// reads as a list of steps instead of 2,000 lines of hand-written JSON.
// Actions in a list run one after another (runAfter is filled in for you).
'use strict';

const CONN = {
  sp: { key: 'shared_sharepointonline', ref: 'gr_GrantedSharePoint', api: 'shared_sharepointonline' },
  mail: { key: 'shared_office365', ref: 'gr_GrantedOutlook', api: 'shared_office365' },
  excel: { key: 'shared_excelonlinebusiness', ref: 'gr_GrantedExcel', api: 'shared_excelonlinebusiness' },
  groups: { key: 'shared_office365groups', ref: 'gr_GrantedGroups', api: 'shared_office365groups' },
};

// Environment variables (solution env vars → flow parameters). The set-up script fills in the values.
const ENV = {
  site: { schema: 'gr_SiteUrl', name: 'Granted site URL', desc: 'The Granted SharePoint site, e.g. https://contoso.sharepoint.com/sites/Granted' },
  excelDrive: { schema: 'gr_ExcelDrive', name: 'Granted Excel library', desc: 'Drive id of the QRRunner library' },
  workbook: { schema: 'gr_ExcelWorkbook', name: 'Granted Excel workbook', desc: 'Drive item id of QR-Runner.xlsx' },
  script: { schema: 'gr_EngineScript', name: 'Granted engine script', desc: 'Drive item id of GrantedEngine.osts' },
  group: { schema: 'gr_UsersGroupId', name: 'Granted Users group', desc: 'Object id of the Granted Users group (the app is shared with it)' },
};
const env = (k) => `parameters('${ENV[k].name} (${ENV[k].schema})')`;

let used; // connectors and env vars used by the flow being built
function begin() { used = { conn: new Set(), env: new Set() }; }
const useEnv = (k) => { used.env.add(k); return env(k); };

/** Chain a list of [name, action] pairs: each runs after the one before it. */
function seq(list, first) {
  const out = {};
  let prev = first ? [first] : [];
  const put = (name, action, after) => {
    if (out[name]) throw new Error('Duplicate action name ' + name);
    action.runAfter = action.runAfter || Object.fromEntries(after.map((p) => [p, ['Succeeded']]));
    out[name] = action;
  };
  for (const item of flat(list)) {
    if (item.par) {
      // Parallel branches: each starts after the previous step; the next step waits for all of them.
      const tails = [];
      for (const branch of item.par) {
        let bprev = prev;
        for (const [name, action] of flat(branch)) { put(name, action, bprev); bprev = [name]; }
        tails.push(...bprev);
      }
      prev = tails;
      continue;
    }
    const [name, action] = item;
    put(name, action, prev);
    prev = [name];
  }
  return out;
}
function flat(list) {
  const out = [];
  const walk = (x) => { if (!x) return; if (x.par) { out.push(x); return; } if (Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && x[1] && typeof x[1] === 'object' && !Array.isArray(x[1])) { out.push(x); return; } if (Array.isArray(x)) x.forEach(walk); };
  walk(list);
  return out;
}
const par = (...branches) => ({ par: branches });

const A = (name, action) => [name, action];
const compose = (name, inputs) => A(name, { type: 'Compose', inputs });
const initVar = (name, variable, type, value) => A(name, { type: 'InitializeVariable', inputs: { variables: [{ name: variable, type, value }] } });
const setVar = (name, variable, value) => A(name, { type: 'SetVariable', inputs: { name: variable, value } });
const appendArr = (name, variable, value) => A(name, { type: 'AppendToArrayVariable', inputs: { name: variable, value } });
const appendStr = (name, variable, value) => A(name, { type: 'AppendToStringVariable', inputs: { name: variable, value } });
const incVar = (name, variable, value = 1) => A(name, { type: 'IncrementVariable', inputs: { name: variable, value } });
const select = (name, from, map) => A(name, { type: 'Select', inputs: { from, select: map } });
const filter = (name, from, where) => A(name, { type: 'Query', inputs: { from, where } });
const terminate = (name, status = 'Succeeded') => A(name, { type: 'Terminate', inputs: { runStatus: status } });

function cond(name, expression, yes, no) {
  return A(name, { type: 'If', expression, actions: seq(yes || []), else: { actions: seq(no || []) } });
}
function scope(name, actions) { return A(name, { type: 'Scope', actions: seq(actions) }); }
function foreach(name, items, actions, concurrency) {
  const a = { type: 'Foreach', foreach: items, actions: seq(actions) };
  if (concurrency) a.runtimeConfiguration = { concurrency: { repetitions: concurrency } };
  return A(name, a);
}
function until(name, expression, actions, count = 10) {
  return A(name, { type: 'Until', expression, limit: { count, timeout: 'PT10M' }, actions: seq(actions) });
}
function sw(name, on, cases, dflt) {
  const c = {};
  for (const [k, acts] of Object.entries(cases)) c['Case_' + k.replace(/[^A-Za-z0-9]/g, '_')] = { case: k, actions: seq(acts) };
  return A(name, { type: 'Switch', expression: on, cases: c, default: { actions: seq(dflt || []) } });
}

// ------------------------------------------------------------------ connectors
function api(c, operationId, parameters) {
  used.conn.add(c);
  return {
    type: 'OpenApiConnection',
    inputs: {
      host: { connectionName: CONN[c].key, operationId, apiId: '/providers/Microsoft.PowerApps/apis/' + CONN[c].api },
      parameters, authentication: "@parameters('$authentication')",
    },
  };
}

const NOMETA = 'application/json;odata=nometadata';
/** SharePoint REST call on the Granted site. Results: body('<name>')?['value'] for lists. */
function spHttp(name, method, uri, body, extraHeaders) {
  const headers = Object.assign({ Accept: NOMETA }, body !== undefined ? { 'Content-Type': NOMETA } : {}, extraHeaders || {});
  const p = { dataset: '@' + useEnv('site'), 'parameters/method': method, 'parameters/uri': uri, 'parameters/headers': headers };
  if (body !== undefined) p['parameters/body'] = body;
  return A(name, api('sp', 'HttpRequest', p));
}
const list = (t) => `_api/web/lists/getbytitle('${t}')/items`;
/** Quote a value for an OData $filter: @{q(expr)} → 'escaped' */
const q = (expr) => `'@{encodeUriComponent(replace(string(${expr}), '''', ''''''))}'`;
/** GET items. query: the part after '?', e.g. "$filter=Email eq @{...}&$top=1" (add $top=5000 for big reads). */
const spGet = (name, listTitle, query) => spHttp(name, 'GET', `${list(listTitle)}?${query}`);
const spGetById = (name, listTitle, idExpr) => spHttp(name, 'GET', `${list(listTitle)}(@{${idExpr}})`);
/** Create an item. fields: object whose values are expressions/literals (evaluated by a Compose first). */
const spCreate = (name, listTitle, fields) => [
  compose(name + '_fields', fields),
  spHttp(name, 'POST', list(listTitle), `@{outputs('${name}_fields')}`),
];
const spUpdate = (name, listTitle, idExpr, fields) => [
  compose(name + '_fields', fields),
  spHttp(name, 'POST', `${list(listTitle)}(@{${idExpr}})`, `@{outputs('${name}_fields')}`, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }),
];
const spDelete = (name, listTitle, idExpr) => spHttp(name, 'POST', `${list(listTitle)}(@{${idExpr}})`, undefined, { 'IF-MATCH': '*', 'X-HTTP-Method': 'DELETE' });
const rows = (name) => `body('${name}')?['value']`;
const firstRow = (name) => `first(body('${name}')?['value'])`;

/** Run the GrantedEngine Office Script (officescripts/GrantedEngine.ts). Result: json(body('<name>')?['result']). */
function engine(name, op, inputExpr, secure) {
  const a = api('excel', 'RunScriptProdV2', {
    source: '@' + useEnv('site'), drive: '@' + useEnv('excelDrive'), file: '@' + useEnv('workbook'),
    scriptSource: '@' + useEnv('site'), scriptDrive: '@' + useEnv('excelDrive'), scriptId: '@' + useEnv('script'),
    'ScriptParameters/op': op, 'ScriptParameters/input': inputExpr,
  });
  if (secure) a.runtimeConfiguration = { secureData: { properties: ['inputs', 'outputs'] } };
  return A(name, a);
}
const engineOut = (name) => `json(body('${name}')?['result'])`;

/** Send an email from the Granted account. to: expression or string with ; separators. */
function mail(name, to, subject, html, extra) {
  const p = { 'emailMessage/To': to, 'emailMessage/Subject': subject, 'emailMessage/Body': html, 'emailMessage/Importance': 'Normal' };
  Object.assign(p, extra || {});
  return A(name, api('mail', 'SendEmailV2', p));
}

function addToGroup(name, upnExpr) {
  return A(name, api('groups', 'AddMemberToGroup', { groupId: '@' + useEnv('group'), userUpn: upnExpr }));
}

// ------------------------------------------------------------------ triggers and responses
/** Power Apps (V2) trigger with three text inputs: projectId, viewAs, payload. */
function appTrigger() {
  const t = (title) => ({ title, type: 'string', 'x-ms-dynamically-added': true, description: title, 'x-ms-content-hint': 'TEXT' });
  return { manual: { type: 'Request', kind: 'PowerAppV2', inputs: { schema: { type: 'object', properties: { text: t('projectId'), text_1: t('viewAs'), text_2: t('payload') }, required: [] } } } };
}
/** Child-flow trigger ("Manually trigger a flow") with named text inputs. */
function childTrigger(names) {
  const props = {}; names.forEach((n, i) => {
    props[i ? 'text_' + i : 'text'] = { title: n, type: 'string', 'x-ms-dynamically-added': true, description: n, 'x-ms-content-hint': 'TEXT' };
  });
  return { manual: { type: 'Request', kind: 'Button', inputs: { schema: { type: 'object', properties: props, required: [] } } } };
}
const childIn = (i) => `triggerBody()?['${i ? 'text_' + i : 'text'}']`;
const recurrence = (frequency, interval, extra) => ({ Recurrence: { type: 'Recurrence', recurrence: Object.assign({ frequency, interval }, extra || {}) } });

/** Reply to the app or parent flow with {json: <text>}. The flow carries on (use respond() to stop). */
function reply(name, jsonExpr) {
  return A(name, { type: 'Response', kind: 'PowerApp', inputs: { statusCode: 200, body: { json: jsonExpr }, schema: { type: 'object', properties: { json: { title: 'json', 'x-ms-dynamically-added': true, type: 'string' } } } } });
}
/** Reply, then stop. */
const respond = (name, jsonExpr) => [reply(name, jsonExpr), terminate(name + '_end')];
/** Reply {"ok":false,"message":<msgExpr>} and stop. msgExpr is an expression, e.g. 'That project no longer exists.' in quotes. */
const fail = (name, msgExpr) => respond(name, `@{string(addProperty(addProperty(json('{}'), 'ok', false), 'message', ${msgExpr}))}`);
/** Reply {"ok":true, ...fields} (fields: object of literals or @expressions). */
const okReply = (name, fields, stop = true) => {
  const steps = [compose(name + '_out', Object.assign({ ok: true }, fields || {}))];
  steps.push(stop ? respond(name, `@{outputs('${name}_out')}`) : reply(name, `@{outputs('${name}_out')}`));
  return steps;
};
/** A WDL string literal. */
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Call a child flow. inputs: array of expressions, in the child's input order. Output: json(body('<name>')?['json']). */
function child(name, flowKey, inputs) {
  const body = {}; inputs.forEach((v, i) => { body[i ? 'text_' + i : 'text'] = v; });
  return A(name, { type: 'Workflow', inputs: { host: { workflowReferenceName: '{{FLOW:' + flowKey + '}}' }, body } });
}
const childOut = (name) => `json(body('${name}')?['json'])`;

/** Wrap a flow's steps in Try, with a Catch that tells support and answers the app. */
function tryCatch(steps, { appFacing = true } = {}) {
  // Variables must be initialised at the top level, so they go before Try (their values are literals).
  const all = flat(steps);
  const inits = all.filter((x) => !x.par && x[1].type === 'InitializeVariable');
  const rest = all.filter((x) => x.par || x[1].type !== 'InitializeVariable');
  const tryScope = scope('Try', rest);
  const catchSteps = [
    spGet('Catch_support', 'AppSettings', "$filter=Title eq 'SupportEmail'&$select=Value"),
    cond('Catch_have_support', `@not(empty(${firstRow('Catch_support')}?['Value']))`, [
      mail('Catch_tell_support', `@{${firstRow('Catch_support')}?['Value']}`, `Granted flow failed: @{workflow()?['tags']?['flowDisplayName']}`,
        `<p>The flow <b>@{workflow()?['tags']?['flowDisplayName']}</b> failed (run @{workflow()?['run']?['name']}).</p><pre>@{string(result('Try'))}</pre>`),
    ], []),
  ];
  if (appFacing) catchSteps.push(...respond('Catch_answer', '{"ok":false,"message":"Something went wrong. Try again in a moment."}'));
  catchSteps.push(terminate('Catch_failed', 'Failed'));
  const c = scope('Catch', catchSteps);
  c[1].runAfter = { Try: ['Failed', 'TimedOut'] };
  return [...inits, tryScope, c];
}

/** Assemble the flow file (the JSON Power Automate keeps in a solution). */
function flow(triggers, actions) {
  const parameters = { $connections: { defaultValue: {}, type: 'Object' }, $authentication: { defaultValue: {}, type: 'SecureObject' } };
  for (const k of [...used.env].sort()) {
    const e = ENV[k];
    parameters[`${e.name} (${e.schema})`] = { defaultValue: '', type: 'String', metadata: { schemaName: e.schema, description: e.desc } };
  }
  const connectionReferences = {};
  for (const c of [...used.conn].sort()) {
    connectionReferences[CONN[c].key] = { runtimeSource: 'embedded', connection: { connectionReferenceLogicalName: CONN[c].ref }, api: { name: CONN[c].api } };
  }
  return {
    properties: {
      connectionReferences,
      definition: {
        $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
        contentVersion: '1.0.0.0', parameters, triggers, actions: seq(actions),
      },
      templateName: '',
    },
    schemaVersion: '1.0.0.0',
  };
}

module.exports = {
  CONN, ENV, begin, seq, A, compose, initVar, setVar, appendArr, appendStr, incVar, select, filter, terminate, cond, scope, foreach, until, sw,
  spHttp, spGet, spCreate, spUpdate, spDelete, rows, firstRow, q, list, engine, engineOut, mail, addToGroup,
  appTrigger, childTrigger, childIn, recurrence, reply, respond, fail, okReply, lit, child, childOut, tryCatch, flow, env, useEnv, par, spGetById, flat,
};
