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

export async function requestMagicLink(email: string): Promise<{ devFallback?: boolean }> {
  return api<{ sent: boolean; devFallback?: boolean }>(
    "/api/turjuman/auth/magic-link",
    { method: "POST", body: JSON.stringify({ email }) }
  );
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

export async function createJob(url: string, targetLang: string): Promise<Job> {
  const data = await api<{ job: Job }>("/api/turjuman/jobs", {
    method: "POST",
    body: JSON.stringify({ url, target_lang: targetLang }),
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
  onProgress: (pct: number) => void
): Promise<Job> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("target_lang", targetLang);

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

export function jobErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("anonymous_quota_exceeded")) return "QUOTA_EXCEEDED";
  if (msg.includes("url_invalid_url")) return "الرابط غير صالح.";
  if (msg.includes("url_invalid_scheme")) return "الرابط يجب أن يبدأ بـ https.";
  if (msg.includes("url_private_ip_blocked")) return "الرابط يشير لعنوان خاص.";
  if (msg.includes("url_dns_resolve_failed")) return "تعذر الوصول للرابط.";
  if (msg.includes("invalid_target_lang")) return "اللغة الهدف غير مدعومة.";
  if (msg.includes("session_expired")) return "انتهت الجلسة. سجّل الدخول مرة أخرى.";
  return "حدث خطأ. حاول مرة أخرى.";
}
