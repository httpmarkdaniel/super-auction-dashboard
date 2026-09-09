import { useEffect } from "react";
import ModuleCard from "../platform/ModuleCard";
import { MODULES } from "../platform/modules";

const ORANGE = "#d99a3d";

// Hero backdrop — pure CSS/SVG analytics geometry (grid, a drawn trend
// line, pulsing nodes, growing bars). No imagery, no canvas/WebGL. Motion
// is opt-out via prefers-reduced-motion (see index.css's ".hero-*" rules).
function AnalyticsBackdrop() {
  return (
    <svg
      viewBox="0 0 1200 340"
      preserveAspectRatio="xMaxYMid slice"
      className="absolute inset-y-0 right-0 w-full md:w-[62%] h-full pointer-events-none hidden sm:block"
      aria-hidden="true"
    >
      <defs>
        <pattern id="hmrHeroGrid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="#7e93c2" strokeWidth="1" />
        </pattern>
      </defs>
      <g className="hero-grid-layer" style={{ opacity: 0.1 }}>
        <rect x="-48" y="-48" width="1296" height="436" fill="url(#hmrHeroGrid)" />
      </g>

      {[46, 108, 170, 232, 294, 356, 418].map((x, i) => {
        const barHeight = 70 + ((i * 37) % 90);
        return (
          <rect
            key={x}
            x={x}
            y={250 - barHeight}
            width="22"
            height={barHeight}
            rx="2"
            fill="#2e4a78"
            opacity="0.35"
            className="hero-bg-bar"
            style={{ animationDelay: `${i * 0.35}s` }}
          />
        );
      })}

      <polyline
        points="30,250 160,210 260,232 360,150 470,178 580,96 690,120 800,54 920,74 1040,30 1160,46"
        fill="none"
        stroke={ORANGE}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
        className="hero-chart-line"
      />
      {[[160, 210], [360, 150], [580, 96], [800, 54], [1040, 30]].map(([cx, cy], i) => (
        <circle key={cx} cx={cx} cy={cy} r="4.5" fill={ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.5}s` }} />
      ))}
    </svg>
  );
}

function SectionHeading({ children }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="w-[5px] h-6 rounded-full shrink-0" style={{ background: ORANGE }} />
      <h2 className="text-[24px] md:text-[28px] leading-none tracking-[0.01em] font-display" style={{ color: "#0f1622" }}>
        {children}
      </h2>
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
        style={{ background: "radial-gradient(ellipse 900px 500px at 15% 20%, #16202f 0%, #0f1622 60%)" }}
      >
        <AnalyticsBackdrop />
        <div className="relative max-w-6xl mx-auto px-6 py-12 md:py-0 md:h-[320px] flex flex-col justify-center">
          <h1 className="text-[52px] md:text-[68px] leading-[0.95] font-display tracking-[0.01em] mb-3">
            <span style={{ color: "#f5f6f8" }}>HMR</span>{" "}
            <span style={{ color: ORANGE }}>ANALYTICS</span>
          </h1>
          <p className="text-[16px] md:text-[18px] font-semibold mb-2" style={{ color: "#a9bde0" }}>
            Business Intelligence &amp; Analytics
          </p>
          <p className="text-[14px] md:text-[15px] max-w-md" style={{ color: "#7e93c2" }}>
            Turning data into actionable business insights.
          </p>
        </div>
      </section>

      {/* Dashboard directory — light */}
      <section className="flex-1" style={{ background: "#ffffff" }}>
        <div className="max-w-6xl mx-auto px-6 py-14 md:py-16">
          <SectionHeading>Available Dashboards</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-14">
            {available.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>

          <SectionHeading>Coming Soon</SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {comingSoon.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="shrink-0" style={{ background: "#0f1622" }}>
        <div className="max-w-6xl mx-auto px-6 py-8 text-center">
          <div className="text-[19px] leading-none font-display tracking-[0.02em] mb-1.5" style={{ color: "#f5f6f8" }}>
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
