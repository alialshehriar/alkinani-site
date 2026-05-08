import { useState } from "react";
import { createJob, jobErrorMessage } from "../../lib/turjuman";

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
];

export default function NewJob({
  onJobCreated,
  onQuotaExceeded,
  freeMinutesRemaining,
  freeMinutesTotal,
}: Props) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("ar");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createJob(url, target);
      setUrl("");
      onJobCreated();
    } catch (err) {
      const msg = jobErrorMessage(err);
      if (msg === "QUOTA_EXCEEDED") {
        onQuotaExceeded();
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-ink-700/40 bg-ink-900/40 p-5"
    >
      <h2 className="text-lg font-medium">ترجمة جديدة</h2>
      <input
        dir="ltr"
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="الصق رابط فيديو (YouTube, TikTok, Twitter, ...)"
        className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-ink-100 placeholder:text-ink-500 focus:border-ember-400 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink-300">لغة الترجمة:</label>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-ink-100 focus:border-ember-400 focus:outline-none"
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
          className="ms-auto rounded-lg bg-ember-400 px-5 py-2 font-medium text-ink-950 transition hover:bg-ember-300 disabled:opacity-50"
        >
          {submitting ? "..." : "ابدأ الترجمة"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="flex items-center justify-between text-xs text-ink-500">
        <span>حد أقصى ٣٠ دقيقة لكل مقطع.</span>
        {freeMinutesRemaining !== null && freeMinutesTotal !== null && (
          <span>
            متبقي{" "}
            <span className="text-ember-400">
              {freeMinutesRemaining}/{freeMinutesTotal}
            </span>{" "}
            دقيقة مجانية
          </span>
        )}
      </div>
    </form>
  );
}
