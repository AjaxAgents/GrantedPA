# Power Apps

GrantedPA is **one canvas app**, "Granted", in phone layout. It's shared with the **Granted Users** group, and every role uses the same app; the tabs follow the person's access on the open project, as in the design.

| | |
|---|---|
| Spec | [granted-app.md](granted-app.md): every screen, control and formula |
| Data sources | **Flows only** (F00–F14). No SharePoint connection in the app, so nobody can reach the lists around the app. |
| Connectors | Power Apps and Power Automate only. The flows use SharePoint, Outlook, Excel Online (Business) and Office 365 Groups/Users, all standard. |
| Look | Matches `prototype/index.html` (open it in a browser): Ajax blue `#0133A2`, white and cool greys, the textured grey header, accordion tabs, green and red only for admit and turn away |
| Phones | The **Power Apps** app from the App Store and Google Play, or a **wrapped** "Granted" app for Ajax-managed devices (see [docs/06-build-guide.md](../docs/06-build-guide.md#7-phones)) |

## Build conventions

- **Solution:** build the app and every flow inside the **Granted** solution (needed for child flows, environment variables and wrap).
- **Modern controls and theme:** turn on modern controls. Theme colours: primary `#0133A2`; header grey `#59656F`; go `#12804A`; stop `#C2252D`; review `#946200`. Minimum tap target 44 px; body text 15–16 px; gate verdict 56 px or more.
- **Names:** screens `scrX`, containers `conX`, galleries `galX`, buttons `btnX`, app-wide variables `gblX`, screen variables `locX`, collections `colX`.
- **Flows:** add them from the Power Automate pane. Each takes `projectId`, `viewAs`, `payload` and returns `json` (see [../powerautomate/README.md](../powerautomate/README.md)). Parse with `ParseJSON()`.
- **Errors:** wrap every flow call in `IfError(…, Notify("No connection. Check your signal and try again.", NotificationType.Error))`. If the flow answers `ok:false`, show its `message` exactly.
- **Accessibility:** set `AccessibleLabel` on every icon button. Don't rely on colour alone: the verdict also says ADMIT or TURN AWAY in words.
- **Version control:** turn on Power Platform Git integration for the solution, or after each publish export the solution into `powerapps/exports/`.
