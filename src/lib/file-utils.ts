const SPREADSHEET_MIMES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

const SPREADSHEET_EXTS = new Set([".csv", ".xls", ".xlsx", ".ods"]);

export function isSpreadsheetFile(f: File): boolean {
  if (SPREADSHEET_MIMES.has(f.type)) return true;
  const i = f.name.lastIndexOf(".");
  return i !== -1 && SPREADSHEET_EXTS.has(f.name.substring(i).toLowerCase());
}
