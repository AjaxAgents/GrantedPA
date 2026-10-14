// Source for sharepoint/list-schema.json (GrantedPA v2, multi-project). Run: npm run build
// Field types: Text, Note, Number, DateOnly, DateTime, Choice, Boolean.
const T = (name, display, extra) => Object.assign({ name, display, type: 'Text' }, extra || {});
const N = (name, display, extra) => Object.assign({ name, display, type: 'Number' }, extra || {});
const DO = (name, display, extra) => Object.assign({ name, display, type: 'DateOnly' }, extra || {});
const DT = (name, display, extra) => Object.assign({ name, display, type: 'DateTime' }, extra || {});
const NOTE = (name, display, extra) => Object.assign({ name, display, type: 'Note' }, extra || {});
const B = (name, display, extra) => Object.assign({ name, display, type: 'Boolean' }, extra || {});
const C = (name, display, choices, extra) => Object.assign({ name, display, type: 'Choice', choices }, extra || {});
const I = { indexed: true };
const PID = () => T('ProjectId', 'Project ID', { indexed: true, required: true });
const KEY = (note) => T('Key', 'Key', { indexed: true, unique: true, required: true, note });

const schema = {
  site: 'Granted',
  timeZone: 'Any (UTC recommended): every date-time is stored in UTC and flows convert to each project\'s own time zone',
  access: [
    'Only the Granted service account (site owner) and the Granted Owners group (Ajax IT) can open these lists.',
    'People never read or write lists directly. The Granted app talks only to flows, which run as the service account and check the caller\'s role on the project first.',
    'SecureSettings is locked further: only the service account (and a named break-glass admin) can read it.',
  ],
  groups: { Owners: 'Granted Owners (Ajax IT)' },
  lists: [
    // ------------------------------------------------------------ people and projects
    {
      title: 'Projects', titleDisplay: 'Project name',
      description: 'One item per project. Created and changed only by flows (F15).',
      fields: [
        T('ProjectId', 'Project ID', { indexed: true, unique: true, required: true, note: 'e.g. p-7f3k2m (made by F15)' }),
        T('ProjectCode', 'Project code', { indexed: true, unique: true, required: true, note: 'e.g. DDC2-7HKQ. Upper case.' }),
        T('PassPrefix', 'Pass prefix', { note: 'From the code, e.g. DDC2' }), T('Location', 'Location'),
        T('TimeZone', 'Time zone', { note: "Windows zone name used by convertTimeZone, e.g. 'Central Standard Time'" }),
        NOTE('SettingsJson', 'Rule settings (JSON)', { plain: true, note: 'Same keys as config/settings.json' }),
        T('TeamsChannelLink', 'Teams channel (optional)'), T('GateDutyPhone', 'Gate duty phone'),
        B('Deleted', 'Deleted', I), DT('DeletedAt', 'Deleted at'), T('DeletedBy', 'Deleted by'),
        T('CreatedByEmail', 'Created by'), DT('CreatedAtUtc', 'Created at'),
      ],
    },
    {
      title: 'People', titleDisplay: 'Full name',
      description: 'A Granted profile per person (Ajax staff and guests). Ajax membership is set from the email domain by flows.',
      fields: [
        T('Email', 'Email', { indexed: true, unique: true, required: true, note: 'Lower case. The Microsoft sign-in email.' }),
        T('FirstName', 'First name'), T('LastName', 'Last name'), T('Phone', 'Phone'), T('Company', 'Company'),
        T('CompanyKey', 'Company key', Object.assign({ note: 'Lower-case slug of Company, e.g. north-field-electrical' }, I)),
        B('IsAjax', 'Ajax Building Company'), B('IsAdminAccount', 'Admin account (can create projects)'),
        C('Status', 'Status', ['Active', 'Pending sign-in', 'Deleted'], Object.assign({ default: 'Active' }, I)),
        C('Source', 'Source', ['App', 'Sign-up form', 'Invite', 'Admin']), DT('CreatedAtUtc', 'Created at'), DT('LastSeenAt', 'Last seen'),
      ],
    },
    {
      title: 'ProjectMembers', titleDisplay: 'Member key',
      description: 'Who is on which project, with which access. Title = ProjectId|email.',
      fields: [
        PID(), T('Email', 'Email', I), C('Role', 'Access', ['Contractor', 'Access Control', 'Admin'], I), T('Trade', 'Trade'),
        C('Status', 'Status', ['Active', 'Removed'], Object.assign({ default: 'Active' }, I)), C('Via', 'Joined by', ['Creator', 'Request', 'Invite']),
        T('AddedBy', 'Added by'), DT('AddedAt', 'Added at'), T('RemovedBy', 'Removed by'), DT('RemovedAt', 'Removed at'),
      ],
    },
    {
      title: 'JoinRequests', titleDisplay: 'Name',
      description: 'Requests to join a project with its code (from the app or the sign-up form). Admins of that project decide.',
      fields: [
        PID(), T('Email', 'Email', I), T('FirstName', 'First name'), T('LastName', 'Last name'), T('Company', 'Company'), T('Phone', 'Phone'), B('IsAjax', 'Ajax email'),
        C('Status', 'Status', ['Pending', 'Approved', 'Declined'], Object.assign({ default: 'Pending' }, I)), C('Source', 'Source', ['App', 'Sign-up form']),
        DT('RequestedAt', 'Requested at'), C('Role', 'Access given', ['Contractor', 'Access Control', 'Admin']), T('Trade', 'Trade'), T('DecidedBy', 'Decided by'), DT('DecidedAt', 'Decided at'),
      ],
    },
    {
      title: 'Invites', titleDisplay: 'Email',
      description: 'Single-use invites bound to one email. Expire after 7 days.',
      fields: [
        PID(), T('Email', 'Email (lower case)', I), C('Role', 'Access', ['Contractor', 'Access Control', 'Admin']), T('Trade', 'Trade'),
        T('InvitedBy', 'Invited by'), DT('InvitedAt', 'Invited at'), DT('ExpiresAt', 'Expires at'),
        C('Status', 'Status', ['Pending', 'Accepted', 'Revoked', 'Expired'], Object.assign({ default: 'Pending' }, I)), DT('AcceptedAt', 'Accepted at'),
      ],
    },
    {
      title: 'Companies', titleDisplay: 'Company',
      description: 'Per-project company switches. A suspended company cannot book and its passes are red (except emergency passes).',
      fields: [PID(), T('CompanyKey', 'Company key', I), B('Suspended', 'Suspended'), T('SuspendedReason', 'Reason'), T('SuspendedBy', 'Suspended by'), DT('SuspendedAt', 'Suspended at')],
    },
    // ------------------------------------------------------------ deliveries and the gate
    {
      title: 'DeliveryRequests', titleDisplay: 'Request no.', attachments: false,
      description: 'One item per delivery request. Written only by flows (F01 creates and decides).',
      fields: [
        PID(),
        T('SubcontractorId', 'Company key', Object.assign({ note: 'CompanyKey of the booking company' }, I)), T('SubcontractorName', 'Company'),
        T('ActivityId', 'Activity ID'), T('ActivityName', 'Activity'),
        T('GateId', 'Gate ID', I), DO('DeliveryDate', 'Delivery date', I), T('SlotStart', 'Slot start', { note: '24-hour site time, e.g. 07:00' }),
        DT('DeliveryStart', 'Delivery start', { note: 'Slot start as a date-time (UTC)' }),
        T('ZoneId', 'Staging zone ID', I), T('Material', 'Material'), N('Quantity', 'Quantity'),
        C('Unit', 'Unit', ['pcs', 'sections', 'reels', 'units', 'LF', 'crates', 'skids', 'boxes', 'load']),
        N('Pallets', 'Pallets', { decimals: 0 }), N('WeightLbs', 'Weight (lb)', { decimals: 0 }),
        T('Carrier', 'Carrier'), T('TruckNumber', 'Truck no.'), T('ContactName', 'Onsite contact'), T('ContactPhone', 'Contact phone'),
        NOTE('EarlyJustification', 'Early delivery reason'),
        C('Status', 'Status', ['Submitted', 'Approved', 'Needs review', 'Rejected', 'Cancelled'], Object.assign({ default: 'Submitted' }, I)),
        T('ReasonCodes', 'Reason codes', { note: 'Semicolon list, e.g. R05;F03' }), NOTE('ReasonText', 'Reasons and fixes'), T('NextOpenSlot', 'Next open slot'),
        DO('StagedUntil', 'Staged until'), T('PassCode', 'Pass code', I), T('PreviousPassCode', 'Previous pass code'),
        NOTE('QrSvg', 'QR (SVG)', { plain: true }),
        T('SubmittedByEmail', 'Submitted by', I), T('SubmittedByName', 'Submitted by (name)'), DT('SubmittedAt', 'Submitted at'), T('DecidedBy', 'Decided by'), DT('DecidedAt', 'Decided at'),
        NOTE('ReviewNote', 'Review note'), DT('ReviewAlertSentAt', 'Review alert sent'), DT('EscalatedAt', 'Escalated at'),
        DT('CancelledAt', 'Cancelled at'), DT('NoShowNotifiedAt', 'No-show notified'), B('IsOverride', 'Emergency override'), B('Maintenance', 'Maintenance mode'),
        NOTE('MessageLog', 'Message history', { plain: true }),
      ],
    },
    {
      title: 'GatePasses', titleDisplay: 'Pass code', titleUnique: true,
      description: 'One item per issued gate pass. Written only by F02, F05, F06.',
      fields: [
        PID(), N('RequestId', 'Request ID', Object.assign({ decimals: 0 }, I)), T('SubcontractorId', 'Company key', I), T('SubcontractorName', 'Company'),
        T('Material', 'Material'), T('QuantityText', 'Quantity'), N('Pallets', 'Pallets', { decimals: 0 }),
        T('GateId', 'Gate ID'), T('GateName', 'Gate'), T('ZoneName', 'Staging zone'),
        DO('DeliveryDate', 'Delivery date', I), T('SlotStart', 'Slot start'), DT('WindowOpen', 'Window opens'), DT('WindowClose', 'Window closes'),
        T('ContactName', 'Onsite contact'), T('ContactPhone', 'Contact phone'),
        C('Status', 'Status', ['Active', 'Used', 'Void'], Object.assign({ default: 'Active' }, I)), B('IsOverride', 'Emergency override'),
        DT('IssuedAt', 'Issued at'), DT('UsedAt', 'Used at'), T('UsedBy', 'Admitted by'), DT('VoidedAt', 'Voided at'), T('VoidReason', 'Void reason'),
        NOTE('QrSvg', 'QR (SVG)', { plain: true }),
      ],
    },
    {
      title: 'GateLog', titleDisplay: 'Code scanned',
      description: 'Every admit and turn-away. Written only by F05. Never edited.',
      fields: [
        PID(), DT('ScannedAt', 'Scanned at', I), C('Result', 'Result', ['Green', 'Red']), T('ReasonCode', 'Reason code'), T('ReasonText', 'Reason'),
        C('Action', 'Action', ['Admitted', 'Turned away']), T('Guard', 'Guard'), T('GuardEmail', 'Guard email'), T('GateId', 'Gate ID'),
        N('PassId', 'Pass item ID', { decimals: 0 }), N('RequestId', 'Request ID', { decimals: 0 }), T('SubcontractorId', 'Company key', I),
        C('Source', 'Source', ['Scan', 'Typed', 'List', 'Offline sync']), DT('DeviceTime', 'Device time'), B('Maintenance', 'Maintenance mode'),
      ],
    },
    {
      title: 'Notifications', titleDisplay: 'Subject',
      description: 'Copy of every message sent. Shown in the app (Messages, Activity). Written only by flows.',
      fields: [
        PID(), C('Kind', 'Kind', ['delivery', 'team', 'account']),
        C('Event', 'Event', ['approved', 'review', 'rejected', 'cancelled', 'emergency', 'turnedAway', 'noshow', 'escalation', 'join', 'invite', 'access', 'system']),
        C('RecipientRole', 'Recipient role', ['Contractor', 'Access Control', 'Admin', 'Person']), T('RecipientEmail', 'Recipient email', I),
        T('Channels', 'Channels'), NOTE('Body', 'Body', { plain: true }), N('RequestId', 'Request ID', Object.assign({ decimals: 0 }, I)),
        T('SubcontractorId', 'Company key'), DT('SentAt', 'Sent at', I),
      ],
    },
    // ------------------------------------------------------------ per-project reference data
    {
      title: 'Activities', titleDisplay: 'Activity',
      description: 'Each project\'s current 3-week look-ahead, loaded weekly by F09.',
      fields: [KEY('ProjectId|ActivityId'), PID(), T('ActivityId', 'Activity ID'), T('Trade', 'Trade'), DO('StartDate', 'Start'), DO('FinishDate', 'Finish'), T('Area', 'Area'), B('IsCurrent', 'In current look-ahead', I), T('ImportBatch', 'Import batch')],
    },
    {
      title: 'Gates', titleDisplay: 'Gate', description: 'Each project\'s gates and trucks per time slot.',
      fields: [KEY('ProjectId|GateId'), PID(), T('GateId', 'Gate ID'), N('CapacityPerSlot', 'Trucks per slot', { decimals: 0 }), B('Active', 'Active', { default: '1' }), N('SortOrder', 'Sort order', { decimals: 0 })],
    },
    {
      title: 'StagingZones', titleDisplay: 'Zone', description: 'Each project\'s laydown and staging areas with pallet capacity.',
      fields: [KEY('ProjectId|ZoneId'), PID(), T('ZoneId', 'Zone ID'), N('CapacityPallets', 'Capacity (pallets)', { decimals: 0 }), B('Active', 'Active', { default: '1' }), NOTE('Notes', 'Notes')],
    },
    {
      title: 'BlackoutDates', titleDisplay: 'Reason', description: 'Days a project\'s gates take no deliveries.',
      fields: [PID(), DO('BlackoutDate', 'Date', I)],
    },
    // ------------------------------------------------------------ app-wide
    {
      title: 'ReasonCodes', titleDisplay: 'Code',
      description: 'Fixed wording for every decision and gate result (from config/reason-codes.json).',
      fields: [T('Key', 'Key'), C('Outcome', 'Outcome', ['reject', 'review', 'green', 'red']), T('Message', 'Message'), NOTE('Remedy', 'What to do', { plain: true })],
    },
    {
      title: 'AppSettings', titleDisplay: 'Setting',
      description: 'App-wide, non-secret settings: service account, support email, app link, default rule settings.',
      fields: [T('Value', 'Value'), NOTE('Description', 'What it controls')],
    },
    {
      title: 'SecureSettings', titleDisplay: 'Setting', restricted: true,
      description: 'Secrets used only by flows: the salted hash of the admin set-up code. Only the service account can read it.',
      fields: [NOTE('Value', 'Value', { plain: true }), NOTE('Description', 'What it controls')],
    },
    {
      title: 'AuditLog', titleDisplay: 'Action',
      description: 'Security-relevant actions: admin grants, code attempts, approvals, role changes, removals, overrides, deletions. Written only by flows. Never edited.',
      fields: [T('ActorEmail', 'Actor', I), T('ProjectId', 'Project ID', I), T('Target', 'Target'), NOTE('Details', 'Details', { plain: true }), DT('At', 'At', I), B('Maintenance', 'Maintenance mode')],
    },
  ],
  libraries: [
    { title: 'QRRunner', description: 'Holds QR-Runner.xlsx, the workbook the Office Scripts run against. Service account only.' },
    { title: 'LookAheadImports', description: 'Copies of each uploaded look-ahead CSV (written by F09), kept for the record.' },
  ],
};
require('fs').writeFileSync(require('path').join(__dirname, '..', 'sharepoint', 'list-schema.json'), JSON.stringify(schema, null, 2) + '\n');
console.log('wrote sharepoint/list-schema.json');
