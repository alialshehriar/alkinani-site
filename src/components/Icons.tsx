/**
 * Hand-crafted icons — 1.5px stroke, 24x24, line style.
 * Tuned for premium editorial look (Phosphor / Lucide level, not bigger).
 */
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 20): React.SVGAttributes<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const ArrowUpRight = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M7 17 17 7" />
    <path d="M9 7h8v8" />
  </svg>
);

export const ArrowDown = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 5v14" />
    <path d="m6 13 6 6 6-6" />
  </svg>
);

export const Mail = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

export const WhatsApp = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3 3L3.5 20.5Z" />
    <path d="M9.5 9c.4 1 1 1.7 1.7 2.4 0.7.7 1.5 1.3 2.4 1.7l1.2-.9a1 1 0 0 1 1-.1l1.7.9c.3.2.5.5.5.9-.2 1.6-1.6 2.6-3 2.5-3-.4-5.7-3.1-6.1-6.1-.1-1.4 1-2.8 2.5-3 .4 0 .7.2.9.5l.9 1.7a1 1 0 0 1-.1 1l-.9 1.2Z" />
  </svg>
);

export const X = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="m4 4 7.5 9.5L4.2 20h2L13 14.5 17.5 20H20l-7.8-9.8L19.5 4h-2L13 9 9 4H4Z" fill="currentColor" stroke="none" />
  </svg>
);

export const LinkedIn = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M7 10v7" />
    <path d="M7 7v.01" />
    <path d="M11 17v-4a2 2 0 0 1 4 0v4" />
    <path d="M11 17v-7" />
  </svg>
);

export const Compass = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 15 1.5-4.5L15 9l-1.5 4.5Z" />
  </svg>
);

export const Layers = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
    <path d="m3 18 9 5 9-5" />
  </svg>
);

export const Spark = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3v4" />
    <path d="M12 17v4" />
    <path d="m5 5 2.5 2.5" />
    <path d="m16.5 16.5 2.5 2.5" />
    <path d="M3 12h4" />
    <path d="M17 12h4" />
    <path d="m5 19 2.5-2.5" />
    <path d="m16.5 7.5 2.5-2.5" />
  </svg>
);

export const Bithrah = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    {/* Sprout / seed mark — leaf + dot */}
    <path d="M12 14C9 14 7 11.5 7 8.5 9 8.5 12 11 12 14Z" fill="currentColor" stroke="none" opacity="0.85" />
    <path d="M12 21v-7" />
    <circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const Codad = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    {/* 3 nodes connected = 3 brains */}
    <circle cx="6" cy="7" r="2" />
    <circle cx="18" cy="7" r="2" />
    <circle cx="12" cy="18" r="2" />
    <path d="M8 7h8" />
    <path d="m7.5 9 4 7" />
    <path d="m16.5 9-4 7" />
  </svg>
);

export const Syndra = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    {/* Keyboard with cursor */}
    <rect x="3" y="6" width="18" height="11" rx="2" />
    <path d="M7 10h.01" />
    <path d="M11 10h.01" />
    <path d="M15 10h.01" />
    <path d="M7 14h10" />
  </svg>
);

export const Anchor = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v15" />
    <path d="M5 14a7 7 0 0 0 14 0" />
    <path d="M8 11h8" />
  </svg>
);

export const Wave = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M2 12c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" />
    <path d="M2 17c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" />
  </svg>
);
