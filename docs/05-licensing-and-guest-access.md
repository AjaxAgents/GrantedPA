# 05 · Licensing and guest access

The decision that matters most for GrantedPA is how subcontractors and gate staff from other companies get access and a licence.

## Who needs what

| Person | Needs | Usually has it? |
|---|---|---|
| Ajax staff | A Microsoft 365 licence that includes Power Apps and Power Automate for Office 365 (standard connectors) | Yes, with Ajax's Microsoft 365 plans |
| Service account | A Microsoft 365 licence with Exchange, SharePoint and Power Automate | IT assigns one |
| **Guests** (subcontractors, gate company) | A Power Apps right recognised in Ajax's tenant | **It depends** (below) |
| People filling in the sign-up form | Nothing (*Anyone can respond*) | — |

Microsoft's table for guests running a canvas app with standard connectors:

| Guest's licence | Can run GrantedPA |
|---|---|
| None, or SharePoint only | **No** |
| Power Apps included with their own company's Microsoft 365 / Office 365 plan | **Yes**. Recognised across tenants. |
| Power Apps per-user (Premium) plan | Yes |
| Power Apps per-app plan from their own tenant | No (per-app plans aren't recognised across tenants). Ajax can assign one in Ajax's tenant. |

## Three ways to handle guests

| Option | How | Cost | Fits |
|---|---|---|---|
| **A. Their own Microsoft 365** | Subcontractors whose companies use Microsoft 365 (Business Basic or above, E1/E3/E5) sign in with their work account | None for Ajax | Larger subcontractors already on Microsoft 365 |
| **B. Ajax assigns licences** | Ajax buys Power Apps licences for guests who have none and assigns them in Ajax's tenant | Power Apps Premium is US$20 per user per month today, **US$22 for new terms and renewals from 1 January 2027**. Per-app plans cost less but are limited to one environment. Check current Microsoft pricing with Ajax's licensing partner. | Small subcontractors, gate staff from a security company |
| **C. Gate tablets on Ajax accounts** | The gate company works on Ajax-owned devices signed in with named Ajax accounts | Ajax Microsoft 365 licences | Access Control only |

Most projects will need a mix: A for most subcontractors, B for the few without Microsoft 365, and A or C at the gate. The custom edition (Granted) avoids this question, because it doesn't use Microsoft accounts for outside users.

## Getting a guest in, step by step

1. **The person signs up** with the public form (F15), or an admin invites them in the app (F12).
2. **An admin approves** (sign-up) or the invite stands. **C4** shares the Granted Welcome page with them, which creates the Entra guest and sends Microsoft's invitation, then adds them to **Granted Users**.
3. **The person accepts** the invitation, signs in with their work account or an emailed one-time code, and opens the app link from the email.
4. **First sign-in:** the app shows *Create your Granted profile*. The pending invite or approval is applied, and their project appears.

If Ajax IT prefers to create guests themselves, C4 emails IT instead, and steps 1, 3 and 4 are unchanged.

## Sources

- [Share a canvas app with guest users](https://learn.microsoft.com/power-apps/maker/canvas-apps/share-app-guests)
- [Wrap FAQ (guest users)](https://learn.microsoft.com/power-apps/maker/common/wrap/faq)
- [Power Apps Premium price change, January 2027](https://blog-en.topedia.com/2026/09/microsoft-increased-power-apps-premium-licensing-costs/)
