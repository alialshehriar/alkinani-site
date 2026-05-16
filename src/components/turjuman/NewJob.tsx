import { useRef, useState } from "react";
import { createJob, jobErrorMessage, uploadFile } from "../../lib/turjuman";

type Props = {
  onJobCreated: () => void;
  onQuotaExceeded: () => void;
  freeMinutesRemaining: number | null;
  freeMinutesTotal: number | null;
};

const TARGETS = [
  { value: "ar", label: "عربي" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "zh", label: "中文" },
];

const MAX_UPLOAD_MB = 500;

export default function NewJob({
  onJobCreated,
  onQuotaExceeded,
  freeMinutesRemaining,
  freeMinutesTotal,
}: Props) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("ar");
  const [submitting, setSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleSubmitOk() {
    setUrl("");
    setSubmitting(false);
    setProgressMsg(null);
    onJobCreated();
  }

  function handleSubmitErr(err: unknown) {
    const msg = jobErrorMessage(err);
    if (msg === "QUOTA_EXCEEDED") {
      onQuotaExceeded();
    } else {
      setError(msg);
    }
    setSubmitting(false);
    setProgressMsg(null);
  }

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setError(null);
    setSubmitting(true);
    try {
      await createJob(url, target);
      handleSubmitOk();
    } catch (err) {
      handleSubmitErr(err);
    }
  }

  async function submitFile(file: File) {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`الملف أكبر من ${MAX_UPLOAD_MB} ميجا.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    setProgressMsg("جاري رفع الملف…");
    try {
      await uploadFile(file, target, (pct) => {
        setProgressMsg(`جاري الرفع… ${pct}٪`);
      });
      handleSubmitOk();
    } catch (err) {
      handleSubmitErr(err);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void submitFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void submitFile(f);
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={submitUrl}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative overflow-hidden rounded-2xl border bg-ink-900/40 p-5 backdrop-blur-md transition ${
          dragOver
            ? "border-ember-400 bg-ember-500/5"
            : "border-ink-700/50 hover:border-ink-600"
        }`}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ember-500/10 text-lg font-medium text-ember-400">
            ↓ أسقط الملف هنا
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-ink-500">
          <span className="h-px w-5 bg-ember-500/50" />
          ترجمة جديدة
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            dir="ltr"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="الصق رابط (YouTube · TikTok · X · Vimeo · ١٩٠٠+ موقع)"
            className="flex-1 rounded-xl border border-ink-700/60 bg-ink-950 px-4 py-3 text-ink-100 placeholder:text-ink-500 focus:border-ember-400 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <span className="text-ink-500">أو</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-initial rounded-xl border border-ink-700/60 bg-ink-950 px-4 py-3 text-sm text-ink-200 transition hover:border-ember-400 hover:text-ember-400 active:bg-ember-400/10"
            >
              ⬆ ارفع ملف من جهازك
            </button>
          </div>
          {/*
            `capture="environment"` was forcing the rear camera on mobile —
            users couldn't pick an existing video from their gallery or
            Files app. Dropping it lets iOS show "Photo Library / Take
            Photo or Video / Choose File" as expected, and Android shows
            the gallery + Files picker.
          */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Mobile-only hint: drag-drop doesn't fire on iOS Safari, so make the
            upload tap target explicit. */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-ink-700/60 bg-ink-950/40 py-3 text-xs text-ink-400 transition hover:border-ember-400/60 hover:text-ember-400 sm:hidden"
        >
          <span>📱</span>
          <span>اضغط هنا لرفع فيديو من معرض الجوال</span>
        </button>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-ink-300">لغة الترجمة:</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="rounded-lg border border-ink-700/60 bg-ink-950 px-3 py-2 text-ink-100 focus:border-ember-400 focus:outline-none"
          >
            {TARGETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting || !url}
            className="ms-auto rounded-xl bg-gradient-to-br from-ember-500 to-ember-400 px-6 py-2.5 text-sm font-medium text-ink-950 transition hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? (progressMsg ?? "...") : "ابدأ الترجمة"}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

        <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
          <span>حد أقصى ٣٠ دقيقة لكل مقطع · ملف حتى {MAX_UPLOAD_MB} ميجا.</span>
          {freeMinutesRemaining !== null && freeMinutesTotal !== null && (
            <span>
              <span className="text-ember-400">
                {freeMinutesRemaining}/{freeMinutesTotal}
              </span>{" "}
              دقيقة مجانية
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
