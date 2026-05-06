import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import { copy, t, type Lang } from "../lib/i18n";
import { ArrowUpRight, Bithrah, Codad, Syndra } from "./Icons";

const ease = [0.22, 1, 0.36, 1] as const;

const ICONS = [Bithrah, Codad, Syndra] as const;

function VentureRow({
  v,
  i,
  lang,
}: {
  v: (typeof copy.ventures.items)[number];
  i: number;
  lang: Lang;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 150, damping: 20 });
  const sy = useSpring(my, { stiffness: 150, damping: 20 });
  const tx = useTransform(sx, (v) => `${v * 0.04}px`);
  const ty = useTransform(sy, (v) => `${v * 0.04}px`);
  const arrowTx = useTransform(sx, (v) => `${v * 0.18}px`);
  const arrowTy = useTransform(sy, (v) => `${v * 0.18}px`);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(e.clientX - (r.left + r.width / 2));
    my.set(e.clientY - (r.top + r.height / 2));
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  const Icon = ICONS[i];

  const Inner = (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      initial={false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8%" }}
      transition={{ duration: 0.8, delay: i * 0.05, ease }}
      className="group relative grid grid-cols-1 gap-y-6 border-t border-ink-800 py-10 transition-colors hover:bg-gradient-to-b hover:from-ink-900/40 hover:to-transparent lg:grid-cols-12 lg:gap-x-8 lg:py-14"
    >
      {/* edge accent on hover */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ember-500/0 to-transparent transition-all duration-700 group-hover:via-ember-500/60" />

      <div className="num-display flex items-center gap-3 text-ember-500 lg:col-span-1" style={{ fontSize: "0.85rem", letterSpacing: "0.18em" }}>
        <span>{v.index}</span>
      </div>

      <div className="lg:col-span-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-ink-700/60 bg-ink-900/70 text-ember-400 transition group-hover:border-ember-500/50 group-hover:text-ember-500">
            <Icon size={18} />
          </span>
          <motion.div
            style={{ x: tx, y: ty }}
            className="font-bold text-ink-100"
          >
            <span style={{ fontSize: "clamp(2rem, 4vw, 3rem)", lineHeight: 1 }}>
              {t(v.name, lang)}
            </span>
          </motion.div>
        </div>
        <div className="mt-4 text-sm text-ink-400">{t(v.role, lang)}</div>
        {v.url && (
          <div className={`mt-1.5 font-en text-xs uppercase tracking-[0.2em] ${v.href ? "text-tide-400 transition group-hover:text-tide-500" : "text-ink-500"}`}>
            {v.url}
          </div>
        )}
      </div>

      <div className="lg:col-span-6">
        <p className="text-ink-300" style={{ fontSize: "clamp(0.95rem, 1.2vw, 1.05rem)", lineHeight: 1.7 }}>
          {t(v.summary, lang)}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {v.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-ink-700/70 bg-ink-900/30 px-3 py-1 font-en text-[11px] tracking-wide text-ink-400 transition group-hover:border-ink-600/70 group-hover:text-ink-200"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-5 text-xs uppercase tracking-[0.2em] text-ink-500">
          {t(v.proof, lang)}
        </div>
      </div>

      <div className="flex items-start justify-end lg:col-span-1">
        {v.href ? (
          <motion.div
            style={{ x: arrowTx, y: arrowTy }}
            className="grid h-10 w-10 place-items-center rounded-full border border-ink-700/70 text-ink-500 transition group-hover:border-ember-500/60 group-hover:bg-ember-500/10 group-hover:text-ember-500"
          >
            <motion.span
              className="block"
              whileHover={{ rotate: -45 }}
            >
              <ArrowUpRight size={18} />
            </motion.span>
          </motion.div>
        ) : null}
      </div>
    </motion.div>
  );

  return v.href ? (
    <a href={v.href} target="_blank" rel="noopener noreferrer" className="block">
      {Inner}
    </a>
  ) : (
    <div>{Inner}</div>
  );
}

export default function Ventures({ lang }: { lang: Lang }) {
  return (
    <section id="work" className="relative w-full px-6 py-32 sm:px-8 sm:py-40">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-end">
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7 }}
            className="text-xs uppercase tracking-[0.3em] text-ember-500 lg:col-span-4"
          >
            <span className="me-3 align-middle text-ink-600">/03</span>
            {t(copy.ventures.section, lang)}
          </motion.p>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, ease }}
            className="font-semibold leading-[1.05] text-ink-100 lg:col-span-8"
            style={{ fontSize: "clamp(2.25rem, 5vw, 4rem)" }}
          >
            {t(copy.ventures.title, lang)}
          </motion.h2>
        </div>

        <div className="mt-16 flex flex-col">
          {copy.ventures.items.map((v, i) => (
            <VentureRow key={v.index} v={v} i={i} lang={lang} />
          ))}
          <div className="border-t border-ink-800" />
        </div>
      </div>
    </section>
  );
}
