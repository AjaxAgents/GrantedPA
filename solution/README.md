# solution/: the ready-to-import app and flows

**Empty for now.** The Power Apps app and the Power Automate flows can only be created inside a Microsoft 365 tenant, so they are described in full in [`powerapps/`](../powerapps) and [`powerautomate/`](../powerautomate) and built once by hand (docs/06-build-guide.md, about 2–3 weeks of maker time).

**After that first build, nobody has to build them again.** Export the solution and save it here; every later installation (another region, another tenant, a rebuild) is then a 30-minute import with [`setup/Import-GrantedPASolution.ps1`](../setup/Import-GrantedPASolution.ps1).

## Export (once, by whoever built it)

With the [Power Platform CLI](https://aka.ms/PowerPlatformCLI), signed in to the environment where Granted was built:

```powershell
pac auth create --environment https://<your environment>.crm.dynamics.com
pac solution export --name Granted --path solution/GrantedPA_managed.zip --managed
pac solution export --name Granted --path solution/GrantedPA_unmanaged.zip           # for future changes
pac solution unpack --zipfile solution/GrantedPA_unmanaged.zip --folder solution/src  # readable source, for review
```

Commit the three outputs. Before committing, check that the export holds **no connection credentials and no AdminCodeHash** (it shouldn't: connections and SharePoint data are never in a solution). The solution should contain:

| Component | Count |
|---|---|
| Canvas app "Granted" | 1 |
| Cloud flows (C1–C4, F00–F15) | 20 |
| Connection references (SharePoint, Office 365 Outlook, Office 365 Users, Office 365 Groups, Excel Online (Business), Microsoft Forms, Approvals if used) | 6–7 |
| Environment variables: `Granted Site URL`, `Granted Service Account` | 2 |

## Import (every installation after the first)

1. Run [`setup/Setup-GrantedPA.ps1`](../setup/Setup-GrantedPA.ps1) (the SharePoint site and lists).
2. As the service account, create the connections in make.powerapps.com → Connections.
3. Run:
   ```powershell
   pwsh ./setup/Import-GrantedPASolution.ps1 -EnvironmentUrl https://<environment>.crm.dynamics.com
   ```
   The first run writes `deployment-settings.json` for you to fill in (connection IDs and the two environment variables); the second run imports.
