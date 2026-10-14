# F05 Gate event

The app decides green or red on the phone or tablet from the cached list of today's passes, so the gate keeps working with a weak signal (see the Receive Delivery section of the [app spec](../powerapps/granted-app.md)). This flow re-checks the pass, records what the guard did and tells people.

**Trigger:** Power Apps (V2). `payload`:

| Field | Example |
|---|---|
| `passCode` | `DDC2-7KQX9M` (normalized by the app) |
| `action` | `admit` or `deny` |
| `reasonCode`, `reasonText`, `remedy` | What the app showed (for `deny`) |
| `gateId` | `G1` |
| `source` | `Scan`, `Typed`, `List`, `Offline sync` |
| `deviceTime` | ISO time on the device when the guard tapped (matters for offline sync) |

**Settings:** Concurrency control **On, degree 1** (a pass can only be admitted once, even from two gates at the same moment).

## Steps

1. C1 Authorize with `action = gate.scan`. Keep `person`, `project`, `maintenance`. `Guard` = person name, plus " (maintenance)" in maintenance mode.
2. Get items `GatePasses` filter `Title eq '@{passCode}' and ProjectId eq '@{projectId}'`, top 1 → `Pass` (may be empty). If found, get its request.
3. `When` = `if(equals(source,'Offline sync'), deviceTime, utcNow())`.
4. **admit:** re-run the gate checks (the same order as `checkPass` in `rules/rules.js`) at `When`, in the project's time zone:

   | Check | If it fails |
   |---|---|
   | The pass exists on this project | G01 |
   | The pass isn't Void and the request isn't Cancelled | G02 |
   | The pass isn't Used | G03 |
   | The company isn't suspended (unless `IsOverride`) | G07 |
   | `DeliveryDate` = the local date of `When` | G04 |
   | `When` ≥ `WindowOpen` | G05 |
   | `When` ≤ `WindowClose` | G06 |

   - Any fail: respond `ok:false, message:'<reason title>. <fix>'`. The app shows it in red.
   - All pass:
     - update the pass: `Status = Used`, `UsedAt = When`, `UsedBy = Guard`;
     - create a `GateLog` row: `Result = Green`, `ReasonCode = G00`, `Action = Admitted`, `Guard`, `GuardEmail`, `GateId`, the IDs, `Source`, `DeviceTime`, `Maintenance`;
     - append *Admitted at gate @{time} by @{Guard}* to the request's `MessageLog`;
     - respond `ok:true, message:'Admitted @{h:mm tt}. Direct the truck to @{ZoneName}.'`.
5. **deny:**
   - Create a `GateLog` row: `Result = Red`, `ReasonCode`, `ReasonText`, `Action = Turned away`, and the rest as above. Never change the pass, so a truck that came too early can come back inside its window.
   - Request known: C2 `turnedAway` with `reasonTitle`, `remedy`, `guard`. The contractor, the project's Access Control and its admins each get the reason and what has to happen.
   - Code unknown: C2 `turnedAway` to Access Control and the admins only.
   - Respond `ok:true, message:'Logged @{time}. … were emailed the reason and what has to happen.'`.
