import { useEffect, useState } from "react";
import {
  requestMagicLink,
  magicLinkErrorMessage,
  startGoogleLogin,
  startAppleLogin,
  requestPhoneOtp,
  verifyPhoneOtp,
  phoneAuthErrorMessage,
  fetchAuthProviders,
  type AuthProviders,
} from "../../lib/turjuman";

type Props = {
  onSent: (email: string) => void;     // email magic-link sent
  onLoggedIn: () => void;               // phone OTP verified → user has session
  initialError?: string | null;
};

type Mode = "menu" | "phone_request" | "phone_verify" | "email";

// Default to the conservative state until we hear back from the server.
// Apple + Google are usually the safest bets — they don't depend on DNS
// or SMS provider availability.
const DEFAULT_PROVIDERS: AuthProviders = {
  google: true,
  apple: true,
  phone: false,
  email_magic_link: false,
};

export default function LoginGate({ onSent, onLoggedIn, initialError }: Props) {
  const [mode, setMode] = useState<Mode>("menu");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [providers, setProviders] = useState<AuthProviders>(DEFAULT_PROVIDERS);

  useEffect(() => {
    let cancelled = false;
    fetchAuthProviders()
      .then((p) => { if (!cancelled) setProviders(p); })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <header className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.22em] text-ember-400">
            ترجمان · Turjuman
          </p>
          <h1 className="text-3xl sm:text-4xl font-medium tracking-tight">
            {mode === "phone_request" || mode === "phone_verify"
              ? "تسجيل برقم الجوال"
              : mode === "email"
                ? "تسجيل بالإيميل"
                : "اختر طريقة التسجيل"}
          </h1>
          <p className="text-sm text-ink-400">
            {mode === "menu"
              ? "كل الطرق آمنة، بدون باسوورد. ١٠ دقايق مجانية شهرياً."
              : null}
          </p>
        </header>

        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-300">
            {error}
          </p>
        )}

        {mode === "menu" && (
          <MenuView
            providers={providers}
            onPhone={() => { setError(null); setMode("phone_request"); }}
            onEmail={() => { setError(null); setMode("email"); }}
          />
        )}

        {mode === "phone_request" && (
          <PhoneRequestView
            onSent={() => setMode("phone_verify")}
            onError={setError}
            onBack={() => { setError(null); setMode("menu"); }}
          />
        )}

        {mode === "phone_verify" && (
          <PhoneVerifyView
            onLoggedIn={onLoggedIn}
            onError={setError}
            onBack={() => { setError(null); setMode("phone_request"); }}
          />
        )}

        {mode === "email" && (
          <EmailView
            onSent={onSent}
            onError={setError}
            onBack={() => { setError(null); setMode("menu"); }}
          />
        )}

        <p className="text-center text-[11px] text-ink-600">
          بدخولك توافق على{" "}
          <a href="/" className="hover:text-ember-400">شروط الاستخدام</a>.
        </p>
      </div>
    </div>
  );
}

function MenuView({
  providers, onPhone, onEmail,
}: { providers: AuthProviders; onPhone: () => void; onEmail: () => void }) {
  // Render disabled methods with a "متوفر قريباً" badge instead of letting
  // the user tap into a flow that's going to fail (SMS still on the console
  // stub, magic-link still blocked on Resend DNS verification).
  return (
    <div className="space-y-3">
      {providers.apple && (
        <button
          type="button"
          onClick={startAppleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-900 active:bg-black"
        >
          <AppleLogo />
          <span>تابع باستخدام Apple</span>
        </button>
      )}

      {providers.google && (
        <button
          type="button"
          onClick={startGoogleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-medium text-[#1F1F1F] transition hover:brightness-95 active:brightness-90"
        >
          <GoogleG />
          <span>تابع باستخدام Google</span>
        </button>
      )}

      {providers.phone ? (
        <button
          type="button"
          onClick={onPhone}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-ember-400/40 bg-ember-400/10 px-4 py-3 text-sm font-medium text-ember-300 transition hover:bg-ember-400/20"
        >
          <span aria-hidden>📱</span>
          <span>تابع برقم الجوال</span>
          <span className="rounded-full bg-ember-400/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-ember-300">SMS</span>
        </button>
      ) : (
        <DisabledRow icon="📱" label="تابع برقم الجوال" reason="قريباً" />
      )}

      {providers.email_magic_link ? (
        <button
          type="button"
          onClick={onEmail}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-ink-700/60 bg-ink-900/40 px-4 py-3 text-sm text-ink-300 transition hover:border-ink-500 hover:text-ink-100"
        >
          <span aria-hidden>✉</span>
          <span>تابع بالإيميل (رابط دخول)</span>
        </button>
      ) : (
        <DisabledRow icon="✉" label="تابع بالإيميل (رابط دخول)" reason="قريباً" />
      )}
    </div>
  );
}

function DisabledRow({ icon, label, reason }: { icon: string; label: string; reason: string }) {
  return (
    <div
      aria-disabled="true"
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-ink-800/60 bg-ink-900/20 px-4 py-3 text-sm text-ink-500 cursor-not-allowed"
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
      <span className="rounded-full bg-ink-700/40 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-ink-400">{reason}</span>
    </div>
  );
}

function EmailView({
  onSent, onError, onBack,
}: { onSent: (email: string) => void; onError: (e: string | null) => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setSubmitting(true);
    try {
      await requestMagicLink(email);
      onSent(email);
    } catch (err) {
      onError(magicLinkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        dir="ltr"
        type="email"
        autoComplete="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-ink-100 placeholder:text-ink-500 focus:border-ember-400 focus:outline-none"
      />
      <button
        type="submit"
        disabled={submitting || !email}
        className="w-full rounded-lg bg-ember-400 py-3 font-medium text-ink-950 transition hover:bg-ember-300 disabled:opacity-50"
      >
        {submitting ? "جاري الإرسال…" : "أرسل رابط الدخول"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="block w-full text-center text-xs text-ink-500 hover:text-ember-400"
      >
        ← رجوع
      </button>
    </form>
  );
}

function PhoneRequestView({
  onSent, onError, onBack,
}: { onSent: () => void; onError: (e: string | null) => void; onBack: () => void }) {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setSubmitting(true);
    try {
      await requestPhoneOtp(phone);
      // Stash phone for the verify step via sessionStorage. Avoids prop drilling
      // through the parent and survives an accidental refresh of the verify form.
      try { sessionStorage.setItem("tj_phone_pending", phone); } catch { /* ignore */ }
      onSent();
    } catch (err) {
      onError(phoneAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink-400">
          رقم الجوال
        </label>
        <input
          dir="ltr"
          type="tel"
          autoComplete="tel"
          required
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+9665XXXXXXXX"
          className="w-full rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-ink-100 placeholder:text-ink-500 focus:border-ember-400 focus:outline-none"
        />
        <p className="mt-2 text-[11px] text-ink-500">
          نرسل لك كود ٦ أرقام عبر SMS. صيغة دولية أو سعودية تبدأ بـ ٠٥.
        </p>
      </div>
      <button
        type="submit"
        disabled={submitting || !phone}
        className="w-full rounded-lg bg-ember-400 py-3 font-medium text-ink-950 transition hover:bg-ember-300 disabled:opacity-50"
      >
        {submitting ? "جاري الإرسال…" : "أرسل كود التحقق"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="block w-full text-center text-xs text-ink-500 hover:text-ember-400"
      >
        ← رجوع
      </button>
    </form>
  );
}

function PhoneVerifyView({
  onLoggedIn, onError, onBack,
}: { onLoggedIn: () => void; onError: (e: string | null) => void; onBack: () => void }) {
  const initial = (() => {
    try { return sessionStorage.getItem("tj_phone_pending") || ""; } catch { return ""; }
  })();
  const [phone] = useState(initial);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setSubmitting(true);
    try {
      await verifyPhoneOtp(phone, code);
      try { sessionStorage.removeItem("tj_phone_pending"); } catch { /* ignore */ }
      onLoggedIn();
    } catch (err) {
      onError(phoneAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="rounded-lg border border-ember-400/30 bg-ember-400/5 px-3 py-2 text-center text-sm text-ember-300">
        أرسلنا كود إلى <span dir="ltr">{phone || "رقمك"}</span>
      </p>
      <input
        dir="ltr"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="123456"
        className="w-full rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-center text-2xl tracking-[0.5em] text-ink-100 placeholder:text-ink-600 focus:border-ember-400 focus:outline-none"
      />
      <button
        type="submit"
        disabled={submitting || code.length !== 6}
        className="w-full rounded-lg bg-ember-400 py-3 font-medium text-ink-950 transition hover:bg-ember-300 disabled:opacity-50"
      >
        {submitting ? "جاري التحقق…" : "تحقق وادخل"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="block w-full text-center text-xs text-ink-500 hover:text-ember-400"
      >
        ← رقم ثاني
      </button>
    </form>
  );
}

function AppleLogo() {
  return (
    <svg width="16" height="18" viewBox="0 0 17 21" fill="currentColor" aria-hidden>
      <path d="M14.094 7.281c-.075.05-2.394 1.394-2.394 4.243 0 3.293 2.832 4.456 2.917 4.484-.013.07-.45 1.585-1.493 3.13-.93 1.358-1.901 2.713-3.379 2.713-1.477 0-1.857-.872-3.561-.872-1.66 0-2.252.9-3.604.9C1.227 21.879 0 20.594 0 17.96c0-2.49 1.515-3.768 1.515-3.768.93-.667 2.017-.844 2.434-.844 1.396 0 2.59.886 3.41.886.778 0 2.13-.94 3.733-.94.61 0 2.643.07 3.972 2.987M11.13 5.043C9.928 6.474 7.96 6.7 7.196 6.74c-.014-.05-.057-.5-.057-.946 0-.985.5-1.97 1.077-2.586C8.957 2.408 10.092 1.879 11.18 1.879c.043.45.057.873.057 1.318 0 .627-.207 1.346-.107 1.846"/>
    </svg>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
