# The Granted canvas app

Phone layout (portrait). Screens: `scrSplash`, `scrProfile` (first sign-in), `scrHome`. The sheets (Add a project, Settings) are containers on `scrHome`. Labels and messages match the prototype and the custom app word for word.

Flow names below are the display names once they're added to the app: `GrantedF00`, `GrantedF01`, and so on.

---

## 1. App

**App.Formulas** (named formulas):

```powerfx
fxBlue = ColorValue("#0133A2"); fxGreyHdr = ColorValue("#59656F"); fxGo = ColorValue("#12804A");
fxStop = ColorValue("#C2252D"); fxHold = ColorValue("#946200"); fxField = ColorValue("#F1F3F6");
fxRoleTabs = Switch(gblRole,
    "Contractor",     ["project","confirmC","schedule","mine","messages"],
    "Access Control", ["project","receive","today","gatelog"],
    "Admin",          ["project","overview","approvals","team","receive","schedule","confirmA","deliveries","emergency","activity","psettings"],
    ["project"]);
fxViewAs = If(gblMaint.On && gblMaint.As <> "Admin", gblMaint.As, "");
```

**App.OnStart:**

```powerfx
Set(gblMaint, { On: false, As: "Admin" });
Set(gblOpen, { project: false, confirmC: true, confirmA: false, schedule: false, mine: false, messages: false,
    receive: true, today: false, gatelog: false, overview: true, approvals: false, team: false,
    deliveries: false, emergency: false, activity: false, psettings: false });
LoadData(colPrefs, "grantedPrefs", true);                 // remembers the last project on this device
Set(gblPid, LookUp(colPrefs, Key = "pid").Value);
```

`scrSplash` (blue background, white logo, "GRANTED", a loading bar): `OnVisible` runs `Select(btnLoadSession)`, then:

```powerfx
If(gblNeedsProfile, Navigate(scrProfile, ScreenTransition.None), Navigate(scrHome, ScreenTransition.Fade))
```

**Load the session** (`btnLoadSession`, a hidden button so it can be re-run from anywhere):

```powerfx
IfError(
    Set(gblS, ParseJSON(GrantedF00.Run("", "", "{""op"":""session""}").json)),
    Notify("No connection. Check your signal and try again.", NotificationType.Error));
Set(gblNeedsProfile, Boolean(gblS.needsProfile));
If(!gblNeedsProfile,
    Set(gblMe, { Email: Text(gblS.me.email), First: Text(gblS.me.first), Last: Text(gblS.me.last),
        Phone: Text(gblS.me.phone), Company: Text(gblS.me.company), IsAjax: Boolean(gblS.me.isAjax),
        IsAdminAccount: Boolean(gblS.me.isAdminAccount) });
    ClearCollect(colProjects, ForAll(Table(gblS.projects), { Id: Text(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name),
        Code: Text(ThisRecord.Value.code), Role: Text(ThisRecord.Value.role) }));
    ClearCollect(colPending, ForAll(Table(gblS.pending), { Id: Text(ThisRecord.Value.projectId), Name: Text(ThisRecord.Value.name) }));
    ForAll(Table(gblS.notices), Notify(Text(ThisRecord.Value), NotificationType.Success));
    If(IsBlank(LookUp(colProjects, Id = gblPid)), Set(gblPid, First(colProjects).Id));
    Select(btnLoadView));
```

**Load the project view** (`btnLoadView`). This is run after every action:

```powerfx
If(IsBlank(gblPid), Set(gblRole, Blank()),
  IfError(Set(gblV, ParseJSON(GrantedF00.Run(gblPid, fxViewAs, "{""op"":""view""}").json)),
      Notify("No connection. Showing what was loaded last.", NotificationType.Warning));
  If(Boolean(gblV.ok),
    Set(gblRole, Text(gblV.role)); Set(gblCanMaintain, Boolean(gblV.canMaintain)); Set(gblInMaint, Boolean(gblV.maintenance));
    Set(gblP, { Id: Text(gblV.project.id), Name: Text(gblV.project.name), Code: Text(gblV.project.code), Location: Text(gblV.project.location) });
    Set(gblSet, gblV.project.settings);    // untyped; read with Value()/Text() where used
    ClearCollect(colGates, ForAll(Table(gblV.project.gates), { Id: Text(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name), Cap: Value(ThisRecord.Value.capacityPerSlot) }));
    ClearCollect(colZones, ForAll(Table(gblV.project.zones), { Id: Text(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name), Cap: Value(ThisRecord.Value.capacityPallets) }));
    ClearCollect(colActs, ForAll(Table(gblV.project.activities), { Id: Text(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name),
        Trade: Text(ThisRecord.Value.trade), Start: DateValue(Text(ThisRecord.Value.start)), Finish: DateValue(Text(ThisRecord.Value.finish)) }));
    Set(gblMySub, { Id: Text(gblV.mySub.id), Name: Text(gblV.mySub.name), Trade: Text(gblV.mySub.trade), Suspended: Boolean(gblV.mySub.suspended) });
    ClearCollect(colReq, ForAll(Table(gblV.requests), {
        Id: Value(ThisRecord.Value.id), Company: Text(ThisRecord.Value.subName), SubId: Text(ThisRecord.Value.subId),
        Activity: Text(ThisRecord.Value.activityId), Gate: Text(ThisRecord.Value.gateId), Date: DateValue(Text(ThisRecord.Value.date)),
        Slot: Text(ThisRecord.Value.slot), Zone: Text(ThisRecord.Value.zoneId), Material: Text(ThisRecord.Value.material),
        Qty: Value(ThisRecord.Value.quantity), Unit: Text(ThisRecord.Value.unit), Pallets: Value(ThisRecord.Value.pallets),
        Carrier: Text(ThisRecord.Value.carrier), Truck: Text(ThisRecord.Value.truck), Contact: Text(ThisRecord.Value.pocName),
        Phone: Text(ThisRecord.Value.pocPhone), Status: Text(ThisRecord.Value.status), Pass: Text(ThisRecord.Value.passCode),
        Reasons: Text(ThisRecord.Value.reasonText), By: Text(ThisRecord.Value.submittedBy), Maint: Boolean(ThisRecord.Value.maintenance),
        Justification: Text(ThisRecord.Value.justification) }));
    ClearCollect(colPasses, ForAll(Table(gblV.passes), { Code: Text(ThisRecord.Value.code), ReqId: Value(ThisRecord.Value.requestId),
        Status: Text(ThisRecord.Value.status), Open: DateTimeValue(Text(ThisRecord.Value.windowOpen)), Close: DateTimeValue(Text(ThisRecord.Value.windowClose)),
        Override: Boolean(ThisRecord.Value.override), Qr: Text(ThisRecord.Value.qrSvg) }));
    // colOcc, colGateLog, colMembers, colJoin, colInvites, colMail, colSubs: same pattern from gblV.occupancy, .gatelog, .members, .joinreqs, .invites, .mail, .subs
    If(gblRole = "Access Control" || gblRole = "Admin", SaveData(colPasses, "grantedPasses"); SaveData(colReq, "grantedToday"));
    ClearCollect(colPrefs, { Key: "pid", Value: gblPid }); SaveData(colPrefs, "grantedPrefs"),
    Notify(Text(gblV.message), NotificationType.Error)));
Set(gblLoadedAt, Now())
```

`tmrRefresh` (Duration 30000, Repeat, AutoStart, hidden): `OnTimerEnd = If(Connection.Connected, Select(btnLoadView))`.

---

## 2. scrProfile: first sign-in

Shown when F00 says `needsProfile`. The person signed in with Microsoft, so their email is already proved. The fields are those of the design's sign-up page, apart from email and password, which Microsoft holds.

| Control | Notes |
|---|---|
| Logo, "Create your Granted profile", "Signed in as `User().Email`" | |
| `txtFirst`, `txtLast`, `txtPhone`, `txtCompany` | Required. Phone: 10 digits (`IsMatch(txtPhone.Text, "\D*(\d\D*){10}")`). |
| `btnAjaxYes` / `btnAjaxNo` | "Member of Ajax Building Company?" When the answer disagrees with the email domain, show the yellow note with an "I understand, continue" checkbox. The note text is the same as `validateSignUp` in `rules/accounts.js`. |
| `txtCode` | "Project code (optional)" |
| Privacy line | "By continuing you agree to the Terms and Privacy Policy" (`Launch()` links to the Ajax-hosted pages) |
| `btnCreate` | Runs the call below |

```powerfx
Set(locR, ParseJSON(GrantedF14.Run("", "", JSON({ op: "create", first: txtFirst.Text, last: txtLast.Text, phone: txtPhone.Text,
    company: txtCompany.Text, declaredAjax: locAjax, ajaxNoteConfirmed: chkAjaxNote.Value, code: txtCode.Text })).json));
If(Boolean(locR.ok), Notify(Text(locR.message), NotificationType.Success); Select(btnLoadSession); Navigate(scrHome),
    Set(locErr, Text(locR.message)))
```

---

## 3. scrHome

### Header (`conHeader`)

- Image fill: the textured grey header (`assets/brand` has no texture; use a 1×1 `fxGreyHdr` fill plus the subtle diagonal-stripe SVG from the prototype, set as the header container's `BackgroundImage`).
- `lblName` = `gblMe.First & " " & gblMe.Last` (white, 26 pt, bold condensed font such as `Segoe UI Semibold`).
- `lblCompany` = `gblMe.Company` (light grey, 14 pt).
- `icoGear` (top right, off-grey `#C9D1D9`): `OnSelect = Set(gblSheet, "settings")`, `AccessibleLabel = "Settings"`.

### Maintenance bar (`conMaint`)

`Visible = gblMaint.On && gblCanMaintain`. Label "MAINTENANCE MODE · VIEWING AS". Three toggle buttons (Admin, Contractor, Access Control):

```powerfx
OnSelect = Set(gblMaint, { On: true, As: "Contractor" }); Select(btnLoadView); Notify("Viewing as Contractor.")
```

The selected button is white with blue text, as in the prototype. The flows apply the view on the server (C1), so what's shown is exactly that role's view, and everything done is labelled as maintenance.

### Tabs (`conTabs`, vertical auto-layout container, scrollable)

One container per tab, in this order:

project · overview · approvals · team · receive · **confirmC** · schedule · **confirmA** · mine · messages · today · gatelog · deliveries · emergency · activity · psettings

Each tab container is `Visible = "<id>" in fxRoleTabs`. **Confirm Delivery** appears twice because contractors see it above Schedule, and Admins below Schedule. Both are one component, `cmpConfirm`, so it's built once.

Each tab is a header button plus a body container:

| Part | Formula |
|---|---|
| Header button `OnSelect` | `Set(gblOpen, Patch(gblOpen, { schedule: !gblOpen.schedule }))` |
| Icon tile | blue tile when open, light blue when closed |
| Title / subtitle | as below |
| Chevron | rotates 180° when open |
| Body `Visible` | `gblOpen.schedule` |

Titles and subtitles (the same wording as the prototype):

| Tab | Title | Subtitle |
|---|---|---|
| project | `gblP.Name` (or "No project yet") | `gblRole & " · " & gblP.Code & If(CountRows(colProjects) > 1, " · tap to switch", "")`. On the right, the blue-and-white **+** button: `Set(gblSheet, "add")` |
| confirmC / confirmA | Confirm Delivery | `CountRows(<my upcoming active passes>) & " gate passes ready"` |
| schedule | Schedule Delivery | `Value(gblSet.minNoticeHours) & " hours’ notice · checked automatically"` |
| mine | My Deliveries | upcoming count |
| messages | Messages | count of `colMail` |
| receive | Receive Delivery | "Scan a gate pass" |
| today / overview | Expected Today / Today | `CountRows(Filter(colReq, Date = Today() && Status = "Approved")) & " deliveries expected " & Text(Today(), "ddd m/d")` |
| gatelog | Gate Log | entries today |
| approvals | Approvals | join requests · deliveries to review, with an amber count badge |
| team | Team & Invites | members · invites pending |
| deliveries | All Deliveries | requests on this project |
| emergency | Emergency Pass | "Same-day override, logged" |
| activity | Activity | "Gate log and messages sent" |
| psettings | Project Settings | "Code, gates, zones and rules" |

Tab bodies are described in §4. When the role changes (another project or another maintenance view), reset `gblOpen` so the first tab under Project is open.

---

## 4. Tab bodies

### Project

- A card with "CURRENT PROJECT", the name, the location, a role pill, the project code chip and a **Copy code** button (`Copy(gblP.Code)`).
- Hint: "Everyone on this project uses this code to join. Admins approve each person and choose their access."
- `galProjects` (when the person has more than one project). `OnSelect = Set(gblPid, ThisItem.Id); Select(btnLoadView); Notify("Switched to " & ThisItem.Name & ".")`
- `galPending`: "Waiting for approval".
- **Add or create a project** button: opens the Add sheet.

### Confirm Delivery (`cmpConfirm`)

- `Items` = my company's upcoming passes:
  ```powerfx
  SortByColumns(Filter(AddColumns(Filter(colReq, Status = "Approved" && Date >= Today() && SubId = gblMySub.Id),
      PassRec, LookUp(colPasses, Code = Pass)), PassRec.Status = "Active"), "Date", SortOrder.Ascending, "Slot", SortOrder.Ascending)
  ```
- When there are several, chips (a horizontal gallery) pick one; otherwise show the first.
- The ticket:
  - a blue top with the material and "ddd m/d · h:mm · gate";
  - the QR image: `"data:image/svg+xml;utf8," & EncodeUrl(locPick.PassRec.Qr)`;
  - the code in 26 pt monospace;
  - "Arrive between *open* and *close*" (from `PassRec.Open`/`Close`);
  - staging, load and contact.
- Empty: "No gate passes yet." plus a **Schedule a delivery** button that opens that tab.

### Schedule Delivery

Same fields and order as the prototype. For each control:

| Control | Detail |
|---|---|
| `drpActivity` | `Filter(colActs, IsBlank(gblMySub.Trade) || Trade = gblMySub.Trade || Trade = "General")`, shown as `Id & " · " & Name & " · starts " & Text(Start, "ddd m/d")`; hint with the dates and "Deliver no earlier than …" |
| `txtMaterial`, `txtQty`, `drpUnit`, `txtPallets`, `txtWeight` | Unit choices: pcs, sections, reels, units, LF, crates, skids, boxes, load |
| `drpGate`, `dpDate` | `OnChange` of gate, date or activity → `Select(btnSlots)` |
| `galSlots` | Wrap gallery of `colSlots`. Each tile: time, "n open" / "Full" / "Under 48 h" / "Gate closed". `DisplayMode` Disabled when not open. `OnSelect = Set(locSlot, ThisItem.Slot)` |
| `drpZone` | `colZoneRoom`, shown as `Name & " · " & Left & " of " & Cap & " pallets free"` |
| `txtJustify` | Visible when `DateDiff(dpDate.SelectedDate, drpActivity.Selected.Start, TimeUnit.Days) > Value(gblSet.maxDaysBeforeInstall)` |
| `txtCarrier`, `txtTruck`, `txtContact`, `txtPhone` | Contact defaults to the person's name and phone |
| `galChecks` | Live preview of the checks (as in the v1 spec): notice, slot room, zone room, before finish, within N days, 10-digit phone, plus the summary line "All checks pass…" / "n problems to fix" |
| `btnSubmit` | "Submit request" or "Save and re-check" |

`btnSlots` (hidden):

```powerfx
Set(locAvail, ParseJSON(GrantedF00.Run(gblPid, fxViewAs, JSON({ op: "slots", gateId: drpGate.Selected.Id,
    date: Text(dpDate.SelectedDate, "yyyy-mm-dd"), activityId: drpActivity.Selected.Id, excludeRequestId: Coalesce(locEditId, 0) })).json));
ClearCollect(colSlots, ForAll(Table(locAvail.slots), { Slot: Text(ThisRecord.Value.slot), Left: Value(ThisRecord.Value.left),
    Open: Boolean(ThisRecord.Value.open), TooSoon: Boolean(ThisRecord.Value.tooSoon), Closed: Boolean(ThisRecord.Value.closedDay) }));
ClearCollect(colZoneRoom, ForAll(colZones As z, { Id: z.Id, Name: z.Name, Cap: z.Cap,
    Left: Value(LookUp(Table(locAvail.zones), Text(ThisRecord.Value.id) = z.Id).Value.left) }));
If(IsBlank(LookUp(colSlots, Slot = locSlot && Open)), Set(locSlot, Blank()))
```

`btnSubmit.OnSelect`:

```powerfx
Set(locRes, ParseJSON(GrantedF01.Run(gblPid, fxViewAs, JSON({ id: Coalesce(locEditId, 0), activityId: drpActivity.Selected.Id,
    gateId: drpGate.Selected.Id, date: Text(dpDate.SelectedDate, "yyyy-mm-dd"), slot: locSlot, zoneId: drpZone.Selected.Id,
    material: txtMaterial.Text, quantity: Value(txtQty.Text), unit: drpUnit.Selected.Value, pallets: Value(txtPallets.Text),
    weightLbs: Value(txtWeight.Text), carrier: txtCarrier.Text, truck: txtTruck.Text, pocName: txtContact.Text,
    pocPhone: txtPhone.Text, justification: txtJustify.Text })).json));
If(Boolean(locRes.ok), Set(locShowResult, true); Set(locEditId, Blank()); Select(btnLoadView),
    Notify(Text(locRes.message), NotificationType.Error))
```

The result card shows:

- **Approved:** "Your gate pass is ready. It’s in Confirm Delivery and your email." Refresh the view every 10 seconds until the pass appears.
- **Sent for review:** "It passed the rules. A project admin will approve or reject it."
- **Not approved:** each reason and its fix, plus **Use next open slot: …** when `locRes.nextOpen` is set.

### My Deliveries

- Upcoming and a "Past, cancelled and rejected" expander.
- Expanding a row shows the reasons, load, activity, truck, contact, booked by and decided by.
- **Reschedule or edit:** fills the Schedule form with `locEditId`.
- **Cancel delivery:** two taps. `GrantedF06.Run(gblPid, fxViewAs, JSON({ requestId: ThisItem.Id }))`, then reload.

### Messages

`colMail`, newest first: time · subject · body.

### Receive Delivery (gate)

- **Barcode reader** (modern control, QR only), styled as the big blue "SCAN QR CODE" button:
  ```powerfx
  OnScan = Set(locRaw, First(Self.Barcodes).Value); Set(locSource, "Scan"); Select(btnCheck)
  ```
- A typed code box with a **Check** button (`locSource = "Typed"`).
- Gate time: `Text(Now(), "ddd m/d h:mm AM/PM")`. Devices must be on the site's time zone; the flow re-checks on the server.

`btnCheck` (hidden) decides on the device from the cached passes, so it still works with a weak signal. It mirrors `checkPass`:

```powerfx
Set(locCode, With({ c: Upper(Substitute(Substitute(locRaw, " ", ""), "-", "")), pre: Upper(First(Split(gblP.Code, "-")).Value) },
    If(StartsWith(c, pre), pre & "-" & Mid(c, Len(pre) + 1), If(Len(c) = 6, pre & "-" & c, c))));
If(IsEmpty(colPasses), LoadData(colPasses, "grantedPasses", true); LoadData(colReq, "grantedToday", true));
Set(locPass, LookUp(colPasses, Code = locCode));
Set(locReq, LookUp(colReq, Id = locPass.ReqId));
Set(locVerdict, Switch(true,
    IsBlank(locPass) || IsBlank(locReq), "G01",
    locPass.Status = "Void" || locReq.Status = "Cancelled", "G02",
    locPass.Status = "Used", "G03",
    !IsBlank(LookUp(colSubs, Id = locReq.SubId && Suspended)) && !locPass.Override, "G07",
    locReq.Date <> Today(), "G04",
    Now() < locPass.Open, "G05",
    Now() > locPass.Close, "G06",
    "G00"));
// Wording: the view includes the ReasonCodes text (gblV.reasons); fill {placeholders} with nested Substitute() as in the v1 gate spec.
Set(locLogged, Blank())
```

The verdict panel:

- Background green (G00) or red, with "ADMIT" or "TURN AWAY" at 56 pt or larger.
- The reason, then "Next:" or "What has to happen:" with the fix.
- Details: company, load, booked window, gate, staging and contact.

| Button | When | OnSelect |
|---|---|---|
| **Admit and log** | green | `GrantedF05.Run(gblPid, fxViewAs, JSON({ passCode: locCode, action: "admit", gateId: drpGate.Selected.Id, source: locSource, deviceTime: Text(Now(), DateTimeFormat.UTC) }))`. Offline: queue it with `Collect(colQueue, …); SaveData(colQueue, "grantedQueue")` and send it when back online (source "Offline sync"). If the flow says `ok:false` (already used at another gate), show its message in red. |
| **Log turn-away and notify** | red | the same with `action: "deny"`, the reason code, title and fix |
| Clear | | `Set(locVerdict, Blank())` |

### Expected Today, Gate Log

- **Expected Today:** today's Approved and Cancelled requests by slot, each with a status pill and a **Check at gate** button (`Set(locRaw, ThisItem.Pass); Set(locSource, "List"); Select(btnCheck)`).
- **Gate Log:** `colGateLog` for today: time, Admitted/Turned away pill, code, reason, guard.

### Admin tabs

| Tab | Content |
|---|---|
| **Today** | Six tiles: Expected, Arrived, Turned away, No-shows, Need approval, Members. Then today's list. |
| **Approvals** | Join requests: name, company, email, phone and when, with an Access dropdown (Contractor / Access Control / Admin), a Trade dropdown, and **Approve** / **Decline** (`GrantedF12` with `op: "decideJoin"`). Below that, deliveries to review: company, time, load and zone, the reasons, any justification, a note box, and **Approve and issue pass** / **Reject** (`GrantedF04`). |
| **Team & Invites** | Invite form (email, access, trade → `F12 invite`). Pending invites with **Revoke**. Members sorted Admin, Access Control, Contractor: an access dropdown (`F12 changeRole`, disabled on yourself) and **Remove** (two taps). |
| **Receive / Schedule / Confirm** | The same as above |
| **All Deliveries** | Today / Upcoming / All filter. Expand a row for company, booked by, load, decided by and reasons. |
| **Emergency Pass** | Company, material, gate, "today at" slot, staging and pallets → `GrantedF10`. Shows "Pass … issued for today …". |
| **Activity** | **Run the no-show check now**, the full gate log (7 days), and every email sent on this project |
| **Project Settings** | Name, location, time zone, code chip, and **New code** (Ajax admin accounts; two taps). Rules: notice hours, max days early, arrival window ±min, review above n pallets, gate open and close, delivery days. Gates (name, trucks per slot) and zones (name, pallets) with Add. **Save** → `F13 settings`. Companies with **Suspend** / **Restore** (`F13 suspend`). Look-ahead: an **Upload CSV** attachment control → `GrantedF09` (file input), with a table of activities. **Delete project** (Ajax admin accounts): type the code to confirm → `F13 delete`. |

---

## 5. Sheets

Each sheet is a container docked to the bottom over a dark scrim, with a grab handle and a Close (×) button.

**Add a project** (`gblSheet = "add"`):

- Ajax admin accounts get a "Join with a code" / "Create a project" switch.
- **Join:** code box → `GrantedF11` → show its message. On success, reload the session and close.
- **Create:** name and location → `GrantedF13 create` → "**Name** is ready. Project code **CODE**. Share it, or invite people from Team & Invites."

**Settings** (`gblSheet = "settings"`), one row each:

| Row | Does |
|---|---|
| Profile | Edit name, phone, company → `F14 save` |
| Change password | Opens the Microsoft account page (`Launch("https://mysignins.microsoft.com/security-info")` for Ajax staff; guests manage their own account) |
| My projects | Each with **Leave** (`F12 leave`) |
| **Maintenance mode** | Visible when `gblCanMaintain`. Switch: `Set(gblMaint, { On: Self.Value, As: "Admin" }); Select(btnLoadView)`. Text: "See this project as a Contractor, Access Control or Admin. Anything you do is labelled as maintenance." |
| Privacy Policy · Terms · Support | Links |
| Sign out | `Exit(true)` signs out of Power Apps. In a wrapped app, users press and hold to sign out, so say so here. |
| Delete my Granted profile | Two taps → `F14 delete` → shows the result, then `Exit(true)` |
