/*
 * Granted — account, project-code and permission rules
 *
 * Pure functions with no dependencies, shared by the prototype and the tests.
 * In production every one of these checks runs again on the server; the app's
 * copy only gives people instant feedback.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GrantedAccounts = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const AJAX_DOMAIN = 'ajaxbuilding.com';
  const ROLES = Object.freeze({
    contractor: { id: 'contractor', label: 'Contractor', short: 'Contractor' },
    access: { id: 'access', label: 'Access Control', short: 'Access Control' },
    admin: { id: 'admin', label: 'Admin', short: 'Admin' },
  });

  // What each project role may do. The server enforces the same table.
  const PERMISSIONS = Object.freeze({
    'delivery.request': ['contractor', 'admin'],
    'delivery.viewOwn': ['contractor', 'admin'],
    'delivery.viewAll': ['admin'],
    'delivery.review': ['admin'],
    'delivery.emergencyPass': ['admin'],
    'gate.scan': ['access', 'admin'],
    'gate.viewToday': ['access', 'admin'],
    'gate.viewLog': ['access', 'admin'],
    'team.approve': ['admin'],
    'team.invite': ['admin'],
    'team.remove': ['admin'],
    'team.changeRole': ['admin'],
    'project.settings': ['admin'],
    'project.delete': ['admin'],
  });
  function can(role, action) { return !!(PERMISSIONS[action] && PERMISSIONS[action].includes(role)); }

  const LOCKOUT = Object.freeze({ maxAttempts: 5, minutes: 15 });

  function normEmail(e) { return String(e || '').trim().toLowerCase(); }
  function emailDomain(e) { const s = normEmail(e); const i = s.lastIndexOf('@'); return i < 0 ? '' : s.slice(i + 1); }
  function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(normEmail(e)); }
  /** Ajax membership comes from the email domain, never from what the user ticks. */
  function isAjaxEmail(e) { return isValidEmail(e) && emailDomain(e) === AJAX_DOMAIN; }

  function passwordChecks(pw) {
    const s = String(pw || '');
    return [
      { id: 'len', label: 'At least 8 characters', ok: s.length >= 8 },
      { id: 'upper', label: 'One uppercase letter', ok: /[A-Z]/.test(s) },
      { id: 'lower', label: 'One lowercase letter', ok: /[a-z]/.test(s) },
      { id: 'number', label: 'One number', ok: /[0-9]/.test(s) },
    ];
  }
  function isValidPassword(pw) { return passwordChecks(pw).every((c) => c.ok) && String(pw).length <= 128; }
  function phoneDigits(p) { return String(p || '').replace(/\D/g, ''); }
  function isValidPhone(p) { const d = phoneDigits(p); return d.length === 10 || (d.length === 11 && d[0] === '1'); }
  function formatPhone(p) { let d = phoneDigits(p); if (d.length === 11) d = d.slice(1); return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : String(p || ''); }

  /**
   * Validates the sign-up form. Returns { ok, errors: {field: message}, isAjax, ajaxNote }.
   * ajaxNote is the clarifying message shown when the Yes/No answer and the email disagree;
   * the person confirms it to continue.
   */
  function validateSignUp(f) {
    const errors = {};
    if (!String(f.first || '').trim()) errors.first = 'Enter your first name.';
    if (!String(f.last || '').trim()) errors.last = 'Enter your last name.';
    if (!isValidPhone(f.phone)) errors.phone = 'Enter a 10-digit phone number.';
    if (!isValidEmail(f.email)) errors.email = 'Enter a valid email address.';
    if (!isValidPassword(f.password)) errors.password = 'Password needs at least 8 characters with an uppercase letter, a lowercase letter and a number.';
    if (!String(f.company || '').trim()) errors.company = 'Enter the company you represent.';
    if (f.declaredAjax !== 'yes' && f.declaredAjax !== 'no') errors.declaredAjax = 'Choose Yes or No.';
    const isAjax = isAjaxEmail(f.email);
    let ajaxNote = '';
    if (f.declaredAjax === 'yes' && isValidEmail(f.email) && !isAjax) {
      ajaxNote = 'Ajax Building Company members sign up with their @' + AJAX_DOMAIN + ' email. This account will be set up as a non-Ajax account.';
    } else if (f.declaredAjax === 'no' && isAjax) {
      ajaxNote = 'This is an @' + AJAX_DOMAIN + ' address, so the account will be set up as an Ajax Building Company account.';
    }
    if (ajaxNote && !f.ajaxNoteConfirmed) errors.declaredAjax = 'Confirm the note below to continue.';
    return { ok: Object.keys(errors).length === 0, errors, isAjax, ajaxNote };
  }

  // ---------------- project codes ----------------
  const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
  function normalizeProjectCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, ''); }
  function codePrefixFromName(name) {
    const words = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    let p = words.map((w) => (/^[0-9]/.test(w) ? w : w[0])).join('');
    if (p.length < 2 && words[0]) p = words[0].slice(0, 4);
    return (p || 'PRJ').slice(0, 5);
  }
  function newProjectCode(name, existing, rand) {
    const r = rand || Math.random; const taken = new Set((existing || []).map(normalizeProjectCode));
    const prefix = codePrefixFromName(name);
    for (let i = 0; i < 1000; i++) {
      let tail = ''; for (let k = 0; k < 4; k++) tail += CODE_ALPHABET[Math.floor(r() * CODE_ALPHABET.length)];
      const code = prefix + '-' + tail; if (!taken.has(code)) return code;
    }
    throw new Error('Could not create a unique project code');
  }
  function passPrefixFromCode(code) { return normalizeProjectCode(code).split('-')[0].slice(0, 5) || 'GR'; }

  /**
   * What happens to the project code typed at sign-up (or in "Add project").
   *   adminCodeMatches: result of comparing the typed code with the protected admin code (done by the caller,
   *   which holds only a hash; in production the server does this and rate-limits it).
   * Returns { kind: 'none' | 'admin' | 'join' | 'invalid', message }
   */
  function classifyProjectCode({ code, email, adminCodeMatches, projectExists, alreadyAdminAccount }) {
    const c = normalizeProjectCode(code);
    if (!c) return { kind: 'none', message: '' };
    if (adminCodeMatches) {
      if (isAjaxEmail(email)) return { kind: 'admin', message: alreadyAdminAccount ? 'This account already has Admin access.' : 'Admin access will be set up for this Ajax account.' };
      return { kind: 'invalid', message: 'That project code was not found. Check it with your project admin.' }; // same wording: reveal nothing
    }
    if (projectExists) return { kind: 'join', message: 'A request to join will go to the project admins.' };
    return { kind: 'invalid', message: 'That project code was not found. Check it with your project admin.' };
  }

  /** Login throttling: returns { locked, minutesLeft } given recent failures. */
  function lockState(failures, now) {
    const t = now ? now.getTime() : Date.now();
    const recent = (failures || []).filter((ts) => t - new Date(ts).getTime() < LOCKOUT.minutes * 60000);
    if (recent.length < LOCKOUT.maxAttempts) return { locked: false, remaining: LOCKOUT.maxAttempts - recent.length };
    const oldest = Math.min(...recent.map((ts) => new Date(ts).getTime()));
    return { locked: true, minutesLeft: Math.max(1, Math.ceil((oldest + LOCKOUT.minutes * 60000 - t) / 60000)) };
  }

  function sixDigitCode(rand) { const r = rand || Math.random; let s = ''; for (let i = 0; i < 6; i++) s += Math.floor(r() * 10); return s; }

  return {
    AJAX_DOMAIN, ROLES, PERMISSIONS, LOCKOUT, CODE_ALPHABET,
    can, normEmail, emailDomain, isValidEmail, isAjaxEmail, passwordChecks, isValidPassword,
    phoneDigits, isValidPhone, formatPhone, validateSignUp,
    normalizeProjectCode, codePrefixFromName, newProjectCode, passPrefixFromCode, classifyProjectCode,
    lockState, sixDigitCode,
  };
});
