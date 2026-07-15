import { useEffect, useState } from "react";
import { STORE_OPTIONS } from "../mockData";
import SearchBar from "./SearchBar";

function StoreDropdown({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 bg-white border-2 border-white rounded-xl pl-3.5 pr-2.5 py-2 shrink-0">
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

export default function Topbar({ title, store, onStoreChange, searchPool }) {
  const [minutesAgo, setMinutesAgo] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setMinutesAgo((m) => m + 1), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 bg-brandOrange px-8 md:px-10 py-5 w-full">
      <div className="shrink-0">
        <div className="font-head uppercase text-[34px] leading-none tracking-wide text-white">
          HMR Auctions Live Pulse
        </div>
        <h1 className="text-[12px] uppercase tracking-[0.14em] font-semibold text-white/80 mt-1">{title}</h1>
      </div>
      <div className="flex items-center gap-3 flex-1 justify-end flex-wrap">
        <SearchBar pool={searchPool} />
        <StoreDropdown value={store} onChange={onStoreChange} />
        <div className="flex items-center gap-2 text-[12.5px] text-white/90 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-white pulse-dot" />
          {minutesAgo === 0 ? "Updated just now" : `Updated ${minutesAgo}m ago`}
        </div>
      </div>
    </div>
  );
}
