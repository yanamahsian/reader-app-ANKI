import { useId } from "react";

export type PlanEmblemFigure = "pawn" | "knight" | "bust" | "queen";

interface PlanEmblemProps {
  figure: PlanEmblemFigure;
}

// Monumental chess/classical-sculpture silhouettes for the four tiers —
// Free = pawn, Library = knight, Atlas = a classical bust (Atlas/Hermes
// register), Academy = queen. Deliberately plain geometric silhouettes
// (circles, tapered columns, a scalloped crown) rather than a detailed
// illustration: the brief calls for "sculptural, classical, monumental,
// minimalist", not a cartoon mascot.
//
// The figure is cut from the same ruby glass as the orb around it, not
// a flat black silhouette dropped on top of it: a bright rim gradient
// plus a screened internal highlight (both defined below, per-instance
// via useId so multiple emblems on one page never share <defs> ids)
// separate it from the background through light, the way the outer
// ".plan-emblem-glass" shell in global.css already does.
//
// Each figure is a handful of separately-filled subpaths (base, stem,
// collar, head, ...) rather than one concatenated path string: with a
// single path, overlapping subpaths only merge cleanly when every one
// of them winds in the same direction, and a single reversed subpath
// (easy to get wrong by hand) punches a visible seam through the
// silhouette wherever it overlaps its neighbour. Separate elements
// with the same fill always union visually, regardless of winding.
const FIGURE_PARTS: Record<PlanEmblemFigure, string[]> = {
  // Pawn: flared base, tapered stem, collar, neck, round head.
  pawn: [
    "M30 90 L70 90 L62 79 L38 79 Z",
    "M41 79 L59 79 L56 51 L44 51 Z",
    "M38 51 C38 47.5 43.4 44.5 50 44.5 C56.6 44.5 62 47.5 62 51 C62 54.5 56.6 57.5 50 57.5 C43.4 57.5 38 54.5 38 51 Z",
    "M46.5 44 L53.5 44 L52.5 36 L47.5 36 Z",
    "M50 16 m-13 0 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0",
  ],
  // Knight: flared base, a trapezoid neck, then a bold, chunky horse
  // head (jaw pointing forward-left) with a separate pointed ear —
  // kept deliberately blocky rather than a delicately curved horse
  // profile, since fine detail disappears at emblem scale.
  knight: [
    "M32 90 L68 90 L61 80 L39 80 Z",
    "M44 80 L56 80 L54 55 L46 55 Z",
    "M46 55 L29 50 C25 49 22 45 24 40 C25 35 30 31 33 27 C36 23 41 21 45 22 " +
      "L48 26 L58 26 C61 26 63 29 62 33 L58 41 C60 45 60 50 58 55 Z",
    "M47 26 L43 13 L55 22 Z",
  ],
  // Classical bust: plinth, draped shoulders, neck, head, a thin
  // laurel band — an Atlas/Hermes-register portrait bust, not a face.
  bust: [
    "M28 90 L72 90 L69 82 L31 82 Z",
    "M31 82 C31 68 38 56 48 51 L52 51 C62 56 69 68 69 82 Z",
    "M46 52 L54 52 L54 43 L46 43 Z",
    "M50 15 m-15 0 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0",
    "M32 22 C36 19 42 17.5 50 17.5 C58 17.5 64 19 68 22 L68 25 C64 22.5 58 21 50 21 C42 21 36 22.5 32 25 Z",
  ],
  // Queen: flared base, tall tapered stem, belt, scalloped crown, orb.
  queen: [
    "M30 90 L70 90 L61 80 L39 80 Z",
    "M42 80 L58 80 L54 44 L46 44 Z",
    "M37 44 C37 40.5 43 37.5 50 37.5 C57 37.5 63 40.5 63 44 C63 47.5 57 50.5 50 50.5 C43 50.5 37 47.5 37 44 Z",
    "M37 38 C35 33 35 27 37 21 L42 28 L47 17 L50 26 L53 17 L58 28 L63 21 C65 27 65 33 63 38 Z",
    "M50 12 m-3.4 0 a3.4 3.4 0 1 0 6.8 0 a3.4 3.4 0 1 0 -6.8 0",
  ],
};

export function PlanEmblem({ figure }: PlanEmblemProps) {
  // Unique per mounted instance (React 19's useId) so the gradient/clip
  // <defs> of one card's emblem never collide with another's — all four
  // tiers render on the page at once.
  const rid = useId();
  const gradId = `plan-emblem-grad-${rid}`;
  const shadeId = `plan-emblem-shade-${rid}`;
  const clipId = `plan-emblem-clip-${rid}`;
  const parts = FIGURE_PARTS[figure];

  return (
    <div className="plan-emblem" aria-hidden="true">
      <div className="plan-emblem-glass">
        <span className="plan-emblem-highlight" />
        <span className="plan-emblem-glint" />
        <svg className="plan-emblem-figure" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* The figure's own ruby-glass material: a bright rim/highlight
                at top-left sinking into a deep garnet shadow at
                bottom-right — the same light logic as the orb around it,
                so the sculpture reads as cut from the same glass rather
                than a flat silhouette dropped on top of it. */}
            <linearGradient id={gradId} x1="12%" y1="6%" x2="88%" y2="100%">
              <stop offset="0%" stopColor="#ffeef1" />
              <stop offset="22%" stopColor="#ffb0c0" />
              <stop offset="46%" stopColor="#e0546c" />
              <stop offset="70%" stopColor="#9c2438" />
              <stop offset="100%" stopColor="#4a0f1c" />
            </linearGradient>
            {/* A soft internal reflection, screened on afterwards and
                confined to the figure via clipPath — a second, cooler
                glint distinct from the gradient fill, so the sculpture
                itself looks lit from within rather than airbrushed. */}
            <radialGradient id={shadeId} cx="32%" cy="24%" r="55%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <clipPath id={clipId}>
              {parts.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </clipPath>
          </defs>

          {parts.map((d, i) => (
            <path
              key={i}
              d={d}
              fill={`url(#${gradId})`}
              stroke="rgba(255, 240, 240, 0.75)"
              strokeWidth={0.9}
              strokeLinejoin="round"
            />
          ))}

          <g clipPath={`url(#${clipId})`} style={{ mixBlendMode: "screen" }}>
            <rect x="0" y="0" width="100" height="100" fill={`url(#${shadeId})`} />
          </g>
        </svg>
      </div>
    </div>
  );
}
