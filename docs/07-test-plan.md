# 07 · Test plan

## 1. Automated tests (every change)

```bash
npm install
npm test        # 53 tests
npm run check   # strict type-check of both Office Scripts
```

| Suite | File | Proves |
|---|---|---|
| Rules | `rules/rules.test.js` | Every request rule, gate rule, status and notice template, at fixed dates. The same cases in plain English: `rules/test-cases.csv`. |
| Accounts | `rules/accounts.test.js` | Password and sign-up rules, Ajax domain match, admin code handling (an outsider and a typo get the same answer), project codes, permissions, lockout |
| QR | `qr/qr.test.js` | The Office Script's QR output decodes with an independent reader for every version, including the emailed PNG |
| Admin code | `officescripts/check-admin-code.test.js` | `CheckAdminCode.ts` gives the same SHA-256 as Node and accepts only the right code |

## 2. Scenario script (test site, before the pilot)

| # | Who | Do this | Expect |
|---|---|---|---|
| 1 | New outsider | Fill in the sign-up form with the sample project code | Thanks email; only **that project's** admins get the join request |
| 2 | Project admin | Approve them as Contractor, trade Electrical | Microsoft invitation sent; they're added to Granted Users |
| 3 | The outsider | Accept, open the app | *Create your Granted profile*; then the project appears with contractor tabs |
| 4 | Ajax staff member | Profile, then **+** with the admin set-up code | *Admin access will be set up*; AuditLog `account.adminGranted` |
| 5 | Guest | **+** with the admin set-up code | *That project code was not found* (the same as a typo); AuditLog `account.codeFailed` |
| 6 | Guest | 6 wrong codes in an hour | The 6th: *Too many project code attempts* |
| 7 | Admin account | Create a project | Code shown; creator is Admin; email received |
| 8 | Admin | Invite an email as Access Control | Invite email plus Microsoft invitation; on first sign-in, Access Control tabs |
| 9 | Contractor | Book a clean delivery 3 days out | *Approved* in seconds; pass and QR in Confirm Delivery and email |
| 10 | Two contractors | Book the last slot at the same moment | One approved, one rejected R07 with the next slot |
| 11 | Contractor | Book 25 pallets | *Sent for review*; only that project's admins get the alert |
| 12 | Admin | Approve it | Pass issued; contractor and Access Control emailed |
| 13 | Access Control | Scan inside the window, admit, scan again | Green, admitted; then red G03 |
| 14 | Access Control | Scan 2 hours early; log the turn-away | Red G05; contractor, Access Control and admins emailed; the pass is unchanged |
| 15 | Access Control | Airplane mode: scan and admit, then reconnect | Green from the cache; the admit syncs |
| 16 | Admin | Turn on Maintenance mode, view as Contractor, book | Contractor tabs; the booking is marked Maintenance |
| 17 | Contractor (not an admin account) | Send a request with `viewAs: "Admin"` (e.g. edit the flow call) | Still treated as Contractor |
| 18 | Admin | Demote yourself, or remove the last admin | Refused |
| 19 | Contractor | Delete my Granted profile | Memberships removed, name blanked on bookings, IT emailed to remove the guest |
| 20 | Anyone (not an owner) | Open the SharePoint site directly | No lists visible |
| 21 | (Clock) | Leave a pass unscanned past its window + 1 hour | Hourly sweep: no-show emailed to the contractor and admins |
| 22 | Admin | Upload `config/sample-data/lookahead.csv` | *Look-ahead updated: 7 activities* |
| 23 | Builder | Break a flow on purpose | `SupportEmail` gets the failure email with a run link |

## 3. Pilot

Two weeks, one project, 2–3 subcontractors and one gate, alongside the current process.

- **Week 1:** nobody is turned away without a superintendent's call.
- **Every day:** a 10-minute check of the gate log against trucks seen, the review queue and any failed runs.
