import { motion } from "motion/react";
import { copy, t, type Lang } from "../lib/i18n";
import CountUp from "./CountUp";

const ease = [0.22, 1, 0.36, 1] as const;

export default function Origin({ lang }: { lang: Lang }) {
  return (
    <section id="origin" className="relative w-full px-6 py-32 sm:px-8 sm:py-40">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-4">
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7 }}
            className="text-xs uppercase tracking-[0.3em] text-ember-500"
          >
            <span className="me-3 align-middle text-ink-600">/01</span>
            {t(copy.origin.section, lang)}
          </motion.p>

          {/* Photo card — hands on laptop */}
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, delay: 0.1, ease }}
            className="mt-10 overflow-hidden rounded-2xl border border-ink-800"
          >
            <picture>
              <source media="(max-width: 768px)" srcSet="/images/hands-sm.webp" type="image/webp" />
              <source srcSet="/images/hands.webp" type="image/webp" />
              <img
                src="/images/hands.webp"
                alt=""
                loading="lazy"
                decoding="async"
                className="block h-full w-full object-cover transition duration-1000 hover:scale-105"
                style={{
                  backgroundImage: "url(/images/hands-tiny.webp)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            </picture>
          </motion.div>
        </div>

        <div className="lg:col-span-8">
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, ease }}
            className="font-semibold leading-[1.05] text-ink-100"
            style={{ fontSize: "clamp(2.25rem, 5vw, 4rem)" }}
          >
            {t(copy.origin.title, lang)}
          </motion.h2>

          <motion.p
            initial={false}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, delay: 0.1 }}
            className="mt-8 max-w-2xl text-ink-300"
            style={{ fontSize: "clamp(1rem, 1.4vw, 1.15rem)", lineHeight: 1.7 }}
          >
            {t(copy.origin.body, lang)}
          </motion.p>

          <motion.blockquote
            initial={false}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className={`mt-10 ${lang === "ar" ? "border-r-2 pr-6" : "border-l-2 pl-6"} border-ember-500/70`}
            style={{ fontSize: "clamp(1.15rem, 1.7vw, 1.4rem)", lineHeight: 1.5 }}
          >
            <span className="font-medium text-ink-100">{t(copy.origin.quote, lang)}</span>
          </motion.blockquote>

          <div className="mt-14 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
            {copy.origin.stats.map((stat, i) => (
              <motion.div
                key={stat.value}
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-5%" }}
                transition={{ duration: 0.7, delay: 0.3 + i * 0.08 }}
              >
                <div className="hairline h-px w-full" />
                <div className="mt-4 text-ink-100" style={{ fontSize: "clamp(2rem, 3.5vw, 2.75rem)", letterSpacing: "-0.02em" }}>
                  <CountUp value={stat.value} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">
                  {t(stat.label, lang)}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
