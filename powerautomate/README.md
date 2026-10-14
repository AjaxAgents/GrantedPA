# Power Automate flows

GrantedPA's server side. The app never reads or writes SharePoint directly. Every screen gets its data from **F00**, and every action is a flow. The flows run as the **Granted service account** and check the caller's access on the project before doing anything. This is the Power Platform equivalent of the custom app's API.

All flows use **standard connectors** only (SharePoint, Office 365 Outlook, Office 365 Users, Office 365 Groups, Excel Online (Business), Microsoft Forms, Microsoft Teams, Power Apps). Build them **inside one solution** ("Granted"), so child flows and environment variables are available, and so the app can be wrapped.

## The flows

| Flow | Trigger | Job | Spec |
|---|---|---|---|
| **C1 Authorize** | Child flow | Who is calling, their access on the project, maintenance mode, permission check | [child-flows.md](child-flows.md) |
| **C2 Send notices** | Child flow | Turns a rule-engine event into emails to the right people *on that project* and logs them | [child-flows.md](child-flows.md) |
| **C3 Audit** | Child flow | Writes one AuditLog row | [child-flows.md](child-flows.md) |
| **C4 Onboard guest** | Child flow | Makes sure an outside person can sign in: B2B guest through SharePoint sharing, added to the Granted Users group | [child-flows.md](child-flows.md) |
| F00 Session and view | Power Apps (V2) | `session`: who am I, my projects, pending requests. `view`: everything this role may see on one project. `slots`: open slots and zone room. | [F00-session-and-view.md](F00-session-and-view.md) |
| F01 Submit request | Power Apps (V2) | Creates or reschedules a request and runs the 12 rules. Approved / Needs review / Rejected. | [F01-submit.md](F01-submit.md) |
| F02 Issue gate pass | SharePoint item created or modified (concurrency 1) | Final capacity check, pass code, QR, pass, emails | [F02-issue-pass.md](F02-issue-pass.md) |
| F03 Review alert, F04 Review decision | SharePoint / Power Apps | Tell the project's admins; approve or reject | [F03-F04-review.md](F03-F04-review.md) |
| F05 Gate event | Power Apps (V2) | Admit (pass used once) or turn away (log and tell everyone) | [F05-gate.md](F05-gate.md) |
| F06 Cancel, F07 Hourly sweep, F08 Daily gate list, F09 Look-ahead upload, F10 Emergency pass | Various | As named | [F06-F10-operations.md](F06-F10-operations.md) |
| F11 Enter a code | Power Apps (V2) | Project code → join request or invite; admin set-up code → Ajax admin account | [F11-F15-accounts-and-team.md](F11-F15-accounts-and-team.md) |
| F12 Team | Power Apps (V2) | Approve or decline a join request, invite, revoke, change access, remove, leave | [F11-F15-accounts-and-team.md](F11-F15-accounts-and-team.md) |
| F13 Projects | Power Apps (V2) | Create (Ajax admin accounts), settings, new code, suspend a company, delete | [F11-F15-accounts-and-team.md](F11-F15-accounts-and-team.md) |
| F14 Profile | Power Apps (V2) | First-time profile, edit profile, delete my Granted profile | [F11-F15-accounts-and-team.md](F11-F15-accounts-and-team.md) |
| F15 Sign-up form | Microsoft Forms: new response | The public sign-up form for people outside Ajax: validates, creates the join request, emails that project's admins | [F11-F15-accounts-and-team.md](F11-F15-accounts-and-team.md) |

Build order for a first end-to-end test: C1, C3, C2 → F14 → F13 (create project) → F00 → F11, F12 → F01, F02 → F05.

## The contract between the app and the flows

Every Power Apps–triggered flow has the same three inputs and one output, so the app calls them all the same way:

| Input | Type | Meaning |
|---|---|---|
| `projectId` | Text | The open project (blank for session-level calls) |
| `viewAs` | Text | Maintenance mode view (`Admin`, `Contractor`, `Access Control`) or blank |
| `payload` | Text | JSON with the action's fields, e.g. `{"op":"approve","joinId":12,"role":"Contractor"}` |

The output is **Respond to a Power App or flow** with one Text output, `json`: `{"ok":true,...}` or `{"ok":false,"message":"plain words the app shows"}`.

Parse the payload once at the start with Compose `In` = `json(triggerBody()?['text_2'])` (the third input's internal name; check yours in the trigger's code view).

## Conventions used in every flow

**Who is calling.** Read the caller from the trigger, which the caller can't fake:

```
toLower(triggerOutputs()?['headers']?['x-ms-user-email'])
```

Never trust an email sent in the payload. Then run **C1 Authorize** with the caller, `projectId`, `viewAs` and the action name, and stop with its message if `ok` is false.

**Permissions** (the same table as `rules/accounts.js`; C1 checks the *effective* role, so maintenance mode can only narrow access):

| Action | Contractor | Access Control | Admin |
|---|---|---|---|
| `delivery.request`, `delivery.viewOwn` | ✓ | | ✓ |
| `delivery.viewAll`, `delivery.review`, `delivery.emergencyPass` | | | ✓ |
| `gate.scan`, `gate.viewToday`, `gate.viewLog` | | ✓ | ✓ |
| `team.approve`, `team.invite`, `team.remove`, `team.changeRole` | | | ✓ |
| `project.settings`, `project.delete` | | | ✓ |

Creating projects, replacing a project code and deleting a project also need `People.IsAdminAccount = Yes` (an Ajax admin account).

**Project settings and time.** Get the project row (C1 returns it). Compose `S` = `json(Project SettingsJson)`. Each project has its own Windows time-zone name in `TimeZone` (e.g. `Central Standard Time`):

```
NowLocal   = convertFromUtc(utcNow(), outputs('TZ'), 'yyyy-MM-ddTHH:mm:ss')
TodayLocal = convertFromUtc(utcNow(), outputs('TZ'), 'yyyy-MM-dd')
SlotUtc    = convertToUtc(concat(DeliveryDate, 'T', SlotStart, ':00'), outputs('TZ'))
```

**Every query filters by project first:** `ProjectId eq '@{projectId}' and …`. `ProjectId` is indexed on every list.

**Who gets told.** Send email through **C2 Send notices**. It looks up the people *on that project*: "contractor" is the person who booked, "security" is the project's Access Control members, and "GC" is **the project's Admins only**. Never send to every admin account.

**Try / Catch.** Wrap the steps in a Scope named `Try`. Add a Scope `Catch` that runs only if `Try` failed or timed out. It emails the AppSettings `SupportEmail` the flow name, a run link (`workflow()?['run']?['name']`) and `result('Try')`, then responds `{"ok":false,"message":"Something went wrong. Try again in a moment."}`.

**Secrets.** On any action that reads `SecureSettings` or runs `CheckAdminCode`, turn on **Settings → Secure inputs and Secure outputs**, so the values never appear in run history.

**Message wording.** Titles and fixes come from the `ReasonCodes` list. Fill placeholders with nested `replace()`, exactly as the custom app and `rules/rules.js` do.

**Sums** (e.g. pallets in a zone). After a `Select` that returns plain numbers:

```
xpath(xml(json(concat('{"r":{"v":', string(body('Select_pallets')), '}}'))), 'sum(/r/v)')
```

**Concurrency.** F01, F02, F05 (admit) and F10 change capacity or passes. Give them **Concurrency control: On, degree 1**, so two requests can never take the last slot and a pass can never be admitted twice.

**Naming and export.** Name flows `Granted F01 Submit request`, and name actions for what they do (`Count slot bookings`), so run history reads like a log. Export the solution after every change into `powerautomate/exports/` (managed and unmanaged).

## Limits to know

- **Power Platform requests:** each flow action counts against the flow owner's daily allowance (the service account). A busy project with 30 deliveries a day uses a few thousand a day, well inside a Microsoft 365 account's allowance, but watch the Power Platform admin center analytics as projects are added.
- **Performance:** an app call to a flow takes about 1–4 seconds. That's why the app loads one project view and updates it after each action, rather than calling flows on every screen change.
