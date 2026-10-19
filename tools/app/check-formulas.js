#!/usr/bin/env node
// Writes every app formula to a file and parses them all with Microsoft's Power Fx engine (tools/app/fxcheck).
// Needs the .NET 8 SDK. Run: node tools/app/check-formulas.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
const F = require('./fx'); const L = require('./logic'); const { screens } = require('./screens');
const out = [];
for (const sc of screens()) F.formulas(sc, out);
out.push(['App', 'LOAD_SESSION', L.LOAD_SESSION], ['App', 'LOAD_VIEW', L.LOAD_VIEW]);
const file = path.join(os.tmpdir(), 'granted-formulas.json');
fs.writeFileSync(file, JSON.stringify(out));
execFileSync('dotnet', ['run', '-c', 'Release', '--project', path.join(__dirname, 'fxcheck'), '--', file], { stdio: 'inherit' });
