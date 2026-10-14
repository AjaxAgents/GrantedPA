# 01 · Architecture

Everything runs inside Ajax's Microsoft 365 tenant, on standard connectors. The app has **no SharePoint connection**: it calls flows, and the flows, running as one service account, are the only thing that touches the lists. That gives GrantedPA the same shape as the custom app. The flows play the API's part, checking who is calling and what they may do on that project before every read and write.

```mermaid
flowchart TB
  subgraph People
    APP["Granted canvas app<br/>(Power Apps mobile app, browser,<br/>or wrapped app on Ajax devices)"]
    FORM["Sign-up form<br/>(Microsoft Forms, anyone can respond)"]
  end
  subgraph Flows["Power Automate (solution 'Granted', service account)"]
    C1["C1 Authorize"]
    C2["C2 Send notices"]
    C3["C3 Audit"]
    C4["C4 Onboard guest"]
    F00["F00 Session and view"]
    FX["F01 Submit · F04 Review · F05 Gate · F06 Cancel<br/>F09 Look-ahead · F10 Emergency · F11 Code<br/>F12 Team · F13 Projects · F14 Profile"]
    F02["F02 Issue pass (concurrency 1)"]
    F03["F03 Review alert"]
    F07["F07 Hourly · F08 Daily list"]
    F15["F15 Sign-up form intake"]
  end
  subgraph SP["SharePoint site 'Granted' (owners only)"]
    L1[("Projects · People · ProjectMembers<br/>JoinRequests · Invites · Companies")]
    L2[("DeliveryRequests · GatePasses<br/>GateLog · Notifications")]
    L3[("Activities · Gates · StagingZones · BlackoutDates<br/>ReasonCodes · AppSettings · AuditLog")]
    SEC[("SecureSettings<br/>(service account only)")]
    XL["QR-Runner.xlsx + Office Scripts<br/>GenerateGatePassQR · CheckAdminCode"]
  end
  OUT["Shared mailbox · optional Teams channel"]
  ENTRA["Microsoft Entra: Ajax staff + B2B guests<br/>group 'Granted Users'"]

  APP --> F00 & FX
  FORM --> F15
  F00 & FX & F15 --> C1 & C2 & C3
  FX --> C4 --> ENTRA
  F00 & FX --> L1 & L2 & L3
  FX --> SEC
  FX & F02 --> XL
  L2 -- "Approved, no pass" --> F02
  L2 -- "Needs review" --> F03
  C2 --> OUT
```

## Why it's shaped this way

| Choice | Reason |
|---|---|
| The app reads and writes only through flows | Guests can't open the lists, so they can't get around the app's rules. Every permission check is in one place (C1), like the custom app's API. |
| One site, `ProjectId` on every row | One app and one set of flows serve every project. SharePoint data sources can't be switched at run time, so a site per project would need an app per project. |
| Effective role decided by the server (C1) | Maintenance mode can't be faked from the app, and it can only narrow access |
| F01, F02, F05 and F10 run one at a time | The last slot can't be double-booked, and a pass can't be admitted twice |
| QR codes and the admin code check are Office Scripts | No premium connector or outside service. Both scripts are tested in this repository. |
| The gate keeps today's passes on the device | A weak signal doesn't stop deliveries; admits queue and sync |
| Sign-up form for outsiders | People need a guest account before they can open the app. The form collects the design's sign-up fields with no licence, and approval creates the guest. |
| Child flows in a solution | Shared logic (authorize, notify, audit, onboard) is written once. Solutions are also needed for wrap and for environment variables. |

## Main sequence: booking to gate

```mermaid
sequenceDiagram
  actor C as Contractor
  participant App
  participant F01 as F01 Submit
  participant L as DeliveryRequests
  participant F02 as F02 Issue pass
  participant QR as Office Script
  actor G as Access Control
  participant F05 as F05 Gate
  C->>App: Fill in the booking
  App->>F01: payload (projectId, request)
  F01->>F01: C1 Authorize, 12 rules
  F01->>L: Create item (Approved)
  F01-->>App: outcome + reasons
  L-->>F02: Approved, no pass
  F02->>QR: GenerateGatePassQR(code)
  F02->>L: Pass, window, QR
  F02-->>C: Email with QR (C2)
  G->>App: Scan QR
  App->>App: Green or red from today's cache
  G->>App: Admit
  App->>F05: admit (re-checked on the server)
  F05-->>App: Admitted, direct to zone
```
