import { useEffect, useState } from "react";
import { fetchMe, type SessionUser } from "../../lib/turjuman";
import LoginGate from "./LoginGate";
import LoginPending from "./LoginPending";
import Dashboard from "./Dashboard";

const ERROR_LABELS: Record<string, string> = {
  expired_or_used: "الرابط منتهي أو سبق استخدامه — اطلب رابطاً جديداً.",
  missing_token: "رابط الدخول غير صالح.",
};

export default function TurjumanApp() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [initialError, setInitialError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setInitialError(ERROR_LABELS[err] ?? null);
      // Clean the URL bar — keep path /tools/turjuman, drop query.
      window.history.replaceState({}, "", "/tools/turjuman");
    }
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    const u = await fetchMe();
    setUser(u);
    setLoading(false);
  }

  function handleLogout() {
    setUser(null);
    setPendingEmail(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink-950 text-ink-100 grid place-items-center">
        <span className="text-ink-400">...</span>
      </main>
    );
  }

  if (user) return <Dashboard user={user} onLogout={handleLogout} />;
  if (pendingEmail) {
    return (
      <LoginPending
        email={pendingEmail}
        onChangeEmail={() => setPendingEmail(null)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-ink-950 text-ink-100">
      <LoginGate onSent={setPendingEmail} initialError={initialError} />
    </main>
  );
}
