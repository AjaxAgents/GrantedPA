# 04 · Security and compliance

GrantedPA follows Microsoft's rules for Power Platform and Microsoft 365 and Apple's rules for apps on iPhone. Where they differ, the stricter rule is followed. Ajax's own Microsoft 365 controls (Conditional Access, MFA, data loss prevention, retention, audit) apply automatically, because everything runs in Ajax's tenant.

## 1. Access control

| Control | How |
|---|---|
| Sign-in | Microsoft Entra ID. Ajax staff use their Ajax accounts. Outside people are **B2B guests**, signing in with their own work account or Microsoft's one-time email code. MFA and Conditional Access come from Ajax's policies. Require MFA for guests. |
| Who can open the app | Only members of the **Granted Users** group, which the app is shared with. Add people only through approval or invite (F12, C4). |
| Who can open the data | **Nobody directly.** Every list is limited to the site owners: the service account and Ajax IT. The app has no SharePoint connection. All reads go through F00, which returns only what the caller's role on that project may see. |
| Permission checks | Every flow starts with C1 Authorize: caller identity from the trigger (not the payload), active membership on that project, and the permission table (same as `rules/accounts.js`) |
| Need to know | Contractors see their own company's deliveries; others' bookings arrive only as anonymous capacity. Access Control sees today's list and the gate log. Admins see their own projects only. |
| Approvals | Join requests and approval emails go **only to the admins of that project** |
| Maintenance mode | Decided by C1 on the server. Only for Ajax admin accounts that are Admins on the project. It can only narrow access, and everything done in it is marked `Maintenance`. |
| Last admin | A project always keeps at least one Admin; admins can't demote or remove themselves |
| Invites | Single use, bound to one email, expire in 7 days, can be revoked |

## 2. The admin set-up code

- **Never in this repository, the app or any list in plain text.** `SecureSettings.AdminCodeHash` holds only a salted, iterated SHA-256 hash (100,000 rounds), made with `node tools/admin-code-hash.mjs`.
- `SecureSettings` is readable only by the service account. The flow actions that read it and run `CheckAdminCode` use **secure inputs and outputs**, so nothing shows in run history.
- It works only for a signed-in `@ajaxbuilding.com` account (the domain must match exactly). Any other account gets the same answer as a mistyped project code. It isn't accepted on the public sign-up form.
- There are 5 tries an hour per person. Every use and every failed code is written to `AuditLog`.
- **Advice:** the code is also Ajax's master password. Consider a separate code just for Granted, and keep `SecureSettings` locked down. Changing it is just a new hash in the list; no change to the app or flows is needed.

## 3. Data protection

- **Data:** name, work email, phone, company, project roles, delivery records, gate log. No location, contacts or photos.
- **Where it lives:** Ajax's SharePoint and Exchange, under Ajax's retention, eDiscovery and backup.
- **Audit:** `AuditLog` (approvals, role changes, removals, overrides, code attempts, deletions) and Microsoft Purview audit for every list change.
- **Append-only by process:** only flows write `GateLog` and `AuditLog`, and no flow edits them. Optionally apply a Purview **retention label** to these two lists to make rows unchangeable records.
- **Deletion:** in the app, *Delete my Granted profile* removes the person's profile, memberships and messages and blanks their name in delivery records. Ajax IT then removes the guest account (the flow emails them).
- **Privacy notice:** link the same privacy policy as the custom edition (hosted on an Ajax site) from the app's profile screen, Settings and the sign-up form.

## 4. Microsoft rules (Power Platform)

| Rule | GrantedPA |
|---|---|
| **Licensing:** every person who uses the app needs a Power Apps right | See [05-licensing-and-guest-access.md](05-licensing-and-guest-access.md). The service account doesn't remove that need (Microsoft's multiplexing rule). |
| **DLP policy** | Put SharePoint, Office 365 Outlook, Office 365 Users, Office 365 Groups, Excel Online (Business), Microsoft Forms, Microsoft Teams and Power Apps Notification in the **Business** group for the Granted environment. Block HTTP and custom connectors there. |
| **Environment** | A dedicated environment, "Granted", with a security group restricting who can make things in it. Production apps don't live in the default environment. |
| **Service account** | A licensed, named account (e.g. `svc-granted@ajaxbuilding.com`) owned by IT, with MFA (a method the team can maintain) and Conditional Access, excluded from password expiry by policy as IT prefers. Owns the flows, the site and the shared mailbox (Send As). |
| **Guest access** | B2B external collaboration on. Guest invite restrictions set so the service account (or SharePoint sharing for the Granted site) can invite. Guests' access reviewed quarterly (Entra access reviews if licensed). |
| **SharePoint external sharing** | Granted site: "New and existing guests", used only to create guest accounts through the Welcome page. The lists themselves aren't shared. |
| **Office Scripts** | Allowed for the service account; "Run script" from Power Automate allowed |
| **Request limits** | Monitor the service account's Power Platform request usage as projects are added |

## 5. Apple rules (iPhone)

| Path | Who is responsible | Notes |
|---|---|---|
| The **Power Apps** app from the App Store | Microsoft publishes it and meets Apple's rules | Ajax adds only content. Camera permission is asked by the Power Apps app. |
| A **wrapped** "Granted" app | Ajax signs and distributes it through **Intune** or **Apple Business Manager** (custom apps), which **are** reviewed by Apple | Needs an Ajax Apple Developer account, a privacy policy URL, a camera reason, and Apple's minimum SDK at build time (Xcode 26 / iOS 26 SDK since April 2026). Apple's guideline 5.1.1(v) requires in-app account deletion only for apps that *create* accounts. GrantedPA offers *Delete my Granted profile* anyway, which is the stricter choice. Sign-in is the company's own (Microsoft Entra), which guideline 4.8 exempts. |

## 6. IT checklist

- [ ] Dedicated environment "Granted" (no Dataverse needed) with a maker security group
- [ ] DLP policy as in §4
- [ ] Service account with licence, mailbox and MFA; shared mailbox `granted@…` with Send As
- [ ] SharePoint communication site "Granted"; service account and Ajax IT as owners only; external sharing "New and existing guests"
- [ ] SharePoint and OneDrive integration with Entra B2B on; email one-time passcode for guests on
- [ ] Microsoft 365 group "Granted Users", security-enabled; the app shared with it
- [ ] Conditional Access: MFA for guests; block legacy authentication
- [ ] Office Scripts allowed; Run script allowed in flows
- [ ] Guest licensing decision made (see doc 05)
- [ ] Purview retention labels on `GateLog` and `AuditLog` (optional)
