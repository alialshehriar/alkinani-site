import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";
import { type Card, pickRandomCards, summarizeAxes, type Choice } from "../lib/cards";
import { readStats, recordPlay, type Stats } from "../lib/stats";

const ROUND_SECONDS = 6; // per-card timer
const ROUND_COUNT = 7;

type Phase = "intro" | "playing" | "loading" | "result" | "lockout";

type Profile = {
  archetype: string;
  headline: string;
  traits: string[];
  insight: string;
  blindspot: string;
  prescription: string;
};

type CopyShape = {
  eyebrow: string;
  title: string;
  sub: string;
  start: string;
  cardOf: (i: number, n: number) => string;
  timer: string;
  chooseHint: string;
  skip: string;
  loading: string;
  archetype: string;
  traits: string;
  insight: string;
  blindspot: string;
  prescription: string;
  again: string;
  share: string;
  stats: { best: string; streak: string; total: string; perfect: string };
};

const COPY: { ar: CopyShape; en: CopyShape } = {
  ar: {
    eyebrow: "/05 Reflex Lab",
    title: "٧ قرارات. ٤٢ ثانية. هويتك كمؤسس.",
    sub: "ما فيه إجابة صح. كل قرار يكشف نمطك. بعد آخر بطاقة، AI يصدر قراءتك الشخصية.",
    start: "ابدأ التحدي",
    cardOf: (i: number, n: number) => `${i + 1} من ${n}`,
    timer: "ثواني",
    chooseHint: "ضرب وحدة. ما فيه رجوع.",
    skip: "تخطّى",
    loading: "AI يحلل نمطك…",
    archetype: "نمطك",
    traits: "الصفات",
    insight: "نقاط القوة",
    blindspot: "نقطة العمى",
    prescription: "خطوتك هذا الأسبوع",
    again: "العب مرة ثانية",
    share: "شارك نمطك",
    stats: { best: "أعلى نتيجة", streak: "أيام متتالية", total: "جولات", perfect: "ممتاز" },
  },
  en: {
    eyebrow: "/05 reflex lab",
    title: "7 choices. 42 seconds. your founder identity.",
    sub: "no right answer. every pick maps your pattern. when the last card flips, AI hands you a personal reading.",
    start: "start the run",
    cardOf: (i: number, n: number) => `${i + 1} of ${n}`,
    timer: "sec",
    chooseHint: "tap one. no going back.",
    skip: "skip",
    loading: "AI is reading your pattern…",
    archetype: "archetype",
    traits: "traits",
    insight: "edge",
    blindspot: "blindspot",
    prescription: "this week",
    again: "play again",
    share: "share archetype",
    stats: { best: "best", streak: "streak", total: "runs", perfect: "perfect" },
  },
} as const;

export default function ReflexLab({ lang }: { lang: Lang }) {
  const isAr = lang === "ar";
  const L = COPY[lang];
  const [phase, setPhase] = useState<Phase>("intro");
  const [deck, setDeck] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ best: 0, streak: 0, total: 0, lastPlay: "", perfect: 0 });
  const timerRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("intro");
  const idxRef = useRef(0);

  useEffect(() => { setStats(readStats()); }, []);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  // Per-card timer
  useEffect(() => {
    if (phase !== "playing") return;
    setSecondsLeft(ROUND_SECONDS);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(timerRef.current!);
          // auto-skip if not chosen
          window.setTimeout(() => skipCard(), 0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase]);

  const start = () => {
    setError(null);
    setProfile(null);
    setChoices([]);
    setIdx(0);
    setDeck(pickRandomCards(ROUND_COUNT));
    setPhase("playing");
  };

  const choose = (side: "A" | "B") => {
    if (phaseRef.current !== "playing") return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    const card = deck[idxRef.current];
    if (!card) return;
    const next: Choice[] = [...choices, { cardId: card.id, side }];
    setChoices(next);
    advance(next);
  };

  const skipCard = () => {
    if (phaseRef.current !== "playing") return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    const card = deck[idxRef.current];
    if (!card) return;
    // Record a "skip" as a neutral side toggle — we'll track it as a missed card
    const next: Choice[] = [...choices, { cardId: card.id, side: Math.random() < 0.5 ? "A" : "B" }];
    setChoices(next);
    advance(next);
  };

  const advance = (next: Choice[]) => {
    if (next.length >= deck.length) {
      finish(next);
    } else {
      setIdx((i) => i + 1);
    }
  };

  const finish = async (final: Choice[]) => {
    setPhase("loading");
    const leans = summarizeAxes(deck, final);
    const picks = final.map((c) => {
      const card = deck.find((d) => d.id === c.cardId);
      const opt = card?.options.find((o) => o.side === c.side);
      return {
        prompt: card ? card.prompt[lang] : "",
        choice: opt ? opt.label[lang] : "",
        axis: opt?.axis ?? "",
        side: c.side,
      };
    });

    // Score: how decisive was the player? 1 means strong lean, 0 means split.
    const decisiveness = Math.round(
      Math.abs(
        Object.values(leans).reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, Object.keys(leans).length),
      ) * 100,
    );
    const finalScore = Math.min(100, Math.max(20, 40 + decisiveness));

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, picks, leans }),
      });
      if (!res.ok) {
        setError(isAr ? "فشل الاتصال." : "Connection failed.");
        setPhase("playing");
        return;
      }
      const data = (await res.json()) as Profile;
      setProfile(data);
      setStats(recordPlay(finalScore));
      setPhase("result");
    } catch {
      setError(isAr ? "فشل الاتصال." : "Connection failed.");
      setPhase("playing");
    }
  };

  const card = deck[idx];

  return (
    <section id="lab" className="relative w-full overflow-hidden px-5 py-24 sm:px-8 sm:py-40">
      <div
        className="ambient-orb pulse-soft"
        style={{
          width: 540,
          height: 540,
          top: "5%",
          [isAr ? "right" : "left"]: -180,
          background: "oklch(0.72 0.17 50 / 1)",
        }}
      />

      <div className="relative mx-auto max-w-5xl">
        <div className="grid grid-cols-1 gap-6 sm:gap-10 lg:grid-cols-12">
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7 }}
            className="text-xs uppercase tracking-[0.3em] text-ember-500 lg:col-span-4"
          >
            {L.eyebrow}
          </motion.p>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="font-semibold leading-[1.05] text-ink-100 lg:col-span-8"
            style={{ fontSize: "clamp(1.95rem, 5vw, 3.75rem)" }}
          >
            {L.title}
          </motion.h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-ink-400 sm:text-base" style={{ lineHeight: 1.65 }}>
          {L.sub}
        </p>

        {/* Stats strip */}
        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-4">
          <StatCell label={L.stats.best} value={stats.best ? `${stats.best}` : "—"} accent={stats.best >= 80 ? "ember" : "ink"} />
          <StatCell label={L.stats.streak} value={stats.streak > 0 ? `${stats.streak}🔥` : "—"} />
          <StatCell label={L.stats.total} value={stats.total ? `${stats.total}` : "—"} />
          <StatCell label={L.stats.perfect} value={stats.perfect > 0 ? `${stats.perfect}` : "—"} accent={stats.perfect > 0 ? "tide" : "ink"} />
        </div>

        {/* Game card */}
        <motion.div
          layout
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.7 }}
          className="mt-8 overflow-hidden rounded-3xl border border-ink-800 bg-ink-900/60 backdrop-blur-md"
        >
          <AnimatePresence mode="wait">
            {phase === "intro" && (
              <IntroPanel key="intro" L={L} onStart={start} totalCards={ROUND_COUNT} lang={lang} />
            )}
            {phase === "playing" && card && (
              <PlayingPanel
                key={`card-${idx}`}
                card={card}
                lang={lang}
                idx={idx}
                total={deck.length}
                secondsLeft={secondsLeft}
                onChoose={choose}
                onSkip={skipCard}
                L={L}
              />
            )}
            {phase === "loading" && (
              <LoadingPanel key="loading" label={L.loading} />
            )}
            {phase === "result" && profile && (
              <ResultPanel
                key="result"
                profile={profile}
                lang={lang}
                onAgain={start}
                L={L}
              />
            )}
          </AnimatePresence>
        </motion.div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------ subcomponents ------------------------------ */

function IntroPanel({
  L,
  onStart,
  totalCards,
  lang,
}: {
  L: CopyShape;
  onStart: () => void;
  totalCards: number;
  lang: Lang;
}) {
  const isAr = lang === "ar";
  const steps: { ar: string; en: string }[] = [
    { ar: "تشوف بطاقة قرار. ٦ ثواني.", en: "you see a decision card. 6 seconds." },
    { ar: "تضرب على واحد من الخيارين.", en: "tap one of the two options." },
    { ar: `${totalCards} بطاقات على التوالي.`, en: `${totalCards} cards in sequence.` },
    { ar: "بنهايتها AI يحلل نمطك ويعطيك قراءة شخصية.", en: "at the end AI reads your pattern and writes a profile." },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-1 gap-8 p-6 sm:grid-cols-2 sm:p-10"
    >
      <div className="space-y-5">
        <div className="text-[10px] uppercase tracking-[0.22em] text-ember-500">
          {isAr ? "كيف اللعبة" : "how it works"}
        </div>
        <ol className="space-y-3 text-sm text-ink-200 sm:text-base" style={{ lineHeight: 1.7 }}>
          {steps.map((line, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="num-display mt-1 text-ember-500 text-xs">{i + 1}</span>
              <span>{isAr ? line.ar : line.en}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          data-cursor="hover"
          onClick={onStart}
          className="rounded-xl bg-ember-500 px-6 py-3 text-sm font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:bg-ember-400"
        >
          {L.start}
        </button>
      </div>

      <div className="relative grid place-items-center rounded-2xl border border-ink-700/60 bg-gradient-to-br from-ember-500/10 via-ink-900 to-tide-500/10 p-10 min-h-[14rem]">
        <div className="text-center space-y-3">
          <div className="text-6xl sm:text-7xl">🎴</div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">
            {isAr ? "ضغط فقط · ٤٢ ثانية · قراءة شخصية" : "tap only · 42 seconds · ai reading"}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PlayingPanel({
  card,
  lang,
  idx,
  total,
  secondsLeft,
  onChoose,
  onSkip,
  L,
}: {
  card: Card;
  lang: Lang;
  idx: number;
  total: number;
  secondsLeft: number;
  onChoose: (s: "A" | "B") => void;
  onSkip: () => void;
  L: CopyShape;
}) {
  const isAr = lang === "ar";
  const danger = secondsLeft <= 2;

  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="p-5 sm:p-10"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Top bar: progress + timer */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-ink-500">
          <span>{(L as { cardOf: (i: number, n: number) => string }).cardOf(idx, total)}</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline font-en text-ink-600">{card.category[lang]}</span>
        </div>
        <div className={`flex items-center gap-2 ${danger ? "text-red-400" : "text-ember-500"}`}>
          <span className="num-display" style={{ fontSize: "1.75rem", letterSpacing: "-0.02em" }}>
            {secondsLeft}
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em]">{L.timer}</span>
        </div>
      </div>

      {/* Progress dots */}
      <div className="mt-3 flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full ${i < idx ? "bg-ember-500" : i === idx ? "bg-ember-500/60" : "bg-ink-800"}`}
          />
        ))}
      </div>

      {/* Card */}
      <div className="mt-8 space-y-7 sm:mt-10">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-ember-500/30 bg-ember-500/10 text-3xl shrink-0">
            {card.emoji}
          </span>
          <h3
            className="font-semibold text-ink-100"
            style={{ fontSize: "clamp(1.4rem, 3vw, 2.1rem)", lineHeight: 1.25 }}
          >
            {card.prompt[lang]}
          </h3>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {card.options.map((opt) => (
            <motion.button
              key={opt.side}
              type="button"
              data-cursor="hover"
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => onChoose(opt.side)}
              className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-ink-700/70 bg-gradient-to-br from-ink-900/80 to-ink-950 p-5 text-start text-ink-100 transition hover:border-ember-500/60 hover:from-ember-500/10 hover:to-ink-900 sm:min-h-[7rem]"
            >
              <span className="text-3xl sm:text-4xl">{opt.emoji ?? "•"}</span>
              <span className="font-medium" style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)", lineHeight: 1.35 }}>
                {opt.label[lang]}
              </span>
              <span className="ms-auto opacity-0 transition group-hover:opacity-100 text-ember-500">
                ↗
              </span>
            </motion.button>
          ))}
        </div>

        {/* Hints */}
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-ink-600">
          <span>{L.chooseHint}</span>
          <button
            type="button"
            data-cursor="hover"
            onClick={onSkip}
            className="text-ink-500 transition hover:text-ink-200"
          >
            {L.skip}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-[18rem] items-center justify-center p-10 text-center"
    >
      <div className="space-y-4">
        <div className="flex justify-center gap-2">
          {[0, 0.15, 0.3].map((d, i) => (
            <span
              key={i}
              className="h-3 w-3 rounded-full bg-gradient-to-br from-ember-500 to-tide-500"
              style={{ animation: `dotPulse 1.4s ease-in-out infinite ${d}s` }}
            />
          ))}
        </div>
        <p className="text-sm text-ink-400">{label}</p>
        <style>{`@keyframes dotPulse { 0%,100%{opacity:0.3;transform:scale(0.85)} 50%{opacity:1;transform:scale(1.15)} }`}</style>
      </div>
    </motion.div>
  );
}

function ResultPanel({
  profile,
  lang,
  onAgain,
  L,
}: {
  profile: Profile;
  lang: Lang;
  onAgain: () => void;
  L: CopyShape;
}) {
  const isAr = lang === "ar";

  const onShare = async () => {
    const text = isAr
      ? `نمطي كمؤسس: ${profile.archetype} 🔥\n${profile.headline}\nاكتشف نمطك: alkinani-site.pages.dev/#lab`
      : `my founder archetype: ${profile.archetype} 🔥\n${profile.headline}\ntry it: alkinani-site.pages.dev/#lab`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert(isAr ? "اتنسخ! الصق في تويتر/واتساب" : "Copied. Paste anywhere.");
      } catch { /* ignore */ }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="p-6 sm:p-10"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Hero of the result — archetype headline */}
      <div className="rounded-2xl border border-ember-500/30 bg-gradient-to-br from-ember-500/10 via-ink-950 to-tide-500/10 p-6 sm:p-8">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-ember-500">
          <span className="h-1 w-1 rounded-full bg-ember-500" />
          {L.archetype}
        </div>
        <motion.h3
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-3 font-bold text-ink-100"
          style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", lineHeight: 1.05, letterSpacing: "-0.01em" }}
        >
          {profile.archetype}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-3 text-base text-ink-300 sm:text-lg"
          style={{ lineHeight: 1.55 }}
        >
          {profile.headline}
        </motion.p>

        {profile.traits && profile.traits.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-5 flex flex-wrap gap-2"
          >
            {profile.traits.map((t, i) => (
              <span
                key={i}
                className="rounded-full border border-ember-500/30 bg-ember-500/10 px-3.5 py-1.5 text-xs text-ember-400"
              >
                {t}
              </span>
            ))}
          </motion.div>
        )}
      </div>

      {/* Body — insight, blindspot, prescription */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ResultBlock
          label={L.insight}
          body={profile.insight}
          tone="positive"
          delay={0.05}
        />
        <ResultBlock
          label={L.blindspot}
          body={profile.blindspot}
          tone="warning"
          delay={0.15}
        />
        <ResultBlock
          label={L.prescription}
          body={profile.prescription}
          tone="action"
          delay={0.25}
        />
      </div>

      {/* Actions */}
      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          data-cursor="hover"
          onClick={onAgain}
          className="rounded-xl bg-ember-500 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:bg-ember-400"
        >
          {L.again}
        </button>
        <button
          type="button"
          data-cursor="hover"
          onClick={onShare}
          className="rounded-xl border border-tide-500/40 px-5 py-2.5 text-xs uppercase tracking-[0.18em] text-tide-400 transition hover:bg-tide-500/10"
        >
          {L.share}
        </button>
      </div>
    </motion.div>
  );
}

function ResultBlock({
  label,
  body,
  tone,
  delay,
}: {
  label: string;
  body: string;
  tone: "positive" | "warning" | "action";
  delay: number;
}) {
  const map = {
    positive: { dot: "bg-tide-500", text: "text-tide-400", border: "border-tide-500/30" },
    warning:  { dot: "bg-red-400",  text: "text-red-300",  border: "border-red-500/30" },
    action:   { dot: "bg-ember-500", text: "text-ember-500", border: "border-ember-500/30" },
  } as const;
  const c = map[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className={`rounded-xl border ${c.border} bg-ink-900/50 p-5`}
    >
      <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] ${c.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
        {label}
      </div>
      <p className="mt-3 text-sm text-ink-200" style={{ lineHeight: 1.7 }}>
        {body}
      </p>
    </motion.div>
  );
}

function StatCell({
  label,
  value,
  accent = "ink",
}: {
  label: string;
  value: string;
  accent?: "ink" | "ember" | "tide";
}) {
  const colorMap = {
    ink: "text-ink-100",
    ember: "text-ember-500",
    tide: "text-tide-400",
  } as const;
  return (
    <div className="bg-ink-950 p-4 sm:p-5">
      <div className="text-[9px] uppercase tracking-[0.22em] text-ink-500 sm:text-[10px]">
        {label}
      </div>
      <div className={`num-display mt-2 ${colorMap[accent]}`} style={{ fontSize: "clamp(1.4rem, 3vw, 1.85rem)", letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </div>
  );
}
