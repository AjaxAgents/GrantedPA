// Minimal stand-in for the ExcelScript types so `npm run check` can type-check
// the Office Script outside Excel. Excel provides the real definitions.
declare namespace ExcelScript { interface Workbook { getName(): string } }
