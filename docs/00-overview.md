# 00 · Overview: the design on Power Platform

Granted's design (see the custom edition's [product spec](https://github.com/AjaxAgents/Granted/blob/main/docs/product-spec.md)) is the target for both editions. This page lists, feature by feature, how GrantedPA delivers it and where Microsoft 365's rules change it.

| Design | GrantedPA | Difference |
|---|---|---|
| Blue splash with the logo | `scrSplash` in the app; a branded splash in a wrapped app | The Power Apps or Microsoft sign-in page appears before it |
| Centred email + password sign-in | **Microsoft sign-in.** Ajax staff use their Ajax account. Outside people are guests and sign in with their own Microsoft work account or a one-time email code. | No in-app password screen, and Granted's password rules don't apply: Microsoft's do. MFA and Conditional Access come from Ajax's tenant. |
| Sign-up page: First, Last, Phone, Email, Password, Company, Ajax Yes/No, optional project code | Two ways in. **Inside the app,** a first sign-in shows a profile screen with First, Last, Phone, Company, Ajax Yes/No and project code; the email is the verified sign-in. **For people not yet in Ajax's tenant,** a public sign-up form (Microsoft Forms) has the same fields; an admin's approval sends the Microsoft invitation. | No password field. The email is proved by Microsoft sign-in instead of a 6-digit code. |
| Ajax member checked against `@ajaxbuilding.com` | Same rule, from the **signed-in** email's domain | — |
| Admin set-up code with an Ajax email creates an Admin account | Same, in the app's **+** box. Checked by a flow against a salted hash in a restricted list, rate-limited and audited. | Not available on the public form, which can't prove the email |
| Project codes; join requests emailed to **that project's admins**; admins choose the access | Same | — |
| Invite by email with automatic access | Same. The invite also creates the Microsoft guest account (through SharePoint sharing) and sends Microsoft's invitation. | The person accepts a Microsoft invitation once |
| Only admin accounts create or delete projects and codes | Same | — |
| Textured grey header with the name, company and gear | Same | — |
| Tab 0 Project with switcher and **+** | Same | — |
| Contractor: Confirm Delivery (QR), Schedule Delivery | Same, plus My Deliveries and Messages | — |
| Access Control: Receive Delivery (QR scanner) | Barcode reader control (live camera), typed code, and an offline cache of today's passes | — |
| Admin: everything, invite and remove people; Schedule and Confirm below Receive | Same | — |
| Maintenance mode toggle in Settings | Same; the flows apply the chosen view | — |
| Delete account | **Delete my Granted profile** in Settings. The Microsoft guest account is removed by Ajax IT (the flow emails them). | Guest removal is an IT step |
| iPhone app | The free **Power Apps** app, or a **wrapped** branded app for Ajax-managed devices (Intune / Apple Business Manager) | Not a public App Store app |
| Push notifications | Email (with the QR attached), in-app Messages and optional Teams posts | Wrapped-app push needs Firebase and a premium HTTP action, so it isn't in the standard-licence build |

**In short:** GrantedPA covers everything about deliveries, the gate, projects, roles and approvals. What changes is the sign-in experience and how the app reaches phones, because Microsoft controls those.
