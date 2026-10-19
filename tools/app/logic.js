// Power Fx used on several screens: loading the session and the project view.
'use strict';

const VIEW_AS = 'If(gblMaint.On && gblMaint.ViewAs <> "Admin", gblMaint.ViewAs, "")';
const NO_CONN = (msg) => `ParseJSON("{""ok"":false,""message"":""${msg}""}")`;

/** Who am I, my projects, pending requests. Then the project view. */
const LOAD_SESSION = `IfError(
    Set(gblS, ParseJSON(GrantedF00.Run("", "", "{""op"":""session""}").json)),
    Set(gblS, ${NO_CONN('No connection. Check your signal and try again.')})
);
Set(gblNeedsProfile, Boolean(gblS.needsProfile));
If(!Boolean(gblS.ok), Notify(Text(gblS.message), NotificationType.Error));
If(gblNeedsProfile, Set(gblSignInEmail, Text(gblS.email)); Set(gblHomeDomainUser, Boolean(gblS.isHome)));
If(Boolean(gblS.ok) && !gblNeedsProfile,
    Set(gblMe, {
        Email: Text(gblS.me.email), First: Text(gblS.me.first), Last: Text(gblS.me.last), Phone: Text(gblS.me.phone),
        Company: Text(gblS.me.company), IsHome: Boolean(gblS.me.isHome), IsAdminAccount: Boolean(gblS.me.isAdminAccount)
    });
    Set(gblSupport, Text(gblS.settings.supportEmail));
    ClearCollect(colProjects, ForAll(Table(gblS.projects), {
        Id: Text(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name), Code: Text(ThisRecord.Value.code),
        Location: Text(ThisRecord.Value.location), Role: Text(ThisRecord.Value.role)
    }));
    ClearCollect(colPending, ForAll(Table(gblS.pending), { Id: Text(ThisRecord.Value.projectId), Name: Text(ThisRecord.Value.name) }));
    ForAll(Table(gblS.notices), Notify(Text(ThisRecord.Value), NotificationType.Success));
    If(IsBlank(LookUp(colProjects, Id = gblPid)), Set(gblPid, First(SortByColumns(colProjects, Name)).Id))
)`;

/** Everything on the open project, already filtered by the server for this person's access. */
const LOAD_VIEW = `If(IsBlank(gblPid),
    Set(gblRole, Blank()); Set(gblP, Blank()),
    IfError(
        Set(gblV, ParseJSON(GrantedF00.Run(gblPid, ${VIEW_AS}, "{""op"":""view""}").json)),
        Set(gblV, ${NO_CONN('No connection. Showing what was loaded last.')})
    );
    If(Boolean(gblV.ok),
        Set(gblRole, Text(gblV.role)); Set(gblCanMaintain, Boolean(gblV.canMaintain)); Set(gblInMaint, Boolean(gblV.maintenance));
        Set(gblP, {
            Id: Text(gblV.project.id), Name: Text(gblV.project.name), Code: Text(gblV.project.code), Location: Text(gblV.project.location),
            TimeZone: Text(gblV.project.timeZone), DutyPhone: Text(gblV.project.dutyPhone)
        });
        Set(gblCfg, {
            MinNotice: Coalesce(Value(gblV.project.settings.minNoticeHours), 48), MaxEarly: Coalesce(Value(gblV.project.settings.maxDaysBeforeInstall), 7),
            Tolerance: Coalesce(Value(gblV.project.settings.gateToleranceMinutes), 60), MaxPallets: Coalesce(Value(gblV.project.settings.maxPalletsPerRequest), 20),
            SlotMinutes: Coalesce(Value(gblV.project.settings.slotMinutes), 60), GateOpen: Coalesce(Text(gblV.project.settings.gateOpen), "06:00"),
            GateClose: Coalesce(Text(gblV.project.settings.gateClose), "16:00")
        });
        IfError(
            ClearCollect(colWorkDays, ForAll(Table(gblV.project.settings.workDays), { Day: Value(ThisRecord.Value) })),
            ClearCollect(colWorkDays, { Day: 1 }, { Day: 2 }, { Day: 3 }, { Day: 4 }, { Day: 5 }, { Day: 6 })
        );
        Set(gblToday, DateValue(Text(gblV.today)));
        Set(gblNowLocal, DateTimeValue(Text(gblV.nowLocal)));
        Set(gblLoadedAt, Now());
        ClearCollect(colGates, ForAll(Table(gblV.project.gates), { Id: Text(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name), Cap: Value(ThisRecord.Value.capacityPerSlot) }));
        ClearCollect(colZones, ForAll(Table(gblV.project.zones), { Id: Text(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name), Cap: Value(ThisRecord.Value.capacityPallets) }));
        ClearCollect(colActs, ForAll(Table(gblV.project.activities), {
            Id: Text(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name), Trade: Text(ThisRecord.Value.trade),
            Start: DateValue(Text(ThisRecord.Value.start)), Finish: DateValue(Text(ThisRecord.Value.finish))
        }));
        ClearCollect(colBlackouts, ForAll(Table(gblV.project.blackouts), { Day: Text(ThisRecord.Value) }));
        Set(gblMySub, { Id: Text(gblV.mySub.id), Name: Text(gblV.mySub.name), Trade: Text(gblV.mySub.trade), Suspended: Boolean(gblV.mySub.suspended) });
        ClearCollect(colSubs, ForAll(Table(gblV.subs), { Id: Text(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name), Trade: Text(ThisRecord.Value.trade), Suspended: Boolean(ThisRecord.Value.suspended) }));
        ClearCollect(colReq, ForAll(Table(gblV.requests), {
            Id: Value(ThisRecord.Value.id), SubId: Text(ThisRecord.Value.subId), Company: Text(ThisRecord.Value.subName),
            Activity: Text(ThisRecord.Value.activityId), ActivityName: Text(ThisRecord.Value.activityName), Gate: Text(ThisRecord.Value.gateId),
            DateText: Text(ThisRecord.Value.date), Date: DateValue(Text(ThisRecord.Value.date)), Slot: Text(ThisRecord.Value.slot),
            Zone: Text(ThisRecord.Value.zoneId), Material: Text(ThisRecord.Value.material), Qty: Value(ThisRecord.Value.quantity),
            Unit: Text(ThisRecord.Value.unit), Pallets: Value(ThisRecord.Value.pallets), Weight: Value(ThisRecord.Value.weightLbs),
            Carrier: Text(ThisRecord.Value.carrier), Truck: Text(ThisRecord.Value.truck), Contact: Text(ThisRecord.Value.pocName),
            Phone: Text(ThisRecord.Value.pocPhone), Status: Text(ThisRecord.Value.status), Pass: Text(ThisRecord.Value.passCode),
            Reasons: Text(ThisRecord.Value.reasonText), NextOpen: Text(ThisRecord.Value.nextOpen), By: Text(ThisRecord.Value.submittedBy),
            DecidedBy: Text(ThisRecord.Value.decidedBy), Justification: Text(ThisRecord.Value.justification),
            Maint: Boolean(ThisRecord.Value.maintenance), StagedUntil: Text(ThisRecord.Value.stagedUntil), Override: Boolean(ThisRecord.Value.override)
        }));
        ClearCollect(colPasses, ForAll(Table(gblV.passes), {
            Code: Text(ThisRecord.Value.code), ReqId: Value(ThisRecord.Value.requestId), Status: Text(ThisRecord.Value.status),
            UsedAt: Text(ThisRecord.Value.usedAt), Open: DateTimeValue(Text(ThisRecord.Value.windowOpen)), Close: DateTimeValue(Text(ThisRecord.Value.windowClose)),
            Override: Boolean(ThisRecord.Value.override), Qr: Text(ThisRecord.Value.qrSvg), ZoneName: Text(ThisRecord.Value.zoneName), GateName: Text(ThisRecord.Value.gateName)
        }));
        ClearCollect(colActive, ForAll(Filter(colReq, Status = "Approved" || Status = "Needs review"), {
            Id: ThisRecord.Id, Gate: ThisRecord.Gate, DateText: ThisRecord.DateText, Slot: ThisRecord.Slot, Zone: ThisRecord.Zone,
            Pallets: ThisRecord.Pallets, From: ThisRecord.Date, Until: Coalesce(DateValue(ThisRecord.StagedUntil), ThisRecord.Date)
        }));
        Collect(colActive, ForAll(Table(gblV.occupancy), {
            Id: Value(ThisRecord.Value.id), Gate: Text(ThisRecord.Value.gateId), DateText: Text(ThisRecord.Value.date), Slot: Text(ThisRecord.Value.slot),
            Zone: Text(ThisRecord.Value.zoneId), Pallets: Value(ThisRecord.Value.pallets), From: DateValue(Text(ThisRecord.Value.date)),
            Until: DateValue(Text(ThisRecord.Value.stagedUntil))
        }));
        ClearCollect(colLog, ForAll(Table(gblV.gatelog), {
            At: DateTimeValue(Text(ThisRecord.Value.at)), Code: Text(ThisRecord.Value.code), Result: Text(ThisRecord.Value.result),
            Reason: Text(ThisRecord.Value.reason), Action: Text(ThisRecord.Value.action), Guard: Text(ThisRecord.Value.guard)
        }));
        ClearCollect(colMembers, ForAll(Table(gblV.members), {
            Id: Value(ThisRecord.Value.id), Email: Text(ThisRecord.Value.email), Name: Text(ThisRecord.Value.name), Company: Text(ThisRecord.Value.company),
            Phone: Text(ThisRecord.Value.phone), Role: Text(ThisRecord.Value.role), Trade: Text(ThisRecord.Value.trade)
        }));
        ClearCollect(colJoin, ForAll(Table(gblV.joinreqs), {
            Id: Value(ThisRecord.Value.id), Name: Text(ThisRecord.Value.name), Email: Text(ThisRecord.Value.email), Company: Text(ThisRecord.Value.company),
            Phone: Text(ThisRecord.Value.phone), At: DateTimeValue(Text(ThisRecord.Value.at)), IsHome: Boolean(ThisRecord.Value.isHome)
        }));
        ClearCollect(colInvites, ForAll(Table(gblV.invites), { Id: Value(ThisRecord.Value.id), Email: Text(ThisRecord.Value.email), Role: Text(ThisRecord.Value.role), Trade: Text(ThisRecord.Value.trade) }));
        ClearCollect(colMail, ForAll(Table(gblV.mail), {
            At: DateTimeValue(Text(ThisRecord.Value.at)), Subject: Text(ThisRecord.Value.subject), Body: Text(ThisRecord.Value.body), To: Text(ThisRecord.Value.to)
        }));
        If(gblRole = "Access Control" || gblRole = "Admin", SaveData(colPasses, "grantedPasses"); SaveData(colReq, "grantedRequests"));
        ClearCollect(colPrefs, { Key: "pid", Value: gblPid }); SaveData(colPrefs, "grantedPrefs"),
        Notify(Text(gblV.message), NotificationType.Error)
    )
)`;

/** Site-local "now" (the server's local time when the view loaded, plus time since). */
const NOW_LOCAL = 'DateAdd(gblNowLocal, DateDiff(gblLoadedAt, Now(), TimeUnit.Minutes), TimeUnit.Minutes)';

/** Call an app flow and keep its answer in a variable; on no connection, a friendly failure. */
const call = (varName, flow, payload) => `IfError(
    Set(${varName}, ParseJSON(${flow}.Run(gblPid, ${VIEW_AS}, ${payload}).json)),
    Set(${varName}, ${NO_CONN('No connection. Check your signal and try again.')})
)`;
/** Call, then toast the message (green or red) and reload the view on success. */
const act = (varName, flow, payload, after) => `${call(varName, flow, payload)};
Notify(Text(${varName}.message), If(Boolean(${varName}.ok), NotificationType.Success, NotificationType.Error));
If(Boolean(${varName}.ok), ${after ? after + '; ' : ''}${LOAD_VIEW})`;

module.exports = { VIEW_AS, LOAD_SESSION, LOAD_VIEW, NOW_LOCAL, call, act, NO_CONN };
