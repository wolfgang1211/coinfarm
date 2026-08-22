// Inline SVG pixel-art generator illustrations — no external assets.
// Each renders a small isometric-ish scene on a colored glow backdrop.

export function GpuArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} shapeRendering="crispEdges">
      {/* rig frame */}
      <rect x="8" y="6" width="48" height="36" fill="#1e293b" stroke="#334155" />
      {/* 3 gpu cards */}
      {[12, 26, 40].map((x, i) => (
        <g key={i}>
          <rect x={x} y="10" width="12" height="24" fill="#0f172a" stroke="#475569" />
          <rect x={x + 2} y="13" width="8" height="3" fill="#38bdf8" opacity="0.9" />
          <rect x={x + 2} y="18" width="8" height="3" fill="#0ea5e9" opacity="0.7" />
          <rect x={x + 2} y="23" width="8" height="3" fill="#0284c7" opacity="0.5" />
          <circle cx={x + 6} cy="31" r="1.5" fill="#22d3ee" className="animate-pulse" style={{ animationDelay: `${i * 0.4}s` }} />
        </g>
      ))}
      {/* glow strip */}
      <rect x="8" y="40" width="48" height="3" fill="#38bdf8" opacity="0.35" />
    </svg>
  );
}

export function AsicArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} shapeRendering="crispEdges">
      <rect x="14" y="4" width="36" height="40" fill="#1c1917" stroke="#44403c" />
      {/* heatsink fins */}
      {[8, 14, 20, 26, 32, 38].map((y) => (
        <rect key={y} x="18" y={y} width="28" height="2" fill="#57534e" />
      ))}
      {/* fan */}
      <circle cx="32" cy="24" r="7" fill="#0c0a09" stroke="#78716c" />
      <g style={{ transformOrigin: "32px 24px" }} className="animate-spin" >
        <path d="M32 18 L34 24 L32 30 L30 24 Z" fill="#a78bfa" />
        <path d="M26 24 L32 22 L38 24 L32 26 Z" fill="#8b5cf6" />
      </g>
      <rect x="14" y="42" width="36" height="2" fill="#a78bfa" opacity="0.4" />
    </svg>
  );
}

export function FarmArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} shapeRendering="crispEdges">
      {/* warehouse */}
      <path d="M8 20 L32 8 L56 20 L56 44 L8 44 Z" fill="#292524" stroke="#57534e" />
      {/* roof stripe */}
      <path d="M8 20 L32 8 L56 20 L56 23 L8 23 Z" fill="#44403c" />
      {/* door */}
      <rect x="26" y="30" width="12" height="14" fill="#1c1917" stroke="#78716c" />
      {/* windows glowing */}
      <rect x="13" y="27" width="7" height="6" fill="#fbbf24" opacity="0.85" />
      <rect x="44" y="27" width="7" height="6" fill="#fbbf24" opacity="0.85" />
      {/* chimney + smoke */}
      <rect x="46" y="10" width="5" height="8" fill="#57534e" />
      <circle cx="49" cy="7" r="2.5" fill="#78716c" opacity="0.5" className="animate-ping" style={{ animationDuration: "2.5s" }} />
    </svg>
  );
}

export function QuantumArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className}>
      <defs>
        <radialGradient id="qg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="55%" stopColor="#c026d3" />
          <stop offset="100%" stopColor="#4a044e" />
        </radialGradient>
      </defs>
      {/* core */}
      <circle cx="32" cy="24" r="8" fill="url(#qg)" className="animate-pulse" />
      {/* orbit rings */}
      <ellipse cx="32" cy="24" rx="22" ry="8" fill="none" stroke="#e879f9" strokeWidth="1" opacity="0.7" />
      <ellipse cx="32" cy="24" rx="22" ry="8" fill="none" stroke="#e879f9" strokeWidth="1" opacity="0.45" transform="rotate(60 32 24)" />
      <ellipse cx="32" cy="24" rx="22" ry="8" fill="none" stroke="#e879f9" strokeWidth="1" opacity="0.45" transform="rotate(-60 32 24)" />
      {/* orbiting particles */}
      <circle cx="10" cy="24" r="2" fill="#f5d0fe" />
      <circle cx="52" cy="17" r="1.6" fill="#f0abfc" />
      <circle cx="44" cy="36" r="1.4" fill="#d946ef" />
    </svg>
  );
}

export const GEN_ART: Record<string, (p: { className?: string }) => React.ReactElement> = {
  gpu: GpuArt,
  asic: AsicArt,
  farm: FarmArt,
  quantum: QuantumArt,
};
