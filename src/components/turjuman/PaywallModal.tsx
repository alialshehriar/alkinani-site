import { useEffect, useState } from "react";
import {
  fetchTiers,
  createCheckout,
  checkoutErrorMessage,
  type TierInfo,
  type CheckoutTier,
} from "../../lib/turjuman";

type Props = {
  isLoggedIn: boolean;
  onLogin: () => void;
  onClose: () => void;
};

const FALLBACK_TIERS: TierInfo[] = [
  { id: "starter", label: "Starter", minutes: 60, price_sar: 14, configured: false },
  { id: "pro", label: "Pro", minutes: 300, price_sar: 49, configured: false },
  { id: "studio", label: "Studio", minutes: 1000, price_sar: 149, configured: false },
];

const BADGES: Partial<Record<CheckoutTier, string>> = {
  pro: "الأنسب",
};

export default function PaywallModal({ isLoggedIn, onLogin, onClose }: Props) {
  const [tiers, setTiers] = useState<TierInfo[]>(FALLBACK_TIERS);
  const [busyTier, setBusyTier] = useState<CheckoutTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchTiers()
      .then((list) => { if (live && list.length) setTiers(list); })
      .catch(() => { /* keep fallback */ });
    return () => { live = false; };
  }, []);

  async function handleBuy(tier: CheckoutTier) {
    if (!isLoggedIn) {
      onLogin();
      return;
    }
    setError(null);
    setBusyTier(tier);
    try {
      const url = await createCheckout(tier);
      // Lemon hosted checkout — open in new tab so the user keeps the
      // Turjuman tab open. After payment they redirect back automatically.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(checkoutErrorMessage(e));
    } finally {
      setBusyTier(null);
    }
  }

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
          {tiers.map((t) => {
            const badge = BADGES[t.id];
            const disabled = !isLoggedIn || !t.configured || busyTier !== null;
            return (
              <div
                key={t.id}
                className={`relative rounded-xl border p-4 transition ${
                  badge
                    ? "border-ember-400/60 bg-ember-400/5"
                    : "border-ink-700/50 bg-ink-950/40"
                }`}
              >
                {badge && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-ember-400 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-950">
                    {badge}
                  </span>
                )}
                <p className="text-sm text-ink-400">{t.label}</p>
                <p className="mt-1 text-3xl font-medium">
                  {t.price_sar}<span className="text-sm text-ink-400"> ر.س</span>
                </p>
                <p className="mt-2 text-sm text-ink-300">
                  {t.minutes} <span className="text-ink-500">دقيقة</span>
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  ({(t.price_sar / t.minutes).toFixed(2)} ر / دقيقة)
                </p>
                <button
                  onClick={() => handleBuy(t.id)}
                  disabled={disabled}
                  className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    badge
                      ? "bg-gradient-to-br from-ember-500 to-ember-400 text-ink-950 hover:brightness-110"
                      : "border border-ember-400/40 bg-ember-400/10 text-ember-400 hover:bg-ember-400/20"
                  }`}
                >
                  {busyTier === t.id
                    ? "جاري الفتح…"
                    : !isLoggedIn
                      ? "سجّل أولاً"
                      : !t.configured
                        ? "قيد التفعيل"
                        : "اشتري الآن"}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-rose-400">{error}</p>
        )}

        <div className="mt-5 flex flex-col items-center gap-2 text-center">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="rounded-md border border-ink-700/60 bg-ink-950 px-2 py-1 text-[10px] font-semibold tracking-wide text-ink-300">مدى</span>
            <span className="rounded-md border border-ink-700/60 bg-ink-950 px-2 py-1 text-[10px] font-semibold tracking-wide text-ink-300">VISA</span>
            <span className="rounded-md border border-ink-700/60 bg-ink-950 px-2 py-1 text-[10px] font-semibold tracking-wide text-ink-300">Mastercard</span>
            <span className="flex items-center gap-1 rounded-md border border-ink-700/60 bg-ink-950 px-2 py-1 text-[10px] font-semibold tracking-wide text-ink-100">
              <svg width="10" height="12" viewBox="0 0 17 21" fill="currentColor" aria-hidden><path d="M14.094 7.281c-.075.05-2.394 1.394-2.394 4.243 0 3.293 2.832 4.456 2.917 4.484-.013.07-.45 1.585-1.493 3.13-.93 1.358-1.901 2.713-3.379 2.713-1.477 0-1.857-.872-3.561-.872-1.66 0-2.252.9-3.604.9C1.227 21.879 0 20.594 0 17.96c0-2.49 1.515-3.768 1.515-3.768.93-.667 2.017-.844 2.434-.844 1.396 0 2.59.886 3.41.886.778 0 2.13-.94 3.733-.94.61 0 2.643.07 3.972 2.987M11.13 5.043C9.928 6.474 7.96 6.7 7.196 6.74c-.014-.05-.057-.5-.057-.946 0-.985.5-1.97 1.077-2.586C8.957 2.408 10.092 1.879 11.18 1.879c.043.45.057.873.057 1.318 0 .627-.207 1.346-.107 1.846"/></svg>
              Pay
            </span>
            <span className="rounded-md border border-ink-700/60 bg-ink-950 px-2 py-1 text-[10px] font-semibold tracking-wide text-ink-300">G Pay</span>
          </div>
          <p className="text-[11px] text-ink-500">
            <span className="text-ember-400">Apple Pay على الايفون والماك</span> · بقية الطرق على كل المتصفحات · للاستفسار{" "}
            <a href="https://wa.me/966599988522" className="text-ember-400 underline-offset-2 hover:underline" target="_blank" rel="noreferrer">WhatsApp</a>
          </p>
          <p className="text-[10px] text-ink-600">الدفع عبر Lemon Squeezy · بيانات الكارت ما تمر علينا</p>
        </div>

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
