import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS: Record<Lang, string[]> = {
  ar: [
    "وش تبني؟",
    "وش بذرة؟",
    "متاح لمشاريع؟",
    "كم تكلف بذرة؟",
    "ليش الـoffshore؟",
  ],
  en: [
    "What do you build?",
    "What is Bithrah?",
    "Are you available?",
    "Why offshore?",
    "How fast can you ship?",
  ],
};

const PLACEHOLDER: Record<Lang, string> = {
  ar: "اكتب سؤالك… (أو اضغط اقتراح)",
  en: "Type your question… (or pick a suggestion)",
};

const LABELS = {
  ar: { question: "السؤال", answer: "الجواب", thinking: "نظام علي يفكر…", send: "اسأل", sending: "يكتب…", clear: "ابدأ من جديد", suggestions: "أسئلة جاهزة" },
  en: { question: "QUESTION", answer: "ANSWER", thinking: "Ali's system thinking…", send: "Ask", sending: "Typing…", clear: "Reset", suggestions: "TRY" },
} as const;

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
          } catch {
            /* ignore */
          }
        }
      }
    }
    onDone();
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === "AbortError") return;
    onError(e instanceof Error ? e.message : String(e));
  }
}

export default function AskTerminal({ lang }: { lang: Lang }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isAr = lang === "ar";
  const L = LABELS[lang];

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
    abortRef.current?.abort();
  }, [lang]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: trimmed }, { role: "assistant", content: "" }];
    setMessages(next);
    setDraft("");
    setStreaming(true);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    let buffer = "";
    await streamChat(
      next.slice(0, -1), // exclude the empty assistant placeholder we added
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
    setMessages([]);
    setDraft("");
    setError(null);
    setStreaming(false);
  };

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
            ? "ذكاء اصطناعي مدرّب على صوته. يرد بلهجة علي، يعرف مشاريعه، ولو طلبت تواصل بيرجعك له."
            : "An AI trained on his voice. Speaks like Ali, knows his projects, hands you off when you want a real call."}
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

          {/* message log */}
          <div
            ref={scrollRef}
            className="max-h-[60vh] min-h-[12rem] space-y-6 overflow-y-auto p-5 sm:p-8 font-mono"
            dir={isAr ? "rtl" : "ltr"}
            style={{ scrollBehavior: "smooth" }}
          >
            {messages.length === 0 && (
              <div className="grid place-items-center py-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full border border-ink-700 bg-ink-900 text-ember-500">
                  <span className="block h-2 w-2 rounded-full bg-ember-500 motion-safe:animate-pulse" />
                </div>
                <p className="mt-4 text-sm text-ink-400 sm:text-base">
                  {isAr ? "ابدأ المحادثة. اكتب أي سؤال." : "Start the conversation. Ask anything."}
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i}>
                <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">
                  {m.role === "user" ? L.question : L.answer}
                </div>
                <div
                  className="mt-2 flex items-start gap-3"
                  style={{ fontSize: "clamp(0.95rem, 1.3vw, 1.15rem)", lineHeight: 1.65 }}
                >
                  <span className={m.role === "user" ? "text-ember-500" : "text-tide-400"}>
                    {isAr ? "←" : ">"}
                  </span>
                  <span className={`whitespace-pre-wrap break-words ${m.role === "user" ? "text-ink-100" : "text-ink-200"}`}>
                    {m.content}
                    {streaming && i === messages.length - 1 && m.role === "assistant" && (
                      <span className="ms-1 inline-block h-4 w-[2px] animate-pulse bg-tide-400 align-middle" />
                    )}
                  </span>
                </div>
              </div>
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
            {messages.length === 0 && (
              <div className="mb-4">
                <div className="mb-2 font-en text-[10px] uppercase tracking-[0.22em] text-ink-600">
                  {L.suggestions}
                </div>
                <div className="flex flex-wrap gap-2">
                  {STARTERS[lang].map((s) => (
                    <button
                      key={s}
                      type="button"
                      data-cursor="hover"
                      onClick={() => send(s)}
                      className="rounded-full border border-ink-700/70 bg-ink-900/60 px-3.5 py-1.5 text-[12px] text-ink-300 transition hover:border-ember-500/60 hover:bg-ember-500/10 hover:text-ember-500"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
