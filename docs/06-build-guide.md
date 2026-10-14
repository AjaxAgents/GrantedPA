# 06 · Build guide

Step by step, from an empty tenant to a working pilot. Plan on **2–4 weeks** for one experienced Power Platform maker, plus IT's set-up time. Each step ends with a check.

## 1. IT set-up (Ajax IT, about 1 day)

Work through the IT checklist in [04-security-and-compliance.md §6](04-security-and-compliance.md#6-it-checklist).

**Check:** the service account can sign in to make.powerapps.com, open the Granted environment and create a flow.

## 2. SharePoint site (30 minutes)

1. Create a **communication site** called "Granted". Make the service account and Ajax IT its only owners.
2. On a PC with PowerShell 7 and PnP PowerShell:
   ```powershell
   ./sharepoint/provision.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/Granted -ClientId <pnp app id> -ServiceAccount svc-granted@ajaxbuilding.com -SampleProject
   ```
   This creates 18 lists and 2 libraries, with indexes, permissions, reason codes, app settings and a sample project.
3. Fill in the `<placeholders>` in `AppSettings`.
4. Upload `officescripts/QR-Runner.xlsx` to the `QRRunner` library.
5. Create a **Welcome** page on the site with the app link and the support contact (C4 shares it with new guests).

**Check:** as a normal user who isn't an owner, open the site. No lists are visible.

## 3. Admin set-up code (5 minutes)

```bash
node tools/admin-code-hash.mjs        # type the code twice; prints sha256i$100000$...
```

Paste the output into `SecureSettings` → `AdminCodeHash` → `Value`. Don't save the code anywhere else.

**Check:** as an Ajax IT owner, `SecureSettings` isn't visible (only the service account can see it).

## 4. Office Scripts (15 minutes)

Signed in as the service account, open `QR-Runner.xlsx` in Excel for the web. Go to **Automate → New script**, paste `officescripts/GenerateGatePassQR.ts` and save it as *GenerateGatePassQR*. Do the same for `officescripts/CheckAdminCode.ts`, saved as *CheckAdminCode*.

**Check:** run each script from a test flow:

- `GenerateGatePassQR` with `SMPL-7KQX9M` returns an SVG and a PNG.
- `CheckAdminCode` returns true for the code and false for anything else.

## 5. Solution and flows (1–2 weeks)

1. In the Granted environment, create the solution **Granted**. Add environment variables for the site URL and the service account.
2. Build the flows from `powerautomate/` in this order:
   - C1, C3, C2, C4
   - F14, F13, F00, F11, F12
   - F01, F02, F03, F04, F05, F06
   - F07, F08, F09, F10
   - F15 (create the Microsoft Form first)
3. In every flow's **Run only users**, set the connections to the service account.

**Check:** run the test cases in `rules/test-cases.csv` through F01 (with a test harness flow or the app). Every reason code must match.

## 6. The app (1 week)

Build `powerapps/granted-app.md` in the solution. Share it with **Granted Users**.

**Check:** run the scenario script in [07-test-plan.md](07-test-plan.md).

## 7. Phones

| Option | Steps |
|---|---|
| **Power Apps app** (simplest) | People install *Power Apps* from the App Store or Google Play, sign in, and open *Granted*. Guests use the tenant switcher to choose Ajax. |
| **Wrapped app** (Ajax devices) | Power Apps → Apps → Wrap. Choose the Granted app, set the branding (blue splash, the icons from `assets/brand`), create the app registration, and sign the app with Ajax's Apple and Google accounts. Distribute through Intune or Apple Business Manager. |

Set every gate device to the project's time zone with automatic time.

## 8. Go live

Follow [08-rollout-and-operations.md](08-rollout-and-operations.md).
