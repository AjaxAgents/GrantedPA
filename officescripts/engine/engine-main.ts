/**
 * Entry point. Power Automate (Excel Online (Business) → Run script from SharePoint library)
 * calls this with an operation name and a JSON input, and gets JSON text back:
 *
 *   evaluate   {req, ctx}            → the 12 delivery rules (F01): outcome, reason codes and wording, next open slot
 *   recheck    {req, ctx}            → slot and zone re-check just before a pass is issued
 *   qr         {code}                → {svg, pngBase64} for a gate pass
 *   adminCode  {code, stored}        → {match} for the admin set-up code (never logged: the flow marks this action secure)
 *   ping       {}                    → {ok:true}, used by set-up to prove the script runs
 *
 * The workbook is not read or changed; Excel is only the place the script runs.
 */
function main(workbook: ExcelScript.Workbook, op: string, input: string): string {
  const data = (input ? JSON.parse(input) : {}) as EngineInput;
  if (op === 'ping') return JSON.stringify({ ok: true, engine: 'Granted', version: 1 });
  if (op === 'evaluate') return JSON.stringify(engEvaluate(data.req, data.ctx));
  if (op === 'recheck') return JSON.stringify(engRecheck(data.req, data.ctx));
  if (op === 'qr') {
    const code = String(data.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}-[A-Z0-9]{6}$/.test(code)) throw new Error('Pass code must look like DC2-7KQX9M.');
    const m = qrEncode(code);
    return JSON.stringify({ code: code, svg: qrToSvg(m, 4), pngBase64: qrToPngBase64(m, 8, 4) });
  }
  if (op === 'adminCode') return JSON.stringify({ match: checkAdminCodeMain(workbook, String(data.code || ''), String(data.stored || '')) });
  throw new Error('Unknown operation: ' + op);
}

interface EngineInput { req: EngRequest; ctx: EngContext; code: string; stored: string }
