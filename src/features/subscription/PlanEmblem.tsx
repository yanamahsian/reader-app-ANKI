import "../../styles/pricing-emblems.css";

export type PlanEmblemFigure = "pawn" | "knight" | "bust" | "queen";

interface PlanEmblemProps {
  figure: PlanEmblemFigure;
}

const ART_ASSETS: Partial<Record<PlanEmblemFigure, string>> = {
  knight: `${import.meta.env.BASE_URL}assets/subscription/plan-library.webp`,
  bust: `${import.meta.env.BASE_URL}assets/subscription/plan-atlas.webp`,
  queen: `${import.meta.env.BASE_URL}assets/subscription/plan-academy.webp`,
};

function FreeColumn() {
  return (
    <svg
      className="plan-emblem-column"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="plan-column-ruby" x1="18%" y1="8%" x2="82%" y2="96%">
          <stop offset="0%" stopColor="#b75b72" />
          <stop offset="28%" stopColor="#7c263d" />
          <stop offset="68%" stopColor="#3a0d1b" />
          <stop offset="100%" stopColor="#16050b" />
        </linearGradient>
        <linearGradient id="plan-column-edge" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255, 214, 224, 0.18)" />
          <stop offset="48%" stopColor="rgba(255, 222, 230, 0.62)" />
          <stop offset="100%" stopColor="rgba(255, 214, 224, 0.08)" />
        </linearGradient>
      </defs>

      <g fill="url(#plan-column-ruby)" stroke="rgba(241, 169, 185, 0.34)" strokeWidth="0.7">
        <path d="M31 84 H69 L65 78 H35 Z" />
        <path d="M36 78 H64 V74 H36 Z" />
        <path d="M40 74 L42 35 H58 L60 74 Z" />
        <path d="M36 35 H64 V31 H36 Z" />
        <path d="M33 31 H67 L63 26 H37 Z" />
        <path d="M38 26 H62 V23 H38 Z" />
      </g>

      <g fill="url(#plan-column-edge)" opacity="0.78">
        <rect x="44" y="35" width="2" height="39" rx="1" />
        <rect x="49" y="35" width="2" height="39" rx="1" />
        <rect x="54" y="35" width="2" height="39" rx="1" />
      </g>
    </svg>
  );
}

export function PlanEmblem({ figure }: PlanEmblemProps) {
  const artSrc = ART_ASSETS[figure];

  return (
    <div className={`plan-emblem plan-emblem-${figure}`} aria-hidden="true">
      {figure === "pawn" ? (
        <FreeColumn />
      ) : (
        <img
          className={`plan-emblem-art plan-emblem-art-${figure}`}
          src={artSrc}
          alt=""
          draggable={false}
        />
      )}
    </div>
  );
}
