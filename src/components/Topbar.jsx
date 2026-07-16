import { STORE_OPTIONS } from "../mockData";
import SearchBar from "./SearchBar";

function StoreDropdown({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 bg-white rounded-xl px-5 h-11 shadow-card shrink-0">
      <span className="text-[11px] tracking-[0.08em] uppercase text-brandOrange font-bold">Store</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-[14px] font-semibold text-series1 bg-transparent outline-none cursor-pointer"
      >
        {STORE_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Topbar({ store, onStoreChange, searchPool, onCtaClick }) {
  return (
    <div className="flex items-center gap-6 bg-brandOrange px-8 md:px-10 py-6 w-full">
      <div className="font-head uppercase text-[64px] leading-[0.95] tracking-wide text-white shrink-0 pr-8">
        <div>HMR Auctions</div>
        <div>Live Pulse</div>
      </div>

      <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
        <SearchBar pool={searchPool} />
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={onCtaClick}
            className="pulse-ring flex items-center gap-2 bg-white text-brandOrange font-bold uppercase tracking-[0.03em] text-[13.5px] px-5 h-11 rounded-xl shadow-card hover:bg-white/90 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-brandOrange pulse-dot" />
            Click Upcoming Auction Event Now!
          </button>
          <StoreDropdown value={store} onChange={onStoreChange} />
        </div>
      </div>
    </div>
  );
}
