import Sparkline from "./primitives/Sparkline";

const TONE_CLASSES = {
  good: "bg-toneGreenBg text-toneGreenText",
  warning: "bg-toneAmberBg text-toneAmberText",
  critical: "bg-toneRedBg text-toneRedText",
};

const TONE_STROKE = {
  good: "#1e7b34",
  warning: "#b07514",
  critical: "#c42b2b",
};

function ScoreRing({ score, tone }) {
  const size = 88;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--gridline)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[29px] font-display text-ink leading-none">{score}</span>
        <span className="text-[12.5px] text-muted mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

export default function HealthScoreCard({ score, status, tone, description, trend, methodology }) {
  const hasTip = Boolean(methodology);
  return (
    <div className={`card px-5 py-4 flex items-center gap-5 shrink-0 w-full lg:w-[400px] relative ${hasTip ? "group/tip" : ""}`}>
      <ScoreRing score={score} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="eyebrow">Health Score</span>
          {hasTip && (
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted text-muted text-[10.5px] font-bold shrink-0 leading-none">
              i
            </span>
          )}
          <span className={`text-[13.5px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${TONE_CLASSES[tone]}`}>
            {status}
          </span>
        </div>
        <p className="text-[15px] text-ink leading-snug mb-2">{description}</p>
        {trend && <Sparkline data={trend} width={140} height={26} colorClass={tone === "critical" ? "text-toneRedText" : tone === "warning" ? "text-toneAmberText" : "text-toneGreenText"} />}
      </div>
      {hasTip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-3 right-3 top-full mt-2 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
        >
          <div className="floating px-3 py-2 text-[14px] leading-snug text-ink shadow-lg text-left">{methodology}</div>
        </div>
      )}
    </div>
  );
}
