import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";
import { speak, progressLevel, type SpeakHandle } from "../lib/tts";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS: Record<Lang, string[]> = {
  ar: [
    "وش تبني فعلاً؟",
    "كيف أبدأ مشروعي؟",
    "متاح للمشاريع؟",
    "كم تكلف بذرة لو اطلقتها؟",
    "ليش offshore؟",
  ],
  en: [
    "What do you actually build?",
    "How should I start my project?",
    "Available for projects?",
    "What does Bithrah cost?",
    "Why offshore?",
  ],
};

// Follow-up chips shown after at least one assistant message has streamed.
const FOLLOWUPS: Record<Lang, string[]> = {
  ar: [
    "اشرح أكثر",
    "أعطني رقم محدد",
    "وش الخطوة الأولى؟",
    "كيف نبدأ سوا؟",
    "اضرب لي مثال حقيقي",
  ],
  en: [
    "go deeper",
    "give me a number",
    "what's the first step?",
    "how do we start?",
    "give a concrete example",
  ],
};

const PLACEHOLDER: Record<Lang, string> = {
  ar: "اسأله أي شي… يفهم نجدي.",
  en: "Ask anything…",
};

const LABELS = {
  ar: {
    question: "أنت",
    answer: "نظام علي",
    thinking: "يفكر…",
    send: "ارسل",
    sending: "يكتب…",
    clear: "محادثة جديدة",
    suggestions: "ابدأ بـ",
    followups: "اسأل أكثر",
    play: "اسمع",
    stop: "أوقف",
    restore: "ترجع للمحادثة السابقة؟",
    restoreYes: "أكمل",
    restoreNo: "ابدأ من جديد",
  },
  en: {
    question: "you",
    answer: "ali's system",
    thinking: "thinking…",
    send: "send",
    sending: "typing…",
    clear: "new chat",
    suggestions: "start with",
    followups: "follow up",
    play: "play",
    stop: "stop",
    restore: "Resume previous conversation?",
    restoreYes: "resume",
    restoreNo: "start fresh",
  },
} as const;

const STORE_KEY = "alk-chat-history-v1";

function loadHistory(): { messages: Msg[]; lang: Lang } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { messages?: Msg[]; lang?: Lang };
    if (!parsed.messages || !parsed.messages.length) return null;
    return { messages: parsed.messages, lang: parsed.lang ?? "ar" };
  } catch { return null; }
}

function saveHistory(messages: Msg[], lang: Lang) {
  if (typeof localStorage === "undefined") return;
  try {
    // Keep only the last 8 messages (4 exchanges) to stay under storage limits.
    const trimmed = messages.slice(-8);
    localStorage.setItem(STORE_KEY, JSON.stringify({ messages: trimmed, lang }));
  } catch { /* ignore */ }
}

function clearHistory() {
  if (typeof localStorage === "undefined") return;
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}

async function streamChat(
  messages: Msg[],
  onDelta: (chunk: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  abort: AbortController,
) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: abort.signal,
    });
    if (!res.ok || !res.body) {
      onError(`HTTP ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let event = "message";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) {
          event = "message";
          continue;
        }
        if (line.startsWith("event: ")) {
          event = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            if (event === "delta" && data.delta) onDelta(data.delta);
            else if (event === "error") onError(data.error || "stream error");
            else if (event === "done") onDone();
          } catch { /* ignore */ }
        }
      }
    }
    onDone();
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === "AbortError") return;
    onError(e instanceof Error ? e.message : String(e));
  }
}

/* -------------------------------- Component -------------------------------- */

export default function AskTerminal({ lang }: { lang: Lang }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeOffer, setResumeOffer] = useState<Msg[] | null>(null);
  const [voiceIdx, setVoiceIdx] = useState<number | null>(null);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const voiceHandleRef = useRef<SpeakHandle | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isAr = lang === "ar";
  const L = LABELS[lang];

  // Offer to resume saved conversation on first mount
  useEffect(() => {
    const saved = loadHistory();
    if (saved && saved.lang === lang && saved.messages.length > 0) {
      setResumeOffer(saved.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist history whenever messages change
  useEffect(() => {
    if (messages.length > 0) saveHistory(messages, lang);
  }, [messages, lang]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // Reset on language change
  useEffect(() => {
    setMessages([]);
    setError(null);
    setVoiceIdx(null);
    voiceHandleRef.current?.stop?.(); voiceHandleRef.current = null;
    abortRef.current?.abort();
    setResumeOffer(null);
  }, [lang]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    voiceHandleRef.current?.stop?.(); voiceHandleRef.current = null;
    setVoiceIdx(null);
    setError(null);
    setResumeOffer(null);
    const next: Msg[] = [...messages, { role: "user", content: trimmed }, { role: "assistant", content: "" }];
    setMessages(next);
    setDraft("");
    setStreaming(true);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    let buffer = "";
    await streamChat(
      next.slice(0, -1),
      (delta) => {
        buffer += delta;
        setMessages((prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { role: "assistant", content: buffer };
          return copy;
        });
      },
      () => {
        setStreaming(false);
        if (!buffer.trim()) {
          setMessages((prev) => prev.slice(0, -1));
          setError(isAr ? "ما رد. جرب مرة ثانية." : "No reply. Try again.");
        }
      },
      (err) => {
        setStreaming(false);
        setMessages((prev) => prev.slice(0, -2));
        setError(err);
      },
      abort,
    );
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    voiceHandleRef.current?.stop?.(); voiceHandleRef.current = null;
    setMessages([]);
    setDraft("");
    setError(null);
    setStreaming(false);
    setVoiceIdx(null);
    setResumeOffer(null);
    clearHistory();
  };

  const playVoice = async (idx: number) => {
    const m = messages[idx];
    if (!m || m.role !== "assistant" || !m.content.trim()) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    // Toggle off if already playing this message
    if (voiceIdx === idx) {
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      setVoiceIdx(null);
      setVoiceProgress(0);
      return;
    }
    voiceHandleRef.current?.stop();
    setVoiceIdx(idx);
    setVoiceProgress(0);
    voiceHandleRef.current = await speak({
      lang,
      text: m.content,
      onChunk: (i, total) => setVoiceProgress(progressLevel(i, total)),
      onEnd: () => {
        setVoiceIdx((cur) => (cur === idx ? null : cur));
        setVoiceProgress(0);
        voiceHandleRef.current = null;
      },
      onError: () => {
        setVoiceIdx(null);
        setVoiceProgress(0);
        voiceHandleRef.current = null;
      },
    });
  };

  const acceptResume = () => {
    if (!resumeOffer) return;
    setMessages(resumeOffer);
    setResumeOffer(null);
  };
  const declineResume = () => {
    setResumeOffer(null);
    clearHistory();
  };

  // Pick chip set based on whether assistant has replied at least once
  const hasAnyAssistantReply = messages.some(
    (m) => m.role === "assistant" && m.content.trim().length > 0,
  );
  const chips = hasAnyAssistantReply ? FOLLOWUPS[lang] : STARTERS[lang];
  const chipLabel = hasAnyAssistantReply ? L.followups : L.suggestions;

  return (
    <section id="ask" className="relative w-full overflow-hidden px-4 py-24 sm:px-8 sm:py-40">
      <div
        className="ambient-orb pulse-soft"
        style={{
          width: 500,
          height: 500,
          top: "10%",
          [isAr ? "left" : "right"]: -150,
          background: "oklch(0.78 0.12 210 / 1)",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-6 sm:gap-10 lg:grid-cols-12">
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7 }}
            className="text-xs uppercase tracking-[0.3em] text-ember-500 lg:col-span-4"
          >
            <span className="me-3 align-middle text-ink-600">/04</span>
            {isAr ? "اسأل علي" : "Ask Ali"}
          </motion.p>

          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="font-semibold leading-[1.05] text-ink-100 lg:col-span-8"
            style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}
          >
            {isAr ? "تكلّم مع نظامي." : "Talk to my system."}
          </motion.h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-ink-500 sm:text-base">
          {isAr
            ? "ذكاء اصطناعي مدرّب على صوته. اضغط 🔊 على أي رد عشان تسمعه. المحادثة محفوظة لما ترجع."
            : "An AI trained on his voice. Tap 🔊 on any reply to hear it. The conversation persists when you come back."}
        </p>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.9 }}
          className="mt-10 overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/50 shadow-2xl backdrop-blur-md"
        >
          {/* terminal chrome */}
          <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full bg-ink-700 shrink-0" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-700 shrink-0" />
              <span className="h-2.5 w-2.5 rounded-full bg-ember-500/80 shrink-0" />
              <span className="ms-3 truncate font-en text-[10px] uppercase tracking-[0.2em] text-ink-500 sm:text-[11px]">
                ali@gulf:~$ talk
              </span>
            </div>
            <div className="flex items-center gap-3">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  data-cursor="hover"
                  className="font-en text-[10px] uppercase tracking-[0.2em] text-ink-500 transition hover:text-ink-200"
                >
                  {L.clear}
                </button>
              )}
              <span className="font-en text-[10px] uppercase tracking-[0.22em] text-emerald-400">
                ● live
              </span>
            </div>
          </div>

          {/* Resume banner */}
          <AnimatePresence>
            {resumeOffer && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden border-b border-ink-800 bg-tide-500/10 px-4 py-3 sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-tide-400">
                    {L.restore}
                  </span>
                  <button
                    type="button"
                    onClick={acceptResume}
                    data-cursor="hover"
                    className="rounded-md bg-tide-500 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-950 transition hover:bg-tide-400"
                  >
                    {L.restoreYes}
                  </button>
                  <button
                    type="button"
                    onClick={declineResume}
                    data-cursor="hover"
                    className="text-[11px] uppercase tracking-[0.2em] text-ink-500 transition hover:text-ink-200"
                  >
                    {L.restoreNo}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* message log */}
          <div
            ref={scrollRef}
            className="max-h-[60vh] min-h-[14rem] space-y-5 overflow-y-auto p-4 sm:p-7"
            dir={isAr ? "rtl" : "ltr"}
            style={{ scrollBehavior: "smooth" }}
          >
            {messages.length === 0 && !resumeOffer && (
              <div className="grid place-items-center py-8 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full border border-ink-700 bg-ink-900">
                  <span className="block h-3 w-3 rounded-full bg-gradient-to-br from-ember-500 to-tide-500 motion-safe:animate-pulse" />
                </span>
                <p className="mt-4 text-sm text-ink-400 sm:text-base">
                  {isAr ? "ابدأ المحادثة. اسأل أي شي." : "Start the conversation. Ask anything."}
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <Bubble
                key={i}
                msg={m}
                lang={lang}
                isStreaming={streaming && i === messages.length - 1 && m.role === "assistant"}
                playing={voiceIdx === i}
                playProgress={voiceIdx === i ? voiceProgress : 0}
                onPlay={() => playVoice(i)}
                playLabel={voiceIdx === i ? L.stop : L.play}
                roleLabel={m.role === "user" ? L.question : L.answer}
              />
            ))}

            {streaming && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-tide-400 motion-safe:animate-bounce" />
                  <span className="h-1.5 w-1.5 rounded-full bg-tide-400 motion-safe:animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-tide-400 motion-safe:animate-bounce" style={{ animationDelay: "0.3s" }} />
                </span>
                <span>{L.thinking}</span>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* input row */}
          <div className="border-t border-ink-800 bg-ink-950/40 p-4 sm:p-5">
            <div className="mb-3">
              <div className="mb-2 font-en text-[10px] uppercase tracking-[0.22em] text-ink-600">
                {chipLabel}
              </div>
              <div className="flex flex-wrap gap-2">
                {chips.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-cursor="hover"
                    disabled={streaming}
                    onClick={() => send(s)}
                    className="rounded-full border border-ink-700/70 bg-ink-900/60 px-3.5 py-1.5 text-[12px] text-ink-300 transition hover:border-ember-500/60 hover:bg-ember-500/10 hover:text-ember-500 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
              className="flex items-end gap-2 rounded-xl border border-ink-700/70 bg-ink-900/60 px-3 py-2 transition focus-within:border-ember-500/60"
              dir={isAr ? "rtl" : "ltr"}
            >
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                placeholder={PLACEHOLDER[lang]}
                rows={1}
                disabled={streaming}
                className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-base text-ink-100 placeholder:text-ink-600 focus:outline-none disabled:opacity-50"
                style={{ fontFamily: "inherit", fontSize: "16px" }}
              />
              <button
                type="submit"
                data-cursor="hover"
                disabled={streaming || !draft.trim()}
                className="shrink-0 rounded-lg bg-ember-500 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:bg-ember-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-500"
              >
                {streaming ? L.sending : L.send}
              </button>
            </form>
            <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink-600" dir={isAr ? "rtl" : "ltr"}>
              {isAr ? "Enter للإرسال · Shift+Enter لسطر جديد" : "Enter to send · Shift+Enter for new line"}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------- Sub-pieces ------------------------------- */

function Bubble({
  msg,
  lang,
  isStreaming,
  playing,
  playProgress,
  onPlay,
  playLabel,
  roleLabel,
}: {
  msg: Msg;
  lang: Lang;
  isStreaming: boolean;
  playing: boolean;
  playProgress: number;
  onPlay: () => void;
  playLabel: string;
  roleLabel: string;
}) {
  const isAr = lang === "ar";
  const user = msg.role === "user";
  const ttsAvailable = typeof window !== "undefined" && !!window.speechSynthesis;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`flex items-start gap-3 ${user ? "flex-row-reverse text-end" : ""}`}
    >
      {/* avatar */}
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full">
        {user ? (
          <span className="grid h-8 w-8 place-items-center rounded-full border border-ink-700 bg-ink-900 text-[10px] uppercase tracking-[0.22em] text-ink-400">
            {isAr ? "أنت" : "you"}
          </span>
        ) : (
          <motion.span
            animate={playing ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={playing ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
            className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-ember-500 to-tide-500 text-[10px] font-bold text-ink-950"
          >
            ع
          </motion.span>
        )}
      </span>

      {/* content column */}
      <div className={`min-w-0 flex-1 space-y-1.5`}>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-ink-500">
          <span>{roleLabel}</span>
          {!user && msg.content.trim().length > 0 && ttsAvailable && (
            <button
              type="button"
              data-cursor="hover"
              onClick={onPlay}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 transition ${playing ? "border-ember-500/60 text-ember-500 bg-ember-500/10" : "border-ink-700 text-ink-400 hover:border-ember-500/40 hover:text-ember-500"}`}
              aria-pressed={playing}
            >
              {playing ? (
                <Waveform />
              ) : (
                <span aria-hidden>▶</span>
              )}
              <span>{playLabel}</span>
            </button>
          )}
        </div>
        <div
          className={`relative whitespace-pre-wrap break-words rounded-2xl px-4 py-3 ${user ? "bg-ember-500/10 text-ink-100 border border-ember-500/20" : "bg-ink-900/70 text-ink-100 border border-ink-700/70"}`}
          style={{ fontSize: "clamp(0.95rem, 1.3vw, 1.1rem)", lineHeight: 1.65 }}
        >
          {msg.content}
          {isStreaming && (
            <span className="ms-1 inline-block h-4 w-[2px] animate-pulse bg-tide-400 align-middle" />
          )}
          {playing && (
            <span className="pointer-events-none absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full">
              <span
                className="block h-full bg-gradient-to-r from-ember-500 to-tide-500 transition-[width] duration-300"
                style={{ width: `${Math.round(playProgress * 100)}%` }}
              />
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Waveform() {
  return (
    <span className="inline-flex items-end gap-[2px] h-3" aria-hidden>
      {[0, 0.2, 0.4, 0.2, 0].map((d, i) => (
        <span
          key={i}
          className="block w-[2px] rounded-full bg-current"
          style={{
            height: "60%",
            animation: `voiceBars 0.9s ease-in-out ${d}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes voiceBars { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }`}</style>
    </span>
  );
}
