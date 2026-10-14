# F03 Review alert · F04 Review decision

## F03 Review alert

**Trigger:** SharePoint · When an item is created or modified · `DeliveryRequests`.

**Trigger conditions:**

```
@equals(triggerOutputs()?['body/Status/Value'], 'Needs review')
@empty(triggerOutputs()?['body/ReviewAlertSentAt'])
@equals(toLower(triggerOutputs()?['body/Editor/Email']), '<service account email>')
```

**Steps**

1. Get the item (a fresh copy).
2. C2 `review`. The contractor gets *Under review* with the flags. **The admins of this project** get *Review needed* with the flags and the app link (AppSettings `AppLink`). If the project has a Teams channel, it gets a post too.
3. Update the item: `ReviewAlertSentAt = utcNow()`, and append to `MessageLog`.

Escalation (a review waiting longer than `reviewEscalationHours`) is handled by F07.

## F04 Review decision

**Trigger:** Power Apps (V2). `payload`: `{"requestId":123,"decision":"approve"|"reject","note":"..."}`.

**Steps**

1. C1 Authorize with `action = delivery.review` (Admins of this project only).
2. Get the item. It must be on this project with `Status = Needs review`. Otherwise respond `ok:false, message:'Someone already decided this request.'`.
3. **Approve:** update `Status = Approved`, `DecidedBy = <name>` (plus " (maintenance)" in maintenance mode), `DecidedAt`, `ReviewNote`. F02 then re-checks capacity, issues the pass and sends the emails. C3 `delivery.approved`.
4. **Reject:** update:
   - `Status = Rejected`, `ReasonCodes = 'GC'`
   - `ReasonText` = *Not approved by the project admin.* plus the note, or *Contact the project admin for details, then submit a new request.*
   - `DecidedBy`, `DecidedAt`, `ReviewNote`

   Then C2 `rejected` and C3 `delivery.rejected`.
5. Respond `ok:true, outcome`.
