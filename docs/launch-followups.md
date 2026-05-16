# Turjuman launch follow-ups

Two items below are technically blocked on Ali (account sign-ups + a real
credit card can't be done by an agent). The rails are pre-built — once the
human steps are done, each one is a single shell command.

---

## 0. Resend domain verification (يفتح magic-link email)

Resend رفض إرسال الإيميل لـ `noreply@alkinani.live` لأن الـ MX على
subdomain `send` مفقود. الـ DKIM verified ✓، الـ SPF TXT موجود ✓، اللي
ناقص هو MX record واحد فقط.

### الخطوات في Namecheap

1. سجّل دخول https://ap.www.namecheap.com → Domain List → alkinani.live →
   "Manage" → "Advanced DNS".
2. Add New Record:
   - Type: **MX Record**
   - Host: `send`
   - Mail Server: `feedback-smtp.eu-west-1.amazonses.com`
   - Priority: `10`
   - TTL: Auto
3. اضغط ✓ احفظ.
4. انتظر ٥-١٠ دقايق ثم نفّذ على VPS:
   ```bash
   ssh root@72.62.116.92 'KEY=$(grep "^RESEND_API_KEY=" /home/alkinani/htdocs/alkinani.live/.env | cut -d= -f2); curl -s -X POST -H "Authorization: Bearer $KEY" https://api.resend.com/domains/291711b0-ccab-4eaf-8563-60d3e20095fa/verify'
   ```
5. تأكّد الـ status صار `verified`:
   ```bash
   ssh root@72.62.116.92 'KEY=$(grep "^RESEND_API_KEY=" /home/alkinani/htdocs/alkinani.live/.env | cut -d= -f2); curl -s -H "Authorization: Bearer $KEY" https://api.resend.com/domains/291711b0-ccab-4eaf-8563-60d3e20095fa | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[\"status\"])"'
   ```
6. لما يصير verified، فعّل الـ UI:
   ```bash
   ssh root@72.62.116.92 'sudo -u alkinani bash -c "
   grep -q RESEND_DOMAIN_VERIFIED /home/alkinani/htdocs/alkinani.live/.env || echo \"RESEND_DOMAIN_VERIFIED=1\" >> /home/alkinani/htdocs/alkinani.live/.env
   pm2 restart alkinani --update-env
   "'
   ```
   الـ UI راح يبدأ يعرض زر "تابع بالإيميل" تلقائياً.

## 1. Phone OTP — Twilio Verify

**Choice locked: Twilio Verify** (vs. Twilio SMS / WhatsApp / Unifonic).
Why: provider-managed throttling, free trial, $0.05/SMS, works globally
including Saudi numbers, supports custom-code delivery so we keep our own
hashed-DB code path.

### Ali's 5-minute steps

ملاحظة: الـ UI يخفي زر "تابع برقم الجوال" تلقائياً حتى نفعّل Twilio.
لما تخلص الخطوات تحت، الزر يرجع يظهر بدون أي تعديل code.

1. Go to **https://twilio.com/try-twilio** and sign up (free trial, no card
   needed for verify SMS during trial credits).
2. In the console, hit **Verify → Services → Create new Service**. Call it
   `Turjuman OTP`. Channels: SMS only. Code length: 6.
3. Copy three values:
   - **Account SID** (top of dashboard, starts with `AC...`)
   - **Auth Token** (top of dashboard, click 👁 to reveal)
   - **Service SID** (Verify > Services > the one you just made, starts with `VA...`)

### Then run (on VPS as user alkinani)

```bash
ssh root@72.62.116.92
sudo -u alkinani bash /home/alkinani/htdocs/alkinani.live/scripts/setup-twilio-verify.sh \
  "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  "<auth_token>" \
  "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

The script:
- backs up `.env`
- sets `SMS_PROVIDER=twilio_verify` + the three Twilio vars
- restarts pm2 with `--update-env`
- shows the next 8 log lines (look for `sms=twilio_verify`)

Test:
```bash
curl -X POST https://alkinani.live/api/turjuman/auth/phone/request \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+9665XXXXXXXX"}'
```
expects `{ ok: true, channel: "sms" }` and a real SMS lands.

---

## 2. Lemon Squeezy — flip TEST → LIVE

Currently in TEST mode (variants `1630446` / `1630457` / `1630477`,
webhook `98273` HMAC-verified end-to-end via simulated order). The flip
needs LIVE products + a real-card test. The script handles the env swap
atomically.

### Ali's ~10-minute steps

1. **https://app.lemonsqueezy.com/products** → for each tier (Starter, Pro,
   Studio) pick the existing TEST product → "Duplicate" → toggle **Live
   mode** in the top-right of the dashboard → adjust pricing if you want
   different SAR amounts in LIVE → save.
2. For each LIVE product, copy the **Variant ID** from
   `Products > <name> > Variants > the row > "..." > Copy ID`.
3. **API → Generate API key** in LIVE mode. Save the key.
4. **Settings → Webhooks → Create webhook** in LIVE mode:
   - URL: `https://alkinani.live/api/turjuman/payments/webhook`
   - Events: `order_created`, `subscription_payment_success`
   - Copy the **signing secret**
5. **Real-card sanity** (single $14 Starter purchase, refundable from
   dashboard if you don't want it):
   - Open https://alkinani.live/tools/turjuman in incognito
   - Trigger the paywall, pay with your real card
   - Confirm: webhook fires (logs show `order_created applied=true`),
     `/api/turjuman/auth/me` shows `credits_balance += 60`.

### Then run (on VPS as user alkinani)

```bash
ssh root@72.62.116.92
sudo -u alkinani bash /home/alkinani/htdocs/alkinani.live/scripts/flip-lemon-to-live.sh \
  "<LEMON_API_KEY>"        \
  "<LEMON_WEBHOOK_SECRET>" \
  "<STARTER_VARIANT_ID>"   \
  "<PRO_VARIANT_ID>"       \
  "<STUDIO_VARIANT_ID>"
```

Script behaviour:
- backs up `.env` to `.env.bak.<ts>`
- upserts the 5 Lemon keys
- pm2 restart with `--update-env`
- probes `/api/turjuman/auth/me` for HTTP 200

**Rollback:** the backup line is printed at the end — single `cp` + `pm2
restart` reverts everything.

---

## 3. Optional: heavier Arabic burn-in font (IBM Plex / Tajawal)

Default burn-in font on the VPS is now **Noto Sans Arabic** (its Bold weight
ships with `fonts-noto-core` and is already on the host). Ali asked about
Tajawal Bold or IBM Plex Sans Arabic Bold — both are heavier and tend to
read better on busy backgrounds.

Neither is in Ubuntu 24.04's default repos in Arabic-capable form
(`fonts-ibm-plex` ships Latin-only; Tajawal isn't packaged at all). If we
want either of them as the primary face:

```bash
# IBM Plex Sans Arabic — from Google Fonts CDN tarball
ssh root@72.62.116.92 '
  mkdir -p /usr/share/fonts/truetype/ibm-plex-arabic
  cd /tmp && rm -rf ibm-plex-arabic && \
  wget -q https://github.com/IBM/plex/releases/latest/download/TrueType.zip && \
  unzip -q TrueType.zip && \
  cp "TrueType/IBM-Plex-Sans-Arabic/"*.ttf /usr/share/fonts/truetype/ibm-plex-arabic/ && \
  fc-cache -f
'

# Tajawal — Google Fonts download
ssh root@72.62.116.92 '
  mkdir -p /usr/share/fonts/truetype/tajawal
  cd /tmp && wget -q "https://fonts.google.com/download?family=Tajawal" -O tajawal.zip && \
  unzip -q -o tajawal.zip -d tajawal/ && \
  cp tajawal/static/*.ttf /usr/share/fonts/truetype/tajawal/ && \
  fc-cache -f
'
```

`server/turjuman/ffmpeg.js` already lists `IBM Plex Sans Arabic,Tajawal,Noto
Sans Arabic` — libass/fontconfig will start preferring whichever face is
installed first. **No code change** is needed after the install.
