import XLSX from "xlsx-js-style";

// Same navy header styling as auctionResultExport.js (src/theme.css light
// values) — kept consistent across every Excel export this dashboard
// produces.
const NAVY_HEX = "22304F";

function dash(value) {
  return value && String(value).trim() ? value : "—";
}

// Vendor Analytics' "All Vendors" table export — one sheet, columns match
// what's on screen (see VendorAnalyticsView.jsx's VENDOR_EXPORT_COLUMNS)
// plus Account Executive/Phone/Email, which the on-screen table doesn't
// have room to show per explicit request. Bid Value is exported as a plain
// number (not the on-screen absolute-value-2dp string) with a real Excel
// number format applied instead, so it stays sortable/summable in Excel.
export function exportVendorAnalyticsExcel({ rangeLabel, rows }) {
  const wb = XLSX.utils.book_new();
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: NAVY_HEX } } };

  const headers = [
    "Vendor",
    "Account Executive",
    "Phone",
    "Email",
    "Bid Value",
    "Lots Listed",
    "Lots Sold",
    "Sell-Through %",
    "Service Income",
    "Branches",
  ];
  const aoa = [headers];
  rows.forEach((v) => {
    const sellThroughPct = v.lots_listed > 0 ? (v.lots_sold / v.lots_listed) * 100 : null;
    const serviceIncome = (v.buyers_premium_income || 0) + (v.commission_income || 0);
    aoa.push([
      dash(v.vendor),
      dash(v.account_executive),
      dash(v.phone),
      dash(v.email),
      Math.abs(v.settled_bid_amount || 0),
      v.lots_listed || 0,
      v.lots_sold || 0,
      sellThroughPct,
      serviceIncome,
      v.branches || 0,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }
  const BID_COL = 4;
  const SELLTHROUGH_COL = 7;
  const SERVICE_COL = 8;
  for (let r = 1; r < aoa.length; r++) {
    const bidAddr = XLSX.utils.encode_cell({ r, c: BID_COL });
    if (ws[bidAddr]) ws[bidAddr].z = '"₱"#,##0.00';
    const stAddr = XLSX.utils.encode_cell({ r, c: SELLTHROUGH_COL });
    if (ws[stAddr] && aoa[r][SELLTHROUGH_COL] != null) ws[stAddr].z = '0.0"%"';
    const svcAddr = XLSX.utils.encode_cell({ r, c: SERVICE_COL });
    if (ws[svcAddr]) ws[svcAddr].z = '"₱"#,##0.00';
  }
  ws["!cols"] = [
    { wch: 32 },
    { wch: 22 },
    { wch: 16 },
    { wch: 28 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
  ];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: headers.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, "Vendors");

  const safeRange = String(rangeLabel || "All").replace(/[\\/:*?"<>|]/g, "").trim();
  XLSX.writeFile(wb, `Vendor Analytics (${safeRange}).xlsx`);
}
