import XLSX from "xlsx-js-style";

// Excel exports for HRH Online Product Analytics' three tables (Repeat
// Sellers, Top Products, Dropped Products). Same navy header styling as
// every other Excel export this dashboard produces (see
// searchKeywordsExport.js). Each export is the table's full row set in its
// on-screen order and grouping, not just the visible page — with sales and
// units in their own numeric columns (the page folds them into one cell).
const NAVY_HEX = "22304F";
const PESO_FORMAT = "#,##0.00";
const INT_FORMAT = "#,##0";

const IDENTITY_LABEL = { product: "Product", category: "Category", subcategory: "Subcategory" };
const TREND_LABEL = { up: "Increasing", down: "Declining", flat: "Steady" };

function identityHeaders(groupBy) {
  return groupBy === "product" ? ["SKU", "Product"] : ["SKUs", IDENTITY_LABEL[groupBy] || "Product"];
}

function otherStock(r) {
  return r.otherStoreStock?.length ? r.otherStoreStock.map((s) => `${s.store} ${s.qty}`).join(", ") : "";
}

// `columns`: [{ header, width, format?, value(row) }]
function writeWorkbook({ sheetName, filename, columns, rows }) {
  const aoa = [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.value(r) ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: NAVY_HEX } } };
  columns.forEach((col, c) => {
    const head = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (head) head.s = headerStyle;
    if (!col.format) return;
    for (let r = 1; r < aoa.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = col.format;
    }
  });
  ws["!cols"] = columns.map((c) => ({ wch: c.width || 14 }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: columns.length - 1 } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function identityColumns(groupBy) {
  const [skuHeader, nameHeader] = identityHeaders(groupBy);
  return [
    { header: skuHeader, width: groupBy === "product" ? 16 : 8, value: (r) => r.sku },
    { header: nameHeader, width: 45, value: (r) => r.product },
  ];
}

function stockColumns() {
  return [
    { header: "Current Stock", width: 13, format: INT_FORMAT, value: (r) => r.currentStockQty },
    { header: "Other Branch Stock", width: 40, value: otherStock },
    { header: "Stock Value (SRP)", width: 17, format: PESO_FORMAT, value: (r) => r.currentStockValue },
  ];
}

const channelPart = (channel) => (channel && channel !== "All Channels" ? ` - ${channel}` : "");
const rangePart = (period) => (period ? `${period.from} to ${period.to}` : "");

export function exportRepeatSellersExcel({ rows, groupBy, granularity, periodBuckets, channel }) {
  const prefix = granularity === "month" ? "Mo" : "Wk";
  const buckets = ["wk1", "wk2", "wk3", "wk4"].flatMap((key, i) => {
    const b = periodBuckets?.[key];
    const label = `${prefix}${i + 1}${b ? ` (${b.from} to ${b.to})` : ""}`;
    return [
      { header: `${label} Sales`, width: 26, format: PESO_FORMAT, value: (r) => r[`${key}Sales`] },
      { header: `${label} Units`, width: 26, format: INT_FORMAT, value: (r) => r[`${key}Units`] },
    ];
  });
  writeWorkbook({
    sheetName: "Repeat Sellers",
    filename: `Repeat Sellers by ${IDENTITY_LABEL[groupBy]} (last 4 ${granularity === "month" ? "months" : "weeks"})${channelPart(channel)}.xlsx`,
    columns: [...identityColumns(groupBy), ...buckets, { header: "Trend", width: 12, value: (r) => TREND_LABEL[r.trend] || "" }, ...stockColumns()],
    rows,
  });
}

export function exportTopProductsExcel({ rows, groupBy, current, previous, channel }) {
  writeWorkbook({
    sheetName: "Top Products",
    filename: `Top Products by ${IDENTITY_LABEL[groupBy]} (${rangePart(current)} vs ${rangePart(previous)})${channelPart(channel)}.xlsx`,
    columns: [
      ...identityColumns(groupBy),
      { header: "Current GMV", width: 15, format: PESO_FORMAT, value: (r) => r.currentGmv },
      { header: "Current Units", width: 13, format: INT_FORMAT, value: (r) => r.currentUnits },
      { header: "Previous GMV", width: 15, format: PESO_FORMAT, value: (r) => r.previousGmv },
      { header: "Previous Units", width: 14, format: INT_FORMAT, value: (r) => r.previousUnits },
      // Same rule as the page: no previous sales counts as +100%.
      { header: "Change (%)", width: 11, format: "0.0", value: (r) => (r.gmvChangePct === null || r.gmvChangePct === undefined ? 100 : Math.round(r.gmvChangePct * 10) / 10) },
      ...stockColumns(),
    ],
    rows,
  });
}

export function exportDroppedProductsExcel({ rows, groupBy, current, previous, channel }) {
  writeWorkbook({
    sheetName: "Dropped Products",
    filename: `Dropped Products by ${IDENTITY_LABEL[groupBy]} (sold ${rangePart(previous)}, none ${rangePart(current)})${channelPart(channel)}.xlsx`,
    columns: [
      ...identityColumns(groupBy),
      { header: "Previous-Period Sales", width: 20, format: PESO_FORMAT, value: (r) => r.previousGmv },
      { header: "Previous-Period Units", width: 20, format: INT_FORMAT, value: (r) => r.previousUnits },
      ...stockColumns(),
      { header: "Status", width: 16, value: (r) => r.status },
    ],
    rows,
  });
}
