import { motion } from "motion/react";
import { copy, t, type Lang } from "../lib/i18n";

export default function Stack({ lang }: { lang: Lang }) {
  return (
    <section id="stack" className="relative w-full px-6 py-32 sm:px-8 sm:py-40">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-end">
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7 }}
            className="text-xs uppercase tracking-[0.3em] text-ember-500 lg:col-span-4"
          >
            <span className="me-3 align-middle text-ink-600">/04</span>
            {t(copy.stack.section, lang)}
          </motion.p>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="font-semibold leading-[1.05] text-ink-100 lg:col-span-8"
            style={{ fontSize: "clamp(2.25rem, 5vw, 4rem)" }}
          >
            {t(copy.stack.title, lang)}
          </motion.h2>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-2">
          {copy.stack.groups.map((group, i) => (
            <motion.div
              key={i}
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-5%" }}
              transition={{ duration: 0.6, delay: i * 0.06 }}
              className="bg-ink-950 p-8 sm:p-10"
            >
              <div className="text-xs uppercase tracking-[0.22em] text-ink-500">
                {t(group.label, lang)}
              </div>
              <ul className="mt-6 flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <li
                    key={item}
                    className="rounded-md border border-ink-700/60 bg-ink-900/40 px-3 py-1.5 font-en text-sm text-ink-200"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
