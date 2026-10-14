# F02 Issue gate pass

The only flow that creates passes. Every approval path ends here: automatic approval (F01), an admin's approval (F04) and emergency passes (F10).

**Trigger:** SharePoint · When an item is created or modified · list `DeliveryRequests`.

**Trigger conditions** (Settings → Trigger conditions, one per line; all must be true):

```
@equals(triggerOutputs()?['body/Status/Value'], 'Approved')
@empty(triggerOutputs()?['body/PassCode'])
@equals(toLower(triggerOutputs()?['body/Editor/Email']), '<service account email>')
```

The third line is a safety check: only items last written by the service account are picked up. Nobody else has write access to the list anyway.

**Settings:** Concurrency control **On, degree 1**.

## Steps

1. **Get item** by trigger ID (a fresh copy). If `Status` ≠ Approved or `PassCode` isn't empty, terminate (Succeeded, "already handled").
2. Get the project (`ProjectId`) → `S` = `json(SettingsJson)`, `TZ` = `TimeZone`, `PassPrefix`. Get the gate (`Key eq 'projectId|GateId'`) and the zone.
3. **Capacity re-check** (skip when `IsOverride` = Yes). This catches an admin approving a reviewed request after the slot or zone has filled:
   - **Slot:** count the project's requests at this gate, date and slot that are Approved with a pass, or Needs review, excluding this one. If the count ≥ capacity, it **lost the race**.
   - **Zone:** do the same over the staging days. If peak + pallets > capacity, it **lost the race**.
   - **Lost the race:**
     - update the request: `Status = Rejected`, `ReasonCodes = R07` (or R08), `ReasonText` with the next open slot (F01 step 7), `DecidedBy = 'Rules engine (capacity re-check)'`;
     - C2 `rejected`;
     - terminate.
4. **Pass code.** Initialize `Alphabet` = `ACDEFGHJKMNPQRTUVWXY34679`. `Do until` `Unique` (limit 10):
   ```
   concat(PassPrefix, '-', substring(variables('Alphabet'), rand(0,25), 1), … six times …)
   ```
   Get items `GatePasses` filter `Title eq '@{code}'` top 1; the code is unique when that's empty. Pass titles are unique across the site, so codes never repeat across projects.
5. **QR code.** Excel Online (Business) · **Run script**, run after this one *succeeded or failed*:
   - Location = the Granted site, Library = `QRRunner`, File = `QR-Runner.xlsx`
   - Script = `GenerateGatePassQR`, `passCode` = the code
   - Outputs: `…?['result']?['svg']` and `?['pngBase64']`

   If the script failed, carry on without a QR (the typed code still works at the gate) and email `SupportEmail`.
6. **Arrival window,** in the project's time zone and clipped to gate hours:
   ```
   SlotLocal   = concat(DeliveryDate, 'T', SlotStart, ':00')
   EndLocal    = addMinutes(SlotLocal, int(S.slotMinutes))
   OpenLocal   = later of  addMinutes(SlotLocal, -S.gateToleranceMinutes)  and  concat(DeliveryDate,'T',S.gateOpen,':00')
   CloseLocal  = earlier of addMinutes(EndLocal, S.gateToleranceMinutes) and  concat(DeliveryDate,'T',S.gateClose,':00')
   WindowOpen  = convertToUtc(OpenLocal, TZ)      WindowClose = convertToUtc(CloseLocal, TZ)
   ```
7. **Create item** `GatePasses` with:
   - `Title` = the code, `ProjectId`, `RequestId`
   - company key and name, `Material`, `QuantityText`, `Pallets`
   - gate and zone names, `DeliveryDate`, `SlotStart`, `WindowOpen`, `WindowClose`
   - contact name and phone
   - `Status = Active`, `IsOverride`, `IssuedAt = utcNow()`, `QrSvg`
8. **Previous pass** (rescheduled): if `PreviousPassCode` isn't empty, set that pass to `Status = Void`, `VoidedAt`, `VoidReason = 'Rescheduled'`.
9. **Update the request:** `PassCode`, `QrSvg`, and append *Gate pass @{code} issued* to `MessageLog`.
10. **Tell people:**
    - C2 `approved`, with `attachPngBase64` = the PNG. The contractor gets the pass and QR; the project's Access Control members get the new delivery.
    - For `IsOverride` = Yes, use C2 `emergency` (contractor, Access Control and the project's admins).
