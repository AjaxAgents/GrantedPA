# Start here: setting up Granted

**Granted** books jobsite deliveries and checks them in at the gate. *No approved delivery, no gate access.* There are two ways to run it. **Track A, Power Apps, is the standard choice for Ajax teams.** Track B, Azure, is there if you need it running sooner or have many outside subcontractors.

📄 **Illustrated guide (PDF):** [docs/Granted-Setup-Guide.pdf](docs/Granted-Setup-Guide.pdf)
👀 **See it working first:** https://ajaxagents.github.io/Granted/ (demo data, nothing to install)

| | **Track A · Power Apps** (this repository) | **Track B · Azure** ([AjaxAgents/Granted](https://github.com/AjaxAgents/Granted)) |
|---|---|---|
| Runs in | Your Microsoft 365: SharePoint, Power Apps, Power Automate | Your Azure subscription: a web app, a database, email |
| People use it in | The Power Apps app (phone or browser) | Any phone browser; an iPhone app is optional |
| Outside companies | Microsoft guest accounts in your tenant (licensing: [docs/05](docs/05-licensing-and-guest-access.md)) | Their own email and password; no Microsoft licence |
| Who sets it up | IT + a Power Platform maker | IT (one person with Azure Owner) |
| Set-up effort | ~1 day of IT, 20-minute script, then **2–3 weeks to build the flows and app the first time** (30 minutes once a solution export exists) | **About 1 hour.** One command. Then about half a day of production polish |
| Running cost | Mostly in your Microsoft 365 licences, plus guest licences if needed | Azure usage: small for a pilot; Azure SQL is the main cost |
| Changes later | Your makers edit screens and flows | A developer edits code; tests run on every change |

---

## What's already done for you, and what's left

### Track A · Power Apps

| # | Item | Status | Who · time |
|---|---|---|---|
| 1 | Business rules, reason codes, wording; 55 automated tests | ✅ In the repository | — |
| 2 | Data model: 18 lists, 2 libraries, every column, index and status colour | ✅ Made by the script | Script |
| 3 | Permissions: lists visible to site owners only; SecureSettings to the service account only | ✅ Made by the script | Script |
| 4 | SharePoint site "Granted", guest sharing on that site only, service account as owner | ✅ Made by the script | Script |
| 5 | Starter data: 21 reason codes, app settings, a sample project with gates and zones | ✅ Made by the script | Script |
| 6 | QR-Runner workbook uploaded | ✅ Made by the script | Script |
| 7 | Admin set-up code stored as a one-way hash | ✅ Made by the script (you type the code) | Script |
| 8 | Welcome page for new guests | ✅ Made by the script | Script |
| 9 | "Granted Users" group, owned by the service account | ✅ Made by the script | Script |
| 10 | Office Scripts (QR codes, admin code check): written and tested | 🟡 Paste two files into Excel for the web | Maker · 15 min |
| 11 | Microsoft 365 tenant set-up: environment, data policy, service account, guest settings, MFA | 🔴 IT's job (checklist in [docs/04 §6](docs/04-security-and-compliance.md#6-it-checklist)) | IT · ~1 day |
| 12 | 20 flows, each specified step by step in [powerautomate/](powerautomate) | 🔴 Built by hand the first time; **import** after that | Maker · 1–2 weeks |
| 13 | The app, every screen and formula specified in [powerapps/](powerapps) | 🔴 Built by hand the first time; **import** after that | Maker · ~1 week |
| 14 | Sign-up Microsoft Form; app link into AppSettings; share the app with Granted Users | 🟡 Short manual steps | Maker · 30 min |
| 15 | Test and go live: [docs/07](docs/07-test-plan.md), [docs/08](docs/08-rollout-and-operations.md) | 🔴 Your team | ½ day + pilot |

**9 of 15 items are done for you, and 1 more is a paste.** The big one left is the first build of the flows and the app (items 12–13). Microsoft only lets those be created inside a tenant, so they can't ship as files until someone has built them once. **After the first build, export the solution into [solution/](solution) and every later installation imports it in about 30 minutes** ([setup/Import-GrantedPASolution.ps1](setup/Import-GrantedPASolution.ps1)).

### Track B · Azure

| # | Item | Status | Who · time |
|---|---|---|---|
| 1 | The app (all three roles), the API, the database design, security; 96 automated tests | ✅ In the repository | — |
| 2 | Every Azure resource: app, database, Key Vault, email, monitoring, permissions | ✅ Made by the command | Command |
| 3 | Secrets: session key, admin code hash | ✅ Made by the command (you type the code) | Command |
| 4 | Database tables and a least-privilege database user | ✅ Made by the command | Command |
| 5 | App installed, started and checked | ✅ Made by the command | Command |
| 6 | An Azure subscription, and someone with Owner on it | 🔴 IT | IT · varies |
| 7 | First admin account and first project | 🟡 Sign up in the app | Anyone · 5 min |
| 8 | Before production: your web address and email domain, an IT group as database admin, alerts | 🟡 Portal steps listed in [operations](https://github.com/AjaxAgents/Granted/blob/main/docs/operations.md) | IT · ½ day |
| 9 | iPhone app (optional; the web app works on iPhones) | 🔴 Needs a Mac, Ajax's Apple Developer account, TestFlight | Developer · 1–2 days + Apple review |

**5 of 9 items are done for you.** The rest are accounts only your company can own, plus optional polish.

---

## Track A · Power Apps, step by step

**1 · IT prepares Microsoft 365 (about 1 day).** Work through [docs/04 §6](docs/04-security-and-compliance.md#6-it-checklist): a Power Platform environment called "Granted", the data policy, a service account (e.g. `svc-granted@yourcompany.com`) with a licence and a mailbox, guest one-time passcodes, and MFA for guests. Decide how guests are licensed ([docs/05](docs/05-licensing-and-guest-access.md)).

**2 · Run the set-up script (20 minutes).** On a PC with [PowerShell 7](https://aka.ms/powershell), signed in as a SharePoint admin:

```powershell
git clone https://github.com/AjaxAgents/GrantedPA
cd GrantedPA
pwsh ./setup/Setup-GrantedPA.ps1
```

No git? Choose **Code → Download ZIP** on GitHub, unzip it, open PowerShell in that folder and run the last line. It asks for your SharePoint name, the service account, a support email and the admin set-up code, makes items 2–9 above, and saves a checklist of what's left in `GrantedPA-setup-summary.txt`.

**3 · Paste the two Office Scripts (15 minutes).** As the service account, open `QRRunner/QR-Runner.xlsx` on the Granted site in Excel for the web. Go to **Automate → New script**, paste [`officescripts/GenerateGatePassQR.ts`](officescripts/GenerateGatePassQR.ts) and save it as *GenerateGatePassQR*. Do the same with [`CheckAdminCode.ts`](officescripts/CheckAdminCode.ts), saved as *CheckAdminCode*.

**4 · The flows and the app.**
- **If [solution/](solution) has `GrantedPA_managed.zip`:** run `pwsh ./setup/Import-GrantedPASolution.ps1 -EnvironmentUrl <your environment URL>` (30 minutes).
- **If not (the first time):** a Power Platform maker builds them from [docs/06-build-guide.md](docs/06-build-guide.md) §4–5, in the order given, then exports the solution into `solution/` so nobody has to do it again.

**5 · Finish and test (½ day).** Create the sign-up Form (F15), put the app link in AppSettings and on the Welcome page, share the app with **Granted Users**, then run [docs/07-test-plan.md](docs/07-test-plan.md).

## Track B · Azure, step by step

**1 · Open Azure Cloud Shell.** Go to https://shell.azure.com as someone with **Owner** on the subscription, and choose **Bash**.

**2 · Paste one line:**

```bash
git clone https://github.com/AjaxAgents/Granted && bash Granted/setup/azure-setup.sh
```

**3 · Answer four questions:** a name for the resource group (`rg-granted-pilot`), the region (`southcentralus` is Texas), `pilot` or `prod`, and the admin set-up code.

**4 · Wait about 15 minutes.** It prints your Granted address, e.g. `https://func-granted-pilot-abc123.azurewebsites.net`.

**5 · Become the first admin.** Open the address, create an account with your company email, type the admin set-up code as the project code, and create your project. Share its project code with your team.

Before production, follow "Before production" in [the operations guide](https://github.com/AjaxAgents/Granted/blob/main/docs/operations.md#1-set-up-one-command-about-15-minutes).

---

## The admin set-up code

Both tracks ask for it while setting up. Ajax staff with a confirmed company email type it as a project code to become admins who can create projects. **It's never written into this repository or either app**; only a one-way hash is stored (Key Vault for Azure, the locked SecureSettings list for Power Apps). Ask the project owner for it privately. To change it, run the set-up again and type a new one.

## Help

- Something in a script failed? Run it again: both are safe to re-run, and both print what went wrong and how to fix it.
- Questions about the design: [docs/00-overview.md](docs/00-overview.md) (Power Apps), [Granted docs](https://github.com/AjaxAgents/Granted/tree/main/docs) (Azure).
- Security review: [docs/04-security-and-compliance.md](docs/04-security-and-compliance.md), [SECURITY.md](SECURITY.md).
