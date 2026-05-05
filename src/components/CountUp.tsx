import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";

/**
 * Number that counts up when scrolled into view.
 * Supports plain integers, "5+" suffix, "24/7" passthrough, and any non-numeric prefix.
 */
export default function CountUp({ value, duration = 1.4 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });
  const [display, setDisplay] = useState<string>(value);

  useEffect(() => {
    // Detect plain integer with optional "+" suffix
    const match = /^(\d+)(\+?)$/.exec(value);
    if (!match) {
      setDisplay(value);
      return;
    }
    if (!inView) {
      setDisplay("0" + match[2]);
      return;
    }
    const target = parseInt(match[1], 10);
    const suffix = match[2];
    const start = performance.now();
    let raf = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const v = Math.round(ease(t) * target);
      setDisplay(`${v}${suffix}`);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <motion.span ref={ref} className="num-display inline-block">
      {display}
    </motion.span>
  );
}
