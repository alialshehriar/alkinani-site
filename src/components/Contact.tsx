import { motion } from "motion/react";
import { copy, t, type Lang } from "../lib/i18n";
import { ArrowUpRight, Mail, WhatsApp, X as XIcon, LinkedIn, Bithrah } from "./Icons";

const ICONS = { Email: Mail, WhatsApp, X: XIcon, LinkedIn, Bithrah };

const ease = [0.22, 1, 0.36, 1] as const;

export default function Contact({ lang }: { lang: Lang }) {
  return (
    <section id="contact" className="relative w-full overflow-hidden px-6 py-32 sm:px-8 sm:py-44">
      <div
        className="ambient-orb pulse-soft bg-ember-600"
        style={{ width: 700, height: 700, bottom: -200, [lang === "ar" ? "right" : "left"]: -150 }}
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7 }}
            className="text-xs uppercase tracking-[0.3em] text-ember-500 lg:col-span-4"
          >
            <span className="me-3 align-middle text-ink-600">/06</span>
            {t(copy.contact.section, lang)}
          </motion.p>
          <div className="lg:col-span-8">
            <motion.h2
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.9, ease }}
              className="font-semibold leading-[1.05] text-ink-100"
              style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)" }}
            >
              {t(copy.contact.title, lang)}
            </motion.h2>
            <motion.p
              initial={false}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.9, delay: 0.1 }}
              className="mt-6 max-w-xl text-ink-400"
              style={{ fontSize: "clamp(1rem, 1.4vw, 1.15rem)", lineHeight: 1.7 }}
            >
              {t(copy.contact.sub, lang)}
            </motion.p>

            <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-2 lg:grid-cols-3">
              {copy.contact.channels.map((ch, i) => {
                const Icon = ICONS[ch.label as keyof typeof ICONS];
                return (
                  <motion.a
                    key={ch.label}
                    href={ch.href}
                    target={ch.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    initial={false}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-5%" }}
                    transition={{ duration: 0.6, delay: i * 0.06 }}
                    className="group relative flex items-center justify-between gap-4 bg-ink-950 p-7 transition hover:bg-ink-900/60"
                  >
                    <div className="flex items-center gap-4">
                      {Icon && (
                        <span className="grid h-10 w-10 place-items-center rounded-lg border border-ink-700/70 text-ink-400 transition group-hover:border-ember-500/60 group-hover:text-ember-500">
                          <Icon size={18} />
                        </span>
                      )}
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-ink-500">
                          {ch.label}
                        </div>
                        <div className="mt-1.5 font-en text-base text-ink-100">{ch.value}</div>
                      </div>
                    </div>
                    <ArrowUpRight size={18} className="text-ink-500 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ember-500" />
                  </motion.a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
