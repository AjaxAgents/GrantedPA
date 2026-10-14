# F00 Session and view

Gives the app everything it shows, already filtered for the caller's role. This is the only way the app reads data. It mirrors `projectView()` in the custom app (`packages/services/src/service.ts`).

**Trigger:** Power Apps (V2) with `projectId`, `viewAs`, `payload` (`{"op":"session"}`, `{"op":"view"}` or `{"op":"slots", ...}`).

---

## op = session

1. C1 Authorize with `action = session`. If `needsProfile`, respond `{"ok":true,"needsProfile":true,"email":"<caller>","isAjax":<domain check>}`.
2. **Apply pending invites** for the caller: Get items `Invites` filter `Email eq '@{caller}' and Status eq 'Pending'`. For each:
   - if `ExpiresAt` < `utcNow()`, set `Status = Expired`;
   - else, if the project isn't deleted: add or reactivate `ProjectMembers` (`Title = ProjectId|email`, Role, Trade, `Via = Invite`), set the invite to `Accepted`, close any pending join request for that project as Approved, run C3 (`team.inviteAccepted`), and email that project's admins *"@{name} joined @{project} as @{role}"*. Collect *"You now have @{role} access to @{project}."* into `Notices`.
3. **My projects:** Get items `ProjectMembers` filter `Email eq '@{caller}' and Status eq 'Active'`. For each, get the `Projects` row (skip deleted). Select `{id, name, code, location, role}`, sorted by name.
4. **Pending:** Get items `JoinRequests` filter `Email eq '@{caller}' and Status eq 'Pending'` → `{projectId, name}`.
5. Respond `{"ok":true,"me":{...person},"projects":[...],"pending":[...],"notices":[...]}`.

---

## op = view

1. C1 Authorize with `action = project.view`. Keep `role`, `realRole`, `maintenance`, `canMaintain`, `project`, `person`.
2. Read the project's reference data: `Gates` (Active, ordered by SortOrder), `StagingZones` (Active), `Activities` (`IsCurrent eq 1`), `BlackoutDates`, `Companies`.
3. **Companies on the project** (mirrors `subsForProject`): `ProjectMembers` filter `ProjectId eq … and Status eq 'Active' and Role ne 'Access Control'`. Join each to `People` for `Company` and `CompanyKey`, and take the first non-blank `Trade` per company. A company is `suspended` if `Companies` has its key with `Suspended = Yes`. Keep `mySub` = the caller's company.
4. **Requests by role.** Read `DeliveryRequests` filter `ProjectId eq '…' and DeliveryDate ge '@{addDays(TodayLocal,-30)}'` (raise the window for the Admin "All" view if needed). Then:
   - `Admin` (effective role): all of them.
   - `Contractor`: only `SubcontractorId eq mySub.id` (the caller's company).
   - `Access Control`: only today's (`DeliveryDate eq TodayLocal`) with Status Approved or Cancelled.
   - **Occupancy** for Contractor and Admin: every other company's Approved or Needs-review request reduced to `{id, gateId, date, slot, zoneId, pallets, stagedUntil, status}`. No names, materials or contacts.
5. **Passes:** `GatePasses` for the visible requests (code, requestId, status, usedAt, windowOpen, windowClose, override, qrSvg). For Access Control and Admin, also add `reasons`: the `ReasonCodes` list (code, message, remedy). The gate screen fills in the wording on the device, so it keeps working offline.
6. **Gate log** (Access Control and Admin): `GateLog` filter `ProjectId eq … and ScannedAt ge '@{addDays(utcNow(),-7)}'`, newest first.
7. **Team** (Admin only):
   - `ProjectMembers` (Active) joined to `People` for name, email, company and phone;
   - `JoinRequests` (Pending);
   - `Invites` (Pending).
8. **Messages:**
   - Admin: `Notifications` filter `ProjectId eq …`, top 200, newest first.
   - Others: the same filter plus `RecipientEmail eq '@{caller}'`.
9. Respond with one JSON object in the same shape as the custom app's `ProjectView`:
   ```json
   {"ok":true,"project":{"id","name","location","code","timeZone","settings":{...},"gates":[...],"zones":[...],"activities":[...]},
    "role":"Contractor","realRole":"Admin","maintenance":true,"canMaintain":true,
    "mySub":{"id","name","trade","suspended"},"subs":[...],"requests":[...],"occupancy":[...],"passes":[...],
    "gatelog":[...],"members":[...],"joinreqs":[...],"invites":[...],"mail":[...],"serverTime":"<utcNow()>"}
   ```
   Request fields: `id, subId, subName, activityId, gateId, date, slot, zoneId, material, quantity, unit, pallets, carrier, truck, pocName, pocPhone, status, passCode, reasonText, submittedBy, decidedBy, justification, maintenance`.
   Build each array with `Select`, and the whole object with one `Compose`. Respond `json = string(outputs('View'))`.

**Speed:** steps 2–8 are independent, so run them as **parallel branches**. A typical project view returns in 2–4 seconds.

---

## op = slots

The booking form's slot board and zone room. The app also works these out itself from the view (`requests` + `occupancy`), so this is the server's answer when the view is stale.

`payload`: `{"op":"slots","gateId":"G1","date":"2026-10-15","activityId":"A1240","excludeRequestId":0}`

1. C1 Authorize with `action = delivery.request`.
2. Slots for the day from the project settings (`gateOpen`, `gateClose`, `slotMinutes`):
   ```
   OpenMin  = add(mul(int(split(S.gateOpen,':')[0]),60), int(split(S.gateOpen,':')[1]))
   CloseMin = (same for gateClose)
   Slots    = Select over range(0, div(sub(CloseMin, OpenMin), S.slotMinutes)) →
              formatDateTime(addMinutes('2000-01-01T00:00:00', add(OpenMin, mul(item(), S.slotMinutes))), 'HH:mm')
   ```
3. Bookings: `DeliveryRequests` filter `ProjectId eq … and GateId eq … and DeliveryDate eq … and (Status eq 'Approved' or Status eq 'Needs review') and ID ne @{excludeRequestId}`.
4. For each slot (concurrency 1), append `{slot, left, open, tooSoon, closedDay}` to an array, where:
   - `used` = the bookings in that slot
   - `tooSoon` = `less(ticks(concat(date,'T',slot,':00')), ticks(addHours(NowLocal, S.minNoticeHours)))`
   - `closedDay` = the day of week isn't in `S.workDays`, or the date is in `BlackoutDates`
   - `left` = `max(0, capacity - used)`
   - `open` = `and(not(tooSoon), not(closedDay), greater(left,0))`
5. Zones: the staging days run from `date` to `max(date, activity StartDate)`. For each zone and each day, sum the pallets of active requests where `DeliveryDate le day and StagedUntil ge day`, using the xpath sum. Keep the highest; `left = capacity - peak`.
6. Respond `{"ok":true,"slots":[...],"zones":[{"id":"Z-SLY","left":34}]}`.
