import { useEffect, useState } from "react";
import {
  srtDownloadUrl,
  mp4DownloadUrl,
  listenToJob,
  type Job,
  type ProgressEvent,
} from "../../lib/turjuman";

type Props = { job: Job; onTerminal?: () => void };

const STATUS_LABELS: Record<Job["status"], string> = {
  queued: "في الطابور",
  processing: "تترجم الآن…",
  done: "جاهزة",
  error: "فشل",
};

const STATUS_COLORS: Record<Job["status"], string> = {
  queued: "text-ink-400",
  processing: "text-ember-400",
  done: "text-emerald-400",
  error: "text-rose-400",
};

const STAGE_LABELS: Record<string, string> = {
  started: "بدأنا…",
  probing: "نتحقق من المصدر…",
  downloading: "نحمّل الفيديو…",
  translating: "Gemini يترجم…",
  burning: "ندمج الترجمة…",
  finalizing: "اللمسة الأخيرة…",
  done: "جاهزة",
  error: "فشل",
};

const TARGET_LABELS: Record<string, string> = {
  ar: "عربي",
  en: "English",
  es: "Español",
  zh: "中文",
};

export default function JobRow({ job, onTerminal }: Props) {
  const created = new Date(job.created_at).toLocaleString("ar");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Subscribe to SSE while the job is still in flight. The stream auto-closes
  // on terminal events; we kick a parent refresh so the row's final fields
  // (durations, download URLs) appear without waiting for the next poll.
  useEffect(() => {
    if (job.status !== "queued" && job.status !== "processing") return;
    const unsub = listenToJob(
      job.id,
      (e) => setProgress(e),
      () => onTerminal?.()
    );
    return unsub;
  }, [job.id, job.status, onTerminal]);

  const inFlight = job.status === "queued" || job.status === "processing";
  const stageLabel = progress?.stage ? STAGE_LABELS[progress.stage] : null;
  const pct = progress?.pct ?? (job.status === "processing" ? 10 : 0);

  return (
    <div className="rounded-lg border border-ink-700/40 bg-ink-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            dir="ltr"
            className="truncate text-sm text-ink-300"
            title={job.source_url}
          >
            {job.source_url.startsWith("file://") ? "📁 ملف من جهازك" : job.source_url}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {created} · {TARGET_LABELS[job.target_lang] ?? job.target_lang}
            {job.duration_seconds
              ? ` · ${Math.ceil(job.duration_seconds / 60)} د`
              : ""}
          </p>
        </div>
        <span className={`shrink-0 text-xs ${STATUS_COLORS[job.status]}`}>
          {STATUS_LABELS[job.status]}
        </span>
      </div>

      {inFlight && (
        <div className="mt-3 space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ember-500 to-ember-300 transition-all duration-500"
              style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}
            />
          </div>
          {stageLabel && (
            <p className="text-xs text-ink-400">{stageLabel} · {pct}%</p>
          )}
        </div>
      )}

      {job.status === "done" && (
        <div className="mt-3 space-y-3">
          {job.output_mp4_path && (
            showPreview ? (
              <div className="overflow-hidden rounded-xl border border-ember-400/30 bg-ink-950 shadow-lg shadow-ember-500/10">
                <video
                  key={job.id}
                  src={mp4DownloadUrl(job.id)}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full bg-black"
                >
                  متصفحك ما يدعم تشغيل الفيديو. حمّله من الزر أدناه.
                </video>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-ember-400/30 bg-gradient-to-br from-ink-900 to-ink-950 transition hover:border-ember-400/60"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,160,80,0.15),transparent_60%)]" />
                <div className="relative flex flex-col items-center gap-2">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-ember-400 text-ink-950 transition group-hover:scale-110 group-hover:bg-ember-300 sm:h-16 sm:w-16">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                  <span className="text-xs font-medium text-ink-200 sm:text-sm">شغّل المعاينة</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-ink-500 sm:text-[11px]">
                    مع الترجمة محروقة
                  </span>
                </div>
              </button>
            )
          )}
          <div className="flex flex-wrap gap-2">
            {job.output_mp4_path && (
              <a
                href={mp4DownloadUrl(job.id)}
                download
                className="rounded-md bg-ember-400 px-3 py-1.5 text-xs font-medium text-ink-950 transition hover:bg-ember-300"
              >
                ⬇ تحميل الفيديو مع الترجمة
              </a>
            )}
            <a
              href={srtDownloadUrl(job.id)}
              download
              className="rounded-md border border-ember-400/40 bg-ember-400/10 px-3 py-1.5 text-xs text-ember-400 transition hover:bg-ember-400/20"
            >
              ملف SRT فقط
            </a>
            {showPreview && (
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="rounded-md border border-ink-700/60 bg-ink-900/40 px-3 py-1.5 text-xs text-ink-400 transition hover:border-ink-500 hover:text-ink-200"
              >
                إخفاء المعاينة
              </button>
            )}
          </div>
        </div>
      )}
      {job.status === "error" && job.error_message && (
        <p className="mt-2 break-words text-xs text-rose-400">
          {friendlyError(job.error_message)}
        </p>
      )}
    </div>
  );
}

function friendlyError(raw: string): string {
  const m = /^too_long:(\d+)min>(\d+)min/.exec(raw);
  if (m) return `الفيديو ${m[1]} دقيقة، الحد الأقصى ${m[2]} دقيقة.`;
  if (raw.startsWith("too_large:")) return "الفيديو حجمه أكبر من ٥٠٠ ميغا.";
  if (raw.includes("Sign in to confirm")) return "هذا المصدر يحجبنا حالياً (يحتاج تسجيل دخول). جرّب رابط من Vimeo, TED, X (تويتر), أو TikTok.";
  if (raw.includes("HTTP Error 403")) return "المصدر يرفض التحميل (403).";
  if (raw.startsWith("url_")) return "الرابط غير صالح أو غير مدعوم.";
  if (raw.startsWith("gemini_")) return "تعذّر الترجمة عبر Gemini. حاول بعد قليل.";
  if (raw.startsWith("yt-dlp")) return "تعذّر الوصول لمحتوى الفيديو. تأكد أن الرابط عام ومتاح.";
  if (raw.includes("cobalt")) return "تعذّر الوصول للمصدر — جرّب رابط ثاني أو ارفع الملف من جهازك.";
  return raw.slice(0, 200);
}
