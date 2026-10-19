# 06 · Build guide

Step by step, from an empty tenant to a working pilot. Plan on **2–3 weeks** the first time (about a day once a solution export exists) for one experienced Power Platform maker, plus IT's set-up time. Each step ends with a check.

## 1. IT set-up (Ajax IT, about 1 day)

Work through the IT checklist in [04-security-and-compliance.md §6](04-security-and-compliance.md#6-it-checklist).

**Check:** the service account can sign in to make.powerapps.com, open the Granted environment and create a flow.

## 2. SharePoint site and admin code (20 minutes, one script)

On a PC with PowerShell 7, signed in as a SharePoint admin, from this repository's folder:

```powershell
pwsh ./setup/Setup-GrantedPA.ps1
```

It asks for the SharePoint name, the service account, a support email and the admin set-up code, then:

- registers a PnP sign-in app (one admin consent), and creates the **communication site** "Granted" with the service account as an owner and guest sharing on for that site only;
- runs `sharepoint/provision.ps1`: 18 lists and 2 libraries, with indexes, owners-only permissions, reason codes, app settings and (if you choose) a sample project;
- uploads `officescripts/QR-Runner.xlsx` to the `QRRunner` library;
- stores the admin set-up code's hash in `SecureSettings` → `AdminCodeHash` (the code itself is never saved);
- publishes the **Welcome** page (C4 shares it with new guests) and creates the **Granted Users** group, owned by the service account.

It writes `GrantedPA-setup-summary.txt` with what it made and what's left. Safe to run again.

By hand instead: create the communication site, run `./sharepoint/provision.ps1 -SiteUrl ... -ClientId <pnp app id> -ServiceAccount ... -SampleProject`, upload the workbook, paste the output of `node tools/admin-code-hash.mjs` into `AdminCodeHash`, and create the Welcome page and the group.

**Check:** as a normal user who isn't an owner, open the site. No lists are visible. As an Ajax IT owner, `SecureSettings` isn't visible (only the service account can see it).

**Then:** fill in `AppLink` and `SignUpFormLink` in `AppSettings` once the app and form exist (step 5).

## 3. Office Scripts (15 minutes)

Signed in as the service account, open `QR-Runner.xlsx` in Excel for the web. Go to **Automate → New script**, paste `officescripts/GenerateGatePassQR.ts` and save it as *GenerateGatePassQR*. Do the same for `officescripts/CheckAdminCode.ts`, saved as *CheckAdminCode*.

**Check:** run each script from a test flow:

- `GenerateGatePassQR` with `SMPL-7KQX9M` returns an SVG and a PNG.
- `CheckAdminCode` returns true for the code and false for anything else.

## 4. Solution and flows (1–2 weeks)

> **If `solution/GrantedPA_managed.zip` exists, skip steps 4 and 5:** run `pwsh ./setup/Import-GrantedPASolution.ps1 -EnvironmentUrl <environment URL>` instead. After you build them the first time, export them as described in [solution/README.md](../solution/README.md) so nobody has to build them again.

1. In the Granted environment, create the solution **Granted**. Add environment variables for the site URL and the service account.
2. Build the flows from `powerautomate/` in this order:
   - C1, C3, C2, C4
   - F14, F13, F00, F11, F12
   - F01, F02, F03, F04, F05, F06
   - F07, F08, F09, F10
   - F15 (create the Microsoft Form first)
3. In every flow's **Run only users**, set the connections to the service account.

**Check:** run the test cases in `rules/test-cases.csv` through F01 (with a test harness flow or the app). Every reason code must match.

## 5. The app (1 week)

Build `powerapps/granted-app.md` in the solution. Share it with **Granted Users**.

**Check:** run the scenario script in [07-test-plan.md](07-test-plan.md).

## 6. Phones

| Option | Steps |
|---|---|
| **Power Apps app** (simplest) | People install *Power Apps* from the App Store or Google Play, sign in, and open *Granted*. Guests use the tenant switcher to choose Ajax. |
| **Wrapped app** (Ajax devices) | Power Apps → Apps → Wrap. Choose the Granted app, set the branding (blue splash, the icons from `assets/brand`), create the app registration, and sign the app with Ajax's Apple and Google accounts. Distribute through Intune or Apple Business Manager. |

Set every gate device to the project's time zone with automatic time.

## 7. Go live

Follow [08-rollout-and-operations.md](08-rollout-and-operations.md).
