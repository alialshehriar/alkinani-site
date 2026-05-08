type Props = { email: string; onChangeEmail: () => void };

export default function LoginPending({ email, onChangeEmail }: Props) {
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-ember-400">
          ترجمان · Turjuman
        </p>
        <h1 className="text-3xl font-medium tracking-tight">تحقّق من بريدك</h1>
        <p className="text-ink-400">
          أرسلنا رابط الدخول إلى{" "}
          <span dir="ltr" className="text-ink-100">
            {email}
          </span>
          .
          <br />
          الرابط صالح ١٥ دقيقة، يستخدم مرة واحدة.
        </p>
        <button
          onClick={onChangeEmail}
          className="text-sm text-ember-400 underline-offset-4 hover:underline"
        >
          استخدام بريد آخر
        </button>
      </div>
    </div>
  );
}
