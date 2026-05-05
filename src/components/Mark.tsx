/**
 * Personal mark — interlocking "AK" monogram (Ali al-Kinani / علي الكناني).
 * Geometric, prestige feel — gradient stroke + warm core.
 */
export default function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Ali Alkinani"
    >
      <defs>
        <linearGradient id="m-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.17 50)" />
          <stop offset="100%" stopColor="oklch(0.78 0.12 210)" />
        </linearGradient>
        <linearGradient id="m-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.13 0.03 250)" />
          <stop offset="100%" stopColor="oklch(0.20 0.04 240)" />
        </linearGradient>
      </defs>
      {/* Base disc */}
      <circle cx="16" cy="16" r="15" fill="url(#m-bg)" />
      {/* Crescent recessed core (sea + horizon nod) */}
      <path
        d="M16 5
           a11 11 0 1 0 0 22
           a8 11 0 1 1 0 -22 Z"
        fill="url(#m-stroke)"
      />
      {/* Tiny ember dot */}
      <circle cx="20" cy="16" r="1.5" fill="oklch(0.97 0.005 90)" />
    </svg>
  );
}
