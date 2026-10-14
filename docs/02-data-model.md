# 02 · Data model

GENERATED from `sharepoint/list-schema.json` by `npm run build`. Edit `tools/schema-src.js`, not this file.

All lists live on one SharePoint site, **Granted**. Time zone: Any (UTC recommended): every date-time is stored in UTC and flows convert to each project's own time zone. Every list keeps version history.

## Who can open the lists

- Only the Granted service account (site owner) and the Granted Owners group (Ajax IT) can open these lists.
- People never read or write lists directly. The Granted app talks only to flows, which run as the service account and check the caller's role on the project first.
- SecureSettings is locked further: only the service account (and a named break-glass admin) can read it.

## Lists at a glance

| List | Purpose |
|---|---|
| `Projects` | One item per project. Created and changed only by flows (F15). |
| `People` | A Granted profile per person (Ajax staff and guests). Ajax membership is set from the email domain by flows. |
| `ProjectMembers` | Who is on which project, with which access. Title = ProjectId|email. |
| `JoinRequests` | Requests to join a project with its code (from the app or the sign-up form). Admins of that project decide. |
| `Invites` | Single-use invites bound to one email. Expire after 7 days. |
| `Companies` | Per-project company switches. A suspended company cannot book and its passes are red (except emergency passes). |
| `DeliveryRequests` | One item per delivery request. Written only by flows (F01 creates and decides). |
| `GatePasses` | One item per issued gate pass. Written only by F02, F05, F06. |
| `GateLog` | Every admit and turn-away. Written only by F05. Never edited. |
| `Notifications` | Copy of every message sent. Shown in the app (Messages, Activity). Written only by flows. |
| `Activities` | Each project's current 3-week look-ahead, loaded weekly by F09. |
| `Gates` | Each project's gates and trucks per time slot. |
| `StagingZones` | Each project's laydown and staging areas with pallet capacity. |
| `BlackoutDates` | Days a project's gates take no deliveries. |
| `ReasonCodes` | Fixed wording for every decision and gate result (from config/reason-codes.json). |
| `AppSettings` | App-wide, non-secret settings: service account, support email, app link, default rule settings. |
| `SecureSettings` | Secrets used only by flows: the salted hash of the admin set-up code. Only the service account can read it. **Restricted.** |
| `AuditLog` | Security-relevant actions: admin grants, code attempts, approvals, role changes, removals, overrides, deletions. Written only by flows. Never edited. |
| `QRRunner` | Holds QR-Runner.xlsx, the workbook the Office Scripts run against. Service account only. |
| `LookAheadImports` | Copies of each uploaded look-ahead CSV (written by F09), kept for the record. |

## Projects

One item per project. Created and changed only by flows (F15).

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Project name | Single line of text |  | |
| `ProjectId` | Project ID | Single line of text | Yes, unique | Required. e.g. p-7f3k2m (made by F15) |
| `ProjectCode` | Project code | Single line of text | Yes, unique | Required. e.g. DDC2-7HKQ. Upper case. |
| `PassPrefix` | Pass prefix | Single line of text |  | From the code, e.g. DDC2 |
| `Location` | Location | Single line of text |  |  |
| `TimeZone` | Time zone | Single line of text |  | Windows zone name used by convertTimeZone, e.g. 'Central Standard Time' |
| `SettingsJson` | Rule settings (JSON) | Multiple lines (plain) |  | Same keys as config/settings.json |
| `TeamsChannelLink` | Teams channel (optional) | Single line of text |  |  |
| `GateDutyPhone` | Gate duty phone | Single line of text |  |  |
| `Deleted` | Deleted | Yes/No | Yes |  |
| `DeletedAt` | Deleted at | Date and time |  |  |
| `DeletedBy` | Deleted by | Single line of text |  |  |
| `CreatedByEmail` | Created by | Single line of text |  |  |
| `CreatedAtUtc` | Created at | Date and time |  |  |

## People

A Granted profile per person (Ajax staff and guests). Ajax membership is set from the email domain by flows.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Full name | Single line of text |  | |
| `Email` | Email | Single line of text | Yes, unique | Required. Lower case. The Microsoft sign-in email. |
| `FirstName` | First name | Single line of text |  |  |
| `LastName` | Last name | Single line of text |  |  |
| `Phone` | Phone | Single line of text |  |  |
| `Company` | Company | Single line of text |  |  |
| `CompanyKey` | Company key | Single line of text | Yes | Lower-case slug of Company, e.g. north-field-electrical |
| `IsAjax` | Ajax Building Company | Yes/No |  |  |
| `IsAdminAccount` | Admin account (can create projects) | Yes/No |  |  |
| `Status` | Status | Choice | Yes | Choices: Active, Pending sign-in, Deleted. Default: Active |
| `Source` | Source | Choice |  | Choices: App, Sign-up form, Invite, Admin |
| `CreatedAtUtc` | Created at | Date and time |  |  |
| `LastSeenAt` | Last seen | Date and time |  |  |

## ProjectMembers

Who is on which project, with which access. Title = ProjectId|email.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Member key | Single line of text |  | |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `Email` | Email | Single line of text | Yes |  |
| `Role` | Access | Choice | Yes | Choices: Contractor, Access Control, Admin |
| `Trade` | Trade | Single line of text |  |  |
| `Status` | Status | Choice | Yes | Choices: Active, Removed. Default: Active |
| `Via` | Joined by | Choice |  | Choices: Creator, Request, Invite |
| `AddedBy` | Added by | Single line of text |  |  |
| `AddedAt` | Added at | Date and time |  |  |
| `RemovedBy` | Removed by | Single line of text |  |  |
| `RemovedAt` | Removed at | Date and time |  |  |

## JoinRequests

Requests to join a project with its code (from the app or the sign-up form). Admins of that project decide.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Name | Single line of text |  | |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `Email` | Email | Single line of text | Yes |  |
| `FirstName` | First name | Single line of text |  |  |
| `LastName` | Last name | Single line of text |  |  |
| `Company` | Company | Single line of text |  |  |
| `Phone` | Phone | Single line of text |  |  |
| `IsAjax` | Ajax email | Yes/No |  |  |
| `Status` | Status | Choice | Yes | Choices: Pending, Approved, Declined. Default: Pending |
| `Source` | Source | Choice |  | Choices: App, Sign-up form |
| `RequestedAt` | Requested at | Date and time |  |  |
| `Role` | Access given | Choice |  | Choices: Contractor, Access Control, Admin |
| `Trade` | Trade | Single line of text |  |  |
| `DecidedBy` | Decided by | Single line of text |  |  |
| `DecidedAt` | Decided at | Date and time |  |  |

## Invites

Single-use invites bound to one email. Expire after 7 days.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Email | Single line of text |  | |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `Email` | Email (lower case) | Single line of text | Yes |  |
| `Role` | Access | Choice |  | Choices: Contractor, Access Control, Admin |
| `Trade` | Trade | Single line of text |  |  |
| `InvitedBy` | Invited by | Single line of text |  |  |
| `InvitedAt` | Invited at | Date and time |  |  |
| `ExpiresAt` | Expires at | Date and time |  |  |
| `Status` | Status | Choice | Yes | Choices: Pending, Accepted, Revoked, Expired. Default: Pending |
| `AcceptedAt` | Accepted at | Date and time |  |  |

## Companies

Per-project company switches. A suspended company cannot book and its passes are red (except emergency passes).

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Company | Single line of text |  | |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `CompanyKey` | Company key | Single line of text | Yes |  |
| `Suspended` | Suspended | Yes/No |  |  |
| `SuspendedReason` | Reason | Single line of text |  |  |
| `SuspendedBy` | Suspended by | Single line of text |  |  |
| `SuspendedAt` | Suspended at | Date and time |  |  |

## DeliveryRequests

One item per delivery request. Written only by flows (F01 creates and decides).

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Request no. | Single line of text |  | |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `SubcontractorId` | Company key | Single line of text | Yes | CompanyKey of the booking company |
| `SubcontractorName` | Company | Single line of text |  |  |
| `ActivityId` | Activity ID | Single line of text |  |  |
| `ActivityName` | Activity | Single line of text |  |  |
| `GateId` | Gate ID | Single line of text | Yes |  |
| `DeliveryDate` | Delivery date | Date only | Yes |  |
| `SlotStart` | Slot start | Single line of text |  | 24-hour site time, e.g. 07:00 |
| `DeliveryStart` | Delivery start | Date and time |  | Slot start as a date-time (UTC) |
| `ZoneId` | Staging zone ID | Single line of text | Yes |  |
| `Material` | Material | Single line of text |  |  |
| `Quantity` | Quantity | Number |  |  |
| `Unit` | Unit | Choice |  | Choices: pcs, sections, reels, units, LF, crates, skids, boxes, load |
| `Pallets` | Pallets | Number |  |  |
| `WeightLbs` | Weight (lb) | Number |  |  |
| `Carrier` | Carrier | Single line of text |  |  |
| `TruckNumber` | Truck no. | Single line of text |  |  |
| `ContactName` | Onsite contact | Single line of text |  |  |
| `ContactPhone` | Contact phone | Single line of text |  |  |
| `EarlyJustification` | Early delivery reason | Multiple lines (plain) |  |  |
| `Status` | Status | Choice | Yes | Choices: Submitted, Approved, Needs review, Rejected, Cancelled. Default: Submitted |
| `ReasonCodes` | Reason codes | Single line of text |  | Semicolon list, e.g. R05;F03 |
| `ReasonText` | Reasons and fixes | Multiple lines (plain) |  |  |
| `NextOpenSlot` | Next open slot | Single line of text |  |  |
| `StagedUntil` | Staged until | Date only |  |  |
| `PassCode` | Pass code | Single line of text | Yes |  |
| `PreviousPassCode` | Previous pass code | Single line of text |  |  |
| `QrSvg` | QR (SVG) | Multiple lines (plain) |  |  |
| `SubmittedByEmail` | Submitted by | Single line of text | Yes |  |
| `SubmittedByName` | Submitted by (name) | Single line of text |  |  |
| `SubmittedAt` | Submitted at | Date and time |  |  |
| `DecidedBy` | Decided by | Single line of text |  |  |
| `DecidedAt` | Decided at | Date and time |  |  |
| `ReviewNote` | Review note | Multiple lines (plain) |  |  |
| `ReviewAlertSentAt` | Review alert sent | Date and time |  |  |
| `EscalatedAt` | Escalated at | Date and time |  |  |
| `CancelledAt` | Cancelled at | Date and time |  |  |
| `NoShowNotifiedAt` | No-show notified | Date and time |  |  |
| `IsOverride` | Emergency override | Yes/No |  |  |
| `Maintenance` | Maintenance mode | Yes/No |  |  |
| `MessageLog` | Message history | Multiple lines (plain) |  |  |

## GatePasses

One item per issued gate pass. Written only by F02, F05, F06.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Pass code | Single line of text | Yes, unique | |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `RequestId` | Request ID | Number | Yes |  |
| `SubcontractorId` | Company key | Single line of text | Yes |  |
| `SubcontractorName` | Company | Single line of text |  |  |
| `Material` | Material | Single line of text |  |  |
| `QuantityText` | Quantity | Single line of text |  |  |
| `Pallets` | Pallets | Number |  |  |
| `GateId` | Gate ID | Single line of text |  |  |
| `GateName` | Gate | Single line of text |  |  |
| `ZoneName` | Staging zone | Single line of text |  |  |
| `DeliveryDate` | Delivery date | Date only | Yes |  |
| `SlotStart` | Slot start | Single line of text |  |  |
| `WindowOpen` | Window opens | Date and time |  |  |
| `WindowClose` | Window closes | Date and time |  |  |
| `ContactName` | Onsite contact | Single line of text |  |  |
| `ContactPhone` | Contact phone | Single line of text |  |  |
| `Status` | Status | Choice | Yes | Choices: Active, Used, Void. Default: Active |
| `IsOverride` | Emergency override | Yes/No |  |  |
| `IssuedAt` | Issued at | Date and time |  |  |
| `UsedAt` | Used at | Date and time |  |  |
| `UsedBy` | Admitted by | Single line of text |  |  |
| `VoidedAt` | Voided at | Date and time |  |  |
| `VoidReason` | Void reason | Single line of text |  |  |
| `QrSvg` | QR (SVG) | Multiple lines (plain) |  |  |

## GateLog

Every admit and turn-away. Written only by F05. Never edited.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Code scanned | Single line of text |  | |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `ScannedAt` | Scanned at | Date and time | Yes |  |
| `Result` | Result | Choice |  | Choices: Green, Red |
| `ReasonCode` | Reason code | Single line of text |  |  |
| `ReasonText` | Reason | Single line of text |  |  |
| `Action` | Action | Choice |  | Choices: Admitted, Turned away |
| `Guard` | Guard | Single line of text |  |  |
| `GuardEmail` | Guard email | Single line of text |  |  |
| `GateId` | Gate ID | Single line of text |  |  |
| `PassId` | Pass item ID | Number |  |  |
| `RequestId` | Request ID | Number |  |  |
| `SubcontractorId` | Company key | Single line of text | Yes |  |
| `Source` | Source | Choice |  | Choices: Scan, Typed, List, Offline sync |
| `DeviceTime` | Device time | Date and time |  |  |
| `Maintenance` | Maintenance mode | Yes/No |  |  |

## Notifications

Copy of every message sent. Shown in the app (Messages, Activity). Written only by flows.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Subject | Single line of text |  | |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `Kind` | Kind | Choice |  | Choices: delivery, team, account |
| `Event` | Event | Choice |  | Choices: approved, review, rejected, cancelled, emergency, turnedAway, noshow, escalation, join, invite, access, system |
| `RecipientRole` | Recipient role | Choice |  | Choices: Contractor, Access Control, Admin, Person |
| `RecipientEmail` | Recipient email | Single line of text | Yes |  |
| `Channels` | Channels | Single line of text |  |  |
| `Body` | Body | Multiple lines (plain) |  |  |
| `RequestId` | Request ID | Number | Yes |  |
| `SubcontractorId` | Company key | Single line of text |  |  |
| `SentAt` | Sent at | Date and time | Yes |  |

## Activities

Each project's current 3-week look-ahead, loaded weekly by F09.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Activity | Single line of text |  | |
| `Key` | Key | Single line of text | Yes, unique | Required. ProjectId|ActivityId |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `ActivityId` | Activity ID | Single line of text |  |  |
| `Trade` | Trade | Single line of text |  |  |
| `StartDate` | Start | Date only |  |  |
| `FinishDate` | Finish | Date only |  |  |
| `Area` | Area | Single line of text |  |  |
| `IsCurrent` | In current look-ahead | Yes/No | Yes |  |
| `ImportBatch` | Import batch | Single line of text |  |  |

## Gates

Each project's gates and trucks per time slot.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Gate | Single line of text |  | |
| `Key` | Key | Single line of text | Yes, unique | Required. ProjectId|GateId |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `GateId` | Gate ID | Single line of text |  |  |
| `CapacityPerSlot` | Trucks per slot | Number |  |  |
| `Active` | Active | Yes/No |  | Default: 1 |
| `SortOrder` | Sort order | Number |  |  |

## StagingZones

Each project's laydown and staging areas with pallet capacity.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Zone | Single line of text |  | |
| `Key` | Key | Single line of text | Yes, unique | Required. ProjectId|ZoneId |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `ZoneId` | Zone ID | Single line of text |  |  |
| `CapacityPallets` | Capacity (pallets) | Number |  |  |
| `Active` | Active | Yes/No |  | Default: 1 |
| `Notes` | Notes | Multiple lines (plain) |  |  |

## BlackoutDates

Days a project's gates take no deliveries.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Reason | Single line of text |  | |
| `ProjectId` | Project ID | Single line of text | Yes | Required |
| `BlackoutDate` | Date | Date only | Yes |  |

## ReasonCodes

Fixed wording for every decision and gate result (from config/reason-codes.json).

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Code | Single line of text |  | |
| `Key` | Key | Single line of text |  |  |
| `Outcome` | Outcome | Choice |  | Choices: reject, review, green, red |
| `Message` | Message | Single line of text |  |  |
| `Remedy` | What to do | Multiple lines (plain) |  |  |

## AppSettings

App-wide, non-secret settings: service account, support email, app link, default rule settings.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Setting | Single line of text |  | |
| `Value` | Value | Single line of text |  |  |
| `Description` | What it controls | Multiple lines (plain) |  |  |

## SecureSettings

Secrets used only by flows: the salted hash of the admin set-up code. Only the service account can read it.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Setting | Single line of text |  | |
| `Value` | Value | Multiple lines (plain) |  |  |
| `Description` | What it controls | Multiple lines (plain) |  |  |

## AuditLog

Security-relevant actions: admin grants, code attempts, approvals, role changes, removals, overrides, deletions. Written only by flows. Never edited.

| Column (internal name) | Display name | Type | Indexed | Notes |
|---|---|---|---|---|
| `Title` | Action | Single line of text |  | |
| `ActorEmail` | Actor | Single line of text | Yes |  |
| `ProjectId` | Project ID | Single line of text | Yes |  |
| `Target` | Target | Single line of text |  |  |
| `Details` | Details | Multiple lines (plain) |  |  |
| `At` | At | Date and time | Yes |  |
| `Maintenance` | Maintenance mode | Yes/No |  |  |

## Libraries

- `QRRunner`: Holds QR-Runner.xlsx, the workbook the Office Scripts run against. Service account only.
- `LookAheadImports`: Copies of each uploaded look-ahead CSV (written by F09), kept for the record.

## Notes

- **Every project-owned row carries `ProjectId`** and every flow filters on it first, so one site serves many projects. `ProjectId` is indexed on every list, which keeps queries working past the 5,000-item list view threshold.
- IDs (`ProjectId`, `GateId`, `ZoneId`, `ActivityId`, company keys) are plain text, not lookup columns. Text keys keep flow queries simple and make imports easy.
- `Key` columns (`ProjectId|GateId` and so on) enforce "unique within a project".
- Times: `DeliveryDate` is a date; `SlotStart` is the site-local slot as `HH:MM`. `DeliveryStart`, `WindowOpen` and `WindowClose` are full date-times stored in UTC; flows convert with `convertTimeZone(..., <project TimeZone>)`.
- **Scale:** a project with 30 deliveries a day adds about 9,000 requests a year. Archive closed projects' rows to a dated copy of the site once a year, or move to one site per region when a list passes about 50,000 items.
