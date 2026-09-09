import { useEffect } from "react";
import ModuleCard from "../platform/ModuleCard";
import { MODULES } from "../platform/modules";

const ORANGE = "#d99a3d";
const BLUE = "#4f7cc9";
const BLUE_LIGHT = "#8fb3e8";

// Hero data visualization — the reference's building photo, replaced with a
// programmatic analytics composition: faint grid, a gradient-filled area
// chart, a drawn/looping trend line, pulsing node markers, a small bar
// cluster and a couple of floating KPI-style numbers. Pure SVG/CSS, no
// imagery. Motion lives in index.css's ".hero-*" rules, all gated behind
// prefers-reduced-motion: no-preference.
function AnalyticsBackdrop() {
  return (
    <svg
      viewBox="0 0 640 320"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
      aria-hidden="true"
    >
      <defs>
        <pattern id="hmrHeroGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke={BLUE_LIGHT} strokeWidth="1" />
        </pattern>
        <linearGradient id="hmrAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BLUE} stopOpacity="0.35" />
          <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
        </linearGradient>
      </defs>

      <g className="hero-grid-layer" style={{ opacity: 0.12 }}>
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
            rx="2"
            fill={BLUE}
            opacity="0.4"
            className="hero-bg-bar"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        );
      })}

      <path
        d="M230,220 C280,235 300,150 350,160 S430,90 470,100 S560,40 610,48 V272 H230 Z"
        fill="url(#hmrAreaFill)"
        stroke="none"
      />
      <path
        d="M230,220 C280,235 300,150 350,160 S430,90 470,100 S560,40 610,48"
        fill="none"
        stroke={ORANGE}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.75"
        className="hero-chart-line"
      />
      {[[230, 220], [350, 160], [470, 100], [610, 48]].map(([cx, cy], i) => (
        <circle key={cx} cx={cx} cy={cy} r="5" fill={ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.5}s` }} />
      ))}

      <text x="470" y="78" fontSize="20" fontWeight="700" fill="#f5f6f8" opacity="0.85" className="hero-kpi-fade" style={{ animationDelay: "0.4s" }}>
        12.8%
      </text>
      <text x="230" y="204" fontSize="14" fontWeight="600" fill={BLUE_LIGHT} opacity="0.65" className="hero-kpi-fade" style={{ animationDelay: "1.6s" }}>
        GMV ▲
      </text>
    </svg>
  );
}

function SectionHeading({ children }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="w-[5px] h-6 rounded-full shrink-0" style={{ background: ORANGE }} />
      <h2 className="text-[24px] md:text-[28px] leading-none tracking-[0.01em] font-display shrink-0" style={{ color: "#0f1622" }}>
        {children}
      </h2>
      <span className="hidden md:block h-px flex-1" style={{ background: "#e7eaf0" }} />
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
    <div className="min-h-screen flex flex-col" style={{ background: "#ffffff" }}>
      {/* Hero */}
      <section
        className="relative overflow-hidden shrink-0"
        style={{ background: "radial-gradient(ellipse 900px 500px at 10% 15%, #16202f 0%, #0f1622 60%)" }}
      >
        <div className="relative max-w-[1480px] mx-auto px-6 md:px-10 py-12 md:py-0 md:h-[320px] flex flex-col md:flex-row items-center gap-8">
          <div className="md:w-[42%] shrink-0">
            <div className="text-[12.5px] tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: "#7e93c2" }}>
              HMR
            </div>
            <h1 className="text-[46px] md:text-[64px] leading-[0.92] font-display tracking-[0.01em] mb-3">
              <span style={{ color: "#f5f6f8" }}>HMR</span>{" "}
              <span style={{ color: ORANGE }}>ANALYTICS</span>
            </h1>
            <p className="text-[16px] md:text-[18px] font-semibold mb-2" style={{ color: "#a9bde0" }}>
              Business Intelligence &amp; Analytics
            </p>
            <p className="text-[14px] md:text-[15px] max-w-sm" style={{ color: "#7e93c2" }}>
              Turning data into actionable business insights.
            </p>
          </div>

          <div className="hidden sm:flex flex-1 self-stretch items-center justify-center min-w-0">
            <AnalyticsBackdrop />
          </div>
        </div>
      </section>

      {/* Dashboard directory — light */}
      <section className="flex-1" style={{ background: "#ffffff" }}>
        <div className="max-w-[1480px] mx-auto px-6 md:px-10 py-14 md:py-16">
          <SectionHeading>Available Dashboards</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 mb-14">
            {available.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>

          <SectionHeading>Coming Soon</SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            {comingSoon.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="shrink-0" style={{ background: "#0f1622" }}>
        <div className="max-w-[1480px] mx-auto px-6 md:px-10 py-7 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-[17px] leading-none font-display tracking-[0.02em]" style={{ color: "#f5f6f8" }}>
            HMR ANALYTICS
          </div>
          <p className="text-[12.5px]" style={{ color: "#7e93c2" }}>
            Business Intelligence &amp; Analytics
          </p>
        </div>
      </footer>
    </div>
  );
}
