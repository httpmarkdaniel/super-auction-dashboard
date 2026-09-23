import XLSX from "xlsx-js-style";

// Same navy header styling as every other Excel export this dashboard
// produces (see vendorTop5YearExport.js/auctionResultExport.js).
const NAVY_HEX = "22304F";

function dash(value) {
  return value && String(value).trim() ? value : "—";
}

// Search Keywords export — one sheet, one row per search term, ranked by
// search count. Site-wide (not HRH-Online-only) — see
// api/_hrh-search-keywords.js's file-header comment for why.
export function exportSearchKeywordsExcel({ range, rows }) {
  const wb = XLSX.utils.book_new();
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: NAVY_HEX } } };

  const headers = ["Search Term", "Searches", "Users"];
  const aoa = [headers];
  rows.forEach((r) => {
    aoa.push([dash(r.keyword), r.searches, r.users]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }
  ws["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 14 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: headers.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, "Search Keywords");

  const rangePart = range ? `${range.from} to ${range.to}` : "All Time";
  XLSX.writeFile(wb, `Search Keywords (${rangePart}).xlsx`);
}
