import { useId } from "react";

export function LogoIcon({ size = 32 }: { size?: number }) {
  const uid = useId();
  const g1 = `logo-g1-${uid}`;
  const g2 = `logo-g2-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={g1}
          x1="10"
          y1="0"
          x2="42"
          y2="52"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient
          id={g2}
          x1="26"
          y1="8"
          x2="26"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      {/* Diamond background */}
      <rect
        x="26"
        y="2"
        width="33.94"
        height="33.94"
        rx="7"
        transform="rotate(45 26 2)"
        fill={`url(#${g1})`}
        opacity="0.15"
      />
      <rect
        x="26"
        y="4"
        width="31.11"
        height="31.11"
        rx="6"
        transform="rotate(45 26 4)"
        fill="none"
        stroke={`url(#${g1})`}
        strokeWidth="1.2"
        opacity="0.4"
      />
      {/* Branch lines */}
      <line
        x1="22"
        y1="14"
        x2="22"
        y2="40"
        stroke={`url(#${g2})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M22 20 C22 20, 24 20, 28 16"
        stroke={`url(#${g2})`}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M22 32 C22 32, 24 32, 28 28"
        stroke={`url(#${g2})`}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
        strokeDasharray="2 3"
      />
      {/* Nodes */}
      <circle
        cx="22"
        cy="14"
        r="3.5"
        fill="#c4b5fd"
        stroke="var(--color-theme-node-stroke)"
        strokeWidth="1.5"
      />
      <circle
        cx="22"
        cy="40"
        r="3.5"
        fill="#7c3aed"
        stroke="var(--color-theme-node-stroke)"
        strokeWidth="1.5"
      />
      <circle
        cx="30"
        cy="14"
        r="3"
        fill="#a78bfa"
        stroke="var(--color-theme-node-stroke)"
        strokeWidth="1.5"
      />
      <circle
        cx="30"
        cy="26"
        r="3"
        fill="#8b5cf6"
        stroke="var(--color-theme-node-stroke)"
        strokeWidth="1.5"
        opacity="0.6"
      />
      {/* Trend arrow */}
      <g opacity="0.9">
        <polyline
          points="30,36 35,30 38,32 44,24"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <polyline
          points="40,24 44,24 44,28"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}

export function LogoWordmark() {
  return (
    <span className="text-lg font-bold leading-tight tracking-[-0.5px]">
      <span className="text-wordmark-code">Code</span>
      <span className="text-wordmark-review">Review</span>
      <span className="text-wordmark-trends">Trends</span>
    </span>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoIcon size={32} />
      <LogoWordmark />
    </span>
  );
}
