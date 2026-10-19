#!/usr/bin/env node
// Builds the Granted canvas app: writes the source (solution/app-src, readable and diffable) and
// packs it into solution/app/Granted.msapp with the Power Platform CLI (`pac canvas pack`).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const F = require('./fx');
const { screens } = require('./screens');

const root = path.join(__dirname, '..', '..');
const base = path.join(__dirname, 'base');
const src = path.join(root, 'solution', 'app-src');
const msapp = path.join(root, 'solution', 'app', 'Granted.msapp');

const FLOW_NAMES = { F00: 'Session and view', F01: 'Submit request', F04: 'Review decision', F05: 'Gate event', F06: 'Cancel delivery', F09: 'Look-ahead upload', F10: 'Emergency pass', F11: 'Enter a code', F12: 'Team', F13: 'Projects', F14: 'Profile' };
const guid = (seed) => { const h = crypto.createHash('sha1').update('granted-app:' + seed).digest('hex'); return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16), '8' + h.slice(17, 20), h.slice(20, 32)].join('-'); };

/** Property names each control template accepts (from its definition in pkgs/). */
function templateProps() {
  const out = {};
  for (const f of fs.readdirSync(path.join(base, 'pkgs'))) {
    const xml = fs.readFileSync(path.join(base, 'pkgs', f), 'utf8');
    out[f.replace(/_[0-9.]+\.xml$/, '')] = new Set([...xml.matchAll(/name="([A-Za-z]+)"/g)].map((m) => m[1]));
  }
  return out;
}

function checkControls(tree, allowed, problems, names) {
  const t = tree.type.split('.')[0];
  if (names.has(tree.name)) problems.push('duplicate control name ' + tree.name);
  names.add(tree.name);
  if (allowed[t]) for (const k of Object.keys(tree.props)) if (tree.props[k] !== undefined && !allowed[t].has(k)) problems.push(`${tree.name} (${t}) has no property ${k}`);
  for (const c of tree.children) checkControls(c, allowed, problems, names);
}

function appYaml() {
  const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets', 'brand', 'logo-white-400.png')).toString('base64');
  const onStart = `Set(gblLogoWhite, "${logo}");
Set(gblMaint, { On: false, ViewAs: "Admin" });
Set(gblS, ParseJSON("{""ok"":true}"));
Set(gblV, ParseJSON("{""ok"":false}"));
Set(locRes, ParseJSON("{""ok"":false}"));
IfError(LoadData(colPrefs, "grantedPrefs", true), false);
Set(gblPid, LookUp(colPrefs, Key = "pid").Value)`;
  return `App As appinfo:
    BackEnabled: =false
    OnStart: |-
${onStart.split('\n').map((l, i) => '        ' + (i === 0 ? '=' : '') + l).join('\n')}
    StartScreen: =scrStart
    Theme: =PowerAppsTheme

    Host As hostControl.DefaultHostControlVariant:
        OnCancel: =false
        OnEdit: =false
        OnNew: =false
        OnSave: =false
        OnView: =false
`;
}

function buildApp(flowIds) {
  fs.rmSync(src, { recursive: true, force: true });
  fs.mkdirSync(path.join(src, 'Src'), { recursive: true });
  for (const d of ['DataSources', 'Connections', 'pkgs/Wadl']) fs.mkdirSync(path.join(src, d), { recursive: true });
  for (const f of fs.readdirSync(path.join(base, 'pkgs'))) fs.copyFileSync(path.join(base, 'pkgs', f), path.join(src, 'pkgs', f));
  fs.copyFileSync(path.join(base, 'ControlTemplates.json'), path.join(src, 'ControlTemplates.json'));
  fs.copyFileSync(path.join(base, 'Src', 'Themes.json'), path.join(src, 'Src', 'Themes.json'));
  fs.writeFileSync(path.join(src, 'ComponentReferences.json'), '[]');

  const all = screens();
  const problems = []; const names = new Set(['App', 'Host']);
  const allowed = templateProps();
  for (const sc of all) checkControls(sc, allowed, problems, names);
  if (problems.length) throw new Error('App problems:\n' + problems.join('\n'));

  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'CanvasManifest.json'), 'utf8'));
  Object.assign(manifest.Properties, {
    AppCreationSource: 'AppFromScratch', AppDescription: 'Delivery booking and gate control. No approved delivery, no gate access.', Author: 'Granted',
    DocumentAppType: 'Phone', DocumentLayoutWidth: 640, DocumentLayoutHeight: 1136, DocumentLayoutOrientation: 'portrait', DocumentLayoutLockOrientation: true,
    DocumentLayoutMaintainAspectRatio: true, DocumentLayoutScaleToFit: true, FileID: guid('file'), Id: guid('app'), Name: 'Granted', ShowStatusBar: false,
  });
  if (manifest.Properties.AppPreviewFlagsMap) manifest.Properties.AppPreviewFlagsMap.enablesaveloadcleardataonweb = true;
  manifest.PublishInfo = { AppName: 'Granted', BackgroundColor: 'rgba(1, 51, 162, 1)', IconColor: 'RGBA(255,255,255,1)', IconName: 'Lock', LogoFileName: '', PublishDataLocally: false, PublishResourcesLocally: false, PublishTarget: 'player', UserLocale: 'en-US' };
  manifest.ScreenOrder = all.map((x) => x.name);
  fs.writeFileSync(path.join(src, 'CanvasManifest.json'), JSON.stringify(manifest, null, 2));

  fs.writeFileSync(path.join(src, 'Src', 'App.fx.yaml'), appYaml());
  for (const sc of all) fs.writeFileSync(path.join(src, 'Src', sc.name + '.fx.yaml'), F.yaml(sc));

  // One data source per flow the app calls.
  const conn = JSON.parse(fs.readFileSync(path.join(base, 'logicflows-connection.json'), 'utf8'));
  const wadl = fs.readFileSync(path.join(base, 'flow-wadl-template.xml'), 'utf8');
  const connections = {}; const metaRefs = {};
  for (const [key, id] of Object.entries(flowIds)) {
    const name = 'Granted' + key;
    const cid = guid('conn:' + key);
    fs.writeFileSync(path.join(src, 'DataSources', name + '.json'), JSON.stringify([{
      ApiId: '/providers/microsoft.powerapps/apis/shared_logicflows', FlowNameId: id, Name: name, ServiceKind: 'ConnectedWadl', Type: 'ServiceInfo', WorkflowEntityId: id,
    }], null, 2));
    const hints = { workflowEntityId: { value: id }, workflowName: { value: id } };
    connections[cid] = Object.assign({}, conn, { id: cid, dataSources: [name], connectionRef: Object.assign({}, conn.connectionRef, { parameterHints: hints, parameterHintsV2: hints }), dependencies: {}, dependents: [] });
    metaRefs[cid] = {
      id: '/providers/microsoft.powerapps/apis/shared_logicflows', displayName: 'Logic flows', iconUri: conn.connectionRef.iconUri, dataSources: [name], dependencies: [], dependents: [],
      parameterHints: hints, parameterHintsV2: hints, isOnPremiseConnection: false, bypassConsent: false, dataSets: {}, apiTier: 'Standard', actions: ['Run'], isCustomApiSolutionAware: false,
    };
    fs.writeFileSync(path.join(src, 'pkgs', 'Wadl', name + '.xml'), flowWadl(wadl, name, 'Granted ' + key + ' ' + FLOW_NAMES[key]));
  }
  fs.writeFileSync(path.join(src, 'Connections', 'Connections.json'), JSON.stringify(connections, null, 2));

  fs.mkdirSync(path.dirname(msapp), { recursive: true });
  if (process.env.GRANTED_SKIP_PACK) {
    console.log('App sources written (packing skipped: GRANTED_SKIP_PACK is set).');
  } else {
    fs.rmSync(msapp, { force: true });
    execFileSync('pac', ['canvas', 'pack', '--sources', src, '--msapp', msapp], { stdio: ['ignore', 'pipe', 'inherit'] });
  }
  console.log(`App: ${all.length} screens, ${names.size - 2} controls, ${Object.keys(flowIds).length} flows → ${path.relative(root, msapp)}`);
  return { msapp, connectionReferences: metaRefs, screens: all };
}

/** The flow's interface as Power Apps sees it: Run(projectId, viewAs, payload) → { json }. */
function flowWadl(template, serviceId, title) {
  let w = template.replace(/siena:serviceId="[^"]+"/, `siena:serviceId="${serviceId}"`).replace(/<doc title="HELPER - ObjectOperations" \/>/, `<doc title="${title}" />`);
  w = w.replace(/<string name="ManualTriggerInput_text_3_def" \/>\s*<string name="ManualTriggerInput_text_4_def" \/>/, '')
    .replace(/<property name="text_3" type="string" \/>\s*<property name="text_4" type="string" \/>/, '')
    .replace('<string name="ResponseActionOutput_thereturnstring_def" />', '<string name="ResponseActionOutput_json_def" />')
    .replace('<property name="thereturnstring" type="string" />', '<property name="json" type="string" />')
    .replace(/<param style="plain" name="text_3"[\s\S]*?<\/param>\s*<param style="plain" name="text_4"[\s\S]*?<\/param>/, '')
    .replace('<doc title="newOwner" />', '<doc title="projectId" />').replace('<doc title="objectName" />', '<doc title="viewAs" />').replace('<doc title="envName" />', '<doc title="payload" />');
  if (w.includes('text_3') || w.includes('thereturnstring')) throw new Error('WADL template changed');
  return w;
}

module.exports = { buildApp };
if (require.main === module) {
  const { stableGuid } = require('../solution/build-solution');
  buildApp(Object.fromEntries(Object.keys(FLOW_NAMES).map((k) => [k, stableGuid('flow:Granted ' + k + ' ' + FLOW_NAMES[k])])));
}
