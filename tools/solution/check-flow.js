// Static checks for the generated flows, so mistakes show up here instead of at import:
//  - every expression parses (balanced brackets, quoted strings, known functions)
//  - outputs()/body()/actions()/items()/result() name an action that exists, variables() a declared variable,
//    parameters() a declared parameter
//  - runAfter points at a sibling action; variables are initialised at the top level only;
//    Response and Terminate are never inside a loop
'use strict';

const FUNCS = new Set(('actions action body outputs items item result variables parameters triggerBody triggerOutputs trigger workflow ' +
  'concat substring replace split trim toLower toUpper indexOf lastIndexOf startsWith endsWith length empty contains first last join ' +
  'union intersection skip take createArray json string int float bool coalesce if equals not and or greater greaterOrEquals less ' +
  'lessOrEquals add sub mul div mod min max range rand utcNow addDays addHours addMinutes addSeconds formatDateTime convertFromUtc ' +
  'convertToUtc convertTimeZone ticks dayOfWeek dayOfMonth startOfDay base64 base64ToString decodeUriComponent encodeUriComponent ' +
  'uriComponent guid addProperty setProperty removeProperty xpath xml formatNumber dataUri iterationIndexes sort reverse slice chunk nthIndexOf').split(/\s+/));

function tokenize(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      let j = i + 1; let s = '';
      for (;;) {
        if (j >= src.length) throw new Error('unterminated string');
        if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } break; }
        s += src[j++];
      }
      t.push({ k: 'str', v: s }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] || ''))) { let j = i + 1; while (/[0-9.]/.test(src[j] || '')) j++; t.push({ k: 'num', v: src.slice(i, j) }); i = j; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i + 1; while (/[A-Za-z0-9_$]/.test(src[j] || '')) j++; t.push({ k: 'id', v: src.slice(i, j) }); i = j; continue; }
    if ('()[],.?'.includes(c)) { t.push({ k: c }); i++; continue; }
    throw new Error('unexpected character ' + JSON.stringify(c) + ' at ' + i);
  }
  return t;
}

/** Parse one expression; returns the function calls found as [name, firstArgString]. */
function parse(src) {
  const t = tokenize(src); let p = 0; const calls = [];
  const peek = () => t[p]; const eat = (k) => { if (!t[p] || t[p].k !== k) throw new Error('expected ' + k + ' near token ' + p + ' in ' + src.slice(0, 120)); return t[p++]; };
  function value() {
    const x = peek(); if (!x) throw new Error('unexpected end');
    if (x.k === 'str' || x.k === 'num') { p++; }
    else if (x.k === 'id') {
      p++;
      if (['true', 'false', 'null'].includes(x.v) && (!peek() || peek().k !== '(')) { /* literal */ }
      else {
        if (!FUNCS.has(x.v)) throw new Error('unknown function ' + x.v);
        eat('('); const args = [];
        if (peek() && peek().k !== ')') { for (;;) { const start = p; value(); args.push(t.slice(start, p)); if (peek() && peek().k === ',') { p++; continue; } break; } }
        eat(')');
        calls.push([x.v, args[0] && args[0].length === 1 && args[0][0].k === 'str' ? args[0][0].v : null, args.length]);
      }
    } else throw new Error('unexpected token ' + x.k);
    // accessors: ?['x'] ['x'] .x
    for (;;) {
      const n = peek(); if (!n) break;
      if (n.k === '?') { p++; continue; }
      if (n.k === '[') { p++; value(); eat(']'); continue; }
      if (n.k === '.') { p++; eat('id'); continue; }
      break;
    }
  }
  value();
  if (p !== t.length) throw new Error('trailing tokens in ' + src.slice(0, 120));
  return calls;
}

/** Every expression inside a string value. */
function expressionsIn(s) {
  if (typeof s !== 'string') return [];
  if (s.startsWith('@@')) return [];
  if (s.startsWith('@') && !s.startsWith('@{')) return [s.slice(1)];
  const out = []; let i = 0;
  while ((i = s.indexOf('@{', i)) >= 0) {
    let j = i + 2; let depth = 1; let inStr = false;
    for (; j < s.length; j++) {
      const c = s[j];
      if (inStr) { if (c === "'") { if (s[j + 1] === "'") { j++; continue; } inStr = false; } continue; }
      if (c === "'") inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) break; }
    }
    if (depth) throw new Error('unclosed @{ in ' + s.slice(i, i + 80));
    out.push(s.slice(i + 2, j)); i = j + 1;
  }
  return out;
}

function checkFlow(name, flow) {
  const errors = [];
  const def = flow.properties.definition;
  const all = new Map(); const vars = new Set(); const loops = new Set();
  const walk = (actions, path, inLoop, topLevel) => {
    for (const [n, a] of Object.entries(actions || {})) {
      if (all.has(n)) errors.push(`${name}: duplicate action name ${n}`);
      all.set(n, a);
      for (const dep of Object.keys(a.runAfter || {})) if (!(dep in actions)) errors.push(`${name}: ${n} runs after ${dep}, which isn't next to it`);
      if (a.type === 'InitializeVariable') { if (!topLevel) errors.push(`${name}: variable ${a.inputs.variables[0].name} must be initialised at the top level`); vars.add(a.inputs.variables[0].name); }
      if ((a.type === 'Response' || a.type === 'Terminate') && inLoop) errors.push(`${name}: ${n} (${a.type}) is inside a loop`);
      const loop = a.type === 'Foreach' || a.type === 'Until';
      if (loop) loops.add(n);
      walk(a.actions, path + '/' + n, inLoop || loop, false);
      if (a.else) walk(a.else.actions, path + '/' + n + '/else', inLoop || loop, false);
      if (a.cases) for (const c of Object.values(a.cases)) walk(c.actions, path, inLoop, false);
      if (a.default) walk(a.default.actions, path, inLoop, false);
    }
  };
  walk(def.actions, '', false, true);
  const params = new Set(Object.keys(def.parameters));
  const visit = (v, where) => {
    if (typeof v === 'string') {
      let exprs = [];
      try { exprs = expressionsIn(v); } catch (e) { errors.push(`${name}: ${where}: ${e.message}`); }
      for (const e of exprs) {
        let calls = [];
        try { calls = parse(e); } catch (err) { errors.push(`${name}: ${where}: ${err.message}\n    ${e.slice(0, 200)}`); continue; }
        for (const [fn, arg, argc] of calls) {
          if (['outputs', 'body', 'actions', 'result'].includes(fn) && arg !== null && !all.has(arg)) errors.push(`${name}: ${where}: ${fn}('${arg}') names no action`);
          if (fn === 'items' && arg !== null && !loops.has(arg)) errors.push(`${name}: ${where}: items('${arg}') names no loop`);
          if (fn === 'variables' && arg !== null && !vars.has(arg)) errors.push(`${name}: ${where}: variable ${arg} is never initialised`);
          if (fn === 'parameters' && arg !== null && !params.has(arg)) errors.push(`${name}: ${where}: parameter ${arg} isn't declared`);
          if (['outputs', 'body', 'actions', 'items', 'variables', 'parameters'].includes(fn) && argc !== 1) errors.push(`${name}: ${where}: ${fn}() needs one argument`);
        }
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, where + '[' + i + ']'));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!['runAfter', 'actions', 'else', 'cases', 'default'].includes(k)) visit(x, where + '.' + k); }
  };
  for (const [n, a] of all) { visit(a, n); if (a.cases) for (const c of Object.values(a.cases)) visit(c.case, n + '.case'); }
  for (const [n, tr] of Object.entries(def.triggers)) visit(tr, 'trigger ' + n);
  return errors;
}

module.exports = { checkFlow, parse, expressionsIn };
