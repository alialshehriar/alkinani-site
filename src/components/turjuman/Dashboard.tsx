import { logout, type SessionUser } from "../../lib/turjuman";

type Props = { user: SessionUser; onLogout: () => void };

export default function Dashboard({ user, onLogout }: Props) {
  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <main className="min-h-screen bg-ink-950 text-ink-100">
      <header className="flex items-center justify-between border-b border-ink-800 px-6 py-4">
        <a href="/tools" className="text-2xl font-medium tracking-tight hover:text-ember-400 transition">
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
                <span className="text-ember-400">{user.credits_balance}</span>{" "}
                دقيقة
              </>
            )}
          </span>
          <span dir="ltr" className="text-ink-400">{user.email}</span>
          <button onClick={handleLogout} className="text-ink-400 transition hover:text-ink-100">
            خروج
          </button>
        </div>
      </header>

      <section className="grid min-h-[60vh] place-items-center px-6 py-12">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-ember-400">
            جاهز للترجمة
          </p>
          <h2 className="text-3xl font-medium tracking-tight">
            ميزة الرفع تنزل قريباً
          </h2>
          <p className="text-ink-400 leading-relaxed">
            هذي المرحلة الأولى — تسجيل الدخول والحساب فقط. ميزة الترجمة الكاملة
            (رفع/لصق فيديو، ترجمة احترافية، مشغّل تفاعلي) تنزل في المرحلة
            التالية.
          </p>
          <p className="pt-4 text-sm text-ink-500">
            شكراً لإيمانك بالمنتج من البدايات.
          </p>
        </div>
      </section>
    </main>
  );
}
