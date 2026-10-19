# solution/: the ready-to-import Granted app

| File | What it is |
|---|---|
| `GrantedPA.zip` | The Power Platform solution: the **Granted** canvas app, its **17 flows**, 4 connection references and 5 environment variables. `setup/Setup-GrantedPA.ps1` fills in the environment variables for your site and writes `GrantedPA-ready.zip` next to it; import that one. |
| `src/` | The same solution unpacked (readable, diffable): `Workflows/*.json` are the flows. |
| `app-src/` | The app's source (`Src/*.fx.yaml`, one file per screen). |
| `app/Granted.msapp` | The packed app. |

Everything here is **generated** from `tools/solution` (flows) and `tools/app` (screens). Change those, then rebuild:

```bash
npm test                                   # rules, engine, flows, app references
node tools/app/check-formulas.js           # parses every app formula with Microsoft's Power Fx engine (.NET 8)
node tools/solution/build-solution.js --pack   # needs the Power Platform CLI (pac)
```

## What's inside

| Flow | Called by | Job |
|---|---|---|
| C1 Authorize | every app flow | Who is calling, their access on the project, maintenance mode |
| C2 Send notices | flows | Emails the right people on the project, one email each, and logs them |
| C4 Onboard person | F12 | Makes outside people guests (by sharing the Welcome page) and adds people to Granted Users |
| C5 Issue gate pass | F01, F04, F10 | Capacity re-check, unique pass code, QR code, emails |
| F00 Session and view | app | Everything the app shows, filtered by role on the server |
| F01 Submit request | app | The 12 rules (run by the GrantedEngine Office Script, the same code as `rules/rules.js`) |
| F04 · F05 · F06 · F10 | app | Review decision · gate admit / turn away · cancel · emergency pass |
| F07 · F08 | schedule | Hourly no-shows, review reminders, expired invites · 5 AM gate list per project |
| F09 · F11 · F12 · F13 · F14 | app | Look-ahead upload · project and admin codes · team · projects · profile |

Differences from the hand-build specs in `powerautomate/`: F02 is the child flow C5 (called directly, no list trigger); F03's review alert is part of F01; audit rows are written inline (no C3); the sign-up Microsoft Form (F15) is not included, so outside people join by invite; all rules, QR codes and the admin-code check run in one Office Script, `officescripts/GrantedEngine.ts`.

## Checked here, not yet in a live tenant

Each build checks every flow expression and reference, packs the app and solution with Microsoft's own tools, and parses every app formula with the Power Fx engine. The rules engine is tested against the reference rules on 2,000 random cases. The first import into a real environment is still the final test: report anything it flags and it will be fixed here.
