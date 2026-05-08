import { useState } from "react";
import { logout, type SessionUser, type Quota } from "../../lib/turjuman";
import NewJob from "./NewJob";
import JobsList from "./JobsList";
import AnonymousHero from "./AnonymousHero";

type Props = {
  user: SessionUser | null;
  quota: Quota | null;
  onLogout: () => void;
  onLoginClick: () => void;
  onQuotaExceeded: () => void;
  onJobsRefresh: () => void;
};

export default function Dashboard({
  user,
  quota,
  onLogout,
  onLoginClick,
  onQuotaExceeded,
  onJobsRefresh,
}: Props) {
  const [nonce, setNonce] = useState(0);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  const freeRemaining = quota?.free_remaining ?? null;
  const freeTotal = quota?.free_total ?? null;

  return (
    <main className="min-h-screen bg-ink-950 text-ink-100">
      <header className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-4 sm:px-6">
        <a
          href="/tools"
          className="text-2xl font-medium tracking-tight transition hover:text-ember-400"
        >
          ترجمان
        </a>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-ink-300">
                <span className="text-ember-400">
                  {user.free_credits_remaining}
                </span>{" "}
                دقيقة مجانية
                {user.credits_balance > 0 && (
                  <>
                    {" · "}
                    <span className="text-ember-400">{user.credits_balance}</span>{" "}
                    مدفوع
                  </>
                )}
              </span>
              <span dir="ltr" className="hidden text-ink-400 sm:inline">
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="text-ink-400 transition hover:text-ink-100"
              >
                خروج
              </button>
            </>
          ) : (
            <button
              onClick={onLoginClick}
              className="rounded-lg border border-ember-400/50 bg-ember-400/10 px-4 py-1.5 text-sm text-ember-400 transition hover:bg-ember-400/20"
            >
              سجّل بإيميلك
            </button>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        {!user && (
          <AnonymousHero
            freeRemaining={freeRemaining}
            freeTotal={freeTotal}
          />
        )}

        <NewJob
          onJobCreated={() => {
            setNonce((n) => n + 1);
            onJobsRefresh();
          }}
          onQuotaExceeded={onQuotaExceeded}
          freeMinutesRemaining={user ? user.free_credits_remaining : freeRemaining}
          freeMinutesTotal={user ? 10 : freeTotal}
        />

        <div>
          <h2 className="mb-3 text-lg font-medium">ترجماتك</h2>
          <JobsList refreshNonce={nonce} />
        </div>
      </section>
    </main>
  );
}
