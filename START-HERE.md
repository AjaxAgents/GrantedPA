# Start here: set up Granted

Two ways to run it. Do **one**.

📄 Illustrated version: [docs/Granted-Setup-Guide.pdf](docs/Granted-Setup-Guide.pdf) · 👀 Try it first: https://ajaxagents.github.io/Granted/

---

## Power Apps (inside your Microsoft 365)

**Have ready:** an IT admin (SharePoint admin + Power Platform admin), a licensed **Granted account** with a mailbox (e.g. `granted@yourcompany.com`), and a PC with [PowerShell 7](https://aka.ms/powershell).

**1. Run the set-up script** (IT admin)

```powershell
git clone https://github.com/AjaxAgents/GrantedPA
cd GrantedPA
pwsh ./setup/Setup-GrantedPA.ps1
```

No git? On GitHub: **Code → Download ZIP**, unzip, open PowerShell in that folder, run the last line. Answer its questions. It builds the SharePoint side and writes **`GrantedPA-ready.zip`**.

**2. Make the environment** (IT admin)

[admin.powerplatform.microsoft.com](https://admin.powerplatform.microsoft.com) → **Environments → + New** → Name `Granted`, Type **Production**, **Add a Dataverse data store: Yes** → Save.
Open it → **Users → + Add user** → the Granted account → **System Administrator**.

**3. Import the app** (signed in as the Granted account)

[make.powerapps.com](https://make.powerapps.com) → pick the **Granted** environment → **Solutions → Import solution** → `GrantedPA-ready.zip` → Next → for each connection, **+ New connection** and sign in → **Import**.

**4. Share it**

**Apps → Granted → Share** → `Granted Users` → Share.

**5. Open Granted**

Set up your profile, type the **admin set-up code** as a project code, create the project, and invite your team from **Team & Invites**.

✅ **Done: a working app.**

---

## Azure (its own small website)

**Have ready:** someone with **Owner** on an Azure subscription.

**1.** Open [shell.azure.com](https://shell.azure.com) and choose **Bash**.

**2.** Paste:

```bash
git clone https://github.com/AjaxAgents/Granted && bash Granted/setup/azure-setup.sh
```

**3.** Answer its four questions.

**4.** Open the address it prints. Create your account, type the **admin set-up code** as a project code, create the project, and share its code with your team.

✅ **Done: a working app.**

---

**The admin set-up code** is never stored in GitHub or either app. You choose it while setting up; only a one-way hash is kept. Give it to people by phone or in person.

Stuck? Run the script again: both are safe to re-run and say what to fix. More detail: [docs/08-rollout-and-operations.md](docs/08-rollout-and-operations.md), [Granted operations](https://github.com/AjaxAgents/Granted/blob/main/docs/operations.md).
