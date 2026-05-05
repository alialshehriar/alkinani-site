import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

/**
 * Custom cursor: small dot that follows the cursor with spring physics,
 * grows when over interactive elements (a, button, [data-cursor=hover]).
 * Hidden on touch devices.
 */
export default function MagneticCursor() {
  const x = useMotionValue(-50);
  const y = useMotionValue(-50);
  const sx = useSpring(x, { stiffness: 600, damping: 35, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 600, damping: 35, mass: 0.4 });

  const ringX = useSpring(x, { stiffness: 180, damping: 22, mass: 0.7 });
  const ringY = useSpring(y, { stiffness: 180, damping: 22, mass: 0.7 });

  const [hover, setHover] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;
    if (!isFinePointer) return;
    setEnabled(true);

    const onMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const interactive = !!t?.closest('a, button, [data-cursor="hover"]');
      setHover(interactive);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseover", onOver);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <>
      {/* Outer ring */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[100] mix-blend-difference"
        style={{
          x: ringX,
          y: ringY,
          translateX: "-50%",
          translateY: "-50%",
        }}
      >
        <motion.div
          animate={{ scale: hover ? 1.6 : 1, opacity: hover ? 0.9 : 0.55 }}
          transition={{ duration: 0.25 }}
          className="h-9 w-9 rounded-full border border-white/70"
        />
      </motion.div>
      {/* Inner dot */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[101] mix-blend-difference"
        style={{
          x: sx,
          y: sy,
          translateX: "-50%",
          translateY: "-50%",
        }}
      >
        <motion.div
          animate={{ scale: hover ? 0.4 : 1 }}
          transition={{ duration: 0.2 }}
          className="h-1.5 w-1.5 rounded-full bg-white"
        />
      </motion.div>
    </>
  );
}
