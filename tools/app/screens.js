// The Granted canvas app, screen by screen (phone, portrait, 640 × 1136).
'use strict';
const F = require('./fx');
const L = require('./logic');
const { C, W, M, FW, s } = F;

const LOGO = 'gblLogoWhite'; // set in App.OnStart (a data URI)
const dq = (t) => t.replace(/"/g, '""');

/** Blue header with a back arrow, a title and the project name. */
function header(prefix, title, opts = {}) {
  return [
    F.rect(prefix + 'Bar', { y: 0, h: 128, fill: C.blue }),
    F.icon(prefix + 'Back', { x: 8, y: 36, w: 56, h: 56, onSelect: opts.back || 'Back()', a11y: 'Back' }, 'ChevronLeft'),
    F.label(prefix + 'Title', { text: title, x: 68, y: 34, w: 540, h: 40, size: 20, bold: true, color: C.white }),
    F.label(prefix + 'Sub', { text: opts.sub || 'gblP.Name & If(gblInMaint, "  ·  maintenance view: " & gblRole, "")', x: 68, y: 74, w: 540, h: 30, size: 12, color: 'ColorValue("#C9D6F2")' }),
  ];
}
/** A section label in small capitals. */
const caption = (name, text, y, x = M, w = FW) => F.label(name, { text, x, y, w, h: 28, size: 11, bold: true, color: C.muted });
/** Field label + control pair helper: returns [label, control]. */
const field = (name, text, y, control) => [F.label(name + 'Lbl', { text: s(text), y, h: 26, size: 12, color: C.muted }), control];

// ======================================================================== start
function scrStart() {
  return F.screen('scrStart', {
    fill: C.blue,
    onVisible: `${L.LOAD_SESSION};
If(gblNeedsProfile, Navigate(scrProfile, ScreenTransition.None),
    ${L.LOAD_VIEW};
    Navigate(scrHome, ScreenTransition.Fade))`,
  }, [
    F.image('imgStartLogo', { image: LOGO, x: 170, y: 380, w: 300, h: 170, a11y: 'Ajax' }),
    F.label('lblStartName', { text: '"GRANTED"', x: 0, y: 570, w: W, h: 40, size: 16, bold: true, color: C.white, align: 'Align.Center' }),
    F.label('lblStartTag', { text: '"No approved delivery, no gate access."', x: 0, y: 612, w: W, h: 30, size: 12, color: 'ColorValue("#C9D6F2")', align: 'Align.Center' }),
    F.button('btnStartRetry', { text: '"Try again"', x: 170, y: 700, w: 300, kind: 'secondary', visible: '!Boolean(gblS.ok)', onSelect: 'Navigate(scrStart, ScreenTransition.None)' }),
  ]);
}

// ======================================================================== first sign-in
function scrProfile() {
  const create = `Set(locBusy, true);
IfError(
    Set(locR, ParseJSON(GrantedF14.Run("", "", JSON({ op: "create", first: txtPfFirst.Text, last: txtPfLast.Text, phone: txtPfPhone.Text, company: txtPfCompany.Text })).json)),
    Set(locR, ${L.NO_CONN('No connection. Check your signal and try again.')})
);
If(Boolean(locR.ok),
    If(!IsBlank(Trim(txtPfCode.Text)),
        IfError(Set(locC, ParseJSON(GrantedF11.Run("", "", JSON({ code: txtPfCode.Text })).json)), Set(locC, ${L.NO_CONN('Profile saved, but the project code could not be sent.')}));
        Notify(Text(locC.message), If(Boolean(locC.ok), NotificationType.Success, NotificationType.Warning));
        If(!IsBlank(Text(locC.projectId)), Set(gblPid, Text(locC.projectId)))
    );
    Navigate(scrStart, ScreenTransition.None),
    Notify(Text(locR.message), NotificationType.Error)
);
Set(locBusy, false)`;
  let y = 150;
  const kids = [
    F.rect('rctPfTop', { y: 0, h: 120, fill: C.blue }),
    F.image('imgPfLogo', { image: LOGO, x: M, y: 30, w: 120, h: 64 }),
    F.label('lblPfTitle', { text: '"Create your Granted profile"', y: 140, h: 44, size: 22, bold: true }),
    F.label('lblPfWho', { text: '"Signed in as " & gblSignInEmail', y: 186, h: 30, size: 13, color: C.muted }),
  ];
  y = 236;
  for (const [n, t, hint] of [['First', 'First name', 'e.g. Dana'], ['Last', 'Last name', 'e.g. Ruiz'], ['Phone', 'Mobile phone (10 digits)', '214-555-0141'], ['Company', 'Company you work for', 'e.g. North Field Electrical']]) {
    kids.push(...field('lblPf' + n, t, y, F.input('txtPf' + n, { y: y + 28, hint })));
    y += 92;
  }
  kids.push(...field('lblPfCode', 'Project code (optional)', y, F.input('txtPfCode', { y: y + 28, hint: 'e.g. DDC2-7HKQ' })));
  y += 100;
  kids.push(
    F.label('lblPfPrivacy', { text: '"By continuing you agree that Granted keeps your name, company, phone and work email to run delivery booking and gate access on your projects."', y, h: 64, size: 11, color: C.muted }),
    F.button('btnPfCreate', { text: 'If(locBusy, "Saving…", "Create profile")', y: y + 80, onSelect: create, displayMode: 'If(locBusy || IsBlank(Trim(txtPfFirst.Text)) || IsBlank(Trim(txtPfLast.Text)) || IsBlank(Trim(txtPfCompany.Text)), DisplayMode.Disabled, DisplayMode.Edit)' }),
  );
  return F.screen('scrProfile', { fill: C.white }, kids);
}

// ======================================================================== home
const TABS = [
  // id, title, roles, subtitle formula, screen
  ['passes', 'Confirm Delivery', ['Contractor', 'Admin'], 'CountRows(Filter(colReq, Status = "Approved" && Date >= gblToday && SubId = gblMySub.Id && !IsBlank(LookUp(colPasses, Code = Pass && Status = "Active")))) & " gate passes ready"', 'scrPasses'],
  ['book', 'Schedule Delivery', ['Contractor', 'Admin'], 'gblCfg.MinNotice & " hours’ notice · checked automatically"', 'scrBook'],
  ['mine', 'My Deliveries', ['Contractor'], 'CountRows(Filter(colReq, Date >= gblToday && (Status = "Approved" || Status = "Needs review"))) & " upcoming"', 'scrMine'],
  ['gate', 'Receive Delivery', ['Access Control', 'Admin'], '"Check a gate pass at the gate"', 'scrGate'],
  ['today', 'Expected Today', ['Access Control', 'Admin'], 'CountRows(Filter(colReq, Date = gblToday && Status = "Approved")) & " deliveries expected " & Text(gblToday, "ddd m/d")', 'scrToday'],
  ['gatelog', 'Gate Log', ['Access Control', 'Admin'], 'CountRows(Filter(colLog, Text(At, "yyyy-mm-dd") = Text(Today(), "yyyy-mm-dd"))) & " entries today"', 'scrGateLog'],
  ['approvals', 'Approvals', ['Admin'], 'CountRows(colJoin) & " join requests · " & CountRows(Filter(colReq, Status = "Needs review")) & " deliveries to review"', 'scrApprovals'],
  ['team', 'Team & Invites', ['Admin'], 'CountRows(colMembers) & " members · " & CountRows(colInvites) & " invites waiting"', 'scrTeam'],
  ['all', 'All Deliveries', ['Admin'], 'CountRows(colReq) & " requests in the last 30 days and ahead"', 'scrAll'],
  ['emergency', 'Emergency Pass', ['Admin'], '"Same-day override, logged"', 'scrEmergency'],
  ['messages', 'Messages', ['Contractor', 'Access Control', 'Admin'], 'CountRows(colMail) & " emails sent"', 'scrMessages'],
  ['psettings', 'Project Settings', ['Admin'], '"Code, gates, zones, rules and look-ahead"', 'scrProject'],
];

function scrHome() {
  const tabsTable = `Filter(Table(${TABS.map(([id, title, roles], i) => `{ Id: ${s(id)}, Title: ${s(title)}, Roles: ${s(roles.join(','))}, Order: ${i} }`).join(', ')}), gblRole in Split(Roles, ","))`;
  const sub = `Switch(ThisItem.Id, ${TABS.map(([id, , , subtitle]) => `${s(id)}, ${subtitle}`).join(', ')}, "")`;
  const go = `Switch(ThisItem.Id, ${TABS.map(([id, , , , scr]) => `${s(id)}, Navigate(${scr}, ScreenTransition.Cover)`).join(', ')})`;
  const maintButton = (n, role, x) => F.button('btnMnt' + n, {
    text: s(role), x, y: 186, w: 176, h: 40, size: 11,
    fill: `If(gblMaint.ViewAs = ${s(role)}, ${C.white}, ${C.hold})`, color: `If(gblMaint.ViewAs = ${s(role)}, ${C.hold}, ${C.white})`,
    onSelect: `Set(gblMaint, { On: true, ViewAs: ${s(role)} }); ${L.LOAD_VIEW}; Notify("Viewing as ${role}.")`,
  });
  return F.screen('scrHome', {}, [
    F.rect('rctHomeTop', { y: 0, h: 150, fill: 'ColorValue("#3E4A55")' }),
    F.label('lblHomeName', { text: 'gblMe.First & " " & gblMe.Last', y: 40, h: 44, size: 24, bold: true, color: C.white, w: 500 }),
    F.label('lblHomeCompany', { text: 'gblMe.Company', y: 86, h: 30, size: 13, color: 'ColorValue("#C9D1D9")', w: 500 }),
    F.icon('icoHomeGear', { x: 572, y: 40, w: 56, h: 56, color: 'ColorValue("#C9D1D9")', onSelect: 'Navigate(scrSettings, ScreenTransition.Cover)', a11y: 'Settings' }, 'Settings'),
    // maintenance bar
    F.rect('rctMaint', { y: 150, h: 92, fill: C.hold, visible: 'gblMaint.On && gblCanMaintain' }),
    F.label('lblMaint', { text: '"MAINTENANCE MODE · VIEWING AS"', y: 152, h: 30, size: 11, bold: true, color: C.white, visible: 'gblMaint.On && gblCanMaintain' }),
    Object.assign(maintButton('Admin', 'Admin', M), {}), maintButton('Contractor', 'Contractor', M + 184), maintButton('Gate', 'Access Control', M + 368),
    // project card
    F.rect('rctProj', { x: M, y: 'If(gblMaint.On && gblCanMaintain, 262, 170)', w: FW, h: 190, fill: C.white }),
    F.label('lblProjCap', { text: '"CURRENT PROJECT"', x: M + 20, y: 'rctProj.Y + 14', w: 300, h: 24, size: 10, bold: true, color: C.muted }),
    F.label('lblProjName', { text: 'If(IsBlank(gblPid), "No project yet", gblP.Name)', x: M + 20, y: 'rctProj.Y + 40', w: FW - 40, h: 40, size: 20, bold: true }),
    F.label('lblProjMeta', { text: 'If(IsBlank(gblPid), "Tap + to join with a project code.", gblRole & " · " & gblP.Location)', x: M + 20, y: 'rctProj.Y + 82', w: FW - 40, h: 28, size: 12, color: C.muted }),
    F.label('lblProjCode', { text: 'gblP.Code', x: M + 20, y: 'rctProj.Y + 120', w: 210, h: 48, size: 18, bold: true, mono: true, fill: C.blueSoft, color: C.blue, align: 'Align.Center', visible: '!IsBlank(gblPid)' }),
    F.button('btnProjCopy', { text: '"Copy code"', x: M + 240, y: 'rctProj.Y + 120', w: 150, h: 48, size: 12, kind: 'secondary', visible: '!IsBlank(gblPid)', onSelect: 'Copy(gblP.Code); Notify("Project code copied.")' }),
    F.button('btnProjSwitch', { text: 'If(locShowProjects, "Close", "Switch")', x: M + 400, y: 'rctProj.Y + 120', w: 172, h: 48, size: 12, kind: 'secondary', visible: 'CountRows(colProjects) > 1', onSelect: 'Set(locShowProjects, !locShowProjects)' }),
    F.button('btnHomeAdd', { text: '"+  Join or create a project"', y: 'rctProj.Y + rctProj.Height + 14', h: 52, size: 13, kind: 'secondary', onSelect: 'Navigate(scrAdd, ScreenTransition.Cover)' }),
    F.label('lblPendingCount', { text: '"Waiting for approval: " & Concat(colPending, Name, ", ")', y: 'btnHomeAdd.Y + 60', h: 'If(CountRows(colPending) > 0, 34, 0)', size: 12, color: C.hold, visible: 'CountRows(colPending) > 0' }),
    // project switcher
    F.gallery('galProjects', {
      items: 'SortByColumns(colProjects, Name)', y: 'lblPendingCount.Y + lblPendingCount.Height + 6', h: 'If(locShowProjects, Min(CountRows(colProjects), 5) * 72, 0)', size: 72,
      visible: 'locShowProjects',
      onSelect: `Set(gblPid, ThisItem.Id); Set(locShowProjects, false); Set(gblMaint, { On: false, ViewAs: "Admin" }); ${L.LOAD_VIEW}; Notify("Switched to " & ThisItem.Name & ".")`,
    }, [
      F.rect('rctProjRow', { x: M, y: 4, w: FW, h: 64, fill: 'If(ThisItem.Id = gblPid, ' + C.blueSoft + ', ' + C.white + ')', onSelect: 'Select(Parent)' }),
      F.label('lblProjRowName', { text: 'ThisItem.Name', x: M + 16, y: 8, w: 400, h: 30, size: 14, bold: true, onSelect: 'Select(Parent)' }),
      F.label('lblProjRowRole', { text: 'ThisItem.Role & " · " & ThisItem.Code', x: M + 16, y: 36, w: 400, h: 26, size: 11, color: C.muted, onSelect: 'Select(Parent)' }),
    ]),
    // tabs
    F.gallery('galTabs', {
      items: tabsTable, y: 'galProjects.Y + galProjects.Height + 8', h: '1136 - Self.Y', size: 96, onSelect: go, visible: '!IsBlank(gblRole)',
    }, [
      F.rect('rctTab', { x: M, y: 6, w: FW, h: 84, fill: C.white, onSelect: 'Select(Parent)' }),
      F.rect('rctTabIcon', { x: M + 16, y: 22, w: 52, h: 52, fill: C.blue, onSelect: 'Select(Parent)' }),
      F.label('lblTabLetter', { text: 'Left(ThisItem.Title, 1)', x: M + 16, y: 22, w: 52, h: 52, size: 18, bold: true, color: C.white, align: 'Align.Center', onSelect: 'Select(Parent)' }),
      F.label('lblTabTitle', { text: 'ThisItem.Title', x: M + 84, y: 16, w: 440, h: 32, size: 15, bold: true, onSelect: 'Select(Parent)' }),
      F.label('lblTabSub', { text: sub, x: M + 84, y: 48, w: 440, h: 30, size: 11, color: C.muted, onSelect: 'Select(Parent)' }),
      F.label('lblTabBadge', { text: 'If(ThisItem.Id = "approvals", Text(CountRows(colJoin) + CountRows(Filter(colReq, Status = "Needs review"))), "")', x: FW - 40, y: 32, w: 44, h: 32, size: 12, bold: true, color: C.white, fill: C.hold, align: 'Align.Center', visible: 'ThisItem.Id = "approvals" && CountRows(colJoin) + CountRows(Filter(colReq, Status = "Needs review")) > 0' }),
      F.icon('icoTabGo', { x: FW - 8, y: 30, w: 36, h: 36, color: C.muted, onSelect: 'Select(Parent)' }, 'ChevronRight'),
    ]),
    F.timer('tmrHomeRefresh', { duration: 60000, repeat: true, onEnd: `If(Connection.Connected && !IsBlank(gblPid), ${L.LOAD_VIEW})` }),
  ]);
}

// ======================================================================== join or create a project
function scrAdd() {
  const join = `Set(locBusy, true);
IfError(Set(locJ, ParseJSON(GrantedF11.Run("", "", JSON({ code: txtAddCode.Text })).json)), Set(locJ, ${L.NO_CONN('No connection. Check your signal and try again.')}));
Notify(Text(locJ.message), If(Boolean(locJ.ok), NotificationType.Success, NotificationType.Error));
If(Boolean(locJ.ok),
    Reset(txtAddCode);
    If(!IsBlank(Text(locJ.projectId)), Set(gblPid, Text(locJ.projectId)));
    ${L.LOAD_SESSION};
    ${L.LOAD_VIEW};
    Navigate(scrHome, ScreenTransition.UnCover));
Set(locBusy, false)`;
  const create = `Set(locBusy, true);
IfError(Set(locN, ParseJSON(GrantedF13.Run("", "", JSON({ op: "create", name: txtNewName.Text, location: txtNewLocation.Text, timeZone: drpNewZone.Selected.Value })).json)), Set(locN, ${L.NO_CONN('No connection. Check your signal and try again.')}));
Notify(Text(locN.message), If(Boolean(locN.ok), NotificationType.Success, NotificationType.Error));
If(Boolean(locN.ok),
    Set(gblPid, Text(locN.projectId)); Reset(txtNewName); Reset(txtNewLocation);
    ${L.LOAD_SESSION};
    ${L.LOAD_VIEW};
    Navigate(scrHome, ScreenTransition.UnCover));
Set(locBusy, false)`;
  return F.screen('scrAdd', { fill: C.white }, [
    ...header('hdrAdd', '"Join or create a project"', { sub: '"Projects use a code to join. Admins approve each person."' }),
    caption('capJoin', '"JOIN WITH A PROJECT CODE"', 150),
    F.input('txtAddCode', { y: 182, hint: 'e.g. DDC2-7HKQ' }),
    F.button('btnAddJoin', { text: 'If(locBusy, "Sending…", "Join project")', y: 246, onSelect: join, displayMode: 'If(locBusy || IsBlank(Trim(txtAddCode.Text)), DisplayMode.Disabled, DisplayMode.Edit)' }),
    F.label('lblAddHint', { text: '"Ask your project admin for the code. An admin will approve you and choose your access. Company staff can also type the admin set-up code here."', y: 312, h: 70, size: 11, color: C.muted }),
    F.rect('rctAddLine', { x: M, y: 400, w: FW, h: 1, visible: 'gblMe.IsAdminAccount' }),
    caption('capCreate', '"CREATE A PROJECT (ADMIN ACCOUNTS)"', 420),
    F.label('lblCreateNo', { text: '"Only admin accounts can create projects. To become one, type the admin set-up code above."', y: 452, h: 60, size: 12, color: C.muted, visible: '!gblMe.IsAdminAccount' }),
    F.input('txtNewName', { y: 452, hint: 'Project name, e.g. DFW-2 Data Center', visible: 'gblMe.IsAdminAccount' }),
    F.input('txtNewLocation', { y: 514, hint: 'Location, e.g. Red Oak, TX', visible: 'gblMe.IsAdminAccount' }),
    F.dropdown('drpNewZone', { y: 576, items: '["Central Standard Time", "Eastern Standard Time", "Mountain Standard Time", "US Mountain Standard Time", "Pacific Standard Time", "Alaskan Standard Time", "Hawaiian Standard Time"]', visible: 'gblMe.IsAdminAccount', a11y: 'Time zone' }),
    F.button('btnAddCreate', { text: 'If(locBusy, "Creating…", "Create project")', y: 640, onSelect: create, visible: 'gblMe.IsAdminAccount', displayMode: 'If(locBusy || IsBlank(Trim(txtNewName.Text)), DisplayMode.Disabled, DisplayMode.Edit)' }),
  ]);
}

// ======================================================================== settings
function scrSettings() {
  const save = L.act('locP', 'GrantedF14', 'JSON({ op: "save", first: txtSetFirst.Text, last: txtSetLast.Text, phone: txtSetPhone.Text, company: txtSetCompany.Text })', L.LOAD_SESSION);
  const leave = `${L.act('locL', 'GrantedF12', 'JSON({ op: "leave" })', `Set(gblPid, Blank()); ${L.LOAD_SESSION}`)}; Set(locConfirmLeave, false)`;
  const del = `If(!locConfirmDelete, Set(locConfirmDelete, true); Notify("Tap again to delete your Granted profile.", NotificationType.Warning),
    IfError(Set(locD, ParseJSON(GrantedF14.Run("", "", JSON({ op: "delete" })).json)), Set(locD, ${L.NO_CONN('No connection. Check your signal and try again.')}));
    Notify(Text(locD.message), If(Boolean(locD.ok), NotificationType.Success, NotificationType.Error));
    If(Boolean(locD.ok), Exit(true)))`;
  return F.screen('scrSettings', { fill: C.white, onVisible: 'Set(locConfirmDelete, false); Set(locConfirmLeave, false)' }, [
    ...header('hdrSet', '"Settings"', { sub: 'gblMe.Email' }),
    caption('capProfile', '"PROFILE"', 146),
    F.input('txtSetFirst', { y: 176, w: (FW - 12) / 2, default: 'gblMe.First', hint: 'First name' }),
    F.input('txtSetLast', { x: M + (FW + 12) / 2, y: 176, w: (FW - 12) / 2, default: 'gblMe.Last', hint: 'Last name' }),
    F.input('txtSetPhone', { y: 236, default: 'gblMe.Phone', hint: 'Mobile phone' }),
    F.input('txtSetCompany', { y: 296, default: 'gblMe.Company', hint: 'Company' }),
    F.button('btnSetSave', { text: '"Save profile"', y: 358, h: 48, kind: 'secondary', onSelect: save }),
    caption('capMaint', '"MAINTENANCE MODE"', 426),
    F.label('lblMaintHelp', { text: 'If(gblCanMaintain, "See this project as a Contractor, Access Control or Admin. Anything you do is labelled as maintenance.", "For admin accounts that are an Admin on this project.")', y: 452, w: FW - 140, h: 64, size: 11, color: C.muted }),
    F.toggle('tglMaint', { x: W - M - 120, y: 456, default: 'gblMaint.On', visible: 'gblCanMaintain', onCheck: `Set(gblMaint, { On: true, ViewAs: "Admin" }); ${L.LOAD_VIEW}`, onUncheck: `Set(gblMaint, { On: false, ViewAs: "Admin" }); ${L.LOAD_VIEW}` }),
    caption('capProjects', '"THIS PROJECT"', 530),
    F.button('btnSetLeave', { text: 'If(locConfirmLeave, "Tap again to leave " & gblP.Name, "Leave " & gblP.Name)', y: 560, h: 48, kind: 'secondary', visible: '!IsBlank(gblPid)', onSelect: `If(!locConfirmLeave, Set(locConfirmLeave, true), ${leave})` }),
    caption('capAccount', '"ACCOUNT"', 628),
    F.button('btnSetPassword', { text: '"Change password or sign-in methods"', y: 658, h: 48, kind: 'secondary', onSelect: 'Launch("https://mysignins.microsoft.com/security-info")' }),
    F.button('btnSetSupport', { text: '"Email support"', y: 716, h: 48, kind: 'secondary', visible: '!IsBlank(gblSupport)', onSelect: 'Launch("mailto:" & gblSupport)' }),
    F.button('btnSetSignOut', { text: '"Sign out"', y: 774, h: 48, kind: 'secondary', onSelect: 'Exit(true)' }),
    F.button('btnSetDelete', { text: 'If(locConfirmDelete, "Tap again: delete my Granted profile", "Delete my Granted profile")', y: 840, h: 48, kind: 'danger', onSelect: del }),
    F.label('lblSetDeleteHelp', { text: '"Removes your profile, access and messages. Delivery records stay for site safety, with your name removed."', y: 896, h: 50, size: 11, color: C.muted }),
  ]);
}

// ======================================================================== confirm delivery (my gate passes)
function scrPasses() {
  const items = `SortByColumns(AddColumns(Filter(colReq, Status = "Approved" && Date >= gblToday && SubId = gblMySub.Id && !IsBlank(LookUp(colPasses, Code = Pass && Status = "Active"))), PassRec, LookUp(colPasses, Code = Pass)), DateText, SortOrder.Ascending, Slot, SortOrder.Ascending)`;
  return F.screen('scrPasses', {}, [
    ...header('hdrPasses', '"Confirm Delivery"'),
    F.label('lblPassesEmpty', { text: '"No gate passes yet. Schedule a delivery; approved ones appear here and in your email."', y: 160, h: 70, size: 13, color: C.muted, visible: 'CountRows(galPasses.AllItems) = 0' }),
    F.button('btnPassesBook', { text: '"Schedule a delivery"', y: 240, visible: 'CountRows(galPasses.AllItems) = 0', onSelect: 'Navigate(scrBook, ScreenTransition.Cover)' }),
    F.gallery('galPasses', { items, y: 140, h: 996, size: 640 }, [
      F.rect('rctPassCard', { x: M, y: 16, w: FW, h: 600, fill: C.white }),
      F.rect('rctPassTop', { x: M, y: 16, w: FW, h: 110, fill: C.blue }),
      F.label('lblPassMat', { text: 'ThisItem.Material', x: M + 20, y: 28, w: FW - 40, h: 40, size: 18, bold: true, color: C.white }),
      F.label('lblPassWhen', { text: 'Text(ThisItem.Date, "ddd m/d") & " · " & Text(Time(Value(Left(ThisItem.Slot, 2)), Value(Right(ThisItem.Slot, 2)), 0), "h:mm AM/PM") & " · " & ThisItem.PassRec.GateName', x: M + 20, y: 72, w: FW - 40, h: 34, size: 13, color: 'ColorValue("#C9D6F2")' }),
      F.image('imgPassQr', { image: 'If(IsBlank(ThisItem.PassRec.Qr), "", "data:image/svg+xml;utf8," & EncodeUrl(ThisItem.PassRec.Qr))', x: 170, y: 140, w: 300, h: 300, a11y: 'Gate pass QR code' }),
      F.label('lblPassCode', { text: 'ThisItem.Pass', x: M, y: 446, w: FW, h: 52, size: 26, bold: true, mono: true, align: 'Align.Center' }),
      F.label('lblPassWindow', { text: '"Arrive between " & Text(ThisItem.PassRec.Open, "h:mm AM/PM") & " and " & Text(ThisItem.PassRec.Close, "h:mm AM/PM")', x: M, y: 500, w: FW, h: 32, size: 13, align: 'Align.Center', color: C.go }),
      F.label('lblPassMore', { text: '"Staging: " & ThisItem.PassRec.ZoneName & " · " & ThisItem.Qty & " " & ThisItem.Unit & ", " & ThisItem.Pallets & " pallets · Contact " & ThisItem.Contact', x: M + 20, y: 536, w: FW - 40, h: 60, size: 11, color: C.muted, align: 'Align.Center' }),
    ]),
  ]);
}

// ======================================================================== schedule delivery
function scrBook() {
  const dText = 'Text(dpBookDate.SelectedDate, "yyyy-mm-dd")';
  const gateId = 'LookUp(colGates, Name = drpBookGate.Selected.Value).Id';
  const zoneId = 'LookUp(colZones, Name = drpBookZone.Selected.Value).Id';
  const act = 'LookUp(colActs, Id = First(Split(drpBookActivity.Selected.Value, " · ")).Value)';
  const minutes = (t) => `(Value(Left(${t}, 2)) * 60 + Value(Right(${t}, 2)))`;
  const recompute = `ClearCollect(colSlots,
    ForAll(Sequence(RoundDown((${minutes('gblCfg.GateClose')} - ${minutes('gblCfg.GateOpen')}) / gblCfg.SlotMinutes, 0), 0) As k,
        With({ m: ${minutes('gblCfg.GateOpen')} + k.Value * gblCfg.SlotMinutes },
            With({ slot: Text(RoundDown(m / 60, 0), "00") & ":" & Text(Mod(m, 60), "00") },
                With({ used: CountIf(colActive, Gate = ${gateId} && DateText = ${dText} && Slot = slot && Id <> Coalesce(locEditId, -1)),
                       cap: Coalesce(LookUp(colGates, Id = ${gateId}).Cap, 0),
                       soon: DateAdd(DateTimeValue(${dText} & " " & slot), 0, TimeUnit.Minutes) < DateAdd(${L.NOW_LOCAL}, gblCfg.MinNotice, TimeUnit.Hours),
                       closed: !((Weekday(dpBookDate.SelectedDate) - 1) in colWorkDays.Day) || ${dText} in colBlackouts.Day },
                    { Slot: slot, Label: Text(Time(RoundDown(m / 60, 0), Mod(m, 60), 0), "h:mm AM/PM"), Left: Max(0, cap - used), TooSoon: soon, Closed: closed,
                      Open: !soon && !closed && cap - used > 0 })))));
With({ until: Max(dpBookDate.SelectedDate, Coalesce(${act}.Start, dpBookDate.SelectedDate)) },
    ClearCollect(colZoneRoom, ForAll(colZones As z,
        { Id: z.Id, Name: z.Name, Cap: z.Cap,
          Left: Max(0, z.Cap - Max(ForAll(Sequence(DateDiff(dpBookDate.SelectedDate, until, TimeUnit.Days) + 1, 0) As d,
              Sum(Filter(colActive, Zone = z.Id && Id <> Coalesce(locEditId, -1) && From <= DateAdd(dpBookDate.SelectedDate, d.Value, TimeUnit.Days) && DateAdd(dpBookDate.SelectedDate, d.Value, TimeUnit.Days) <= Until), Pallets)), Value)) })));
If(IsBlank(LookUp(colSlots, Slot = locSlot && Open)), Set(locSlot, Blank()))`;
  const submit = `Set(locBusy, true);
${L.call('locRes', 'GrantedF01', `JSON({ id: Coalesce(locEditId, 0), activityId: ${act}.Id, gateId: ${gateId}, date: ${dText}, slot: Coalesce(locSlot, ""),
    zoneId: ${zoneId}, material: txtBookMaterial.Text, quantity: Value(txtBookQty.Text), unit: drpBookUnit.Selected.Value, pallets: Value(txtBookPallets.Text),
    weightLbs: Value(txtBookWeight.Text), carrier: txtBookCarrier.Text, truck: txtBookTruck.Text, pocName: txtBookContact.Text, pocPhone: txtBookPhone.Text,
    justification: txtBookJustify.Text })`)};
If(Boolean(locRes.ok),
    Set(locShowResult, true); Set(locEditId, Blank()); Set(locSlot, Blank());
    ${L.LOAD_VIEW};
    If(Text(locRes.status) = "Approved", Set(locWaitPass, 12)),
    Notify(Text(locRes.message), NotificationType.Error));
Set(locBusy, false)`;
  const resultText = `Switch(Text(locRes.status),
    "Approved", "Approved. Your gate pass is on its way to Confirm Delivery and your email.",
    "Needs review", "Sent for review. It passed the rules; a project admin will approve or reject it.",
    "Not approved. " & Concat(Table(locRes.reasons), Text(ThisRecord.Value.title) & ". " & Text(ThisRecord.Value.remedy), Char(10)))`;
  let y = 140;
  const kids = [...header('hdrBook', 'If(IsBlank(locEditId), "Schedule Delivery", "Reschedule or edit")')];
  const add = (...c) => kids.push(...c);
  // the result card, shown after submitting
  add(
    F.rect('rctBookResult', { x: M, y: 140, w: FW, h: 260, fill: `Switch(Text(locRes.status), "Approved", ${C.goSoft}, "Needs review", ${C.holdSoft}, ${C.stopSoft})`, visible: 'locShowResult' }),
    F.label('lblBookResult', { text: resultText, x: M + 16, y: 150, w: FW - 32, h: 170, size: 13, visible: 'locShowResult', valign: 'VerticalAlign.Top' }),
    F.button('btnBookNext', { text: 'If(IsBlank(Text(locRes.nextOpen.label)), "Book another delivery", "Use next open slot: " & Text(locRes.nextOpen.label))', x: M + 16, y: 330, w: FW - 32, h: 52, size: 12, visible: 'locShowResult',
      onSelect: `Set(locShowResult, false); If(!IsBlank(Text(locRes.nextOpen.date)), Set(locDate, DateValue(Text(locRes.nextOpen.date))); Set(locSlot, Text(locRes.nextOpen.slot)));` }),
    F.timer('tmrBookWait', { duration: 10000, repeat: true, autoStart: 'locWaitPass > 0', start: 'locWaitPass > 0', onEnd: `Set(locWaitPass, locWaitPass - 1); ${L.LOAD_VIEW}` }),
  );
  y = 140;
  const vis = '!locShowResult';
  const row = (n, text, ctrl, h = 52) => { add(F.label('lbl' + n, { text: s(text), y, h: 24, size: 11, color: C.muted, visible: vis }), Object.assign(ctrl, {})); ctrl.props.Y = y + 26; ctrl.props.Visible = ctrl.props.Visible ? `(${ctrl.props.Visible}) && ${vis}` : vis; y += 26 + h + 12; };
  row('BookActivity', 'Look-ahead activity', F.dropdown('drpBookActivity', {
    items: `ForAll(SortByColumns(Filter(colActs, IsBlank(gblMySub.Trade) || IsBlank(Trade) || Trade = gblMySub.Trade || Trade = "General"), Start), Id & " · " & Name & " · starts " & Text(Start, "ddd m/d"))`,
    onChange: recompute, a11y: 'Look-ahead activity',
  }));
  row('BookMaterial', 'Material', F.input('txtBookMaterial', { hint: 'e.g. Busway sections', max: 120 }));
  add(F.label('lblBookQty', { text: '"Quantity · unit · pallets · weight (lb)"', y, h: 24, size: 11, color: C.muted, visible: vis }));
  const q = y + 26; const qw = (FW - 36) / 4;
  add(
    F.input('txtBookQty', { x: M, y: q, w: qw, number: true, hint: 'Qty', visible: vis }),
    F.dropdown('drpBookUnit', { x: M + qw + 12, y: q, w: qw, items: '["pcs", "sections", "reels", "units", "LF", "crates", "skids", "boxes", "load"]', visible: vis, a11y: 'Unit' }),
    F.input('txtBookPallets', { x: M + 2 * (qw + 12), y: q, w: qw, number: true, hint: 'Pallets', visible: vis, onChange: recompute }),
    F.input('txtBookWeight', { x: M + 3 * (qw + 12), y: q, w: qw, number: true, hint: 'lb', visible: vis }),
  );
  y = q + 64;
  row('BookGate', 'Gate', F.dropdown('drpBookGate', { items: 'ForAll(colGates, Name)', onChange: recompute, a11y: 'Gate' }));
  row('BookDate', 'Delivery date', F.datepicker('dpBookDate', { default: 'Coalesce(locDate, DateAdd(gblToday, RoundUp(gblCfg.MinNotice / 24, 0) + 1, TimeUnit.Days))', onChange: recompute, a11y: 'Delivery date' }));
  add(F.label('lblBookSlots', { text: '"Time slot (tap one)"', y, h: 24, size: 11, color: C.muted, visible: vis }));
  add(F.gallery('galBookSlots', { items: 'colSlots', y: y + 26, h: 'RoundUp(CountRows(colSlots) / 3, 0) * 76', size: 76, wrap: 3, visible: vis }, [
    F.button('btnSlot', {
      text: 'ThisItem.Label & Char(10) & If(ThisItem.Closed, "Gate closed", ThisItem.TooSoon, "Under " & gblCfg.MinNotice & " h", ThisItem.Left = 0, "Full", ThisItem.Left & " open")',
      x: 6, y: 6, w: 182, h: 64, size: 11, fill: `If(locSlot = ThisItem.Slot, ${C.blue}, ThisItem.Open, ${C.white}, ${C.field})`, color: `If(locSlot = ThisItem.Slot, ${C.white}, ThisItem.Open, ${C.blue}, ${C.muted})`,
      displayMode: 'If(ThisItem.Open, DisplayMode.Edit, DisplayMode.Disabled)', onSelect: 'Set(locSlot, ThisItem.Slot)',
    }),
  ]));
  y += 26;
  const after = (n) => `galBookSlots.Y + galBookSlots.Height + ${n}`;
  kids.push(
    F.label('lblBookZone', { text: '"Staging zone"', y: after(8), h: 24, size: 11, color: C.muted, visible: vis }),
    F.dropdown('drpBookZone', { y: after(34), items: 'ForAll(colZoneRoom, Name & " · " & Left & " of " & Cap & " pallets free")', visible: vis, a11y: 'Staging zone' }),
    F.input('txtBookJustify', { y: after(98), hint: 'Why does this need to arrive early? (sent to the admin)', multiline: true, h: 80, visible: `${vis} && DateDiff(dpBookDate.SelectedDate, ${act}.Start, TimeUnit.Days) > gblCfg.MaxEarly` }),
    F.input('txtBookCarrier', { y: after(190), w: (FW - 12) / 2, hint: 'Carrier', visible: vis }),
    F.input('txtBookTruck', { x: M + (FW + 12) / 2, y: after(190), w: (FW - 12) / 2, hint: 'Truck no.', visible: vis }),
    F.input('txtBookContact', { y: after(254), w: (FW - 12) / 2, hint: 'Onsite contact', default: 'gblMe.First & " " & gblMe.Last', visible: vis }),
    F.input('txtBookPhone', { x: M + (FW + 12) / 2, y: after(254), w: (FW - 12) / 2, hint: 'Contact phone', default: 'gblMe.Phone', visible: vis }),
    F.label('lblBookChecks', {
      text: `With({ issues: Filter(Table(
            { T: "Pick a time slot", Bad: IsBlank(locSlot) },
            { T: "Describe the material", Bad: IsBlank(Trim(txtBookMaterial.Text)) },
            { T: "Contact phone needs 10 digits", Bad: Len(Concat(Filter(Split(txtBookPhone.Text, ""), IsMatch(Value, "\\d")), Value)) <> 10 },
            { T: "Delivery after the activity finishes", Bad: dpBookDate.SelectedDate > ${act}.Finish },
            { T: "Zone has no room for that many pallets", Bad: Value(txtBookPallets.Text) > Coalesce(LookUp(colZoneRoom, Id = ${zoneId}).Left, 0) },
            { T: "Large delivery: an admin will review it", Bad: Value(txtBookPallets.Text) > gblCfg.MaxPallets }
        ), Bad) },
        If(CountRows(issues) = 0, "All checks pass. It will be approved automatically if the slot is still free.", Concat(issues, "• " & T, Char(10))))`,
      y: after(318), h: 120, size: 12, color: C.muted, visible: vis, valign: 'VerticalAlign.Top',
    }),
    F.button('btnBookSubmit', { text: 'If(locBusy, "Checking…", IsBlank(locEditId), "Submit request", "Save and re-check")', y: after(444), onSelect: submit, visible: vis,
      displayMode: `If(locBusy || IsBlank(locSlot) || IsBlank(${act}), DisplayMode.Disabled, DisplayMode.Edit)` }),
    F.button('btnBookCancelEdit', { text: '"Stop editing"', y: after(510), kind: 'secondary', h: 48, visible: `${vis} && !IsBlank(locEditId)`, onSelect: 'Set(locEditId, Blank()); Back()' }),
  );
  return F.screen('scrBook', { onVisible: `Set(locShowResult, false); ${recompute}` }, kids);
}

// ======================================================================== my deliveries
function scrMine() {
  const cancel = `If(locCancelId <> ThisItem.Id, Set(locCancelId, ThisItem.Id); Notify("Tap again to cancel this delivery.", NotificationType.Warning),
    ${L.act('locX', 'GrantedF06', 'JSON({ requestId: ThisItem.Id })')}; Set(locCancelId, Blank()))`;
  const statusColor = `Switch(ThisItem.Status, "Approved", ${C.go}, "Needs review", ${C.hold}, "Rejected", ${C.stop}, ${C.muted})`;
  return F.screen('scrMine', { onVisible: 'Set(locCancelId, Blank())' }, [
    ...header('hdrMine', '"My Deliveries"'),
    F.button('btnMineFilter', { text: 'If(locPast, "Showing past, cancelled and rejected", "Showing upcoming")', y: 140, h: 44, size: 12, kind: 'secondary', onSelect: 'Set(locPast, !locPast)' }),
    F.gallery('galMine', {
      items: `SortByColumns(Filter(colReq, If(locPast, Date < gblToday || Status = "Cancelled" || Status = "Rejected", Date >= gblToday && (Status = "Approved" || Status = "Needs review"))), DateText, If(locPast, SortOrder.Descending, SortOrder.Ascending), Slot, SortOrder.Ascending)`,
      y: 196, h: 940, size: 250, flexible: false,
    }, [
      F.rect('rctMine', { x: M, y: 8, w: FW, h: 234, fill: C.white }),
      F.label('lblMineTitle', { text: 'ThisItem.Material', x: M + 16, y: 16, w: 400, h: 32, size: 15, bold: true }),
      F.label('lblMineStatus', { text: 'ThisItem.Status', x: W - M - 150, y: 18, w: 134, h: 28, size: 11, bold: true, color: C.white, fill: statusColor, align: 'Align.Center' }),
      F.label('lblMineWhen', { text: 'Text(ThisItem.Date, "ddd m/d") & " · " & ThisItem.Slot & " · gate " & ThisItem.Gate & " · " & ThisItem.Pallets & " pallets" & If(IsBlank(ThisItem.Pass), "", " · pass " & ThisItem.Pass)', x: M + 16, y: 50, w: FW - 32, h: 28, size: 12, color: C.muted }),
      F.label('lblMineReasons', { text: 'If(IsBlank(ThisItem.Reasons), "Booked by " & ThisItem.By & If(IsBlank(ThisItem.DecidedBy), "", " · decided by " & ThisItem.DecidedBy), ThisItem.Reasons)', x: M + 16, y: 80, w: FW - 32, h: 90, size: 11, valign: 'VerticalAlign.Top' }),
      F.button('btnMineEdit', { text: '"Reschedule or edit"', x: M + 16, y: 178, w: 280, h: 48, size: 12, kind: 'secondary',
        visible: 'ThisItem.Status in ["Approved", "Needs review", "Rejected"]',
        onSelect: 'Set(locEditId, ThisItem.Id); Set(locDate, ThisItem.Date); Set(locSlot, ThisItem.Slot); Navigate(scrBook, ScreenTransition.Cover)' }),
      F.button('btnMineCancel', { text: 'If(locCancelId = ThisItem.Id, "Tap again to cancel", "Cancel delivery")', x: M + 308, y: 178, w: FW - 324, h: 48, size: 12, kind: 'danger',
        visible: 'ThisItem.Status in ["Approved", "Needs review"]', onSelect: cancel }),
    ]),
  ]);
}

// ======================================================================== messages
function scrMessages() {
  return F.screen('scrMessages', {}, [
    ...header('hdrMsg', '"Messages"'),
    F.label('lblMsgEmpty', { text: '"No messages yet."', y: 160, h: 40, color: C.muted, visible: 'CountRows(colMail) = 0' }),
    F.gallery('galMsg', { items: 'SortByColumns(colMail, At, SortOrder.Descending)', y: 140, h: 996, size: 200 }, [
      F.rect('rctMsg', { x: M, y: 8, w: FW, h: 184, fill: C.white }),
      F.label('lblMsgAt', { text: 'Text(ThisItem.At, "ddd m/d h:mm AM/PM") & If(gblRole = "Admin", " · to " & ThisItem.To, "")', x: M + 16, y: 14, w: FW - 32, h: 24, size: 10, color: C.muted }),
      F.label('lblMsgSubject', { text: 'ThisItem.Subject', x: M + 16, y: 38, w: FW - 32, h: 32, size: 13, bold: true }),
      F.html('htmMsgBody', { html: 'ThisItem.Body', x: M + 8, y: 72, w: FW - 16, h: 116 }),
    ]),
  ]);
}

// ======================================================================== receive delivery (gate)
function scrGate() {
  const words = `Table(
    { Code: "G00", Title: "Approved delivery", Remedy: "Admit the truck and direct it to {zone}." },
    { Code: "G01", Title: "No approved delivery for this code", Remedy: "The contractor must submit a delivery request with {notice} hours’ notice, or the project admin can issue an emergency pass." },
    { Code: "G02", Title: "This delivery was cancelled", Remedy: "The contractor must submit a new delivery request." },
    { Code: "G03", Title: "Pass already used at {used}", Remedy: "Each pass admits one truck. A second truck needs its own approved request." },
    { Code: "G04", Title: "Approved for {date}, not today", Remedy: "Return on {date} between {open} and {close}, or reschedule in the app." },
    { Code: "G05", Title: "Too early: window opens at {open}", Remedy: "Wait off-site until {open}, or the project admin can approve early entry." },
    { Code: "G06", Title: "Too late: window closed at {close}", Remedy: "Reschedule in the app, or the project admin can issue an emergency pass." },
    { Code: "G07", Title: "Contractor’s booking privileges are suspended", Remedy: "Contact the project admin." })`;
  const fill = (t) => `Substitute(Substitute(Substitute(Substitute(Substitute(Substitute(${t}, "{zone}", locPass.ZoneName), "{notice}", Text(gblCfg.MinNotice)), "{used}", If(IsBlank(locPass.UsedAt), "", Text(DateTimeValue(locPass.UsedAt), "h:mm AM/PM"))), "{date}", Text(locReq.Date, "ddd m/d")), "{open}", Text(locPass.Open, "h:mm AM/PM")), "{close}", Text(locPass.Close, "h:mm AM/PM"))`;
  const check = `Set(locCode, With({ c: Upper(Substitute(Substitute(locRaw, " ", ""), "-", "")), pre: Upper(First(Split(gblP.Code, "-")).Value) },
    If(Len(c) = 6, pre & "-" & c, StartsWith(c, pre), pre & "-" & Mid(c, Len(pre) + 1), c)));
If(IsEmpty(colPasses), LoadData(colPasses, "grantedPasses", true); LoadData(colReq, "grantedRequests", true));
Set(locPass, LookUp(colPasses, Code = locCode));
Set(locReq, LookUp(colReq, Id = locPass.ReqId));
Set(locVerdict, If(
    IsBlank(locPass) || IsBlank(locReq), "G01",
    locPass.Status = "Void" || locReq.Status = "Cancelled", "G02",
    locPass.Status = "Used", "G03",
    !IsBlank(LookUp(colSubs, Id = locReq.SubId && Suspended)) && !locPass.Override, "G07",
    locReq.Date <> Today(), "G04",
    Now() < locPass.Open, "G05",
    Now() > locPass.Close, "G06",
    "G00"));
Set(locWord, LookUp(${words}, Code = locVerdict));
Set(locTitle, ${fill('locWord.Title')});
Set(locRemedy, ${fill('locWord.Remedy')})`;
  const gateId = 'LookUp(colGates, Name = drpGateGate.Selected.Value).Id';
  const admit = `Set(locBusy, true);
IfError(Set(locG, ParseJSON(GrantedF05.Run(gblPid, ${L.VIEW_AS}, JSON({ passCode: locCode, action: "admit", gateId: ${gateId}, source: locSource, deviceTime: Text(Now(), DateTimeFormat.UTC) })).json)),
    Collect(colQueue, { passCode: locCode, action: "admit", gateId: ${gateId}, source: "Offline sync", deviceTime: Text(Now(), DateTimeFormat.UTC) }); SaveData(colQueue, "grantedQueue");
    Set(locG, ${L.NO_CONN('No signal: admitted on this device. It will be sent when the signal is back.')}));
Notify(Text(locG.message), If(Boolean(locG.ok), NotificationType.Success, NotificationType.Error));
If(Boolean(locG.ok), Set(locVerdict, Blank()); Set(locRaw, ""); Reset(txtGateCode); ${L.LOAD_VIEW});
Set(locBusy, false)`;
  const deny = `Set(locBusy, true);
IfError(Set(locG, ParseJSON(GrantedF05.Run(gblPid, ${L.VIEW_AS}, JSON({ passCode: locCode, action: "deny", gateId: ${gateId}, source: locSource, reasonCode: locVerdict, reasonTitle: locTitle, remedy: locRemedy, deviceTime: Text(Now(), DateTimeFormat.UTC) })).json)),
    Set(locG, ${L.NO_CONN('No signal. Turn the truck away and log it when the signal is back.')}));
Notify(Text(locG.message), If(Boolean(locG.ok), NotificationType.Success, NotificationType.Error));
If(Boolean(locG.ok), Set(locVerdict, Blank()); Set(locRaw, ""); Reset(txtGateCode); ${L.LOAD_VIEW});
Set(locBusy, false)`;
  const green = 'locVerdict = "G00"';
  return F.screen('scrGate', { onVisible: 'Set(locVerdict, Blank()); LoadData(colQueue, "grantedQueue", true)' }, [
    ...header('hdrGate', '"Receive Delivery"'),
    F.label('lblGateClock', { text: '"Gate time " & Text(Now(), "ddd m/d h:mm AM/PM")', y: 140, h: 30, size: 12, color: C.muted }),
    F.dropdown('drpGateGate', { y: 174, items: 'ForAll(colGates, Name)', a11y: 'Gate' }),
    F.input('txtGateCode', { y: 240, w: FW - 140, hint: 'Type the pass code, e.g. 7KQX9M' }),
    F.button('btnGateCheck', { text: '"Check"', x: W - M - 128, y: 240, w: 128, h: 52, onSelect: `Set(locRaw, txtGateCode.Text); Set(locSource, "Typed"); ${check}` }),
    F.button('btnGateSync', { text: '"Send " & CountRows(colQueue) & " offline admits"', y: 300, h: 44, size: 12, kind: 'secondary', visible: 'CountRows(colQueue) > 0 && Connection.Connected',
      onSelect: `ForAll(colQueue, IfError(GrantedF05.Run(gblPid, "", JSON(ThisRecord)), false)); Clear(colQueue); SaveData(colQueue, "grantedQueue"); Notify("Offline admits sent."); ${L.LOAD_VIEW}` }),
    // verdict
    F.rect('rctVerdict', { x: M, y: 356, w: FW, h: 420, fill: `If(${green}, ${C.go}, ${C.stop})`, visible: '!IsBlank(locVerdict)' }),
    F.label('lblVerdictBig', { text: `If(${green}, "ADMIT", "TURN AWAY")`, x: M, y: 370, w: FW, h: 80, size: 40, bold: true, color: C.white, align: 'Align.Center', visible: '!IsBlank(locVerdict)' }),
    F.label('lblVerdictTitle', { text: 'locTitle', x: M + 20, y: 452, w: FW - 40, h: 60, size: 16, bold: true, color: C.white, align: 'Align.Center', visible: '!IsBlank(locVerdict)' }),
    F.label('lblVerdictRemedy', { text: `If(${green}, "Next: ", "What has to happen: ") & locRemedy`, x: M + 20, y: 514, w: FW - 40, h: 90, size: 13, color: C.white, align: 'Align.Center', visible: '!IsBlank(locVerdict)' }),
    F.label('lblVerdictDetail', { text: 'If(IsBlank(locReq), "Code " & locCode, locReq.Company & " · " & locReq.Material & " · " & locReq.Pallets & " pallets · booked " & locReq.Slot & " · contact " & locReq.Contact & " " & locReq.Phone)', x: M + 20, y: 606, w: FW - 40, h: 70, size: 11, color: C.white, align: 'Align.Center', visible: '!IsBlank(locVerdict)' }),
    F.button('btnGateAdmit', { text: '"Admit and log"', x: M + 20, y: 690, w: FW - 40, h: 64, fill: C.white, color: C.go, visible: `!IsBlank(locVerdict) && ${green}`, onSelect: admit, displayMode: 'If(locBusy, DisplayMode.Disabled, DisplayMode.Edit)' }),
    F.button('btnGateDeny', { text: '"Log turn-away and notify"', x: M + 20, y: 690, w: FW - 40, h: 64, fill: C.white, color: C.stop, visible: `!IsBlank(locVerdict) && !(${green})`, onSelect: deny, displayMode: 'If(locBusy, DisplayMode.Disabled, DisplayMode.Edit)' }),
    F.button('btnGateClear', { text: '"Clear"', y: 790, h: 44, kind: 'secondary', visible: '!IsBlank(locVerdict)', onSelect: 'Set(locVerdict, Blank()); Reset(txtGateCode)' }),
    // expected today
    caption('capGateToday', '"EXPECTED TODAY · TAP TO CHECK"', 'If(IsBlank(locVerdict), 360, 846)'),
    F.gallery('galGateToday', {
      items: 'SortByColumns(Filter(colReq, Date = Today() && Status = "Approved"), Slot, SortOrder.Ascending)',
      y: 'capGateToday.Y + 30', h: '1136 - Self.Y', size: 78,
      onSelect: `Set(locRaw, ThisItem.Pass); Set(locSource, "List"); ${check}`,
    }, [
      F.rect('rctGateRow', { x: M, y: 4, w: FW, h: 70, fill: C.white, onSelect: 'Select(Parent)' }),
      F.label('lblGateRowTime', { text: 'ThisItem.Slot', x: M + 12, y: 4, w: 90, h: 70, size: 15, bold: true, onSelect: 'Select(Parent)' }),
      F.label('lblGateRowWho', { text: 'ThisItem.Company & Char(10) & ThisItem.Material & " · " & ThisItem.Pass', x: M + 106, y: 4, w: FW - 120, h: 70, size: 11, onSelect: 'Select(Parent)' }),
    ]),
  ]);
}

// ======================================================================== today / overview
function scrToday() {
  const tile = (n, label, value, x, y, color) => [
    F.rect('rctTile' + n, { x, y, w: (FW - 24) / 3, h: 104, fill: C.white }),
    F.label('lblTileV' + n, { text: value, x, y: y + 10, w: (FW - 24) / 3, h: 52, size: 26, bold: true, color: color || C.ink, align: 'Align.Center' }),
    F.label('lblTileL' + n, { text: s(label), x, y: y + 62, w: (FW - 24) / 3, h: 32, size: 11, color: C.muted, align: 'Align.Center' }),
  ];
  const tw = (FW - 24) / 3 + 12;
  return F.screen('scrToday', {}, [
    ...header('hdrToday', 'If(gblRole = "Admin", "Today", "Expected Today")'),
    ...tile('1', 'Expected', 'CountRows(Filter(colReq, Date = gblToday && Status = "Approved"))', M, 144),
    ...tile('2', 'Arrived', 'CountRows(Filter(colLog, Text(At, "yyyy-mm-dd") = Text(Today(), "yyyy-mm-dd") && Action = "Admitted"))', M + tw, 144, C.go),
    ...tile('3', 'Turned away', 'CountRows(Filter(colLog, Text(At, "yyyy-mm-dd") = Text(Today(), "yyyy-mm-dd") && Action = "Turned away"))', M + 2 * tw, 144, C.stop),
    ...tile('4', 'Need approval', 'CountRows(Filter(colReq, Status = "Needs review")) + CountRows(colJoin)', M, 260, C.hold),
    ...tile('5', 'Members', 'CountRows(colMembers)', M + tw, 260),
    ...tile('6', 'Cancelled today', 'CountRows(Filter(colReq, Date = gblToday && Status = "Cancelled"))', M + 2 * tw, 260),
    caption('capTodayList', '"TODAY’S DELIVERIES"', 384),
    F.gallery('galToday', { items: 'SortByColumns(Filter(colReq, Date = gblToday && (Status = "Approved" || Status = "Cancelled")), Slot, SortOrder.Ascending)', y: 414, h: 722, size: 92 }, [
      F.rect('rctTodayRow', { x: M, y: 4, w: FW, h: 84, fill: C.white }),
      F.label('lblTodayTime', { text: 'ThisItem.Slot', x: M + 12, y: 4, w: 90, h: 84, size: 15, bold: true }),
      F.label('lblTodayWho', { text: 'ThisItem.Company & Char(10) & ThisItem.Material & " · " & ThisItem.Pallets & " pallets · " & ThisItem.Pass', x: M + 106, y: 4, w: FW - 260, h: 84, size: 11 }),
      F.label('lblTodayStatus', { text: 'With({ p: LookUp(colPasses, Code = ThisItem.Pass) }, If(ThisItem.Status = "Cancelled", "Cancelled", p.Status = "Used", "Arrived", Now() > DateAdd(p.Close, 60, TimeUnit.Minutes), "No-show", "Expected"))', x: W - M - 140, y: 28, w: 128, h: 30, size: 10, bold: true, color: C.white, align: 'Align.Center',
        fill: `With({ p: LookUp(colPasses, Code = ThisItem.Pass) }, If(ThisItem.Status = "Cancelled", ${C.muted}, p.Status = "Used", ${C.go}, Now() > DateAdd(p.Close, 60, TimeUnit.Minutes), ${C.stop}, ${C.blue}))` }),
    ]),
  ]);
}

// ======================================================================== gate log
function scrGateLog() {
  return F.screen('scrGateLog', {}, [
    ...header('hdrLog', '"Gate Log"'),
    F.gallery('galLog', { items: 'SortByColumns(colLog, At, SortOrder.Descending)', y: 140, h: 996, size: 96 }, [
      F.rect('rctLogRow', { x: M, y: 4, w: FW, h: 88, fill: C.white }),
      F.label('lblLogTime', { text: 'Text(ThisItem.At, "ddd h:mm AM/PM")', x: M + 12, y: 8, w: 180, h: 30, size: 12, bold: true }),
      F.label('lblLogResult', { text: 'ThisItem.Action', x: W - M - 150, y: 10, w: 138, h: 28, size: 10, bold: true, color: C.white, align: 'Align.Center', fill: `If(ThisItem.Result = "Green", ${C.go}, ${C.stop})` }),
      F.label('lblLogDetail', { text: 'ThisItem.Code & " · " & ThisItem.Reason & " · " & ThisItem.Guard', x: M + 12, y: 42, w: FW - 24, h: 44, size: 11, color: C.muted }),
    ]),
  ]);
}

// ======================================================================== approvals
function scrApprovals() {
  const decideJoin = (approve) => L.act('locA', 'GrantedF12', `JSON({ op: "decideJoin", joinId: ThisItem.Id, approve: ${approve}, role: drpJoinRole.Selected.Value, trade: txtJoinTrade.Text })`);
  const review = (decision) => L.act('locA', 'GrantedF04', `JSON({ requestId: ThisItem.Id, decision: "${decision}", note: txtReviewNote.Text })`);
  return F.screen('scrApprovals', {}, [
    ...header('hdrAppr', '"Approvals"'),
    caption('capApprJoin', '"JOIN REQUESTS · " & CountRows(colJoin)', 140),
    F.gallery('galJoin', { items: 'colJoin', y: 170, h: 'Min(CountRows(colJoin), 3) * 250', size: 250 }, [
      F.rect('rctJoin', { x: M, y: 6, w: FW, h: 238, fill: C.white }),
      F.label('lblJoinName', { text: 'ThisItem.Name & " · " & ThisItem.Company', x: M + 16, y: 14, w: FW - 32, h: 32, size: 14, bold: true }),
      F.label('lblJoinContact', { text: 'ThisItem.Email & " · " & ThisItem.Phone & If(ThisItem.IsHome, " · company email", " · outside company")', x: M + 16, y: 46, w: FW - 32, h: 28, size: 11, color: C.muted }),
      F.dropdown('drpJoinRole', { x: M + 16, y: 82, w: 280, items: '["Contractor", "Access Control", "Admin"]', a11y: 'Access' }),
      F.input('txtJoinTrade', { x: M + 308, y: 82, w: FW - 324, hint: 'Trade, e.g. Electrical' }),
      F.button('btnJoinApprove', { text: '"Approve"', x: M + 16, y: 150, w: 280, h: 52, kind: 'go', onSelect: decideJoin('true') }),
      F.button('btnJoinDecline', { text: '"Decline"', x: M + 308, y: 150, w: FW - 324, h: 52, kind: 'secondary', onSelect: decideJoin('false') }),
    ]),
    caption('capApprReview', '"DELIVERIES TO REVIEW · " & CountRows(Filter(colReq, Status = "Needs review"))', 'galJoin.Y + galJoin.Height + 12'),
    F.gallery('galReview', { items: 'SortByColumns(Filter(colReq, Status = "Needs review"), DateText, SortOrder.Ascending)', y: 'capApprReview.Y + 30', h: '1136 - Self.Y', size: 330 }, [
      F.rect('rctReview', { x: M, y: 6, w: FW, h: 318, fill: C.white }),
      F.label('lblReviewWho', { text: 'ThisItem.Company & " – " & ThisItem.Material', x: M + 16, y: 14, w: FW - 32, h: 32, size: 14, bold: true }),
      F.label('lblReviewWhen', { text: 'Text(ThisItem.Date, "ddd m/d") & " " & ThisItem.Slot & " · gate " & ThisItem.Gate & " · zone " & ThisItem.Zone & " · " & ThisItem.Pallets & " pallets"', x: M + 16, y: 46, w: FW - 32, h: 28, size: 11, color: C.muted }),
      F.label('lblReviewWhy', { text: 'ThisItem.Reasons & If(IsBlank(ThisItem.Justification), "", Char(10) & "Justification: " & ThisItem.Justification)', x: M + 16, y: 76, w: FW - 32, h: 100, size: 11, valign: 'VerticalAlign.Top' }),
      F.input('txtReviewNote', { x: M + 16, y: 180, w: FW - 32, hint: 'Note to the contractor (optional)' }),
      F.button('btnReviewApprove', { text: '"Approve and issue pass"', x: M + 16, y: 244, w: 320, h: 52, kind: 'go', onSelect: review('approve') }),
      F.button('btnReviewReject', { text: '"Reject"', x: M + 348, y: 244, w: FW - 364, h: 52, kind: 'danger', onSelect: review('reject') }),
    ]),
  ]);
}

// ======================================================================== team & invites
function scrTeam() {
  const invite = L.act('locT', 'GrantedF12', 'JSON({ op: "invite", email: txtInviteEmail.Text, role: drpInviteRole.Selected.Value, trade: txtInviteTrade.Text })', 'Reset(txtInviteEmail); Reset(txtInviteTrade)');
  const change = L.act('locT', 'GrantedF12', 'JSON({ op: "changeRole", memberId: ThisItem.Id, role: drpMemberRole.Selected.Value, trade: ThisItem.Trade })');
  const remove = `If(locRemoveId <> ThisItem.Id, Set(locRemoveId, ThisItem.Id); Notify("Tap Remove again to confirm.", NotificationType.Warning),
    ${L.act('locT', 'GrantedF12', 'JSON({ op: "remove", memberId: ThisItem.Id })')}; Set(locRemoveId, Blank()))`;
  return F.screen('scrTeam', { onVisible: 'Set(locRemoveId, Blank())' }, [
    ...header('hdrTeam', '"Team & Invites"'),
    caption('capInvite', '"INVITE SOMEONE"', 140),
    F.input('txtInviteEmail', { y: 170, hint: 'Their work email' }),
    F.dropdown('drpInviteRole', { y: 230, w: 280, items: '["Contractor", "Access Control", "Admin"]', a11y: 'Access' }),
    F.input('txtInviteTrade', { x: M + 292, y: 230, w: FW - 292, hint: 'Trade (contractors)' }),
    F.button('btnInvite', { text: '"Send invite"', y: 292, h: 52, onSelect: invite, displayMode: 'If(IsBlank(Trim(txtInviteEmail.Text)), DisplayMode.Disabled, DisplayMode.Edit)' }),
    caption('capInvites', '"INVITES WAITING · " & CountRows(colInvites)', 360),
    F.gallery('galInvites', { items: 'colInvites', y: 390, h: 'Min(CountRows(colInvites), 3) * 70', size: 70 }, [
      F.label('lblInviteRow', { text: 'ThisItem.Email & " · " & ThisItem.Role', x: M, y: 6, w: FW - 140, h: 58, size: 12, fill: C.white, padL: 12 }),
      F.button('btnRevoke', { text: '"Revoke"', x: W - M - 128, y: 10, w: 128, h: 50, size: 12, kind: 'secondary', onSelect: L.act('locT', 'GrantedF12', 'JSON({ op: "revokeInvite", inviteId: ThisItem.Id })') }),
    ]),
    caption('capMembers', '"MEMBERS · " & CountRows(colMembers)', 'galInvites.Y + galInvites.Height + 12'),
    F.gallery('galMembers', {
      items: 'SortByColumns(AddColumns(colMembers, Rank, Switch(Role, "Admin", 0, "Access Control", 1, 2)), Rank, SortOrder.Ascending, Name, SortOrder.Ascending)',
      y: 'capMembers.Y + 30', h: '1136 - Self.Y', size: 168,
    }, [
      F.rect('rctMember', { x: M, y: 6, w: FW, h: 156, fill: C.white }),
      F.label('lblMemberName', { text: 'ThisItem.Name & If(Lower(ThisItem.Email) = Lower(gblMe.Email), "  (you)", "")', x: M + 16, y: 12, w: FW - 32, h: 30, size: 14, bold: true }),
      F.label('lblMemberMeta', { text: 'ThisItem.Company & " · " & ThisItem.Email & " · " & ThisItem.Phone', x: M + 16, y: 42, w: FW - 32, h: 28, size: 11, color: C.muted }),
      F.dropdown('drpMemberRole', { x: M + 16, y: 80, w: 230, items: '["Contractor", "Access Control", "Admin"]', default: 'ThisItem.Role', a11y: 'Access',
        displayMode: 'If(Lower(ThisItem.Email) = Lower(gblMe.Email), DisplayMode.Disabled, DisplayMode.Edit)' }),
      F.button('btnMemberSave', { text: '"Change"', x: M + 256, y: 80, w: 150, h: 52, size: 12, kind: 'secondary', onSelect: change,
        visible: 'drpMemberRole.Selected.Value <> ThisItem.Role' }),
      F.button('btnMemberRemove', { text: 'If(locRemoveId = ThisItem.Id, "Confirm", "Remove")', x: W - M - 160, y: 80, w: 144, h: 52, size: 12, kind: 'danger', onSelect: remove,
        visible: 'Lower(ThisItem.Email) <> Lower(gblMe.Email)' }),
    ]),
  ]);
}

// ======================================================================== all deliveries
function scrAll() {
  return F.screen('scrAll', {}, [
    ...header('hdrAll', '"All Deliveries"'),
    F.dropdown('drpAllFilter', { y: 140, items: '["Today", "Upcoming", "Needs review", "All"]', a11y: 'Show' }),
    F.gallery('galAll', {
      items: `SortByColumns(Filter(colReq, Switch(drpAllFilter.Selected.Value, "Today", Date = gblToday, "Upcoming", Date >= gblToday, "Needs review", Status = "Needs review", true)), DateText, SortOrder.Descending, Slot, SortOrder.Ascending)`,
      y: 204, h: 932, size: 176,
    }, [
      F.rect('rctAll', { x: M, y: 6, w: FW, h: 164, fill: C.white }),
      F.label('lblAllWho', { text: 'ThisItem.Company & " – " & ThisItem.Material', x: M + 16, y: 12, w: FW - 180, h: 30, size: 13, bold: true }),
      F.label('lblAllStatus', { text: 'ThisItem.Status', x: W - M - 150, y: 14, w: 134, h: 28, size: 10, bold: true, color: C.white, align: 'Align.Center',
        fill: `Switch(ThisItem.Status, "Approved", ${C.go}, "Needs review", ${C.hold}, "Rejected", ${C.stop}, ${C.muted})` }),
      F.label('lblAllWhen', { text: 'Text(ThisItem.Date, "ddd m/d") & " " & ThisItem.Slot & " · gate " & ThisItem.Gate & " · " & ThisItem.Pallets & " pallets · " & ThisItem.Pass & If(ThisItem.Maint, " · maintenance", "")', x: M + 16, y: 44, w: FW - 32, h: 28, size: 11, color: C.muted }),
      F.label('lblAllWhy', { text: '"Booked by " & ThisItem.By & " · decided by " & ThisItem.DecidedBy & If(IsBlank(ThisItem.Reasons), "", Char(10) & ThisItem.Reasons)', x: M + 16, y: 74, w: FW - 32, h: 90, size: 11, valign: 'VerticalAlign.Top' }),
    ]),
  ]);
}

// ======================================================================== emergency pass
function scrEmergency() {
  const issue = L.act('locE', 'GrantedF10', `JSON({ subId: LookUp(colSubs, Name = drpEmCompany.Selected.Value).Id, material: txtEmMaterial.Text, gateId: LookUp(colGates, Name = drpEmGate.Selected.Value).Id,
    slot: drpEmSlot.Selected.Value, zoneId: LookUp(colZones, Name = drpEmZone.Selected.Value).Id, pallets: Value(txtEmPallets.Text) })`, 'Reset(txtEmMaterial)');
  const slots = `ForAll(Sequence(RoundDown(((Value(Left(gblCfg.GateClose, 2)) * 60 + Value(Right(gblCfg.GateClose, 2))) - (Value(Left(gblCfg.GateOpen, 2)) * 60 + Value(Right(gblCfg.GateOpen, 2)))) / gblCfg.SlotMinutes, 0), 0) As k,
    With({ m: Value(Left(gblCfg.GateOpen, 2)) * 60 + Value(Right(gblCfg.GateOpen, 2)) + k.Value * gblCfg.SlotMinutes }, Text(RoundDown(m / 60, 0), "00") & ":" & Text(Mod(m, 60), "00")))`;
  return F.screen('scrEmergency', { fill: C.white }, [
    ...header('hdrEm', '"Emergency Pass"'),
    F.label('lblEmHelp', { text: '"A same-day pass that skips the rules. It is logged, counts as an override against the company, and the contractor, gate team and admins are told."', y: 140, h: 70, size: 12, color: C.muted }),
    ...field('lblEmCompany', 'Company', 220, F.dropdown('drpEmCompany', { y: 248, items: 'ForAll(SortByColumns(colSubs, Name), Name)', a11y: 'Company' })),
    ...field('lblEmMaterial', 'Material', 312, F.input('txtEmMaterial', { y: 340, hint: 'What is on the truck' })),
    ...field('lblEmGate', 'Gate', 404, F.dropdown('drpEmGate', { y: 432, items: 'ForAll(colGates, Name)', a11y: 'Gate' })),
    ...field('lblEmSlot', 'Today at', 496, F.dropdown('drpEmSlot', { y: 524, items: slots, a11y: 'Time' })),
    ...field('lblEmZone', 'Staging zone', 588, F.dropdown('drpEmZone', { y: 616, items: 'ForAll(colZones, Name)', a11y: 'Staging zone' })),
    ...field('lblEmPallets', 'Pallets', 680, F.input('txtEmPallets', { y: 708, number: true, default: '"0"' })),
    F.button('btnEmIssue', { text: '"Issue emergency pass"', y: 790, kind: 'danger', onSelect: issue, displayMode: 'If(IsBlank(Trim(txtEmMaterial.Text)), DisplayMode.Disabled, DisplayMode.Edit)' }),
  ]);
}

// ======================================================================== project settings
function scrProject() {
  const save = L.act('locS', 'GrantedF13', `JSON({ op: "settings", name: txtPsName.Text, location: txtPsLocation.Text, timeZone: drpPsZone.Selected.Value,
    settings: { minNoticeHours: Value(txtPsNotice.Text), maxDaysBeforeInstall: Value(txtPsEarly.Text), gateToleranceMinutes: Value(txtPsWindow.Text),
        maxPalletsPerRequest: Value(txtPsPallets.Text), gateOpen: txtPsOpen.Text, gateClose: txtPsClose.Text, slotMinutes: gblCfg.SlotMinutes },
    gates: ForAll(colEditGates, { id: Id, name: Name, capacityPerSlot: Cap, sort: Sort }),
    zones: ForAll(colEditZones, { id: Id, name: Name, capacityPallets: Cap }) })`);
  const upload = `IfError(
    ClearCollect(colCsv, ForAll(Filter(Split(Substitute(txtPsCsv.Text, Char(13), ""), Char(10)), !IsBlank(Trim(Value)) && !StartsWith(Upper(Trim(Value)), "ID,")) As line,
        With({ c: Split(line.Value, ",") },
            { id: Trim(First(c).Value), name: Trim(Last(FirstN(c, 2)).Value), trade: Trim(Last(FirstN(c, 3)).Value),
              start: IfError(Text(DateValue(Trim(Last(FirstN(c, 4)).Value)), "yyyy-mm-dd"), ""), finish: IfError(Text(DateValue(Trim(Last(FirstN(c, 5)).Value)), "yyyy-mm-dd"), "") }))),
    Notify("That doesn’t look like a CSV with ID, Activity, Trade, Start, Finish.", NotificationType.Error));
${L.act('locU', 'GrantedF09', 'JSON({ rows: colCsv })', 'Reset(txtPsCsv)')}`;
  const newCode = `If(!locConfirmCode, Set(locConfirmCode, true); Notify("Tap again: the old code stops working at once.", NotificationType.Warning),
    ${L.act('locK', 'GrantedF13', 'JSON({ op: "regenerateCode" })', L.LOAD_SESSION)}; Set(locConfirmCode, false))`;
  const del = L.act('locZ', 'GrantedF13', 'JSON({ op: "delete", confirmCode: txtPsDelete.Text })', `Set(gblPid, Blank()); ${L.LOAD_SESSION}; Navigate(scrHome, ScreenTransition.UnCover)`);
  const init = `Set(locConfirmCode, false);
ClearCollect(colEditGates, ForAll(colGates, { Id: ThisRecord.Id, Name: ThisRecord.Name, Cap: ThisRecord.Cap, Sort: 0 }));
ClearCollect(colEditZones, ForAll(colZones, { Id: ThisRecord.Id, Name: ThisRecord.Name, Cap: ThisRecord.Cap }))`;
  const num = (n, label, x, y, w, dflt) => [
    F.label('lbl' + n, { text: s(label), x, y, w, h: 24, size: 11, color: C.muted }),
    F.input('txt' + n, { x, y: y + 26, w, number: !['PsOpen', 'PsClose'].includes(n), default: dflt }),
  ];
  const hw = (FW - 12) / 2;
  return F.screen('scrProject', { fill: C.white, onVisible: init }, [
    ...header('hdrPs', '"Project Settings"'),
    F.gallery('galPsScroll', { items: '[1]', y: 128, h: 1008, size: 2350, a11y: 'Project settings' }, [
      caption('capPsProject', '"PROJECT"', 12),
      F.input('txtPsName', { y: 42, default: 'gblP.Name', hint: 'Project name' }),
      F.input('txtPsLocation', { y: 102, default: 'gblP.Location', hint: 'Location' }),
      F.dropdown('drpPsZone', { y: 162, items: '["Central Standard Time", "Eastern Standard Time", "Mountain Standard Time", "US Mountain Standard Time", "Pacific Standard Time", "Alaskan Standard Time", "Hawaiian Standard Time"]', default: 'gblP.TimeZone', a11y: 'Time zone' }),
      F.label('lblPsCode', { text: '"Project code: " & gblP.Code', y: 226, w: 360, h: 52, size: 16, bold: true, mono: true }),
      F.button('btnPsNewCode', { text: 'If(locConfirmCode, "Tap again", "New code")', x: W - M - 200, y: 226, w: 200, h: 52, size: 12, kind: 'secondary', visible: 'gblMe.IsAdminAccount', onSelect: newCode }),
      caption('capPsRules', '"RULES"', 296),
      ...num('PsNotice', 'Notice (hours)', M, 326, hw, 'Text(gblCfg.MinNotice)'),
      ...num('PsEarly', 'Max days before install', M + hw + 12, 326, hw, 'Text(gblCfg.MaxEarly)'),
      ...num('PsWindow', 'Arrival window ± minutes', M, 410, hw, 'Text(gblCfg.Tolerance)'),
      ...num('PsPallets', 'Review above (pallets)', M + hw + 12, 410, hw, 'Text(gblCfg.MaxPallets)'),
      ...num('PsOpen', 'Gate opens (HH:MM)', M, 494, hw, 'gblCfg.GateOpen'),
      ...num('PsClose', 'Gate closes (HH:MM)', M + hw + 12, 494, hw, 'gblCfg.GateClose'),
      caption('capPsGates', '"GATES (NAME · TRUCKS PER SLOT)"', 590),
      F.gallery('galPsGates', { items: 'colEditGates', y: 620, h: 'CountRows(colEditGates) * 64', size: 64 }, [
        F.input('txtGateName', { x: M, y: 6, w: FW - 140, default: 'ThisItem.Name', onChange: 'Patch(colEditGates, ThisItem, { Name: Self.Text })' }),
        F.input('txtGateCap', { x: W - M - 128, y: 6, w: 128, number: true, default: 'Text(ThisItem.Cap)', onChange: 'Patch(colEditGates, ThisItem, { Cap: Value(Self.Text) })' }),
      ]),
      F.button('btnPsAddGate', { text: '"+ Add gate"', y: 'galPsGates.Y + galPsGates.Height + 6', h: 44, size: 12, kind: 'secondary', onSelect: 'Collect(colEditGates, { Id: "G" & Text(CountRows(colEditGates) + 1) & "-" & Text(Now(), "hhmmss"), Name: "New gate", Cap: 1, Sort: CountRows(colEditGates) + 1 })' }),
      caption('capPsZones', '"STAGING ZONES (NAME · PALLETS)"', 'btnPsAddGate.Y + 64'),
      F.gallery('galPsZones', { items: 'colEditZones', y: 'capPsZones.Y + 30', h: 'CountRows(colEditZones) * 64', size: 64 }, [
        F.input('txtZoneName', { x: M, y: 6, w: FW - 140, default: 'ThisItem.Name', onChange: 'Patch(colEditZones, ThisItem, { Name: Self.Text })' }),
        F.input('txtZoneCap', { x: W - M - 128, y: 6, w: 128, number: true, default: 'Text(ThisItem.Cap)', onChange: 'Patch(colEditZones, ThisItem, { Cap: Value(Self.Text) })' }),
      ]),
      F.button('btnPsAddZone', { text: '"+ Add zone"', y: 'galPsZones.Y + galPsZones.Height + 6', h: 44, size: 12, kind: 'secondary', onSelect: 'Collect(colEditZones, { Id: "Z" & Text(CountRows(colEditZones) + 1) & "-" & Text(Now(), "hhmmss"), Name: "New zone", Cap: 10 })' }),
      F.button('btnPsSave', { text: '"Save project settings"', y: 'btnPsAddZone.Y + 64', onSelect: save }),
      caption('capPsCompanies', '"COMPANIES"', 'btnPsSave.Y + 80'),
      F.gallery('galPsCompanies', { items: 'SortByColumns(colSubs, Name)', y: 'capPsCompanies.Y + 30', h: 'CountRows(colSubs) * 64', size: 64 }, [
        F.label('lblCompanyName', { text: 'ThisItem.Name & If(IsBlank(ThisItem.Trade), "", " · " & ThisItem.Trade) & If(ThisItem.Suspended, " · SUSPENDED", "")', x: M, y: 6, w: FW - 160, h: 52, size: 12 }),
        F.button('btnCompanySuspend', { text: 'If(ThisItem.Suspended, "Restore", "Suspend")', x: W - M - 148, y: 8, w: 148, h: 48, size: 12, kind: 'secondary',
          onSelect: L.act('locC', 'GrantedF13', 'JSON({ op: "suspend", subId: ThisItem.Id, subName: ThisItem.Name, suspended: !ThisItem.Suspended })') }),
      ]),
      caption('capPsLook', '"LOOK-AHEAD · PASTE THE CSV (ID, ACTIVITY, TRADE, START, FINISH)"', 'galPsCompanies.Y + galPsCompanies.Height + 16'),
      F.input('txtPsCsv', { y: 'capPsLook.Y + 30', h: 200, multiline: true, hint: 'ID,Activity,Trade,Start,Finish' }),
      F.button('btnPsUpload', { text: '"Upload look-ahead (" & CountRows(colActs) & " activities now)"', y: 'txtPsCsv.Y + 212', onSelect: upload, displayMode: 'If(IsBlank(Trim(txtPsCsv.Text)), DisplayMode.Disabled, DisplayMode.Edit)' }),
      caption('capPsDelete', '"DELETE PROJECT (ADMIN ACCOUNTS)"', 'btnPsUpload.Y + 84'),
      F.input('txtPsDelete', { y: 'capPsDelete.Y + 30', hint: 'Type the project code to confirm', visible: 'gblMe.IsAdminAccount' }),
      F.button('btnPsDelete', { text: '"Delete project"', y: 'txtPsDelete.Y + 64', kind: 'danger', visible: 'gblMe.IsAdminAccount', onSelect: del,
        displayMode: 'If(Upper(Trim(txtPsDelete.Text)) = gblP.Code, DisplayMode.Edit, DisplayMode.Disabled)' }),
    ]),
  ]);
}

module.exports = {
  screens: () => [scrStart(), scrProfile(), scrHome(), scrAdd(), scrSettings(), scrPasses(), scrBook(), scrMine(), scrMessages(), scrGate(), scrToday(), scrGateLog(), scrApprovals(), scrTeam(), scrAll(), scrEmergency(), scrProject()],
  TABS,
};
