import { useEffect } from "react";

// Generic placeholder for a not-yet-built module (currently HRH Online).
// No mock KPIs, no fake data — just a "not built yet" state and a way back.
export default function ComingSoonPage({ title, description }) {
  useEffect(() => {
    document.title = `${title} · HMR Analytics`;
  }, [title]);

  return (
    <div className="min-h-screen flex items-center" style={{ background: "#0f1622" }}>
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <div
          className="text-[12.5px] tracking-[0.14em] uppercase font-semibold mb-3"
          style={{ color: "#7e93c2" }}
        >
          HMR Analytics
        </div>
        <h1 className="text-[26px] font-bold mb-3" style={{ color: "#f2f4f7" }}>
          {title}
        </h1>
        <p className="text-[14.5px] leading-relaxed mb-2" style={{ color: "#a3adba" }}>
          {description}
        </p>
        <span
          className="inline-block text-[11px] tracking-[0.06em] uppercase font-semibold px-2 py-1 rounded-full mt-4 mb-10"
          style={{ background: "#eef0f4", color: "#5b6573" }}
        >
          Coming Soon
        </span>

        <div>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold px-3.5 py-2 rounded-lg transition-opacity hover:opacity-90"
            style={{ background: "#d99a3d", color: "#ffffff" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            HMR Analytics Home
          </a>
        </div>
      </div>
    </div>
  );
}
