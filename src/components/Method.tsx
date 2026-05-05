import { motion } from "motion/react";
import { copy, t, type Lang } from "../lib/i18n";

const ease = [0.22, 1, 0.36, 1] as const;

export default function Method({ lang }: { lang: Lang }) {
  return (
    <section id="method" className="relative w-full overflow-hidden px-6 py-32 sm:px-8 sm:py-40">
      {/* Atmospheric horizon photo background */}
      <div className="pointer-events-none absolute inset-0">
        <picture>
          <source media="(max-width: 768px)" srcSet="/images/horizon-sm.webp" type="image/webp" />
          <source srcSet="/images/horizon.webp" type="image/webp" />
          <img
            src="/images/horizon.webp"
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-50"
          />
        </picture>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, oklch(0.13 0.03 250) 0%, oklch(0.13 0.03 250 / 0.55) 35%, oklch(0.13 0.03 250 / 0.55) 65%, oklch(0.13 0.03 250) 100%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7 }}
            className="text-xs uppercase tracking-[0.3em] text-ember-500 lg:col-span-4"
          >
            <span className="me-3 align-middle text-ink-600">/03</span>
            {t(copy.method.section, lang)}
          </motion.p>
          <div className="lg:col-span-8">
            <motion.h2
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.9, ease }}
              className="font-semibold leading-[1.05] text-ink-100"
              style={{ fontSize: "clamp(2.25rem, 5vw, 4rem)" }}
            >
              {t(copy.method.title, lang)}
            </motion.h2>
            <motion.p
              initial={false}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.9, delay: 0.1 }}
              className="mt-6 max-w-2xl text-ink-400"
              style={{ fontSize: "clamp(1rem, 1.3vw, 1.1rem)", lineHeight: 1.7 }}
            >
              {t(copy.method.body, lang)}
            </motion.p>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 gap-8 md:grid-cols-3">
          {copy.method.steps.map((step, i) => (
            <motion.div
              key={step.n}
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-8%" }}
              transition={{ duration: 0.8, delay: i * 0.1, ease }}
              className="group relative rounded-2xl border border-ink-800 bg-ink-900/60 p-8 backdrop-blur-md transition hover:border-ink-700 hover:bg-ink-900/80"
            >
              <div className="num-display text-ember-500" style={{ fontSize: "0.8rem", letterSpacing: "0.2em" }}>
                STEP {step.n}
              </div>
              <h3 className="mt-6 font-semibold text-ink-100" style={{ fontSize: "clamp(1.4rem, 2vw, 1.75rem)", lineHeight: 1.2 }}>
                {t(step.title, lang)}
              </h3>
              <p className="mt-4 text-ink-400" style={{ fontSize: "0.97rem", lineHeight: 1.65 }}>
                {t(step.body, lang)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
