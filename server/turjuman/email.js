// Resend email wrapper with a graceful dev fallback: if RESEND_API_KEY is
// missing, log the would-be link to the server console and return ok=true.
// Lets local development proceed without external dependencies.

export async function sendMagicLinkEmail({ apiKey, from, to, link }) {
  if (!apiKey) {
    // Dev mode: print the link so the developer can copy/paste it.
    console.log(`[turjuman:email-dev] would send to ${to}`);
    console.log(`[turjuman:email-dev] link: ${link}`);
    return { ok: true, devFallback: true };
  }

  const subject = "ترجمان · سجّل دخولك / Sign in to Turjuman";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html: htmlBody(link),
        text: textBody(link),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function htmlBody(link) {
  return `<!doctype html>
<html dir="auto">
<body style="font-family:Tajawal,Inter,system-ui,sans-serif;background:#06080a;color:#e3e7eb;padding:40px;">
  <h1 style="color:#ffb347;font-weight:500;">ترجمان</h1>
  <p>اضغط الرابط أدناه لتسجيل الدخول. الرابط صالح لمدة ١٥ دقيقة، ولا يمكن استخدامه إلا مرة واحدة.</p>
  <p style="margin:24px 0;">
    <a href="${link}" style="background:#ffb347;color:#06080a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;">دخول</a>
  </p>
  <p style="color:#6c7884;font-size:12px;">إذا لم تطلب هذا الرابط، تجاهل هذه الرسالة.</p>
  <hr style="border:0;border-top:1px solid #232a31;margin:32px 0;" />
  <p>Click the button above to sign in. The link is valid for 15 minutes and is single-use.</p>
</body>
</html>`;
}

function textBody(link) {
  return `ترجمان · سجّل دخولك\n\n${link}\n\nصالح ١٥ دقيقة، استخدام واحد.`;
}
