# F11 Enter a code · F12 Team · F13 Projects · F14 Profile · F15 Sign-up form

These flows mirror the custom app's account and team services. Messages use the same wording.

---

## F11 Enter a code

The **+** on the Project tab. `payload`: `{"code":"ddc2-7hkq"}`.

1. C1 Authorize with `action = session` (any signed-in person with a profile).
2. `Code` = `toUpper(trim(code))`, keeping only `A–Z`, `0–9` and `-`. If empty: `ok:false, message:'Enter a project code.'`.
3. **Rate limit:** count `AuditLog` rows with `ActorEmail eq caller and Title eq 'account.codeFailed' and At ge @{addHours(utcNow(),-1)}`. If there are 5 or more: `ok:false, message:'Too many project code attempts. Try again in an hour.'`.
4. **Admin set-up code?** Get the `SecureSettings` row `AdminCodeHash` (**secure inputs/outputs on**). Excel Online (Business) → **Run script** `CheckAdminCode` on `QR-Runner.xlsx`, with `code` and `stored` (**secure inputs/outputs on**). Result `IsAdminCode`.
5. **If `IsAdminCode`:**
   - Caller's email **ends with** `@ajaxbuilding.com` (exact domain; their Microsoft sign-in proves the email): set `People.IsAdminAccount = Yes`, run C3 `account.adminGranted`, and respond `ok:true, message:'Admin access will be set up for this Ajax account.'` (or *This account already has Admin access.*).
   - Any other email: treat it exactly like an unknown code (step 7). Never reveal that it was the admin code.
6. **Project code:** Get `Projects` filter `ProjectCode eq '@{Code}' and Deleted eq 0`.
   - Already a member: `ok:true, projectId, message:'You’re already on @{name}.'`
   - A pending invite for the caller's email: apply it (as in F00 session step 2): `ok:true, projectId, message:'Invite accepted. You have @{role} access to @{name}.'`
   - A pending join request already: `ok:true, message:'Your request to join @{name} is still waiting for an admin.'`
   - Otherwise:
     - create `JoinRequests` (`Source = App`, the person's details);
     - C3 `team.joinRequested`;
     - email **that project's admins only**: *Join request: @{name} (@{company}) for @{project}*, saying to open Granted → Approvals;
     - respond `ok:true, message:'Request sent. The @{project} admins will choose your access.'`.
7. **Not found:** run C3 `account.codeFailed`, then respond `ok:false, message:'That project code was not found. Check it with your project admin.'`.

---

## F12 Team

`payload.op` selects the action. Each one starts with C1 Authorize for the permission shown.

| op | Permission | Steps |
|---|---|---|
| `decideJoin` `{joinId, approve, role, trade}` | `team.approve` | The request must be on this project and Pending. **Approve:** add or reactivate `ProjectMembers` (`Via = Request`), set the request to Approved with role, `DecidedBy` and `DecidedAt`, run C4 Onboard guest, then email the person *You’re on @{project}* with the app link. **Decline:** set Declined and email *Request to join @{project}* (declined wording). C3. |
| `invite` `{email, role, trade}` | `team.invite` | The email must be valid. The person must not already be a member, and there must be no Pending invite for them. Create `Invites` (`ExpiresAt` = now + 7 days). Then run C4 Onboard guest (creates the guest and sends the Microsoft invitation), and email *@{inviter} invited you to @{project} on Granted* with the app link. If they already have a profile, apply the invite now. C3. |
| `revokeInvite` `{inviteId}` | `team.invite` | Must be Pending. Set Revoked. C3. |
| `changeRole` `{memberId, role, trade}` | `team.changeRole` | Can't change your own access. Can't demote the last Admin (*A project needs at least one admin.*). Update the member, then email the person *Your access on @{project} changed*. If Admin was gained or lost, also email the project's admins. C3. |
| `remove` `{memberId}` | `team.remove` | Can't remove yourself (use Leave) or the last Admin. Set `Status = Removed`, `RemovedBy`, `RemovedAt`, then email *Removed from @{project}*. C3. |
| `leave` `{}` | any member | The last Admin can't leave. Set `Status = Removed`. C3 `team.left`. |

Respond `ok:true` or `ok:false` with the reason, in the custom app's wording.

---

## F13 Projects

| op | Who | Steps |
|---|---|---|
| `create` `{name, location, timeZone}` | `People.IsAdminAccount = Yes` and an Ajax email | Make the code from the name's prefix plus 4 characters from `ACDEFGHJKMNPQRTUVWXY34679`, checking it's unique in `Projects`. Make `ProjectId` = `p-` + 8 characters. Create the `Projects` row (`PassPrefix` = the code's prefix, `TimeZone` default `Central Standard Time`, `SettingsJson` = AppSettings `DefaultSettingsJson` with `passPrefix` and `timeZone` set). Copy the default gates and zones from `config/sample-data` into `Gates` and `StagingZones` with this `ProjectId`. Add the creator to `ProjectMembers` as Admin (`Via = Creator`). Email the creator *Project created: @{name} (@{code})*. C3. |
| `settings` `{name, location, timeZone, settings:{…}, gates:[…], zones:[…]}` | `project.settings` | Clamp each number to the custom app's ranges: notice 0–336 h, early 0–60 days, window 0–240 min, review 1–500 pallets, gate times `HH:MM` with open < close. Update `SettingsJson`. Upsert `Gates` and `StagingZones` by `Key`; anything removed is set inactive, not deleted. C3. |
| `regenerateCode` | `project.settings` and an Ajax admin account | New unique code; the old one stops working at once. C3 with old and new codes. |
| `suspend` `{subId, suspended}` | `project.settings` | Upsert `Companies` (`ProjectId`, `CompanyKey`). C3. |
| `delete` `{confirmCode}` | `project.delete` and an Ajax admin account | `confirmCode` must equal the project code. Set `Deleted = Yes`, `DeletedAt`, `DeletedBy`. The records stay for audit. C3. |

---

## F14 Profile

| op | Steps |
|---|---|
| `create` `{first, last, phone, company, declaredAjax, ajaxNoteConfirmed, code}` | The first time someone signs in (C1 said `needsProfile`). Validate with the same rules as `validateSignUp` in `rules/accounts.js`: names, a 10-digit phone, company, and Yes/No with the confirmation note when it disagrees with the email. Create `People` with `Email` = the caller's verified sign-in email, `IsAjax` from the **email domain** (never from the answer), `CompanyKey` = slug of company, `Status = Active`, `Source = App`. Then apply invites (F00 session step 2). If a `code` was given, run the F11 logic. C3 `account.profileCreated`. |
| `save` `{first, last, phone, company}` | Validate and update the caller's `People` row. |
| `delete` `{}` | **Delete my Granted profile** (in-app account deletion; App Store guideline 5.1.1(v)). Block it if the caller is the only Admin on any project (*You’re the only admin on @{project}. Make someone else an admin first, or delete the project.*). Otherwise: set every membership to Removed; decline any pending join requests; blank the caller's name, email and phone in their `DeliveryRequests` (`SubmittedByName = 'Deleted user'`); delete their `Notifications`; mark `People` `Status = Deleted` with the personal fields cleared. Remove them from **Granted Users** (Office 365 Groups → Remove member from group). C3 `account.deleted`. Then email `SupportEmail` to delete the Entra **guest account** (guests only; Ajax staff accounts are managed by Ajax HR/IT). Respond *Your Granted profile was deleted.* |

---

## F15 Sign-up form (people outside Ajax)

People outside Ajax can't open the app until they're a guest in Ajax's tenant. The **sign-up form** gives them the requested sign-up page without a licence.

**The form** (Microsoft Forms, owned by the service account, set to *Anyone can respond*, with *One response per person* off). Fields:
- First name, Last name, Phone, Work email, Company
- Member of Ajax Building Company? (Yes/No)
- Project code (required)
- a consent line linking the privacy policy

Put the form link on the Granted site's Welcome page and in AppSettings `SignUpFormLink`.

**Trigger:** Microsoft Forms → When a new response is submitted → Get response details.

1. **Validate:** name, 10-digit phone, email format, company and project code. If anything's invalid, email the address given *We couldn’t process your Granted sign-up* with what to fix, then stop.
2. **Ajax emails** (domain match): reply *Ajax staff sign in to Granted with your Ajax Microsoft account. Open the app and tap + to enter the project code.*, then stop. Admin set-up never happens through this form, because the form can't prove who typed the email.
3. **Rate limit:** at most 5 sign-up form responses per email per day (count `JoinRequests` with `Source = Sign-up form`). Over that, stop quietly.
4. **Project:** look up the code (not deleted). If it isn't found, email *That project code was not found. Check it with your project admin.* and stop.
5. If there's already a Pending request for this email on this project, stop. Otherwise create `JoinRequests` (`Source = Sign-up form`, `IsAjax = No`). Create or update `People` with `Status = Pending sign-in`, `Source = Sign-up form`.
6. Email **that project's admins only**: *Join request: @{name} (@{company}) for @{project}*. Email the person: *Thanks. The @{project} admins will review your request. If they approve it, you’ll get a Microsoft invitation to sign in.*
7. C3 `team.joinRequested`.

When an admin approves (F12 `decideJoin`), C4 creates the guest and sends the invitation. The person signs in with a Microsoft account or a one-time email code (Microsoft Entra email one-time passcode for guests), and their `People` row becomes Active on first sign-in.
