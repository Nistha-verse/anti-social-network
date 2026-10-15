import { useId } from "react";

type SpiteJarProps = { lamports: number; pulse?: number; compact?: boolean };

export function SpiteJar({ lamports, pulse = 0, compact = false }: SpiteJarProps) {
  const id = useId().replace(/:/g, "");
  const clipId = `jar-clip-${id}`;
  const liquidId = `jar-liquid-${id}`;
  const sol = lamports / 1_000_000_000;
  const fill = 1 - Math.exp(-sol / 5);
  const liquidY = 86 - fill * 58;
  const exact = sol.toFixed(6);

  return (
    <div className={`jar-wrap ${compact ? "jar-wrap--compact" : ""}`}>
      <div className={`jar ${pulse ? "jar--pulse" : ""}`} key={pulse} aria-hidden="true">
        <svg viewBox="0 0 100 112" className="jar__svg">
          <defs>
            <clipPath id={clipId}><path d="M23 22h54l-4 72c0 7-8 11-23 11S27 101 27 94Z" /></clipPath>
            <linearGradient id={liquidId} x1="0" x2="1" y1="0" y2="1">
              <stop stopColor="#ff9fba" />
              <stop offset="1" stopColor="#e16d9d" />
            </linearGradient>
          </defs>
          <path className="jar__glass" d="M23 22h54l-4 72c0 7-8 11-23 11S27 101 27 94Z" />
          <g clipPath={`url(#${clipId})`}>
            <rect className="jar__liquid" x="17" y={liquidY} width="66" height="40" fill={`url(#${liquidId})`} />
            <path className="jar__wave" d={`M17 ${liquidY}c10-5 18 5 28 0s18-5 38 0v5H17Z`} />
          </g>
          <path className="jar__rim" d="M19 20c0-5 9-8 31-8s31 3 31 8-9 8-31 8-31-3-31-8Z" />
          <path className="jar__shine" d="M33 38c-2 17-3 32-2 45" />
          <path className="jar__spark" d="m84 37 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm-4 42 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" />
        </svg>
      </div>
      <div className="jar__copy">
        <span className="eyebrow">Spite Pool</span>
        <strong>{exact} SOL</strong>
      </div>
    </div>
  );
}
