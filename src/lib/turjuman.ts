// Client-side helpers for the Turjuman tool.
// Backend lives at /api/turjuman/* on the same origin.

export type SessionUser = {
  id: string;
  email: string;
  credits_balance: number;
  free_credits_remaining: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}:${body}`);
  }
  return (await res.json()) as T;
}

export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const data = await api<{ user: SessionUser }>("/api/turjuman/auth/me");
    return data.user;
  } catch {
    return null;
  }
}

export type AuthProviders = {
  google: boolean;
  apple: boolean;
  phone: boolean;
  email_magic_link: boolean;
};

/** Returns which sign-in methods are actually working in this deployment. */
export async function fetchAuthProviders(): Promise<AuthProviders> {
  try {
    return await api<AuthProviders>("/api/turjuman/auth/providers");
  } catch {
    // Conservative fallback: assume only Apple+Google work (they're the
    // simplest, no DNS or SMS provider needed).
    return { google: true, apple: true, phone: false, email_magic_link: false };
  }
}

export async function requestMagicLink(email: string): Promise<{ devFallback?: boolean }> {
  return api<{ sent: boolean; devFallback?: boolean }>(
    "/api/turjuman/auth/magic-link",
    { method: "POST", body: JSON.stringify({ email }) }
  );
}

/** Hard-redirect to Google's OAuth start. Returns to /tools/turjuman after. */
export function startGoogleLogin(): void {
  window.location.href = "/api/turjuman/auth/google/start";
}

/** Hard-redirect to Apple's OAuth start. Returns to /tools/turjuman after. */
export function startAppleLogin(): void {
  window.location.href = "/api/turjuman/auth/apple/start";
}

export async function requestPhoneOtp(phone: string): Promise<{ sent: boolean; channel: string }> {
  return api<{ sent: boolean; channel: string }>(
    "/api/turjuman/auth/phone/request",
    { method: "POST", body: JSON.stringify({ phone }) }
  );
}

export async function verifyPhoneOtp(phone: string, code: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(
    "/api/turjuman/auth/phone/verify",
    { method: "POST", body: JSON.stringify({ phone, code }) }
  );
}

export function phoneAuthErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("invalid_phone")) return "رقم الجوال غير صحيح. اكتبه بصيغة دولية (+9665XXXXXXXX).";
  if (msg.includes("rate_limited")) return "أرسلنا كود قبل قليل. حاول بعد ساعة.";
  if (msg.includes("send_failed")) return "تعذر إرسال الكود. حاول مرة ثانية أو استخدم Google.";
  if (msg.includes("sms_not_configured")) return "تسجيل الجوال غير مفعّل حالياً. استخدم Google أو الإيميل.";
  if (msg.includes("no_pending_otp")) return "ما طلبت كود لهذا الرقم. اطلب كود جديد.";
  if (msg.includes("expired")) return "انتهت صلاحية الكود. اطلب كود جديد.";
  if (msg.includes("wrong_code")) return "الكود غير صحيح. تأكد ثم حاول.";
  if (msg.includes("too_many_attempts")) return "محاولات كثيرة. اطلب كود جديد.";
  if (msg.includes("already_used")) return "تم استخدام هذا الكود. اطلب كود جديد.";
  return "حدث خطأ. حاول مرة أخرى.";
}

export async function logout(): Promise<void> {
  await api<{ ok: true }>("/api/turjuman/auth/logout", { method: "POST" });
}

export type Quota = {
  kind: "user" | "anon" | "anon_fresh";
  free_remaining?: number;
  free_total?: number;
  session_user_id?: string;
};

export async function fetchQuota(): Promise<Quota> {
  return api<Quota>("/api/turjuman/jobs/quota/me");
}

/**
 * Translate an opaque magic-link error code to a user-facing Arabic message.
 */
export function magicLinkErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("disposable_email")) return "بريد مؤقت غير مدعوم.";
  if (msg.includes("invalid_email")) return "صيغة البريد غير صحيحة.";
  if (msg.includes("rate_limited")) return "أرسلنا رابطاً قبل قليل. تحقّق من بريدك أو حاول بعد ساعة.";
  if (msg.includes("email_failed")) return "تعذر إرسال البريد. حاول بعد دقيقة.";
  return "حدث خطأ. حاول مرة أخرى.";
}

/* -------------------------- Jobs -------------------------- */

export type JobStatus = "queued" | "processing" | "done" | "error";

export type Job = {
  id: string;
  user_id: string;
  source_url: string;
  target_lang: string;
  status: JobStatus;
  duration_seconds: number | null;
  credits_charged: number;
  error_message: string | null;
  output_srt_path: string | null;
  output_mp4_path: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
};

export type JobOptions = {
  /** "ar" | "en" | "es" | "zh" or null/undefined for Gemini auto-detect. */
  sourceLang?: string | null;
  /** Subtitle burn-in size: S/M/L. Defaults to M when omitted. */
  subtitleSize?: "S" | "M" | "L" | null;
};

export async function createJob(
  url: string,
  targetLang: string,
  opts: JobOptions = {}
): Promise<Job> {
  const body: Record<string, unknown> = { url, target_lang: targetLang };
  if (opts.sourceLang) body.source_lang = opts.sourceLang;
  if (opts.subtitleSize) body.subtitle_size = opts.subtitleSize;
  const data = await api<{ job: Job }>("/api/turjuman/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.job;
}

export async function listJobs(): Promise<Job[]> {
  const data = await api<{ jobs: Job[] }>("/api/turjuman/jobs");
  return data.jobs;
}

export function srtDownloadUrl(id: string): string {
  return `/api/turjuman/jobs/${id}/srt`;
}

export function mp4DownloadUrl(id: string): string {
  return `/api/turjuman/jobs/${id}/mp4`;
}

/**
 * Upload a file via XHR so we can stream progress events to the UI.
 * Returns the created Job.
 */
export function uploadFile(
  file: File,
  targetLang: string,
  onProgress: (pct: number) => void,
  opts: JobOptions = {}
): Promise<Job> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("target_lang", targetLang);
    if (opts.sourceLang) fd.append("source_lang", opts.sourceLang);
    if (opts.subtitleSize) fd.append("subtitle_size", opts.subtitleSize);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/turjuman/jobs/upload");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body.job);
        else reject(new Error(`${xhr.status}:${xhr.responseText}`));
      } catch (e) {
        reject(new Error(`upload_parse:${String(e)}`));
      }
    };
    xhr.onerror = () => reject(new Error("upload_network"));
    xhr.send(fd);
  });
}

/* -------------------------- Live progress (SSE) -------------------------- */

export type ProgressStage =
  | "started" | "probing" | "downloading" | "translating"
  | "burning" | "finalizing" | "done" | "error";

export type ProgressEvent = {
  stage: ProgressStage;
  pct: number;
  durationSec?: number;
  charged?: number;
  error?: string;
  t?: number;
};

/**
 * Subscribe to live job progress over SSE. Returns an unsubscribe.
 * The browser auto-reconnects on transient drops; we only handle the
 * happy + terminal paths here.
 */
export function listenToJob(
  jobId: string,
  onEvent: (e: ProgressEvent) => void,
  onTerminal?: (e: ProgressEvent) => void
): () => void {
  const es = new EventSource(`/api/turjuman/jobs/${jobId}/stream`, {
    withCredentials: true,
  });
  const handle = (terminal: boolean) => (raw: MessageEvent) => {
    try {
      const evt = JSON.parse(raw.data) as ProgressEvent;
      onEvent(evt);
      if (terminal) {
        onTerminal?.(evt);
        es.close();
      }
    } catch { /* ignore parse errors */ }
  };
  es.addEventListener("progress", handle(false));
  es.addEventListener("done", handle(true));
  es.addEventListener("error", handle(true));
  return () => es.close();
}

/* -------------------------- Payments -------------------------- */

export type CheckoutTier = "starter" | "pro" | "studio";

export type TierInfo = {
  id: CheckoutTier;
  label: string;
  minutes: number;
  price_sar: number;
  configured: boolean;
};

export async function fetchTiers(): Promise<TierInfo[]> {
  const data = await api<{ tiers: TierInfo[] }>("/api/turjuman/payments/tiers");
  return data.tiers;
}

export async function createCheckout(tier: CheckoutTier): Promise<string> {
  const data = await api<{ url: string }>("/api/turjuman/payments/create-checkout", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
  return data.url;
}

export function checkoutErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("unauthenticated") || msg.includes("session_expired")) {
    return "سجّل دخولك أولاً ثم أعد المحاولة.";
  }
  if (msg.includes("payments_disabled")) return "الدفع غير متاح حالياً.";
  if (msg.includes("tier_unavailable")) return "هذي الباقة قيد التفعيل.";
  if (msg.includes("invalid_tier")) return "باقة غير صحيحة.";
  return "تعذّر فتح الدفع. حاول مرة ثانية.";
}

export function jobErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("anonymous_quota_exceeded")) return "QUOTA_EXCEEDED";
  if (msg.includes("url_invalid_url")) return "الرابط غير صالح.";
  if (msg.includes("url_invalid_scheme")) return "الرابط يجب أن يبدأ بـ https.";
  if (msg.includes("url_private_ip_blocked")) return "الرابط يشير لعنوان خاص.";
  if (msg.includes("url_dns_resolve_failed")) return "تعذر الوصول للرابط.";
  if (msg.includes("invalid_target_lang")) return "اللغة الهدف غير مدعومة.";
  if (msg.includes("invalid_source_lang")) return "اللغة المصدر غير مدعومة.";
  if (msg.includes("same_source_target")) return "اللغة المصدر واللغة الهدف ما يصيرون نفس الشيء.";
  if (msg.includes("invalid_subtitle_size")) return "حجم الترجمة غير صحيح.";
  if (msg.includes("session_expired")) return "انتهت الجلسة. سجّل الدخول مرة أخرى.";
  return "حدث خطأ. حاول مرة أخرى.";
}

/**
 * Translates a *pipeline* failure string (the one stored in turjuman_jobs.
 * error_message after the worker rejects) into a user-facing Arabic line.
 *
 * Different signature from jobErrorMessage above (which handles errors
 * thrown synchronously by the create-job endpoint). This one is keyed to
 * the strings the worker throws + the error patterns ffmpeg/yt-dlp/Gemini
 * surface verbatim into the DB row.
 */
export function jobFailureMessage(errorMessage: string | null | undefined): string {
  if (!errorMessage) return "تعذّرت الترجمة.";
  const m = errorMessage.toLowerCase();
  if (m.startsWith("silent_audio") || m.includes("silent_audio"))
    return "الفيديو ما فيه صوت واضح. تأكد إن المقطع فيه كلام مسموع.";
  if (m.includes("sign in to confirm") || m.includes("youtube") && m.includes("bot"))
    return "يوتيوب يحجب التنزيل من خوادمنا حالياً. جرّب رابط ثاني أو ارفع الفيديو مباشرة.";
  if (m.includes("instagram"))
    return "إنستجرام يحجب تنزيل هذا المقطع. جرّب رابط من يوتيوب أو X أو ارفع الملف مباشرة.";
  if (m.startsWith("too_long:"))
    return "المقطع أطول من ٣٠ دقيقة. قسّمه واطلب ترجمة كل جزء على حدة.";
  if (m.includes("audio_extract_failed"))
    return "تعذّر استخراج الصوت من الفيديو. تأكد إن الملف غير معطوب.";
  if (m.includes("gemini_no_cues") || m.includes("gemini_chunk_failed"))
    return "ما قدر النموذج يستخرج ترجمة من هذا المقطع. غالباً صوت غير واضح أو لغة غير مدعومة.";
  if (m.includes("gemini_empty_response") || m.includes("blockreason"))
    return "النموذج رفض ترجمة هذا المقطع. جرّب مقطع آخر.";
  if (m.includes("ffmpeg burn failed"))
    return "تعذّرت كتابة الترجمة على الفيديو. حاول مرة ثانية.";
  return "تعذّرت الترجمة. حاول مرة ثانية أو راسلنا لو تكرر.";
}
