// SMS / WhatsApp OTP delivery. Provider-agnostic.
// Configured via SMS_PROVIDER env var. Switch by changing one line.
//
// Supported:
//   - "twilio_sms"     SMS via Twilio Programmable Messaging
//   - "twilio_verify"  Twilio Verify v2 (recommended; Twilio handles attempts/throttling)
//   - "twilio_whatsapp" WhatsApp via Twilio (free first 1K conversations/mo)
//   - "console"        dev fallback — prints code to server log instead of sending
//
// All providers implement a single shape:
//   sendPhoneOtp({ phone, code, config }) → { ok, channel?, error? }

export function readSmsConfigFromEnv(env = process.env) {
  const provider = (env.SMS_PROVIDER || "console").trim();
  if (provider === "console") {
    return { provider };
  }
  if (provider === "twilio_sms" || provider === "twilio_verify" || provider === "twilio_whatsapp") {
    return {
      provider,
      twilioAccountSid: env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: env.TWILIO_AUTH_TOKEN,
      // For twilio_sms / twilio_whatsapp:
      twilioFromNumber: env.TWILIO_FROM_NUMBER,
      twilioWhatsappFrom: env.TWILIO_WHATSAPP_FROM,
      // For twilio_verify (provider-managed code; we don't pass our own code):
      twilioVerifyServiceSid: env.TWILIO_VERIFY_SERVICE_SID,
    };
  }
  return { provider: "console" };
}

export async function sendPhoneOtp({ phone, code, config }) {
  if (!config?.provider || config.provider === "console") {
    console.log(`[turjuman/sms] DEV OTP for ${phone}: ${code}`);
    return { ok: true, channel: "console" };
  }
  if (config.provider === "twilio_sms") return sendTwilioSms({ phone, code, config });
  if (config.provider === "twilio_whatsapp") return sendTwilioWhatsapp({ phone, code, config });
  if (config.provider === "twilio_verify") return sendTwilioVerify({ phone, code, config });
  return { ok: false, error: "unknown_provider:" + config.provider };
}

async function twilioPost(config, path, body) {
  const auth = "Basic " + Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}${path}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `twilio_${res.status}:${json.message || ""}` };
  return { ok: true, json };
}

async function twilioVerifyPost(config, body) {
  const auth = "Basic " + Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64");
  const res = await fetch(`https://verify.twilio.com/v2/Services/${config.twilioVerifyServiceSid}/Verifications`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `twilio_verify_${res.status}:${json.message || ""}` };
  return { ok: true, json };
}

async function sendTwilioSms({ phone, code, config }) {
  if (!config.twilioFromNumber) return { ok: false, error: "twilio_from_missing" };
  const body = `كود ترجمان: ${code}\nصالح ١٠ دقايق. لا تشارك الكود.`;
  const r = await twilioPost(config, "/Messages.json", {
    To: phone,
    From: config.twilioFromNumber,
    Body: body,
  });
  return r.ok ? { ok: true, channel: "sms" } : r;
}

async function sendTwilioWhatsapp({ phone, code, config }) {
  if (!config.twilioWhatsappFrom) return { ok: false, error: "twilio_whatsapp_from_missing" };
  const body = `كود ترجمان: *${code}*\nصالح ١٠ دقايق. لا تشاركه مع أحد.`;
  const r = await twilioPost(config, "/Messages.json", {
    To: `whatsapp:${phone}`,
    From: `whatsapp:${config.twilioWhatsappFrom}`,
    Body: body,
  });
  return r.ok ? { ok: true, channel: "whatsapp" } : r;
}

// Twilio Verify generates the code itself. We ignore our `code` param and let
// Twilio manage delivery, retries, and throttling. The code lives in Twilio's
// system; on /verify our route still hashes our own DB code first, but if the
// provider is twilio_verify we should use checkVerification instead. (This
// project keeps the simple hash-in-DB path and only uses Verify for delivery.
// Switch to checkVerification once we want Twilio's anti-fraud signals too.)
async function sendTwilioVerify({ phone, code, config }) {
  if (!config.twilioVerifyServiceSid) return { ok: false, error: "twilio_verify_service_missing" };
  // CustomCode lets us deliver OUR code through Twilio's system. Requires the
  // Verify service to be configured with "Custom Code" enabled. Falls back to
  // SMS channel.
  const r = await twilioVerifyPost(config, {
    To: phone,
    Channel: "sms",
    CustomCode: code,
  });
  return r.ok ? { ok: true, channel: "sms" } : r;
}
