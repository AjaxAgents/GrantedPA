# Child flows: C1 Authorize · C2 Send notices · C3 Audit · C4 Onboard guest

Child flows hold the logic every other flow shares. Build them first, in the solution, with the trigger **Manually trigger a flow** and the last action **Respond to a Power App or flow**. In each child flow's *Run only users* settings, set every connection to **"Use this connection (service account)"**.

---

## C1 Authorize

**Inputs:** `caller` (text, lower case), `projectId` (text, may be blank), `viewAs` (text, may be blank), `action` (text: a permission name from the README table, or `session`).

**Steps**

1. **Person.** Get items `People` filter `Email eq '@{caller}' and Status ne 'Deleted'`, top 1. If its `Status` is `Pending sign-in` (signed up through the form, now signing in for the first time), set it to `Active`. They have now proved the email by signing in.
   - None, and `action` is `session` or `profile.create`: respond `ok:true, needsProfile:true` (the app shows the first-time profile screen).
   - None otherwise: respond `ok:false, message:'Finish setting up your Granted profile first.'`.
2. Update the person's `LastSeenAt = utcNow()`. This is at most once an hour; compare with the current value first so busy screens don't write constantly.
3. If `projectId` is blank, respond `ok:true` with the person and stop.
4. **Project.** Get items `Projects` filter `ProjectId eq '@{projectId}' and Deleted eq 0`, top 1. None: `ok:false, message:'That project no longer exists.'`.
5. **Membership.** Get items `ProjectMembers` filter `ProjectId eq '@{projectId}' and Email eq '@{caller}' and Status eq 'Active'`, top 1. None: `ok:false, message:'You’re not on this project.'`.
6. **Maintenance mode.**
   ```
   CanMaintain = and(equals(Person IsAdminAccount, true), equals(Member Role, 'Admin'))
   Role        = if(and(CanMaintain, contains(createArray('Admin','Contractor','Access Control'), viewAs)), viewAs, Member Role)
   Maintenance = and(CanMaintain, not(empty(viewAs)), not(equals(viewAs, 'Admin')))
   ```
7. **Permission.** Compose `Allowed` (the README table as JSON):
   ```json
   {"delivery.request":["Contractor","Admin"],"delivery.viewOwn":["Contractor","Admin"],"delivery.viewAll":["Admin"],
    "delivery.review":["Admin"],"delivery.emergencyPass":["Admin"],"gate.scan":["Access Control","Admin"],
    "gate.viewToday":["Access Control","Admin"],"gate.viewLog":["Access Control","Admin"],"team.approve":["Admin"],
    "team.invite":["Admin"],"team.remove":["Admin"],"team.changeRole":["Admin"],"project.settings":["Admin"],
    "project.delete":["Admin"],"project.view":["Contractor","Access Control","Admin"]}
   ```
   If `not(contains(outputs('Allowed')?[action], Role))`, respond `ok:false, message:'You don’t have access to do that on this project.'`.
8. Respond `ok:true` with `person` (Email, FirstName, LastName, Phone, Company, CompanyKey, IsAjax, IsAdminAccount), `project` (row as JSON), `role`, `realRole`, `maintenance`, `canMaintain`.

---

## C2 Send notices

Mirrors `notices()` in `rules/rules.js` and `routeNotices()` in the prototype.

**Inputs:** `projectId`, `event` (`approved`, `review`, `rejected`, `cancelled`, `emergency`, `turnedAway`, `noshow`), `requestId` (number, 0 if none), `extraJson` (text: `reasonTitle`, `remedy`, `guard`, `by`, `scannedCode`), `attachPngBase64` (text, optional).

**Steps**

1. Get the request (if any) and the project. Build the data: company, material, `when` = `formatDateTime(DeliveryDate,'ddd M/d')` + `h:mm tt` of the slot, gate name, zone name, pass code, and the reasons (ReasonText).
2. **Recipients on this project only:**
   - `contractor` = the request's `SubmittedByEmail`
   - `security` = Get items `ProjectMembers` filter `ProjectId eq '…' and Role eq 'Access Control' and Status eq 'Active'` → Select `Email`
   - `gc` = the same with `Role eq 'Admin'`
3. Use a **Switch** on `event` with the exact subjects and bodies from `rules.js`. For example:
   - `approved`: contractor gets *Approved: @{code} for @{when}* with the QR PNG attached (`attachPngBase64`); security gets *New approved delivery @{when}*.
   - `review`: contractor gets *Under review: …*; gc gets *Review needed: … (@{when})*.
   - `turnedAway`: contractor (if known), security and gc each get *Turned away at gate: …* with the reason and the fix.
4. Send each with **Office 365 Outlook → Send an email from a shared mailbox (V2)** (mailbox: AppSettings `SharedMailbox`, e.g. `granted@ajaxbuilding.com`). Group recipients as BCC, so outside companies never see each other's addresses.
5. If the project has a `TeamsChannelLink`, post `review`, `emergency`, `turnedAway` and `noshow` to it as well (Microsoft Teams → Post message as Flow bot).
6. One `Notifications` row per recipient (`ProjectId`, `Kind = delivery`, `Event`, `RecipientRole`, `RecipientEmail`, `Body`, `RequestId`, `SentAt`). The app's Messages and Activity tabs read these through F00.
7. Respond `ok:true, sent:<count>`.

---

## C3 Audit

**Inputs:** `actor`, `action`, `projectId`, `target`, `detailsJson`, `maintenance` (yes/no).
**Step:** Create item `AuditLog` with `Title = action`, `At = utcNow()`, and the inputs. Respond `ok:true`.

Actions written: `account.profileCreated`, `account.adminGranted`, `account.codeFailed`, `account.deleted`, `project.created`, `project.settings`, `project.codeReplaced`, `project.deleted`, `project.companySuspended`, `team.joinRequested`, `team.joinApproved`, `team.joinDeclined`, `team.invited`, `team.inviteRevoked`, `team.inviteAccepted`, `team.roleChanged`, `team.removed`, `team.left`, `delivery.emergencyPass`, `delivery.approved`, `delivery.rejected`.

---

## C4 Onboard guest

Makes an outside person able to open the app. Uses only standard connectors. **Ajax IT should test this once in the tenant:** guest settings differ between tenants, and the alternative paths are listed below.

**Inputs:** `email`, `displayName`.

**Steps**

1. If the email ends with `@` + AppSettings `AjaxDomain`, respond `ok:true, guest:false`. Ajax staff already have accounts.
2. **Invite as a guest by sharing.** Use SharePoint **Send an HTTP request to SharePoint** (standard) on the Granted site to share the site's **Welcome** page (a page that holds only the app link and support details, with Read access only) with the email:
   ```
   POST _api/SP.Web.ShareObject
   {"url":"<Welcome page URL>","peoplePickerInput":"[{\"Key\":\"@{email}\"}]","roleValue":"role:1073741826",
    "groupId":0,"propagateAcl":false,"sendEmail":true,"includeAnonymousLinkInEmail":false,
    "emailSubject":"You’re invited to Granted","emailBody":"Ajax Building Company invited you to Granted for delivery booking and gate access."}
   ```
   With the SharePoint and OneDrive integration with Microsoft Entra B2B turned on (Microsoft's default for new tenants), this creates the Entra guest account and sends the Microsoft invitation.
3. **Add to the app's group.** Office 365 Users → Search for users (`email`) to get the guest's ID, then Office 365 Groups → **Add member to group** for the group **Granted Users**. The app is shared with this group, which must be a security-enabled Microsoft 365 group. If the guest can't be found yet, the hourly sweep (F07) retries.
4. Respond `ok:true, guest:true`.

**If Ajax IT prefers not to create guests from a flow:** turn off steps 2–3 and have C4 email the Granted Owners mailbox instead ("Please invite this person as a guest and add them to Granted Users"). IT then uses the Entra admin center or a bulk-invite CSV, and the person is told access will follow. Every other part of the app works the same either way.
