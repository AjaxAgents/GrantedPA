# F06 Cancel · F07 Hourly sweep · F08 Daily gate list · F09 Look-ahead upload · F10 Emergency pass

## F06 Cancel delivery

**Trigger:** Power Apps (V2). `payload`: `{"requestId":123}`.

1. C1 Authorize with `action = delivery.viewOwn`.
2. Get the request. It must be on this project, and its company must be the caller's (or the role is Admin). Otherwise `ok:false`.
3. `Status` must be Approved or Needs review, and the pass must not be Used (*This truck was already admitted.*).
4. Update: `Status = Cancelled`, `CancelledAt`, and append to `MessageLog`. If there's a pass, set it to `Void` with `VoidReason = 'Cancelled'`.
5. C2 `cancelled`. The contractor gets a confirmation; Access Control gets *Cancelled delivery @{code}. Do not admit.*
6. Respond `ok:true`.

## F07 Hourly sweep

**Trigger:** Recurrence every hour.

For each project that isn't deleted (Get items `Projects` filter `Deleted eq 0`):

1. **No-shows.** Find active passes where `WindowClose` + `noShowGraceMinutes` < now. If the request's `NoShowNotifiedAt` is empty, run C2 `noshow` (the contractor and the project's admins), then set `NoShowNotifiedAt`.
2. **Review escalation.** Find requests in Needs review whose `ReviewAlertSentAt` is older than `reviewEscalationHours` and whose `EscalatedAt` is empty. Email the project's admins again, flagged as waiting too long, then set `EscalatedAt`.
3. **Invites:** set Pending invites past `ExpiresAt` to Expired.
4. **Guest onboarding retries:** for people with `Status = Pending sign-in`, re-run C4 step 3 (add to Granted Users).

Across all projects:

5. **Stuck requests:** any request still `Submitted` after 15 minutes means F01 failed part-way. Email `SupportEmail` a list with links.

## F08 Daily gate list

**Trigger:** Recurrence daily at 04:45 UTC. Inside, run per project when the project's local time is between 5:00 and 6:00 AM and today is a work day.

1. That project's passes for today (not Void), ordered by slot.
2. An HTML table: slot, company, material, pallets, gate, zone, pass code, contact, phone.
3. Email the project's Access Control members and admins: *@{project} deliveries for @{ddd M/d}: @{n} trucks*, with the line *Not on this list = do not admit.* and the gate duty phone.
4. **Heartbeat:** at the bottom, add yesterday's counts (admitted, turned away, no-shows, rejected). If the email doesn't arrive, that itself signals a problem.

## F09 Look-ahead upload

**Trigger:** Power Apps (V2) with an extra **File** input (the CSV chosen in Project Settings). `payload`: `{"fileName":"lookahead.csv"}`.

1. C1 Authorize with `action = project.settings`.
2. Create a file in `LookAheadImports` named `@{projectId}/@{yyyyMMdd-HHmm}-@{fileName}`, to keep a record.
3. `Lines` = `split(base64ToString(triggerBody()?['file']?['contentBytes']), decodeUriComponent('%0A'))`. Skip the header row if the first cell is `ID`.
4. For each line (concurrency 1): split on commas into ID, Activity, Trade, Start, Finish. Accept `YYYY-MM-DD` or `M/D/YYYY`. The row is valid when ID and name aren't empty, both are dates, and Finish ≥ Start. Upsert `Activities` by `Key = projectId|ID` with `IsCurrent = Yes` and `ImportBatch` = the file name. Collect invalid rows and why.
5. Set `IsCurrent = No` on this project's activities from older batches. Their bookings keep their data.
6. Respond `ok:true, loaded, skipped:[...]`. The app shows *Look-ahead updated: n activities* and any skipped rows.

The CSV has the same columns as the custom app's (`config/sample-data/lookahead.csv`), so a scheduler can use one export for either edition.

## F10 Emergency pass

**Trigger:** Power Apps (V2). `payload`: `{"subId":"north-field-electrical","material":"...","gateId":"G1","slot":"10:00","zoneId":"Z-EY","pallets":1}`.

1. C1 Authorize with `action = delivery.emergencyPass` (Admins).
2. Check that the company is on the project, the gate and zone exist, the slot is within gate hours, and the material isn't blank.
3. The company's contact is its first active member, or the caller.
4. Create a `DeliveryRequests` item (as the service account):
   - the company, `ActivityId = 'EMERGENCY'`, today (`TodayLocal`), the slot, gate and zone
   - `Quantity = 1`, `Unit = load`, `Pallets`
   - `Status = Approved`, `IsOverride = Yes`, `ReasonCodes = EM`, `ReasonText = 'Emergency pass issued by @{name}'`
   - `DecidedBy = '@{name} (emergency)'`, `StagedUntil = TodayLocal`, `Maintenance`
5. F02 picks it up, skips the capacity check (it's an override) and issues the pass with the `emergency` notices. C3 `delivery.emergencyPass`.
6. Respond `ok:true, requestId`. The app refreshes the view until the pass code appears.
