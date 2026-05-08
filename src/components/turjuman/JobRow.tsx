import { srtDownloadUrl, mp4DownloadUrl, type Job } from "../../lib/turjuman";

type Props = { job: Job };

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

const TARGET_LABELS: Record<string, string> = {
  ar: "عربي",
  en: "English",
  es: "Español",
};

export default function JobRow({ job }: Props) {
  const created = new Date(job.created_at).toLocaleString("ar");
  return (
    <div className="rounded-lg border border-ink-700/40 bg-ink-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            dir="ltr"
            className="truncate text-sm text-ink-300"
            title={job.source_url}
          >
            {job.source_url}
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
      {job.status === "done" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {job.output_mp4_path && (
            <a
              href={mp4DownloadUrl(job.id)}
              className="rounded-md bg-ember-400 px-3 py-1.5 text-xs font-medium text-ink-950 transition hover:bg-ember-300"
            >
              ⬇ تحميل الفيديو مع الترجمة
            </a>
          )}
          <a
            href={srtDownloadUrl(job.id)}
            className="rounded-md border border-ember-400/40 bg-ember-400/10 px-3 py-1.5 text-xs text-ember-400 transition hover:bg-ember-400/20"
          >
            ملف SRT فقط
          </a>
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
  return raw.slice(0, 200);
}
