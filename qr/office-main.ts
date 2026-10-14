/**
 * Entry point. Power Automate passes the pass code; the script returns the
 * QR code as SVG (for the app) and PNG base64 (for the email attachment).
 * The workbook is not read or changed; Excel is only the place the script runs.
 */
function main(workbook: ExcelScript.Workbook, passCode: string): GatePassQr {
  const code = passCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}-[A-Z0-9]{6}$/.test(code)) {
    throw new Error('Pass code must look like DC2-7KQX9M. Received: ' + passCode);
  }
  const m = qrEncode(code);
  return {
    passCode: code,
    svg: qrToSvg(m, 4),
    pngBase64: qrToPngBase64(m, 8, 4),
    version: m.version,
    modules: m.size,
  };
}

interface GatePassQr {
  passCode: string;
  svg: string;
  pngBase64: string;
  version: number;
  modules: number;
}
