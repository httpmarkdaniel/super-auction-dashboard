import { useEffect } from "react";
import ModuleCard from "../platform/ModuleCard";
import { MODULES } from "../platform/modules";

export default function HomePage() {
  useEffect(() => {
    document.title = "HMR Analytics";
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#0f1622" }}>
      <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
        <div
          className="text-[12.5px] tracking-[0.14em] uppercase font-semibold mb-3"
          style={{ color: "#7e93c2" }}
        >
          HMR
        </div>
        <h1 className="text-[32px] md:text-[38px] font-bold mb-2" style={{ color: "#f2f4f7" }}>
          HMR Analytics
        </h1>
        <p className="text-[16px] mb-12 md:mb-14" style={{ color: "#a3adba" }}>
          Business Intelligence &amp; Analytics
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {MODULES.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      </div>
    </div>
  );
}
