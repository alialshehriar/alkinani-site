import { useState } from "react";
import { logout, type SessionUser } from "../../lib/turjuman";
import NewJob from "./NewJob";
import JobsList from "./JobsList";

type Props = { user: SessionUser; onLogout: () => void };

export default function Dashboard({ user, onLogout }: Props) {
  const [nonce, setNonce] = useState(0);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <main className="min-h-screen bg-ink-950 text-ink-100">
      <header className="flex items-center justify-between border-b border-ink-800 px-6 py-4">
        <a
          href="/tools"
          className="text-2xl font-medium tracking-tight transition hover:text-ember-400"
        >
          ترجمان
        </a>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-ink-300">
            مجاني:{" "}
            <span className="text-ember-400">
              {user.free_credits_remaining}
            </span>{" "}
            دقيقة
            {user.credits_balance > 0 && (
              <>
                {" · "}مدفوع:{" "}
                <span className="text-ember-400">
                  {user.credits_balance}
                </span>{" "}
                دقيقة
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
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <NewJob onJobCreated={() => setNonce((n) => n + 1)} />
        <div>
          <h2 className="mb-3 text-lg font-medium">ترجماتك</h2>
          <JobsList refreshNonce={nonce} />
        </div>
      </section>
    </main>
  );
}
