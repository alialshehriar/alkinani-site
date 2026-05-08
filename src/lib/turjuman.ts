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

/**
 * Translate an opaque magic-link error code to a user-facing Arabic message.
 */
export function magicLinkErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("disposable_email")) return "بريد مؤقت غير مدعوم.";
  if (msg.includes("invalid_email")) return "صيغة البريد غير صحيحة.";
  if (msg.includes("rate_limited")) return "حاول بعد ساعة، تم تجاوز الحد.";
  if (msg.includes("email_failed")) return "تعذر إرسال البريد. حاول بعد دقيقة.";
  return "حدث خطأ. حاول مرة أخرى.";
}
