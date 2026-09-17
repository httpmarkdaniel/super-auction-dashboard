import XLSX from "xlsx-js-style";

// Same navy header styling as auctionResultExport.js/vendorTop5YearExport.js
// (src/theme.css light values) — kept consistent across every Excel export
// this dashboard produces.
const NAVY_HEX = "22304F";

function dash(value) {
  return value && String(value).trim() ? value : "—";
}

// Top Bidders — 5-Year Bid Value export. One sheet, one row per bidder,
// one column per calendar year plus Total, plus Phone/Email (no Account
// Executive column — that's a vendor-specific concept, doesn't apply to
// bidders). Year/Total amounts are exported as plain numbers with a real
// Excel number format, not the on-screen abs-value-2dp string.
export function exportBidderTop5YearExcel({ years, category, rows }) {
  const wb = XLSX.utils.book_new();
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: NAVY_HEX } } };

  const headers = ["Bidder", "Phone", "Email", ...years.map(String), "Total"];
  const aoa = [headers];
  rows.forEach((v) => {
    aoa.push([dash(v.bidder_name), dash(v.phone), dash(v.email), ...years.map((y) => Math.abs(v.years[y] || 0)), Math.abs(v.total || 0)]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }
  const firstYearCol = 3;
  for (let r = 1; r < aoa.length; r++) {
    for (let c = firstYearCol; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr]) ws[addr].z = '"₱"#,##0.00';
    }
  }
  ws["!cols"] = [{ wch: 32 }, { wch: 16 }, { wch: 28 }, ...years.map(() => ({ wch: 16 })), { wch: 18 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: headers.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, "Top Bidders 5-Year");

  const catPart = category ? category.replace(/[\\/:*?"<>|]/g, "").trim() : "All Categories";
  XLSX.writeFile(wb, `Top Bidders 5-Year Bid Value (${catPart}).xlsx`);
}
