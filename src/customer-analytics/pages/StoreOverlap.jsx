import { useEffect, useMemo, useState } from "react";
import Panel from "../../retail/components/Panel";
import DataTable from "../../retail/components/DataTable";
import ToggleSm from "../../retail/components/ToggleSm";
import { LoadingState, ErrorState } from "../../retail/components/States";
import { retail } from "../../retail/theme";
import { formatNum, formatPct } from "../../retail/format";
import { fetchCa } from "../api";

const MATRIX_SIZE = 14;

// Which stores share customers — api/_customer-analytics.js handleCaOverlap.
// Pick a focus store for a ranked list, or scan the matrix; every number
// opens the Customer Explorer pre-filtered to "bought at both".
export default function StoreOverlap({ openExplorer }) {
  const [windowKey, setWindowKey] = useState("all");
  const [focus, setFocus] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchCa("caOverlap", { window: windowKey }, controller.signal)
      .then(setData)
      .catch((err) => err.name !== "AbortError" && setError(err.message))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [windowKey]);

  const shared = useMemo(() => {
    const m = new Map();
    for (const p of data?.pairs || []) m.set(`${p.a}|${p.b}`, p.shared);
    return m;
  }, [data]);

  const storeList = data?.stores || [];
  const focusStore = storeList.some((s) => s.store === focus) ? focus : storeList[0]?.store || "";
  const focusSize = storeList.find((s) => s.store === focusStore)?.customers || 0;
  const focusRows = storeList
    .filter((s) => s.store !== focusStore)
    .map((s) => {
      const n = shared.get(`${focusStore}|${s.store}`) || 0;
      return { id: s.store, store: s.store, shared: n, pctOfFocus: focusSize ? (n / focusSize) * 100 : 0, pctOfOther: s.customers ? (n / s.customers) * 100 : 0 };
    })
    .filter((r) => r.shared > 0)
    .sort((a, b) => b.shared - a.shared);

  const maxFocusPct = Math.max(1, ...focusRows.map((r) => r.pctOfFocus));

  const matrixStores = storeList.slice(0, MATRIX_SIZE);
  const maxPct = Math.max(
    1,
    ...matrixStores.flatMap((a) => matrixStores.filter((b) => b.store !== a.store).map((b) => ((shared.get(`${a.store}|${b.store}`) || 0) / a.customers) * 100))
  );

  const openPair = (a, b) => openExplorer({ stores: [a, b], match: "all", scope: "all" });
  const windowLabel = windowKey === "12m" ? "last 12 months" : "all time";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Store Overlap
        </div>
        <ToggleSm
          value={windowKey}
          onChange={setWindowKey}
          options={[
            { key: "all", label: "All time" },
            { key: "12m", label: "Last 12 months" },
          ]}
        />
      </div>

      {loading && !data && <LoadingState label="Loading store overlap…" />}
      {error && <ErrorState label={`Couldn't load store overlap: ${error}`} />}

      {data && !error && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }}>
          <Panel
            title="Shared Customers for One Store"
            subtitle={`Registered customers of the focus store who also bought at each other store (${windowLabel}). Click a row to see them.`}
            action={
              <select
                value={focusStore}
                onChange={(e) => setFocus(e.target.value)}
                className="text-[13px] font-semibold px-3 h-10 rounded-xl outline-none"
                style={{ background: retail.bg, color: retail.ink2, border: `1px solid ${retail.border}` }}
              >
                {storeList.map((s) => (
                  <option key={s.store} value={s.store}>
                    {s.store} ({formatNum(s.customers)})
                  </option>
                ))}
              </select>
            }
            className="mb-4"
          >
            <DataTable
              columns={[
                { key: "store", label: "Also Bought At" },
                { key: "shared", label: "Shared Customers", render: (r) => formatNum(r.shared) },
                {
                  key: "pctOfFocus",
                  label: `% of ${focusStore}`,
                  render: (r) => (
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="h-2 rounded-full shrink-0" style={{ width: Math.max(3, (r.pctOfFocus / maxFocusPct) * 90), background: retail.blue }} />
                      {formatPct(r.pctOfFocus)}
                    </div>
                  ),
                },
                { key: "pctOfOther", label: "% of That Store", render: (r) => formatPct(r.pctOfOther) },
              ]}
              rows={focusRows}
              paginate
              pageSize={12}
              onRowClick={(r) => openPair(focusStore, r.store)}
              emptyLabel="No shared customers."
            />
          </Panel>

          <Panel
            title="Overlap Matrix"
            subtitle={`Top ${matrixStores.length} stores by customers (${windowLabel}). Each cell = customers of the ROW store who also bought at the COLUMN store; shading = % of the row store. Click a cell to open that list.`}
          >
            <div className="overflow-x-auto">
              <table className="text-[11.5px] border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10" style={{ background: retail.surface }} />
                    {matrixStores.map((s) => (
                      <th key={s.store} className="px-1 pb-2 align-bottom font-semibold" style={{ color: retail.muted, minWidth: 64 }}>
                        <div className="leading-tight break-words">{s.store}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixStores.map((a) => (
                    <tr key={a.store}>
                      <th className="sticky left-0 z-10 text-left pr-2 py-1 font-semibold whitespace-nowrap" style={{ background: retail.surface, color: retail.ink }}>
                        {a.store} <span style={{ color: retail.muted, fontWeight: 400 }}>{formatNum(a.customers)}</span>
                      </th>
                      {matrixStores.map((b) => {
                        if (a.store === b.store) return <td key={b.store} className="text-center" style={{ background: retail.bg, color: retail.muted }}>—</td>;
                        const n = shared.get(`${a.store}|${b.store}`) || 0;
                        const pct = a.customers ? (n / a.customers) * 100 : 0;
                        const alpha = Math.min(1, pct / maxPct);
                        return (
                          <td
                            key={b.store}
                            onClick={() => n && openPair(a.store, b.store)}
                            title={`${formatNum(n)} of ${a.store}'s ${formatNum(a.customers)} customers also bought at ${b.store} (${formatPct(pct)})`}
                            className="text-center px-1 py-1.5 tabular-nums"
                            style={{
                              background: `rgba(59,130,246,${(0.06 + alpha * 0.8).toFixed(3)})`,
                              color: alpha > 0.55 ? "#fff" : retail.ink,
                              cursor: n ? "pointer" : undefined,
                              border: "1px solid #fff",
                            }}
                          >
                            {formatNum(n)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
