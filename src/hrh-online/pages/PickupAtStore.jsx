import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import ShareBar from "../components/ShareBar";
import FunnelList from "../components/FunnelList";
import { BarComparisonChart } from "../components/Charts";
import { pickupAtStore } from "../mock/data";
import { formatPeso, formatPct } from "../format";

// DOMAIN RULE: Pickup is checkout/fulfillment behavior, not a payment type
// — "Payment Type within Pickup" below is a breakdown of payment methods
// used BY pickup orders, never a claim that pickup itself is a payment
// method (see the same rule enforced in SalesAnalytics.jsx).
export default function PickupAtStore() {
  const { kpis, pickupVsDelivery, paymentTypeWithinPickup, pickupByRedemptionStore, pickupByCategory, pickupLifecycle } = pickupAtStore;

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Pickup at Store
      </div>

      <KpiRow>
        <KpiCard label="Pickup Orders" value={kpis.pickupOrders.value.toLocaleString("en-PH")} delta={kpis.pickupOrders.delta} />
        <KpiCard label="Pickup GMV" value={formatPeso(kpis.pickupGmv.value)} delta={kpis.pickupGmv.delta} />
        <KpiCard label="Pickup NMV" value={formatPeso(kpis.pickupNmv.value)} delta={kpis.pickupNmv.delta} />
        <KpiCard label="Pickup Share" value={formatPct(kpis.pickupShare.value)} delta={kpis.pickupShare.delta} />
        <KpiCard label="Pickup AOV" value={formatPeso(kpis.pickupAov.value)} delta={kpis.pickupAov.delta} />
      </KpiRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Panel title="Pickup vs Delivery">
          <ShareBar segments={pickupVsDelivery} />
        </Panel>
        <Panel title="Payment Type within Pickup">
          <ShareBar segments={paymentTypeWithinPickup} />
          <p className="text-[11px] mt-2.5" style={{ color: "#94a0ae" }}>
            Payment method used by pickup orders — pickup itself is a fulfillment choice, not a payment type.
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Panel title="Pickup by Redemption Store">
          <BarComparisonChart data={pickupByRedemptionStore} series={[{ key: "value", name: "Pickup GMV" }]} />
        </Panel>
        <Panel title="Pickup by Category">
          <ShareBar segments={pickupByCategory} />
        </Panel>
      </div>

      <Panel title="Pickup Lifecycle">
        <FunnelList stages={pickupLifecycle} />
      </Panel>
    </div>
  );
}
