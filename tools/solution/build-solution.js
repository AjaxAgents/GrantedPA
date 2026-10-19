#!/usr/bin/env node
// Builds the GrantedPA Power Platform solution: every flow, the app, the connection references
// and environment variables, ready to import.
//
//   node tools/solution/build-solution.js          writes solution/src (unpacked, readable)
//   ... --pack                                     also packs solution/GrantedPA.zip (needs the Power Platform CLI, pac)
//
// Flow GUIDs are derived from the flow names, so every build is identical and re-importing
// updates the same flows instead of adding copies.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const D = require('./dsl');
const { checkFlow } = require('./check-flow');

const root = path.join(__dirname, '..', '..');
const out = path.join(root, 'solution', 'src');
const VERSION = '1.0.0.0';

const FLOWS = [
  ['C1', 'Granted C1 Authorize', require('./flows/children').C1, 'Who is calling, their access on the project, maintenance mode.'],
  ['C2', 'Granted C2 Send notices', require('./flows/children').C2, 'Emails the right people on the project and logs each one.'],
  ['C4', 'Granted C4 Onboard person', require('./flows/children').C4, 'Makes outside people guests and adds people to Granted Users.'],
  ['C5', 'Granted C5 Issue gate pass', require('./flows/children').C5, 'Capacity re-check, pass code, QR code, emails.'],
  ['F00', 'Granted F00 Session and view', require('./flows/f00').F00, 'Everything the app shows, filtered for the caller’s role.'],
  ['F01', 'Granted F01 Submit request', require('./flows/deliveries').F01, 'Books or reschedules a delivery and runs the 12 rules.'],
  ['F04', 'Granted F04 Review decision', require('./flows/deliveries').F04, 'An admin approves or rejects a request in review.'],
  ['F05', 'Granted F05 Gate event', require('./flows/deliveries').F05, 'Admit (pass used once) or turn away (logged, everyone told).'],
  ['F06', 'Granted F06 Cancel delivery', require('./flows/deliveries').F06, 'Cancels a delivery and voids its pass.'],
  ['F07', 'Granted F07 Hourly sweep', require('./flows/ops').F07, 'No-shows, review reminders, expired invites.'],
  ['F08', 'Granted F08 Morning gate list', require('./flows/ops').F08, 'Emails each project’s gate team the day’s list at 5 AM local time.'],
  ['F09', 'Granted F09 Look-ahead upload', require('./flows/ops').F09, 'Loads the 3-week look-ahead from the app.'],
  ['F10', 'Granted F10 Emergency pass', require('./flows/deliveries').F10, 'Same-day override pass, logged.'],
  ['F11', 'Granted F11 Enter a code', require('./flows/accounts').F11, 'Project codes (join requests, invites) and the admin set-up code.'],
  ['F12', 'Granted F12 Team', require('./flows/accounts').F12, 'Approve, invite, change access, remove, leave.'],
  ['F13', 'Granted F13 Projects', require('./flows/accounts').F13, 'Create projects, settings, new code, suspend a company, delete.'],
  ['F14', 'Granted F14 Profile', require('./flows/accounts').F14, 'First-time profile, edits, and deleting a profile.'],
];
const APP_FLOWS = ['F00', 'F01', 'F04', 'F05', 'F06', 'F09', 'F10', 'F11', 'F12', 'F13', 'F14'];

/** A stable GUID from a name (same input, same GUID). */
function stableGuid(name) {
  const h = crypto.createHash('sha1').update('granted-pa:' + name).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), '5' + h.slice(13, 16), ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 20), h.slice(20, 32)].join('-');
}
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fileName = (display) => display.replace(/[^A-Za-z0-9]/g, '');
const write = (rel, content) => { const p = path.join(out, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };

function build() {
  fs.rmSync(out, { recursive: true, force: true });
  const ids = Object.fromEntries(FLOWS.map(([k, display]) => [k, stableGuid('flow:' + display)]));
  const problems = [];
  const envUsed = new Set();
  const connUsed = new Set();

  for (const [key, display, make, description] of FLOWS) {
    const flow = make();
    let json = JSON.stringify(flow, null, 2).replace(/\{\{FLOW:([A-Z0-9]+)\}\}/g, (m, k) => { if (!ids[k]) throw new Error('unknown child flow ' + k); return ids[k]; });
    const parsed = JSON.parse(json);
    problems.push(...checkFlow(display, parsed));
    for (const p of Object.values(parsed.properties.definition.parameters)) if (p.metadata && p.metadata.schemaName) envUsed.add(p.metadata.schemaName);
    for (const c of Object.values(parsed.properties.connectionReferences)) connUsed.add(c.connection.connectionReferenceLogicalName);
    const id = ids[key];
    const base = `Workflows/${fileName(display)}-${id.toUpperCase()}.json`;
    write(base, json);
    write(base + '.data.xml', `<?xml version="1.0" encoding="utf-8"?>
<Workflow WorkflowId="{${id}}" Name="${xmlEsc(display)}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <JsonFileName>/${base}</JsonFileName>
  <Type>1</Type>
  <Subprocess>0</Subprocess>
  <Category>5</Category>
  <Mode>0</Mode>
  <Scope>4</Scope>
  <OnDemand>0</OnDemand>
  <TriggerOnCreate>0</TriggerOnCreate>
  <TriggerOnDelete>0</TriggerOnDelete>
  <AsyncAutodelete>0</AsyncAutodelete>
  <SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>
  <StateCode>1</StateCode>
  <StatusCode>2</StatusCode>
  <RunAs>1</RunAs>
  <IsTransacted>1</IsTransacted>
  <IntroducedVersion>1.0.0.0</IntroducedVersion>
  <IsCustomizable>1</IsCustomizable>
  <BusinessProcessType>0</BusinessProcessType>
  <IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>
  <PrimaryEntity>none</PrimaryEntity>
  <LocalizedNames>
    <LocalizedName languagecode="1033" description="${xmlEsc(display)}" />
  </LocalizedNames>
  <Descriptions>
    <Description languagecode="1033" description="${xmlEsc(description)}" />
  </Descriptions>
</Workflow>
`);
  }
  if (problems.length) { console.error(problems.join('\n')); throw new Error(problems.length + ' problem(s) in the flows'); }

  // Environment variables (values are filled in by setup/Setup-GrantedPA.ps1 before import).
  for (const e of Object.values(D.ENV)) {
    if (!envUsed.has(e.schema)) continue;
    write(`environmentvariabledefinitions/${e.schema}/environmentvariabledefinition.xml`, `<environmentvariabledefinition schemaname="${e.schema}">
  <defaultvalue></defaultvalue>
  <description default="${xmlEsc(e.desc)}">
    <label description="${xmlEsc(e.desc)}" languagecode="1033" />
  </description>
  <displayname default="${xmlEsc(e.name)}">
    <label description="${xmlEsc(e.name)}" languagecode="1033" />
  </displayname>
  <introducedversion>1.0.0.0</introducedversion>
  <iscustomizable>1</iscustomizable>
  <isrequired>1</isrequired>
  <secretstore>0</secretstore>
  <type>100000000</type>
</environmentvariabledefinition>
`);
  }

  // The canvas app (built by tools/app/build-app.js).
  const appName = 'gr_granted_7c41e';
  const withApp = !process.env.GRANTED_NO_APP;
  if (withApp) {
  const app = require('../app/build-app').buildApp(Object.fromEntries(APP_FLOWS.map((k) => [k, ids[k]])));
  fs.mkdirSync(path.join(out, 'CanvasApps'), { recursive: true });
  if (fs.existsSync(app.msapp)) fs.copyFileSync(app.msapp, path.join(out, 'CanvasApps', appName + '_DocumentUri.msapp'));
  fs.copyFileSync(path.join(root, 'assets', 'brand', 'icon-192.png'), path.join(out, 'CanvasApps', appName + '_BackgroundImageUri'));
  write(`CanvasApps/${appName}.meta.xml`, `<?xml version="1.0" encoding="utf-8"?>
<CanvasApp xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Name>${appName}</Name>
  <AppVersion>2026-10-19T12:00:00Z</AppVersion>
  <Status>Ready</Status>
  <CreatedByClientVersion>3.25094.10.0</CreatedByClientVersion>
  <MinClientVersion>3.25094.10.0</MinClientVersion>
  <Tags>{"primaryDeviceWidth":"640","primaryDeviceHeight":"1136","supportsPortrait":"true","supportsLandscape":"false","primaryFormFactor":"Phone","publisherVersion":"3.25094.10","minimumRequiredApiVersion":"2.2.0","hasComponent":"false","hasUnlockedComponent":"false","isUnifiedRootApp":"false","sienaVersion":"20251019T120000Z-3.25094.10.0"}</Tags>
  <IsCdsUpgraded>0</IsCdsUpgraded>
  <GalleryItemId xsi:nil="true"></GalleryItemId>
  <BackgroundColor>rgba(1, 51, 162, 1)</BackgroundColor>
  <DisplayName>Granted</DisplayName>
  <Description>Delivery booking and gate control. No approved delivery, no gate access.</Description>
  <CommitMessage xsi:nil="true"></CommitMessage>
  <Publisher xsi:nil="true"></Publisher>
  <AuthorizationReferences>[]</AuthorizationReferences>
  <ConnectionReferences>${xmlEsc(JSON.stringify(app.connectionReferences))}</ConnectionReferences>
  <DatabaseReferences>{}</DatabaseReferences>
  <CanConsumeAppPass>1</CanConsumeAppPass>
  <CanvasAppType>0</CanvasAppType>
  <BypassConsent>0</BypassConsent>
  <EmbeddedApp xsi:nil="true"></EmbeddedApp>
  <IntroducedVersion>1.0.0.0</IntroducedVersion>
  <CdsDependencies>{"cdsdependencies":[]}</CdsDependencies>
  <IsCustomizable>1</IsCustomizable>
  <BackgroundImageUri>/CanvasApps/${appName}_BackgroundImageUri</BackgroundImageUri>
  <DocumentUri>/CanvasApps/${appName}_DocumentUri.msapp</DocumentUri>
</CanvasApp>
`);
  }

  const refs = [...connUsed].sort().map((ref) => {
    const c = Object.values(D.CONN).find((x) => x.ref === ref);
    const names = { gr_GrantedSharePoint: 'Granted SharePoint', gr_GrantedOutlook: 'Granted Outlook (sends the emails)', gr_GrantedExcel: 'Granted Excel (runs the rules script)', gr_GrantedGroups: 'Granted Office 365 Groups' };
    return `    <connectionreference connectionreferencelogicalname="${ref}">
      <connectionreferencedisplayname>${xmlEsc(names[ref] || ref)}</connectionreferencedisplayname>
      <connectorid>/providers/Microsoft.PowerApps/apis/${c.api}</connectorid>
      <iscustomizable>1</iscustomizable>
      <statecode>0</statecode>
      <statuscode>1</statuscode>
    </connectionreference>`;
  });
  write('Other/Customizations.xml', `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities />
  <Roles />
  <Workflows />
  <FieldSecurityProfiles />
  <Templates />
  <EntityMaps />
  <EntityRelationships />
  <OrganizationSettings />
  <optionsets />
  <CustomControls />
  <EntityDataProviders />
  <CanvasApps />
  <connectionreferences>
${refs.join('\n')}
  </connectionreferences>
  <Languages>
    <Language>1033</Language>
  </Languages>
</ImportExportXml>
`);
  const roots = FLOWS.map(([k]) => `      <RootComponent type="29" id="{${ids[k]}}" behavior="0" />`)
    .concat(withApp ? [`      <RootComponent type="300" schemaName="${appName}" behavior="0" />`] : []);
  write('Other/Solution.xml', `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.2.25094.163" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SolutionManifest>
    <UniqueName>GrantedPA</UniqueName>
    <LocalizedNames>
      <LocalizedName description="Granted" languagecode="1033" />
    </LocalizedNames>
    <Descriptions>
      <Description description="Delivery booking and gate control: the Granted app, its flows, connection references and settings." languagecode="1033" />
    </Descriptions>
    <Version>${VERSION}</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>granted</UniqueName>
      <LocalizedNames>
        <LocalizedName description="Granted" languagecode="1033" />
      </LocalizedNames>
      <Descriptions />
      <EMailAddress xsi:nil="true"></EMailAddress>
      <SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>
      <CustomizationPrefix>gr</CustomizationPrefix>
      <CustomizationOptionValuePrefix>74210</CustomizationOptionValuePrefix>
      <Addresses>
        <Address>
          <AddressNumber>1</AddressNumber>
          <AddressTypeCode>1</AddressTypeCode>
          <ShippingMethodCode>1</ShippingMethodCode>
        </Address>
        <Address>
          <AddressNumber>2</AddressNumber>
          <AddressTypeCode>1</AddressTypeCode>
          <ShippingMethodCode>1</ShippingMethodCode>
        </Address>
      </Addresses>
    </Publisher>
    <RootComponents>
${roots.join('\n')}
    </RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>
`);
  console.log(`Solution source: ${FLOWS.length} flows, ${envUsed.size} environment variables, ${connUsed.size} connection references, 1 app → solution/src`);
  return { ids };
}

module.exports = { build, FLOWS, stableGuid };

if (require.main === module) {
  build();
  if (process.argv.includes('--pack')) {
    const zip = path.join(root, 'solution', 'GrantedPA.zip');
    fs.rmSync(zip, { force: true });
    execFileSync('pac', ['solution', 'pack', '--zipfile', zip, '--folder', out, '--packagetype', 'Unmanaged'], { stdio: 'inherit' });
    console.log('Packed ' + path.relative(root, zip));
  }
}
