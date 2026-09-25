import { useEffect } from "react";
import ModuleCard from "../platform/ModuleCard";
import { MODULES } from "../platform/modules";
import { BRAND_BLUE, BRAND_ORANGE, BRAND_WHITE, blueA, whiteA } from "../platform/brand";
import hmrLogo from "../assets/hmr-logo.png";

// HMR Analytics portal — branded strictly in the HMR logo's three colours
// (blue / orange / white, see src/platform/brand.js).

// Hero data visualization — a programmatic analytics composition: faint
// grid, a gradient-filled area chart, a drawn/looping trend line, pulsing
// node markers, a small bar cluster and a couple of floating KPI-style
// numbers. Pure SVG/CSS, no imagery. Motion lives in index.css's ".hero-*"
// rules, all gated behind prefers-reduced-motion: no-preference.
function AnalyticsBackdrop() {
  return (
    <svg viewBox="0 0 640 320" preserveAspectRatio="xMidYMid meet" className="w-full h-full" aria-hidden="true">
      <defs>
        <pattern id="hmrHeroGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke={BRAND_WHITE} strokeWidth="1" />
        </pattern>
        <linearGradient id="hmrAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRAND_WHITE} stopOpacity="0.22" />
          <stop offset="100%" stopColor={BRAND_WHITE} stopOpacity="0" />
        </linearGradient>
      </defs>

      <g className="hero-grid-layer" style={{ opacity: 0.08 }}>
        <rect x="-40" y="-40" width="720" height="400" fill="url(#hmrHeroGrid)" />
      </g>

      {[24, 64, 104, 144, 184].map((x, i) => {
        const barHeight = 30 + ((i * 23) % 46);
        return (
          <rect
            key={x}
            x={x}
            y={272 - barHeight}
            width="20"
            height={barHeight}
            rx="3"
            fill={BRAND_WHITE}
            opacity="0.22"
            className="hero-bg-bar"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        );
      })}

      <path d="M230,220 C280,235 300,150 350,160 S430,90 470,100 S560,40 610,48 V272 H230 Z" fill="url(#hmrAreaFill)" stroke="none" />
      <path
        d="M230,220 C280,235 300,150 350,160 S430,90 470,100 S560,40 610,48"
        fill="none"
        stroke={BRAND_ORANGE}
        strokeWidth="3.5"
        strokeLinecap="round"
        className="hero-chart-line"
      />
      {[[230, 220], [350, 160], [470, 100], [610, 48]].map(([cx, cy], i) => (
        <circle key={cx} cx={cx} cy={cy} r="5.5" fill={BRAND_ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.5}s` }} />
      ))}

      <text x="470" y="78" fontSize="20" fontWeight="800" fill={BRAND_WHITE} opacity="0.9" className="hero-kpi-fade" style={{ animationDelay: "0.4s" }}>
        12.8%
      </text>
      <text x="230" y="204" fontSize="14" fontWeight="700" fill={BRAND_WHITE} opacity="0.6" className="hero-kpi-fade" style={{ animationDelay: "1.6s" }}>
        GMV ▲
      </text>
    </svg>
  );
}

function SectionHeading({ children, count }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="w-[5px] h-6 rounded-full shrink-0" style={{ background: BRAND_ORANGE }} />
      <h2 className="text-[22px] md:text-[24px] leading-none font-extrabold tracking-[-0.3px] shrink-0" style={{ color: BRAND_BLUE }}>
        {children}
      </h2>
      {count !== undefined && (
        <span className="text-[12px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: blueA(0.08), color: BRAND_BLUE }}>
          {count}
        </span>
      )}
      <span className="hidden md:block h-px flex-1" style={{ background: blueA(0.12) }} />
    </div>
  );
}

export default function HomePage() {
  useEffect(() => {
    document.title = "HMR Analytics";
  }, []);

  const available = MODULES.filter((m) => m.status === "available");
  const comingSoon = MODULES.filter((m) => m.status !== "available");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BRAND_WHITE, fontFamily: "Inter, ui-sans-serif, -apple-system, 'Segoe UI', Arial, sans-serif" }}>
      {/* Brand bar */}
      <header className="shrink-0" style={{ background: BRAND_WHITE, borderBottom: `1px solid ${blueA(0.1)}` }}>
        <div className="max-w-[1450px] mx-auto px-[5vw] h-16 flex items-center gap-3">
          <img src={hmrLogo} alt="HMR" className="w-10 h-10 rounded-lg shrink-0" />
          <div className="leading-tight">
            <div className="text-[16px] font-extrabold" style={{ color: BRAND_BLUE }}>
              HMR Analytics
            </div>
            <div className="text-[11.5px] font-medium" style={{ color: blueA(0.6) }}>
              Business Intelligence &amp; Analytics
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden shrink-0" style={{ background: BRAND_BLUE }}>
        <div className="relative max-w-[1450px] mx-auto px-[5vw] py-12 md:py-0 md:h-[340px] flex flex-col md:flex-row items-center gap-8">
          <div className="md:w-[44%] shrink-0">
            <div
              className="inline-block text-[12px] tracking-[0.18em] uppercase font-extrabold mb-4 px-3 py-1 rounded-full"
              style={{ background: BRAND_ORANGE, color: BRAND_WHITE }}
            >
              HMR
            </div>
            <h1 className="text-[46px] md:text-[62px] leading-[0.95] font-black tracking-[-1.5px] mb-4">
              <span style={{ color: BRAND_WHITE }}>HMR</span> <span style={{ color: BRAND_ORANGE }}>ANALYTICS</span>
            </h1>
            <p className="text-[17px] md:text-[19px] font-bold mb-1.5" style={{ color: BRAND_WHITE }}>
              Business Intelligence &amp; Analytics
            </p>
            <p className="text-[14px] md:text-[15px] max-w-sm" style={{ color: whiteA(0.7) }}>
              Turning data into actionable business insights.
            </p>
          </div>

          <div className="hidden sm:flex flex-1 self-stretch items-center justify-center min-w-0">
            <AnalyticsBackdrop />
          </div>
        </div>
        <div className="h-1.5" style={{ background: BRAND_ORANGE }} />
      </section>

      {/* Dashboard directory */}
      <section className="flex-1" style={{ background: BRAND_WHITE }}>
        <div className="max-w-[1450px] mx-auto px-[5vw] py-10 md:py-12">
          <SectionHeading count={available.length}>Available Dashboards</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 mb-12">
            {available.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>

          <SectionHeading count={comingSoon.length}>Coming Soon</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {comingSoon.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="shrink-0" style={{ background: BRAND_BLUE, borderTop: `4px solid ${BRAND_ORANGE}` }}>
        <div className="max-w-[1450px] mx-auto px-[5vw] py-7 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={hmrLogo} alt="" className="w-8 h-8 rounded-md" />
            <div className="text-[17px] leading-none font-black tracking-[0.02em]" style={{ color: BRAND_WHITE }}>
              HMR <span style={{ color: BRAND_ORANGE }}>ANALYTICS</span>
            </div>
          </div>
          <p className="text-[12.5px]" style={{ color: whiteA(0.7) }}>
            Business Intelligence &amp; Analytics
          </p>
        </div>
      </footer>
    </div>
  );
}
