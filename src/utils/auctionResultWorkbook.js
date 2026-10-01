import XLSX from "xlsx-js-style";

// Auction Result Excel workbook (Sales Summary / Top Info / Detailed) —
// shared by the dashboard's Export button (src/utils/auctionResultExport.js,
// browser download) and the automated auction-result email
// (api/_auction-result-email.js, server-side attachment), so the emailed
// file is always byte-for-byte the same layout as the dashboard export.
// Kept free of jsPDF/browser-only imports so it also loads in Node.

// Dashboard's own navy/orange tokens (src/theme.css light values) — used
// lightly for export headers only, per the task's "do not overdesign it"
// instruction. Not theme-aware (exported files have no dark mode).
export const NAVY_HEX = "22304F";

export function endDateOnly(value) {
  // end_date/dr_received are UTC-typed ClickHouse columns (see
  // api/overview.js's own comment on end_date) — the raw
  // "YYYY-MM-DD HH:MM:SS.mmm" string's first 10 characters ARE the exact
  // calendar day already used for grouping/filtering, so no timezone math
  // belongs here, just truncation.
  return value ? String(value).slice(0, 10) : "—";
}

export function dash(value) {
  return value && String(value).trim() ? value : "—";
}

export function numOrBlank(value) {
  return value == null ? "" : value;
}

// Single date when From=To (the default, single-day case), a range
// otherwise — keeps the old single-day filename shape unchanged when
// nothing multi-day was selected.
export function exportDateSuffix(filters) {
  return filters.from === filters.to ? filters.from : `${filters.from}_to_${filters.to}`;
}

// XLSX filename: "<Vendor> Auction Summary(<end_date>).xlsx" when a
// Vendor filter is active, "All Vendors Auction Summary(<end_date>).xlsx"
// otherwise — strips characters Windows/macOS both reject in filenames
// (\ / : * ? " < > |), since a real vendor name is free-text and could
// contain any of them.
export function sanitizeForFilename(value) {
  return value.replace(/[\\/:*?"<>|]/g, "").trim();
}

export function excelFileName(filters) {
  const vendorPart = sanitizeForFilename(filters.vendor || "All Vendors");
  return `${vendorPart} Auction Summary(${exportDateSuffix(filters)}).xlsx`;
}

// Detailed export's 20 business-label columns, in the exact requested
// sequence — [label, cell value getter]. BP %/SF % pass through as-is
// (buyers_premium/commission are stored as plain percentage numbers
// already, e.g. 15/17/18 — NEVER multiplied by 100 here; see
// api/overview.js's own comment on this).
//
// PO Number: NO source field for this exists on xv3.mart_auction_vendor_
// analysis (verified against the table's full column list) — receiving_
// number/dr_number/or_number/client_reference_number are each a distinct,
// already-mapped concept, none proven equivalent to a Purchase Order
// number. Rendered as "—" (the same convention as every other missing
// value in this sheet) rather than silently substituting a wrong field;
// flagged as a real source gap, not fabricated.
//
// Receiving Number/DR PIS/Account Executive: dropped from this sheet per
// the requested column sequence (which excludes them) — still returned
// by the type=auction-result-export API response itself (untouched;
// nothing else reads this file's column list) in case another feature
// needs them later.
export const DETAILED_COLUMNS = [
  ["Branch", (r) => dash(r.branch)],
  ["Vendor", (r) => dash(r.vendor)],
  ["Origin", (r) => dash(r.origin)],
  ["DR Number", (r) => dash(r.dr_number)],
  ["DR Received", (r) => endDateOnly(r.dr_received)],
  ["PO Number", () => "—"],
  ["Client Ref No", (r) => dash(r.client_reference_number)],
  ["Item Barcode", (r) => dash(r.item_barcode)],
  ["Qty", (r) => numOrBlank(r.qty)],
  ["Item Status", (r) => dash(r.item_status)],
  ["Auction Number", (r) => dash(r.auction_number)],
  ["End Date", (r) => endDateOnly(r.end_date)],
  ["Lot Number", (r) => dash(r.lot_number)],
  ["Description", (r) => dash(r.description)],
  ["Reserved Price", (r) => r.reserved_price ?? 0],
  ["Bid Amount", (r) => r.bid_amount ?? 0],
  ["BP %", (r) => numOrBlank(r.bp_percent)],
  ["SF %", (r) => numOrBlank(r.sf_percent)],
  ["Payment Status", (r) => dash(r.payment_status)],
  ["For Approval Status", (r) => dash(r.for_approval_status)],
];
export const QTY_COL = 8;
export const RESERVED_COL = 14;
export const BID_COL = 15;
export const BP_COL = 16;
export const SF_COL = 17;
export const DESCRIPTION_COL = 13;
export const DETAILED_COL_COUNT = DETAILED_COLUMNS.length;

// ============================================================
// EXCEL — xlsx-js-style (SheetJS fork with cell style support).
// Three sheets: "Auction Result Summary" (the Sales Summary table itself
// — no separate filter/metadata or standalone-totals block above it; the
// table's own total row already carries those totals), "Top Info", and
// "Detailed Auction Result" (the full item-barcode-grain export — see
// api/overview.js's type=auction-result-export). Sheets 1-2 are built
// from the already-loaded on-screen data; Sheet 3's `detailed` argument
// is only ever populated by an on-demand fetch triggered by the Export
// click itself (see useAuctionResult.js's fetchAuctionResultExportData)
// — never fetched on normal page load.
// ============================================================
export function buildAuctionResultWorkbook({ totals, rows, topInfo, detailed }) {
  const wb = XLSX.utils.book_new();

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: NAVY_HEX } },
  };
  const labelStyle = { font: { bold: true } };

  // --- Sheet 1: Auction Result Summary ---
  // No filter/metadata block or standalone Total Lots/Reserved Price/Bid
  // Amount lines above the table (per task) — the sheet opens directly
  // with the Sales Summary header row; its own total row below still
  // carries the same totals.
  const aoa = [];
  const headerRow = aoa.length;
  aoa.push(["Payment Status", "For Approval Status", "Count of Lot", "Reserved Price", "Bid Amount"]);
  const dataStartRow = aoa.length;
  rows.forEach((r) => aoa.push([r.payment_status, r.for_approval_status, r.count_of_lot, r.reserved_price, r.bid_amount]));
  const totalRowIdx = aoa.length;
  aoa.push(["Total (distinct lots)", "", totals.count_of_lot, totals.reserved_price, totals.bid_amount]);

  const ws1 = XLSX.utils.aoa_to_sheet(aoa);

  const setStyle = (ws, r, c, style) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (ws[addr]) ws[addr].s = { ...ws[addr].s, ...style };
  };
  const setFormat = (ws, r, c, fmt) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (ws[addr]) ws[addr].z = fmt;
  };

  for (let c = 0; c < 5; c++) setStyle(ws1, headerRow, c, headerStyle);

  for (let i = 0; i < rows.length; i++) {
    const r = dataStartRow + i;
    setFormat(ws1, r, 2, "#,##0");
    setFormat(ws1, r, 3, '"₱"#,##0.00');
    setFormat(ws1, r, 4, '"₱"#,##0.00');
  }
  setStyle(ws1, totalRowIdx, 0, labelStyle);
  setFormat(ws1, totalRowIdx, 2, "#,##0");
  setFormat(ws1, totalRowIdx, 3, '"₱"#,##0.00');
  setFormat(ws1, totalRowIdx, 4, '"₱"#,##0.00');
  for (let c = 0; c < 5; c++) setStyle(ws1, totalRowIdx, c, { font: { bold: true } });

  ws1["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Auction Result Summary");

  // --- Sheet 2: Top Info ---
  const topInfoAoa = [
    ["Vendor", "Account Executive", "Branch", "Auction Number", "End Date"],
    ...topInfo.map((t) => [dash(t.vendor), dash(t.account_executive), dash(t.branch), dash(t.auction_number), endDateOnly(t.end_date)]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(topInfoAoa);
  for (let c = 0; c < 5; c++) setStyle(ws2, 0, c, headerStyle);
  ws2["!cols"] = [{ wch: 32 }, { wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Top Info");

  // --- Sheet 3: Detailed Auction Result ---
  // No title row or standalone Total Bid Amount/Total Reserved Price
  // block above the table (per task) — the sheet opens directly with the
  // detailed header row, except for the truncation warning (kept when
  // present — a data-completeness notice, not a decorative summary total).
  if (detailed) {
    const aoa3 = [];
    if (detailed.truncated) aoa3.push([detailed.truncationNote]);
    const headerRow3 = aoa3.length;
    aoa3.push(DETAILED_COLUMNS.map(([label]) => label));
    const dataStartRow3 = aoa3.length;
    detailed.rows.forEach((r) => aoa3.push(DETAILED_COLUMNS.map(([, get]) => get(r))));

    const ws3 = XLSX.utils.aoa_to_sheet(aoa3);

    if (detailed.truncated) setStyle(ws3, 0, 0, { font: { italic: true, color: { rgb: "B00020" } } });

    for (let c = 0; c < DETAILED_COL_COUNT; c++) setStyle(ws3, headerRow3, c, headerStyle);

    for (let i = 0; i < detailed.rows.length; i++) {
      const r = dataStartRow3 + i;
      setFormat(ws3, r, QTY_COL, "#,##0");
      setFormat(ws3, r, BP_COL, '0.00"%"');
      setFormat(ws3, r, SF_COL, '0.00"%"');
      setFormat(ws3, r, BID_COL, '"₱"#,##0.00');
      setFormat(ws3, r, RESERVED_COL, '"₱"#,##0.00');
    }

    ws3["!cols"] = DETAILED_COLUMNS.map(([label], i) => ({ wch: i === DESCRIPTION_COL ? 44 : Math.max(14, label.length + 2) }));
    ws3["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: headerRow3, c: 0 }, e: { r: dataStartRow3 + detailed.rows.length - 1, c: DETAILED_COL_COUNT - 1 } }),
    };

    XLSX.utils.book_append_sheet(wb, ws3, "Detailed Auction Result");
  }

  return wb;
}
