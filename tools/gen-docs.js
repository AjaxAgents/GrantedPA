// Generates docs/02-data-model.md from sharepoint/list-schema.json so the two never disagree.
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const s = JSON.parse(fs.readFileSync(path.join(root, 'sharepoint/list-schema.json'), 'utf8'));
const typeName = { Text: 'Single line of text', Note: 'Multiple lines (plain)', Number: 'Number', DateOnly: 'Date only', DateTime: 'Date and time', Choice: 'Choice', Boolean: 'Yes/No' };
let md = '# 02 · Data model\n\nGENERATED from `sharepoint/list-schema.json` by `npm run build`. Edit `tools/schema-src.js`, not this file.\n\n';
md += 'All lists live on one SharePoint site, **' + s.site + '**. Time zone: ' + s.timeZone + '. Every list keeps version history.\n\n';
md += '## Who can open the lists\n\n' + s.access.map((a) => '- ' + a).join('\n') + '\n\n';
md += '## Lists at a glance\n\n| List | Purpose |\n|---|---|\n';
for (const l of s.lists.concat(s.libraries)) md += '| `' + l.title + '` | ' + (l.description || '') + (l.restricted ? ' **Restricted.**' : '') + ' |\n';
for (const l of s.lists) {
  md += '\n## ' + l.title + '\n\n' + (l.description ? l.description + '\n\n' : '');
  md += '| Column (internal name) | Display name | Type | Indexed | Notes |\n|---|---|---|---|---|\n';
  md += '| `Title` | ' + (l.titleDisplay || 'Title') + ' | Single line of text | ' + (l.titleUnique ? 'Yes, unique' : '') + ' | |\n';
  for (const f of l.fields) {
    const notes = [f.choices ? 'Choices: ' + f.choices.join(', ') : '', f.default !== undefined ? 'Default: ' + f.default : '', f.required ? 'Required' : '', f.note || ''].filter(Boolean).join('. ');
    md += '| `' + f.name + '` | ' + f.display + ' | ' + (typeName[f.type] || f.type) + ' | ' + (f.unique ? 'Yes, unique' : f.indexed ? 'Yes' : '') + ' | ' + notes + ' |\n';
  }
}
md += '\n## Libraries\n\n' + s.libraries.map((l) => '- `' + l.title + '`: ' + l.description).join('\n') + '\n';
md += `
## Notes

- **Every project-owned row carries \`ProjectId\`** and every flow filters on it first, so one site serves many projects. \`ProjectId\` is indexed on every list, which keeps queries working past the 5,000-item list view threshold.
- IDs (\`ProjectId\`, \`GateId\`, \`ZoneId\`, \`ActivityId\`, company keys) are plain text, not lookup columns. Text keys keep flow queries simple and make imports easy.
- \`Key\` columns (\`ProjectId|GateId\` and so on) enforce "unique within a project".
- Times: \`DeliveryDate\` is a date; \`SlotStart\` is the site-local slot as \`HH:MM\`. \`DeliveryStart\`, \`WindowOpen\` and \`WindowClose\` are full date-times stored in UTC; flows convert with \`convertTimeZone(..., <project TimeZone>)\`.
- **Scale:** a project with 30 deliveries a day adds about 9,000 requests a year. Archive closed projects' rows to a dated copy of the site once a year, or move to one site per region when a list passes about 50,000 items.
`;
fs.writeFileSync(path.join(root, 'docs/02-data-model.md'), md);
console.log('wrote docs/02-data-model.md');
