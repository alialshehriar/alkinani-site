import { useEffect, useRef, useState } from "react";

type Ripple = { id: number; x: number; y: number };

/**
 * Click anywhere on parent → ripple expands from click point.
 * Pure CSS animation, GPU-friendly.
 */
export default function Ripples({ color = "rgba(255,255,255,0.18)" }: { color?: string }) {
  const [list, setList] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = ++idRef.current;
      setList((prev) => [...prev.slice(-6), { id, x, y }]);
      setTimeout(() => setList((prev) => prev.filter((r) => r.id !== id)), 1400);
    };

    const parent = (document.getElementById("ripple-host") || null) as HTMLElement | null;
    if (!parent) return;
    parent.addEventListener("click", onClick);
    return () => parent.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {list.map((r) => (
        <span
          key={r.id}
          className="absolute rounded-full"
          style={{
            left: r.x,
            top: r.y,
            width: 4,
            height: 4,
            transform: "translate(-50%, -50%)",
            background: "transparent",
            border: `1px solid ${color}`,
            animation: "ripple-out 1.3s cubic-bezier(0.22, 1, 0.36, 1) forwards",
          }}
        />
      ))}
      <style>{`
        @keyframes ripple-out {
          0%   { width: 4px; height: 4px; opacity: 0.95; border-width: 1.5px; }
          70%  { opacity: 0.5; border-width: 1px; }
          100% { width: 320px; height: 320px; opacity: 0; border-width: 0.5px; }
        }
      `}</style>
    </div>
  );
}
