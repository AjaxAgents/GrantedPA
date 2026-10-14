# F01 Submit request

Creates a delivery request, or reschedules one, and runs the 12 rules in the same order as `rules/rules.js` (`evaluateRequest`), so the reason codes match the tests (`rules/test-cases.csv`).

**Trigger:** Power Apps (V2) with `projectId`, `viewAs`, `payload`:

```json
{"id":0,"activityId":"A1240","gateId":"G1","date":"2026-10-15","slot":"09:00","zoneId":"Z-NLY","material":"Grounding reels",
 "quantity":4,"unit":"reels","pallets":2,"weightLbs":900,"carrier":"Lone Oak","truck":"118","pocName":"Dana Ruiz",
 "pocPhone":"214-555-0141","justification":""}
```

`id` = 0 for a new request, or the request's SharePoint ID to reschedule.

**Settings:** Concurrency control **On, degree 1**. Requests are evaluated one at a time, so two contractors can't both take the last truck slot or the last pallets in a zone.

## Steps

1. `Caller`. Run C1 Authorize with `action = delivery.request`. Keep `person`, `project`, `role`, `maintenance`.
2. **Clean the input:**
   - trim every text and cap its length (material 120, carrier 80, truck 40, contact 80, justification 500);
   - `unit` must be one of the list's choices;
   - `quantity` and `pallets` must be numbers.
3. **Rescheduling** (`id` > 0): get the item. It must be on this project, and its `SubcontractorId` must equal the caller's `CompanyKey` (or the role is Admin), with `Status` in Approved, Needs review or Rejected. Otherwise respond `ok:false` with the reason.
4. **Company:** `SubcontractorId` = the existing item's (rescheduling) or the caller's `CompanyKey`. `Suspended` comes from `Companies`, and `Trade` from the company's members (see F00 view, step 3).
5. Get the project's activity (`Key eq '@{projectId}|@{activityId}' and IsCurrent eq 1`), gate and zone. Initialize the arrays `Fails` and `Flags` and the string `NextOpenLabel`.
6. **Run the checks.** Each fail appends its code to `Fails`; each flag appends to `Flags`. Skip any check whose inputs are missing, as the reference engine does.

| # | Code | Fails when |
|---|---|---|
| 1 | R01 | A required field is empty, quantity ≤ 0, pallets isn't a whole number ≥ 0, or the phone doesn't have 10 digits: `not(equals(length(replace(replace(replace(replace(replace(pocPhone,'-',''),' ',''),'(',''),')',''),'.','')),10))` |
| 2 | R02 | The company is suspended on this project |
| 3 | R03 | No current activity with that ID on this project |
| 4 | R04 | The company has a trade **and** the activity's trade differs |
| 5 | R05 | `less(ticks(SlotLocal), ticks(addHours(NowLocal, int(S.minNoticeHours))))` |
| 6 | R06 | Not a work day, a blackout date, or the slot isn't one of the day's slots |
| 7 | R07 | Approved + Needs-review requests at this gate, date and slot (not this one) ≥ the gate's `CapacityPerSlot` |
| 8 | R08 | Zone peak over the staging days (excluding this one) + `pallets` > the zone's `CapacityPallets` |
| 9 | R09 | `date` > the activity's `FinishDate` |
| 10 | R10 / F01 | Days before install > `S.maxDaysBeforeInstall`: no justification is a **fail R10**; with one, a **flag F01** |
| 11 | F02 | `pallets` > `S.maxPalletsPerRequest`: **flag** |
| 12 | F03 | Same company and activity, Approved or Needs review, within `S.duplicateWindowDays` days: **flag** |

7. **Next open slot** (only if `Fails` has R05, R06 or R07). Search day by day from `formatDateTime(addHours(NowLocal, S.minNoticeHours),'yyyy-MM-dd')`, up to `S.searchDaysForNextSlot` days. Skip closed days. The first slot at or after the earliest time with room sets `NextOpenLabel` (`ddd M/d h:mm tt`), `nextDate` and `nextSlot`.
8. **Outcome:**
   - `Status` = Rejected if any fail, else Needs review if any flag, else Approved
   - `ReasonCodes` = `join(union(Fails, Flags), ';')`
   - `ReasonText` = for each code, the `ReasonCodes` list wording with its placeholders filled, one `Title. Remedy` per line
9. **Save** (as the service account; F02 relies on that):
   - New: **Create item** `DeliveryRequests` with every field, plus:
     - `ProjectId`, `SubcontractorName` = the company
     - `SubmittedByEmail` = Caller, `SubmittedByName`
     - `Status`, `ReasonCodes`, `ReasonText`, `NextOpenSlot`
     - `StagedUntil` = `max(date, activity StartDate)`, `DeliveryStart` = SlotUtc
     - `DecidedBy` = 'Rules engine', `DecidedAt`, `SubmittedAt` = `utcNow()`
     - `Maintenance` = C1's `maintenance`
     - `Title` = `DR-@{ID}` (update after create)
   - Reschedule: **Update item** with the same fields. If it had a pass, set `PreviousPassCode = PassCode` and clear `PassCode`, so F02 issues a new pass and voids the old one.
   - Append to `MessageLog`: `@{NowLocal} @{Status}: @{ReasonText}`.
10. **Notify:**
    - Rejected: C2 `rejected`.
    - Needs review: F03 handles the admin alert; C2 sends the contractor *Under review*.
    - Approved: F02 sends the pass.
11. **Respond:** `{"ok":true,"id":<ID>,"outcome":"Approved","reasons":[...],"nextOpen":{"date","slot","label"} or null}`.

The app shows the outcome at once. For Approved, it then refreshes the view every 10 seconds (for up to 2 minutes) until the pass appears.
