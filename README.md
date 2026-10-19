# GrantedPA

**Granted on Microsoft Power Platform: delivery booking and gate control for Ajax Building Company jobsites, built inside Microsoft 365.**

> **No approved delivery, no gate access.**

### 👉 Setting it up? Open **[START-HERE.md](START-HERE.md)** (or the [PDF](docs/Granted-Setup-Guide.pdf)): one script, one import, a working app.
### 📘 Using it? The [user guide](docs/Granted-User-Guide.pdf) shows what admins, contractors and Access Control do, in pictures.

This is one of two editions, built so management can choose:

| Edition | Built with | Repository |
|---|---|---|
| **GrantedPA** (this one) | One Power Apps canvas app, SharePoint lists, Power Automate flows, Office Scripts. Standard connectors only. | AjaxAgents/GrantedPA |
| **Granted** | A custom iPhone app and mobile web app, with an API on Ajax's Azure | [AjaxAgents/Granted](https://github.com/AjaxAgents/Granted) |

Both run the same rules with the same reason codes and wording. [docs/decision.md](docs/decision.md) compares them side by side.

## How it works

Subcontractors book deliveries in the Granted app. Flows run the 12 delivery rules and answer straight away: approved, needs review or rejected. An approved delivery gets a QR gate pass by email and in the app. Access Control scans it at the gate. Green means admit; red means turn away, and the contractor, the gate and **that project's admins** are told why and what has to happen.

People join a project with its project code. An admin of that project approves them and chooses their access (Contractor, Access Control or Admin), or invites them by email. Ajax staff become **Ajax admin accounts**, who can create projects, by entering the admin set-up code. That code is never stored in this repository; only a salted hash is kept, in a locked-down list.

Admin accounts also get **Maintenance mode** (Settings): view any project as Admin, Contractor or Access Control. It's applied on the server, so the view is exact, and anything done in it is labelled.

There is no AI anywhere. Every decision is a fixed rule with a reason code.

## What's in this repository

```
docs/            Overview, decision, architecture, data model, rules, security and compliance,
                 licensing and guest access, step-by-step build guide, test plan, rollout and operations
powerapps/       The canvas app: every screen, control and formula
powerautomate/   Every flow (4 child flows + F00–F15): trigger, settings, steps and expressions
sharepoint/      list-schema.json (generated), provision.ps1 (builds the site), column formatting
officescripts/   GenerateGatePassQR.ts (QR codes, generated), CheckAdminCode.ts (admin code check)
rules/           The reference rules (rules.js, accounts.js) that the flows follow, with tests and
                 plain-English test cases
qr/              The QR encoder source and tests that decode its output
prototype/       A clickable UI reference (open prototype/index.html in a browser; admin set-up disabled)
config/          settings.json and reason-codes.json (generated from the rules), sample gates, zones, look-ahead
assets/brand/    Logo and app icons
setup/           Setup-GrantedPA.ps1: builds the SharePoint side and writes GrantedPA-ready.zip
solution/        GrantedPA.zip: the app and its 17 flows, ready to import (generated from tools/solution and tools/app)
tools/           build.js, schema-src.js, gen-docs.js, admin-code-hash.mjs, solution/ (flows), app/ (screens)
```

## Commands

```bash
npm install
npm test        # rebuilds generated files, then runs 64 tests (rules, engine vs rules, accounts, QR decode, admin-code check, flows and app)
npm run check   # strict type-check of both Office Scripts
```

## Start here

0. **Setting up?** [START-HERE.md](START-HERE.md).
1. **Deciding?** Read [docs/decision.md](docs/decision.md) and [docs/05-licensing-and-guest-access.md](docs/05-licensing-and-guest-access.md).
2. **Building?** Follow [docs/06-build-guide.md](docs/06-build-guide.md) step by step.
3. **IT review?** Read [docs/04-security-and-compliance.md](docs/04-security-and-compliance.md).

Copyright © Ajax Building Company. All rights reserved. See [LICENSE](LICENSE).
