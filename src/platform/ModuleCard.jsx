// Portal module card — two fixed visual variants keyed off module.status,
// independent of the dashboards' own themes (this is platform chrome, not
// a dashboard view), in the HMR brand's three colours. "available" renders as a
// large landscape feature card with a per-module decorative glyph that
// strengthens toward the right edge; "coming-soon" renders as a compact,
// deliberately non-clickable-looking tile with its own subtle motif. Same
// module shape either way, so future modules drop into whichever grid
// matches their status with zero extra work.
import { BRAND_BLUE, BRAND_ORANGE, BRAND_WHITE, blueA, orangeA, whiteA } from "./brand";

// HMR brand colours only (blue / orange / white — see ./brand.js). Glyphs
// on the blue "available" cards draw in white + orange; glyphs on the white
// "coming soon" tiles draw in blue + orange.
const ORANGE = BRAND_ORANGE;
const BLUE = whiteA(0.55);
const BLUE_LIGHT = whiteA(0.8);
const TILE_BLUE = BRAND_BLUE;

// Available-card glyphs — abstract chart geometry only, keyed by
// module.id, strongest on the right where the card's own gradient overlay
// is lightest. Falls back to a generic node cluster for a future module.
function AvailableGlyph({ id }) {
  if (id === "auction") {
    return (
      <svg viewBox="0 0 420 240" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="auctionFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={BRAND_BLUE} stopOpacity="1" />
            <stop offset="42%" stopColor={BRAND_BLUE} stopOpacity="0.35" />
            <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[210, 240, 270, 300, 330, 360, 390].map((x, i) => {
          const h = 40 + ((i * 29) % 90);
          return (
            <rect key={x} x={x} y={190 - h} width="16" height={h} rx="2" fill={BLUE} opacity="0.55" className="hero-bg-bar" style={{ animationDelay: `${i * 0.3}s` }} />
          );
        })}
        <polyline
          points="200,170 240,150 270,158 300,110 330,120 360,70 400,84"
          fill="none"
          stroke={ORANGE}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
          className="hero-chart-line"
        />
        {[[240, 150], [300, 110], [360, 70]].map(([cx, cy], i) => (
          <circle key={cx} cx={cx} cy={cy} r="4.5" fill={ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
        <rect x="0" y="0" width="420" height="240" fill="url(#auctionFade)" />
      </svg>
    );
  }

  if (id === "hrh-online") {
    return (
      <svg viewBox="0 0 420 240" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="hrhFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={BRAND_BLUE} stopOpacity="1" />
            <stop offset="42%" stopColor={BRAND_BLUE} stopOpacity="0.35" />
            <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hrhArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE_LIGHT} stopOpacity="0.4" />
            <stop offset="100%" stopColor={BLUE_LIGHT} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M220,180 C250,190 270,140 300,145 S350,95 380,100 S410,60 420,64 V210 H220 Z" fill="url(#hrhArea)" />
        <path
          d="M220,180 C250,190 270,140 300,145 S350,95 380,100 S410,60 420,64"
          fill="none"
          stroke={ORANGE}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.8"
          className="hero-chart-line"
        />
        {[[220, 180], [300, 145], [380, 100]].map(([cx, cy], i) => (
          <circle key={cx} cx={cx} cy={cy} r="4.5" fill={ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
        <line x1="216" y1="205" x2="418" y2="205" stroke={BLUE} strokeWidth="2" strokeDasharray="1 6" strokeLinecap="round" opacity="0.6" />
        <rect x="0" y="0" width="420" height="240" fill="url(#hrhFade)" />
      </svg>
    );
  }

  if (id === "retail") {
    // Store-front rows of stacked bars + a steady trend line.
    return (
      <svg viewBox="0 0 420 240" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="retailFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={BRAND_BLUE} stopOpacity="1" />
            <stop offset="45%" stopColor={BRAND_BLUE} stopOpacity="0.35" />
            <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[262, 290, 318, 346, 374, 402].map((x, i) => {
          const low = 26 + ((i * 17) % 34);
          const high = 18 + ((i * 29) % 40);
          return (
            <g key={x} className="hero-bg-bar" style={{ animationDelay: `${i * 0.28}s` }}>
              <rect x={x} y={220 - low} width="18" height={low} rx="2" fill={BLUE} />
              <rect x={x} y={220 - low - high - 4} width="18" height={high} rx="2" fill={BLUE_LIGHT} opacity="0.55" />
            </g>
          );
        })}
        <polyline points="262,158 290,148 318,150 346,124 374,128 402,100 420,96" fill="none" stroke={ORANGE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="hero-chart-line" />
        {[[318, 150], [374, 128], [420, 96]].map(([cx, cy], i) => (
          <circle key={cx} cx={cx} cy={cy} r="4.5" fill={ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
        <rect x="0" y="0" width="420" height="240" fill="url(#retailFade)" />
      </svg>
    );
  }

  if (id === "customer-analytics") {
    // Customer network — linked nodes around a central hub.
    const hub = [342, 142];
    const nodes = [[276, 96], [300, 204], [396, 96], [412, 176], [262, 160], [374, 214]];
    return (
      <svg viewBox="0 0 420 240" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="marketingFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={BRAND_BLUE} stopOpacity="1" />
            <stop offset="48%" stopColor={BRAND_BLUE} stopOpacity="0.35" />
            <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {nodes.map(([x, y]) => (
          <line key={`l${x}`} x1={hub[0]} y1={hub[1]} x2={x} y2={y} stroke={BLUE_LIGHT} strokeWidth="1.5" opacity="0.5" />
        ))}
        {nodes.map(([x, y], i) => (
          <circle key={`n${x}`} cx={x} cy={y} r={i % 2 ? 8 : 6} fill={BLUE} className="hero-node" style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
        <circle cx={hub[0]} cy={hub[1]} r="14" fill={ORANGE} />
        <circle cx={hub[0]} cy={hub[1]} r="24" fill="none" stroke={ORANGE} strokeWidth="2" opacity="0.45" className="hero-node" />
        <rect x="0" y="0" width="420" height="240" fill="url(#marketingFade)" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 420 240" className="absolute inset-0 w-full h-full opacity-40" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      {[260, 310, 360].map((cx, i) => (
        <circle key={cx} cx={cx} cy={120} r="5" fill={ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
    </svg>
  );
}

function AvailableCard({ module }) {
  return (
    <a
      href={module.route}
      className="group relative overflow-hidden rounded-xl flex flex-col justify-center min-h-[230px] md:min-h-[250px] p-6 md:p-7 transition-transform hover:-translate-y-0.5"
      style={{ background: BRAND_BLUE, boxShadow: `0 10px 30px ${blueA(0.18)}` }}
    >
      <AvailableGlyph id={module.id} />

      <span
        className="absolute top-5 right-6 text-[10.5px] tracking-[0.1em] uppercase font-bold px-2.5 py-1 rounded-full"
        style={{ background: orangeA(0.18), color: BRAND_ORANGE }}
      >
        Available
      </span>

      <div className="relative max-w-[62%]">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center text-[15px] font-bold shrink-0 mb-4"
          style={{ background: ORANGE, color: BRAND_WHITE }}
        >
          {module.name.charAt(0)}
        </div>

        <h3 className="text-[28px] md:text-[32px] leading-none font-black tracking-[-0.5px] mb-3" style={{ color: BRAND_WHITE }}>
          {module.name.toUpperCase()}
        </h3>
        <p className="text-[13.5px] leading-relaxed mb-6" style={{ color: whiteA(0.75) }}>
          {module.description}
        </p>

        <span
          className="inline-flex items-center gap-1.5 text-[13.5px] font-bold px-3.5 py-2 rounded-lg transition-transform group-hover:translate-x-0.5"
          style={{ background: ORANGE, color: BRAND_WHITE }}
        >
          {module.actionLabel}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </a>
  );
}

// Coming-soon motifs — one small, very restrained per-module CSS/SVG
// pattern, keyed by module.id. Purely decorative, never suggests the
// module is clickable.
function ComingSoonGlyph({ id }) {
  const common = "absolute right-3 bottom-3 w-[86px] h-[54px] opacity-[0.16]";
  if (id === "retail") {
    return (
      <svg viewBox="0 0 90 56" className={common} aria-hidden="true">
        {[10, 26, 42, 58, 74].map((x, i) => {
          const h = 16 + ((i * 11) % 30);
          return <rect key={x} x={x} y={50 - h} width="9" height={h} rx="1.5" fill={TILE_BLUE} className="hero-bg-bar" style={{ animationDelay: `${i * 0.25}s` }} />;
        })}
      </svg>
    );
  }
  if (id === "inventory") {
    return (
      <svg viewBox="0 0 90 56" className={common} aria-hidden="true">
        {[0, 1, 2].flatMap((row) =>
          [0, 1, 2, 3].map((col) => <rect key={`${row}-${col}`} x={6 + col * 21} y={4 + row * 18} width="15" height="12" rx="1.5" fill={TILE_BLUE} />),
        )}
      </svg>
    );
  }
  if (id === "customer-analytics") {
    return (
      <svg viewBox="0 0 90 56" className={common} aria-hidden="true">
        <line x1="20" y1="14" x2="46" y2="30" stroke={TILE_BLUE} strokeWidth="1.5" />
        <line x1="46" y1="30" x2="72" y2="16" stroke={TILE_BLUE} strokeWidth="1.5" />
        <line x1="46" y1="30" x2="66" y2="46" stroke={TILE_BLUE} strokeWidth="1.5" />
        {[[20, 14], [46, 30], [72, 16], [66, 46]].map(([cx, cy], i) => (
          <circle key={cx} cx={cx} cy={cy} r="5" fill={ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
      </svg>
    );
  }
  if (id === "bopis") {
    return (
      <svg viewBox="0 0 90 56" className={common} aria-hidden="true">
        <path d="M6,44 Q45,10 84,30" fill="none" stroke={TILE_BLUE} strokeWidth="2" strokeDasharray="4 6" className="hero-chart-line" />
        <circle cx="84" cy="30" r="5" fill={ORANGE} className="hero-node" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 90 56" className={common} aria-hidden="true">
      <polyline points="4,40 22,30 40,34 58,16 76,22" fill="none" stroke={TILE_BLUE} strokeWidth="2" className="hero-chart-line" />
      <circle cx="76" cy="22" r="4.5" fill={ORANGE} className="hero-node" />
    </svg>
  );
}

function ComingSoonCard({ module }) {
  return (
    <div
      className="relative overflow-hidden flex flex-col rounded-xl p-5 min-h-[180px] cursor-default"
      style={{ background: BRAND_WHITE, border: `1px solid ${blueA(0.14)}` }}
    >
      <ComingSoonGlyph id={module.id} />
      <div className="relative flex items-start justify-between gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center text-[13px] font-bold shrink-0"
          style={{ background: orangeA(0.12), color: BRAND_ORANGE }}
        >
          {module.name.charAt(0)}
        </div>
        <span
          className="text-[9.5px] tracking-[0.08em] uppercase font-bold px-2 py-1 rounded-full shrink-0 whitespace-nowrap"
          style={{ background: blueA(0.07), color: blueA(0.7) }}
        >
          Coming Soon
        </span>
      </div>
      <h3 className="relative text-[18px] leading-tight font-extrabold tracking-[-0.2px] mb-1.5" style={{ color: BRAND_BLUE }}>
        {module.name.toUpperCase()}
      </h3>
      <p className="relative text-[12.5px] leading-snug max-w-[80%]" style={{ color: blueA(0.65) }}>
        {module.description}
      </p>
    </div>
  );
}

export default function ModuleCard({ module }) {
  return module.status === "available" ? <AvailableCard module={module} /> : <ComingSoonCard module={module} />;
}
