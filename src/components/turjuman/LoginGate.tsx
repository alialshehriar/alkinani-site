import { useState } from "react";
import { requestMagicLink, magicLinkErrorMessage } from "../../lib/turjuman";

type Props = {
  onSent: (email: string) => void;
  initialError?: string | null;
};

export default function LoginGate({ onSent, initialError }: Props) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestMagicLink(email);
      onSent(email);
    } catch (err) {
      setError(magicLinkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
        <header className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.22em] text-ember-400">
            ترجمان · Turjuman
          </p>
          <h1 className="text-4xl font-medium tracking-tight">سجّل بدخولك</h1>
          <p className="text-ink-400">
            اكتب بريدك. نرسل لك رابط دخول من غير باسوورد.
          </p>
        </header>
        <input
          dir="ltr"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-ink-100 placeholder:text-ink-500 focus:border-ember-400 focus:outline-none"
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-ember-400 py-3 font-medium text-ink-950 transition hover:bg-ember-300 disabled:opacity-50"
        >
          {submitting ? "جاري الإرسال..." : "أرسل رابط الدخول"}
        </button>
        <p className="text-center text-xs text-ink-500">
          بدخولك توافق على{" "}
          <a href="/" className="hover:text-ember-400">شروط الاستخدام</a>.
        </p>
      </form>
    </div>
  );
}
