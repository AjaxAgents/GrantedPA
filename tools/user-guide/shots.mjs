// The screens and callouts for the user guide. Each: who signs in, steps, what to crop (clip), and
// the elements to mark (name -> CSS selector). Run by capture.mjs.
const open = (t) => async (p) => p.getByText(t, { exact: true }).first().click();
const fill = async (p) => {
  await p.selectOption('#f_activityId', await p.locator('#f_activityId option').nth(4).getAttribute('value'));
  await p.fill('#f_material', 'Ground rod kits'); await p.fill('#f_quantity', '40'); await p.selectOption('#f_unit', 'boxes'); await p.fill('#f_pallets', '3');
  await p.locator('.slot:not(.off)').nth(1).click();
  await p.selectOption('#f_zoneId', await p.locator('#f_zoneId option').nth(5).getAttribute('value'));
  await p.fill('#f_carrier', 'Lone Star Freight'); await p.fill('#f_pocName', 'Dana Ruiz'); await p.fill('#f_pocPhone', '214-555-0141');
};
const check = (good) => async (p) => {
  const t = await p.locator('#panel-today .item').nth(1).innerText();
  await p.fill('#codeIn', good ? t.match(/DDC2-[A-Z0-9]+/)[0] : 'DDC2-HKT4WA');
  await p.click('.codeform button[type=submit]'); await p.waitForTimeout(800);
  await p.evaluate(() => window.scrollTo(0, 0));
};
const pad = 10;
export default [
  { name: 'c-form', who: 'dana', pad, steps: [open('Confirm Delivery'), open('Schedule Delivery'), fill],
    clip: ['#panel-schedule form .section-t >> nth=1', '#panel-schedule form > .row'],
    marks: { gate: '#f_gateId', date: '#f_date', slot: '.slots', zone: '#f_zoneId', checks: '.checksum', submit: '#panel-schedule form > .row button' } },
  { name: 'c-form-top', who: 'dana', pad, steps: [open('Confirm Delivery'), open('Schedule Delivery'), fill],
    clip: ['#panel-schedule form .section-t >> nth=0', '#panel-schedule form > .grid2 >> nth=0'],
    marks: { act: '#f_activityId', mat: '#f_material', pal: '#f_pallets' } },
  { name: 'c-pass', who: 'dana', pad, steps: [open('Confirm Delivery'), open('Schedule Delivery'), fill, async (p) => { await p.getByRole('button', { name: 'Submit request' }).click(); await p.waitForTimeout(1200); }],
    clip: '#panel-schedule .card', marks: { ok: '.pill.st-approved', qr: '.ticket .qr', code: '.ticket .pcode', when: '.ticket-body > p' } },
  { name: 'g-scan', who: 'gate', pad, clip: '#panel-receive', marks: { scan: '.scanbtn', type: '#codeIn' } },
  { name: 'g-green', who: 'gate', pad: 4, steps: [open('Expected Today'), check(true)], clip: '#gResult .verdict', marks: { big: '.verdict .big', next: '.verdict > div:nth-child(4)', btn: '.verdict .row .btn' } },
  { name: 'g-red', who: 'gate', pad: 4, steps: [open('Expected Today'), check(false)], clip: '#gResult .verdict', marks: { big: '.verdict .big', what: '.verdict .why', btn: '.verdict .row .btn' } },
  { name: 'g-today', who: 'gate', pad, steps: [open('Expected Today')], clip: ['#panel-today .item >> nth=0', '#panel-today .item >> nth=3'], marks: { st: '#panel-today .item >> nth=0 >> .pill', go: '#panel-today .item >> nth=1 >> button' } },
  { name: 'a-home', who: 'admin', pad, steps: [open('Today')], clip: 'main.tabs',
    marks: { project: '#tab-project', overview: '#tab-overview', approvals: '#tab-approvals', team: '#tab-team', receive: '#tab-receive', schedule: '#tab-schedule', deliveries: '#tab-deliveries', emergency: '#tab-emergency', activity: '#tab-activity', psettings: '#tab-psettings' } },
  { name: 'a-review', who: 'admin', pad, steps: [open('Today'), open('Approvals')], clip: '#panel-approvals .card >> nth=2', marks: { why: '#panel-approvals .card >> nth=2 >> .reasons', ok: '#panel-approvals .card >> nth=2 >> .btn.go', no: '#panel-approvals .card >> nth=2 >> .row .btn >> nth=1' } },
  { name: 'a-join', who: 'admin', pad, steps: [open('Today'), open('Approvals')], clip: '#panel-approvals .card >> nth=0', marks: { role: '#panel-approvals .card >> nth=0 >> select >> nth=0', ok: '#panel-approvals .card >> nth=0 >> .btn.primary' } },
];
