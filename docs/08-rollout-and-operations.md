# 08 · Rollout and operations

## Phases

| Phase | What happens | Done when |
|---|---|---|
| 0. Decide | Management picks the edition; licensing for guests is agreed ([05](05-licensing-and-guest-access.md)) | Decision recorded |
| 1. IT set-up | Checklist in [04 §6](04-security-and-compliance.md#6-it-checklist) | All items ticked |
| 2. Build | [06-build-guide.md](06-build-guide.md) | Scenario script in [07](07-test-plan.md) passes |
| 3. Pilot | One project, two weeks | No double bookings, no pass used twice, turn-away emails within 5 minutes |
| 4. Go live | Every subcontractor onboarded; the gate enforces "not on the list, not in"; contract notice issued | Every delivery booked in Granted |

## Onboarding

- **Subcontractors:** the admin shares the project code and the sign-up form link at the kickoff, or invites each booker. They walk through one booking (15 minutes).
- **Gate company:** guards are invited as Access Control, or use Ajax-owned tablets. Post orders: *"Scan every delivery. Green: tap Admit. Red: tap Log turn-away, tell the driver what the screen says, don't admit. If Granted is down, use the 5 AM list and call the superintendent."*

## Running

| When | Who | Task |
|---|---|---|
| 5–6 AM local | Automatic (F08) | Today's gate list to Access Control and admins; it also shows the system is alive |
| Hourly | Automatic (F07) | No-shows, review escalations, expired invites, guest retries, stuck requests |
| Morning | Project admins | Approvals tab: join requests and reviews |
| Weekly | Scheduler | Upload the 3-week look-ahead CSV in Project Settings |
| Quarterly | Ajax IT | Review guest accounts and Granted Users membership; check the service account's request usage |

## When something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| "Finish setting up your Granted profile first" | The first-time profile wasn't completed | Open the app again; the profile screen appears |
| A guest can't open the app | Invitation not accepted, not in Granted Users, or no Power Apps licence | Resend the invite (F12), check the group, check the licence |
| Approved but no pass after 5 minutes | F02 failed, or the QR script is blocked | Open the failed run and resubmit. The pass is issued without a QR if the script fails. |
| Red for a truck that should be green | Wrong day, outside the window, or the device clock is wrong | Read the reason on screen; set the device to automatic time in the project's time zone |
| Gate offline | Site network | The app works from today's cache; admits sync later |
| A flow failure email | Connection expired, or throttling | Fix the connection under the service account; resubmit the run |

## Handover

This repository, the exported **Granted** solution (managed and unmanaged), the SharePoint site template (`Get-PnPSiteTemplate`), the form, and one-page guides for contractors and guards.
