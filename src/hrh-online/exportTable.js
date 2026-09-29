import XLSX from "xlsx-js-style";

// Exports a DataTable's rows to .xlsx — raw row values per column key
// (numbers stay numbers), headers = the column labels.
export function exportTableToExcel(columns, rows, fileName = "HRH Online Table") {
  const header = columns.map((c) => (typeof c.label === "string" ? c.label : c.key));
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = r[c.key];
      return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v;
    }),
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  header.forEach((_, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (cell) cell.s = { font: { bold: true } };
  });
  ws["!cols"] = header.map((h) => ({ wch: Math.max(12, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${fileName.replace(/[\/:*?"<>|]/g, "")}.xlsx`);
}

// For hand-built <table>s: exports the rendered table as shown.
export function exportDomTableToExcel(tableEl, fileName = "HRH Online Table") {
  if (!tableEl) return;
  const wb = XLSX.utils.table_to_book(tableEl, { sheet: "Data" });
  XLSX.writeFile(wb, `${fileName.replace(/[\/:*?"<>|]/g, "")}.xlsx`);
}
