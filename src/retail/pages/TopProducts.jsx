import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import SubTabNav from "../components/SubTabNav";
import ProductVelocityAnalysis from "../components/ProductVelocityAnalysis";
import { LoadingState, ErrorState } from "../components/States";
import { retail } from "../theme";
import { formatPeso, formatNum, formatPct } from "../format";

const SUBVIEW_TABS = [
  { key: "item", label: "Item" },
  { key: "category", label: "Category" },
];

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}

function fmtQty(v, q) {
  return `${formatPeso(v)} (${formatNum(q)})`;
}
function StockPill({ status, detail }) {
  const isStock = status === "HAS_STOCK";
  return (
    <span
      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: isStock ? "#fdf6e3" : "#faeaea", color: isStock ? "#8a6d1a" : retail.bad }}
      title={detail}
    >
      {isStock ? "🟡 Has stock" : "🔴 Sold out"}
    </span>
  );
}

const REPEAT_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 260 },
  { key: "department", label: "Department" },
  { key: "w1", label: "Wk1", render: (r) => fmtQty(r.weeks[0].revenue, r.weeks[0].qty) },
  { key: "w2", label: "Wk2", render: (r) => fmtQty(r.weeks[1].revenue, r.weeks[1].qty) },
  { key: "w3", label: "Wk3", render: (r) => fmtQty(r.weeks[2].revenue, r.weeks[2].qty) },
  { key: "w4", label: "Wk4", render: (r) => fmtQty(r.weeks[3].revenue, r.weeks[3].qty) },
  { key: "stock", label: "Stock", render: (r) => <StockPill status={r.stockStatus} detail={r.stockDetail} /> },
];

const TOPMOVERS_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 260 },
  { key: "department", label: "Department" },
  { key: "tw", label: "This Week", render: (r) => fmtQty(r.tw, r.twq) },
  { key: "lw", label: "Last Week", render: (r) => fmtQty(r.lw, r.lwq) },
  { key: "note", label: "Note", render: (r) => (r.isNew ? "🆕 New appearance" : "🔁 Repeat seller") },
  { key: "stock", label: "Stock", render: (r) => <StockPill status={r.stockStatus} detail={r.stockDetail} /> },
];

const DROPPED_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 260 },
  { key: "department", label: "Department" },
  { key: "lw", label: "Last Week Sales", render: (r) => fmtQty(r.lw, r.lwq) },
  { key: "stock", label: "Status", render: (r) => <StockPill status={r.stockStatus} detail={r.stockDetail} /> },
];

const CATEGORY_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "gmv", label: "Sales", render: (r) => formatPeso(r.gmv) },
  { key: "sharePct", label: "% of Total", render: (r) => formatPct(r.sharePct, 2) },
];

const CATEGORY_ITEM_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 280 },
  { key: "sales", label: "Sales", render: (r) => formatPeso(r.sales) },
  { key: "qty", label: "Qty", render: (r) => formatNum(r.qty) },
  { key: "stores", label: "Store(s)" },
];

// Real ClickHouse-backed Top Products — see api/_retail-top-products.js
// (dispatched via ?report=topProducts). Item subview (Repeat Sellers/Top
// Movers/Dropped) always compares This Week vs Last Week — there's no MTD
// equivalent for a week-over-week product list. Stock status comes from
// xv3.mart_level_of_inventory. Note: the Item subview scans a genuinely
// large window (4 weeks x up to 12 stores) and can take 15-25s to load —
// this is a real data-volume constraint, not a stuck request.
export default function TopProducts({ filters }) {
  const { segment, dateRange, store } = filters;
  const [subview, setSubview] = useState("item");
  const [itemData, setItemData] = useState(null);
  const [categoryData, setCategoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drilldownCategory, setDrilldownCategory] = useState(null);

  const loadItem = useCallback(async (seg, st, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, ...(st ? { store: st } : {}), subview: "item", report: "topProducts" });
      const res = await fetch(`/api/retail-analytics?${qs.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setItemData(json);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategory = useCallback(async (seg, dr, st, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, ...dateRangeParams(dr), ...(st ? { store: st } : {}), subview: "category", report: "topProducts" });
      const res = await fetch(`/api/retail-analytics?${qs.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setCategoryData(json);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (subview === "item") loadItem(segment, store, controller.signal);
    else loadCategory(segment, dateRange, store, controller.signal);
    return () => controller.abort();
  }, [segment, dateRange, store, subview, loadItem, loadCategory]);

  const drilldownItems = drilldownCategory ? categoryData?.itemsByCategory?.[drilldownCategory] || [] : [];

  return (
    <div>

      <ProductVelocityAnalysis filters={filters} />

      <SubTabNav tabs={SUBVIEW_TABS} value={subview} onChange={setSubview} />
      <div className="mt-4">
        {error && <ErrorState label={`Couldn't load Top Products: ${error}`} />}

        {subview === "item" && (
          <>
            {loading && !itemData && <LoadingState label="Loading Top Products (this can take 15-25s)…" />}
            {itemData && !error && (
              <>
                <Panel title="1. Repeat Sellers — Sold in All 4 of the Last 4 Weeks (Top 10)" className="mb-4">
                  <DataTable columns={REPEAT_COLUMNS} rows={itemData.repeatSellers} emptyLabel="No products sold in all 4 of the last 4 weeks." />
                </Panel>
                <Panel title="2. Top Products This Week vs Last Week (Top 10)" className="mb-4">
                  <DataTable columns={TOPMOVERS_COLUMNS} rows={itemData.topMovers} emptyLabel="No sales this week." />
                </Panel>
                <Panel title="3. Sold Last Week, NOT Selling This Week" className="mb-4">
                  <DataTable columns={DROPPED_COLUMNS} rows={itemData.dropped} emptyLabel="Nothing dropped off from last week." />
                </Panel>
                {itemData.dataQuality?.length > 0 && (
                  <Panel title="Data Quality Notes">
                    <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: retail.ink2 }}>
                      {itemData.dataQuality.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </>
            )}
          </>
        )}

        {subview === "category" && (
          <>
            {loading && !categoryData && <LoadingState label="Loading Top Categories…" />}
            {categoryData && !error && (
              <>
                <Panel title="Top Categories" subtitle="Click a row for its top 5 items" className="mb-4">
                  <DataTable columns={CATEGORY_COLUMNS} rows={categoryData.categories} onRowClick={(r) => setDrilldownCategory(r.category)} paginate pageSize={12} emptyLabel="No sales in this period." />
                </Panel>
                {categoryData.dataQuality?.length > 0 && (
                  <Panel title="Data Quality Notes">
                    <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: retail.ink2 }}>
                      {categoryData.dataQuality.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </>
            )}
          </>
        )}
      </div>

      <Modal open={Boolean(drilldownCategory)} onClose={() => setDrilldownCategory(null)} title={drilldownCategory || ""} subtitle="Top 5 items in this category">
        <DataTable columns={CATEGORY_ITEM_COLUMNS} rows={drilldownItems} emptyLabel="No item detail for this category." />
      </Modal>
    </div>
  );
}
