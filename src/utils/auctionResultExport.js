import XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatPeso } from "./format";

// Dashboard's own navy/orange tokens (src/theme.css light values) — used
// lightly for export headers only, per the task's "do not overdesign it"
// instruction. Not theme-aware (exported files have no dark mode).
const NAVY_HEX = "22304F";
const NAVY_RGB = [0x22, 0x30, 0x4f];

function endDateOnly(value) {
  // end_date is a UTC-typed ClickHouse column (see api/overview.js's own
  // comment on this) — the raw "YYYY-MM-DD HH:MM:SS.mmm" string's first 10
  // characters ARE the exact calendar day already used for grouping and
  // filtering, so no timezone math belongs here.
  return value ? String(value).slice(0, 10) : "—";
}

function dash(value) {
  return value && String(value).trim() ? value : "—";
}

function buildFilterLines(filters, filterLabels) {
  return [
    ["End Date", filters.endDate],
    ["Branch", filterLabels.branch],
    ["Vendor", filterLabels.vendor],
    ["Auction Number", filterLabels.auctionNumber],
    ["Status", filterLabels.status],
    ["BDM", filterLabels.bdm],
  ];
}

// ============================================================
// EXCEL — xlsx-js-style (SheetJS fork with cell style support).
// Two sheets: "Auction Result Summary" (filter context + totals + Sales
// Summary table) and "Top Info". Built from the SAME already-loaded
// rows/totals/top_info the page renders — no refetch.
// ============================================================
export function exportAuctionResultExcel({ filters, filterLabels, totals, rows, topInfo }) {
  const wb = XLSX.utils.book_new();

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: NAVY_HEX } },
  };
  const titleStyle = { font: { bold: true, sz: 13 } };
  const labelStyle = { font: { bold: true } };

  // --- Sheet 1: Auction Result Summary ---
  const aoa = [];
  aoa.push(["Auction Result Summary"]);
  aoa.push([]);
  buildFilterLines(filters, filterLabels).forEach(([label, value]) => aoa.push([label, value]));
  aoa.push([]);
  const totalLotsRow = aoa.length;
  aoa.push(["Total Lots", totals.count_of_lot]);
  const totalReservedRow = aoa.length;
  aoa.push(["Total Reserved Price", totals.reserved_price]);
  const totalBidRow = aoa.length;
  aoa.push(["Total Bid Amount", totals.bid_amount]);
  aoa.push([]);
  const headerRow = aoa.length;
  aoa.push(["Payment Status", "For Approval Status", "Count of Lot", "Reserved Price", "Bid Amount"]);
  const dataStartRow = aoa.length;
  rows.forEach((r) => aoa.push([r.payment_status, r.for_approval_status, r.count_of_lot, r.reserved_price, r.bid_amount]));
  const totalRowIdx = aoa.length;
  aoa.push(["Total (distinct lots)", "", totals.count_of_lot, totals.reserved_price, totals.bid_amount]);

  const ws1 = XLSX.utils.aoa_to_sheet(aoa);

  const setStyle = (r, c, style) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (ws1[addr]) ws1[addr].s = { ...ws1[addr].s, ...style };
  };
  const setFormat = (r, c, fmt) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (ws1[addr]) ws1[addr].z = fmt;
  };

  setStyle(0, 0, titleStyle);
  buildFilterLines(filters, filterLabels).forEach((_, i) => setStyle(2 + i, 0, labelStyle));
  setStyle(totalLotsRow, 0, labelStyle);
  setStyle(totalReservedRow, 0, labelStyle);
  setStyle(totalBidRow, 0, labelStyle);
  setFormat(totalLotsRow, 1, "#,##0");
  setFormat(totalReservedRow, 1, '"₱"#,##0.00');
  setFormat(totalBidRow, 1, '"₱"#,##0.00');

  for (let c = 0; c < 5; c++) setStyle(headerRow, c, headerStyle);

  for (let i = 0; i < rows.length; i++) {
    const r = dataStartRow + i;
    setFormat(r, 2, "#,##0");
    setFormat(r, 3, '"₱"#,##0.00');
    setFormat(r, 4, '"₱"#,##0.00');
  }
  setStyle(totalRowIdx, 0, labelStyle);
  setFormat(totalRowIdx, 2, "#,##0");
  setFormat(totalRowIdx, 3, '"₱"#,##0.00');
  setFormat(totalRowIdx, 4, '"₱"#,##0.00');
  for (let c = 0; c < 5; c++) setStyle(totalRowIdx, c, { font: { bold: true } });

  ws1["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Auction Result Summary");

  // --- Sheet 2: Top Info ---
  const topInfoAoa = [
    ["Vendor", "Account Executive", "Branch", "Auction Number", "End Date"],
    ...topInfo.map((t) => [dash(t.vendor), dash(t.account_executive), dash(t.branch), dash(t.auction_number), endDateOnly(t.end_date)]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(topInfoAoa);
  for (let c = 0; c < 5; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws2[addr]) ws2[addr].s = headerStyle;
  }
  ws2["!cols"] = [{ wch: 32 }, { wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Top Info");

  XLSX.writeFile(wb, `Auction_Result_${filters.endDate}.xlsx`);
}

// ============================================================
// PDF — jsPDF + jspdf-autotable. Compact report (filters, summary, Top
// Info table, Sales Summary table), landscape so the 5-column tables with
// long Vendor/Branch text stay readable. Built from the same already-
// loaded data as the page and the Excel export above.
// ============================================================
export function exportAuctionResultPdf({ filters, filterLabels, totals, rows, topInfo }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const marginLeft = 40;
  let y = 44;

  doc.setFont(undefined, "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY_RGB);
  doc.text("AUCTION RESULT", marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 22;

  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("Selected Filters", marginLeft, y);
  y += 14;
  doc.setFont(undefined, "normal");
  buildFilterLines(filters, filterLabels).forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, marginLeft, y);
    y += 13;
  });

  y += 6;
  doc.setFont(undefined, "bold");
  doc.text("Summary", marginLeft, y);
  y += 14;
  doc.setFont(undefined, "normal");
  [
    `Total Lots: ${totals.count_of_lot.toLocaleString()}`,
    `Total Reserved Price: ${formatPeso(totals.reserved_price)}`,
    `Total Bid Amount: ${formatPeso(totals.bid_amount)}`,
  ].forEach((line) => {
    doc.text(line, marginLeft, y);
    y += 13;
  });

  y += 8;
  doc.setFont(undefined, "bold");
  doc.text("Top Info", marginLeft, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: marginLeft, right: marginLeft },
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: "bold" },
    head: [["Vendor", "Account Executive", "Branch", "Auction Number", "End Date"]],
    body: topInfo.map((t) => [dash(t.vendor), dash(t.account_executive), dash(t.branch), dash(t.auction_number), endDateOnly(t.end_date)]),
  });

  let y2 = doc.lastAutoTable.finalY + 22;
  doc.setFont(undefined, "bold");
  doc.setFontSize(10);
  doc.text("Sales Summary", marginLeft, y2);
  y2 += 4;

  autoTable(doc, {
    startY: y2,
    margin: { left: marginLeft, right: marginLeft },
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: "bold" },
    head: [["Payment Status", "For Approval Status", "Count of Lot", "Reserved Price", "Bid Amount"]],
    body: rows.map((r) => [r.payment_status, r.for_approval_status, r.count_of_lot.toLocaleString(), formatPeso(r.reserved_price), formatPeso(r.bid_amount)]),
    foot: [["Total (distinct lots)", "", totals.count_of_lot.toLocaleString(), formatPeso(totals.reserved_price), formatPeso(totals.bid_amount)]],
    footStyles: { fillColor: [230, 230, 235], textColor: NAVY_RGB, fontStyle: "bold" },
  });

  doc.save(`Auction_Result_${filters.endDate}.pdf`);
}
