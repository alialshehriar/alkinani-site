import { motion } from "motion/react";

type Props = { freeRemaining: number | null; freeTotal: number | null };

export default function AnonymousHero({ freeRemaining, freeTotal }: Props) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl border border-ember-500/30 bg-gradient-to-br from-ember-500/10 via-ink-950/60 to-tide-500/8 px-6 py-10 text-center sm:px-10 sm:py-14"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 h-40 w-[480px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-ember-500) 60%, transparent) 0%, transparent 70%)",
        }}
      />
      <p className="mb-4 flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.3em] text-ember-500/80">
        <span className="h-px w-7 bg-ember-500/70" />
        ترجمان · Turjuman
        <span className="h-px w-7 bg-ember-500/70" />
      </p>
      <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
        ترجم فيديوهاتك. <span className="text-ember-400">احترافياً.</span>
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-ink-300">
        الصق رابط من YouTube/X/Vimeo/TikTok أو ارفع ملف، استلم الفيديو نفسه
        مع الترجمة محروقة عليه.
      </p>
      {freeRemaining !== null && freeTotal !== null && (
        <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-ember-500/40 bg-ember-500/10 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-ember-400">
          <span>مجاني</span>
          <span className="text-ember-300">
            {freeRemaining}/{freeTotal} دقيقة
          </span>
          <span>متبقية</span>
        </p>
      )}
    </motion.header>
  );
}
