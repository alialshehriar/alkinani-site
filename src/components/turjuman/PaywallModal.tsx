type Props = {
  isLoggedIn: boolean;
  onLogin: () => void;
  onClose: () => void;
};

const TIERS = [
  { name: "Starter", minutes: 60, price: 14, badge: null },
  { name: "Pro", minutes: 300, price: 49, badge: "الأنسب" },
  { name: "Studio", minutes: 1000, price: 149, badge: null },
];

export default function PaywallModal({ isLoggedIn, onLogin, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/85 px-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-ink-700/40 bg-ink-900 p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="text-center mb-6">
          <p className="text-xs uppercase tracking-[0.22em] text-ember-400">
            استهلكت رصيدك المجاني
          </p>
          <h2 className="mt-2 text-3xl font-medium tracking-tight">
            {isLoggedIn ? "اختر باقة لمتابعة الترجمة" : "سجّل بإيميلك واستلم ١٠ دقايق إضافية"}
          </h2>
          <p className="mt-2 text-sm text-ink-400">
            بدون التزام شهري · الكريدت يبقى ٦ شهور · ادفع بمدى أو فيزا
          </p>
        </header>

        {!isLoggedIn && (
          <div className="mb-5 rounded-xl border border-ember-400/30 bg-ember-400/5 p-4 text-center">
            <p className="text-sm">
              <span className="font-medium text-ember-400">١٠ دقايق مجانية شهرياً</span>{" "}
              لو سجّلت بإيميلك (بدون باسوورد)
            </p>
            <button
              onClick={onLogin}
              className="mt-3 rounded-lg border border-ember-400/50 bg-ember-400/10 px-4 py-2 text-sm text-ember-400 transition hover:bg-ember-400/20"
            >
              سجّل الآن
            </button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className="relative rounded-xl border border-ink-700/50 bg-ink-950/40 p-4"
            >
              {t.badge && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-ember-400 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-950">
                  {t.badge}
                </span>
              )}
              <p className="text-sm text-ink-400">{t.name}</p>
              <p className="mt-1 text-3xl font-medium">
                {t.price}<span className="text-sm text-ink-400"> ر.س</span>
              </p>
              <p className="mt-2 text-sm text-ink-300">
                {t.minutes} <span className="text-ink-500">دقيقة</span>
              </p>
              <p className="mt-1 text-xs text-ink-500">
                ({(t.price / t.minutes).toFixed(2)} ر / دقيقة)
              </p>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-ink-500">
          الباقات المدفوعة قيد التفعيل النهائي · للحجز المبكر تواصل عبر <a href="https://wa.me/966599988522" className="text-ember-400 underline-offset-2 hover:underline" target="_blank" rel="noreferrer">WhatsApp</a>
        </p>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-ink-700 py-2 text-sm text-ink-300 transition hover:bg-ink-800/50"
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}
