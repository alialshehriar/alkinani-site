import { useEffect, useState, useCallback } from "react";
import {
  fetchMe,
  fetchQuota,
  type SessionUser,
  type Quota,
} from "../../lib/turjuman";
import LoginGate from "./LoginGate";
import LoginPending from "./LoginPending";
import Dashboard from "./Dashboard";
import PaywallModal from "./PaywallModal";

const ERROR_LABELS: Record<string, string> = {
  expired_or_used: "الرابط منتهي أو سبق استخدامه — اطلب رابطاً جديداً.",
  missing_token: "رابط الدخول غير صالح.",
};

type Mode = "loading" | "anonymous" | "authed" | "login" | "pending_email";

export default function TurjumanApp() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  const refresh = useCallback(async () => {
    const [u, qta] = await Promise.all([fetchMe(), fetchQuota().catch(() => null)]);
    setUser(u);
    setQuota(qta);
    setMode(u ? "authed" : "anonymous");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setInitialError(ERROR_LABELS[err] ?? null);
      window.history.replaceState({}, "", "/tools/turjuman");
    }
    void refresh();
  }, [refresh]);

  function handleLogout() {
    setUser(null);
    setPendingEmail(null);
    setMode("anonymous");
    void refresh();
  }

  if (mode === "loading") {
    return (
      <main className="min-h-screen bg-ink-950 text-ink-100 grid place-items-center">
        <span className="text-ink-400">...</span>
      </main>
    );
  }

  if (mode === "login") {
    return (
      <main className="min-h-screen bg-ink-950 text-ink-100">
        {pendingEmail ? (
          <LoginPending
            email={pendingEmail}
            onChangeEmail={() => setPendingEmail(null)}
          />
        ) : (
          <LoginGate
            onSent={(e) => {
              setPendingEmail(e);
              setMode("pending_email");
            }}
            initialError={initialError}
          />
        )}
        <button
          onClick={() => setMode("anonymous")}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 text-xs text-ink-500 underline-offset-4 hover:text-ember-400 hover:underline"
        >
          ← رجوع للتجربة المجانية
        </button>
      </main>
    );
  }

  if (mode === "pending_email" && pendingEmail) {
    return (
      <main className="min-h-screen bg-ink-950 text-ink-100">
        <LoginPending
          email={pendingEmail}
          onChangeEmail={() => {
            setPendingEmail(null);
            setMode("login");
          }}
        />
      </main>
    );
  }

  // anonymous OR authed both render the Dashboard now;
  // Dashboard switches based on `user` being null.
  return (
    <>
      <Dashboard
        user={user}
        quota={quota}
        onLogout={handleLogout}
        onLoginClick={() => setMode("login")}
        onQuotaExceeded={() => setPaywall(true)}
        onJobsRefresh={refresh}
      />
      {paywall && (
        <PaywallModal
          isLoggedIn={!!user}
          onLogin={() => {
            setPaywall(false);
            setMode("login");
          }}
          onClose={() => setPaywall(false)}
        />
      )}
    </>
  );
}
