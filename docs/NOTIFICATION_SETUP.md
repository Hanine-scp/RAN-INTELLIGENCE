# Email & SMS Configuration Guide

Your notification system requires proper configuration to send OTP codes via email and SMS. Here's how to set it up:

##  Current Status
- ✓ Email (SMTP): **Configured but domain invalid**
- ✗ SMS (Vonage): **NOT configured - API keys empty**
- ⚠ Dev Mode: **DISABLED** (AUTH_DEV_MODE=false, AUTH_SKIP_OTP=false)

---

## 1️ Email Configuration (Mailtrap)

### Problem
The sender domain `no-reply@votre-domaine-verifie.com` is rejected by Mailtrap because:
- It's a placeholder (French for "your-verified-domain.com")
- Mailtrap only allows sending from **verified domains** or **their default domain**

### Solution: Use Mailtrap Sandbox Domain

1. **Option A: Use Mailtrap's Free Sandbox** (Easiest)
   ```
   # Get your unique Mailtrap domain:
   MAILTRAP_API_TOKEN=959bd9db1e76b0eeeca679ce86f71150
   SMTP_HOST=live.smtp.mailtrap.io
   SMTP_PORT=587
   SMTP_USER=api
   SMTP_PASS=959bd9db1e76b0eeeca679ce86f71150
   SMTP_FROM=RAN Intelligence <hello@sandboxa1b2c3d4.mailosaur.io>
   # Replace with your actual sandbox domain from Mailtrap dashboard
   ```

2. **Option B: Use Your Own Verified Domain**
   - Login to Mailtrap.io
   - Go to: Settings → Domains → Add Domain
   - Add your domain (e.g., `notifications.yourcompany.com`)
   - Verify ownership via DNS records
   - Use: `SMTP_FROM=RAN Intelligence <no-reply@yourcompany.com>`

3. **To Get Your Mailtrap Sandbox Domain:**
   - Go to https://mailtrap.io/inboxes
   - Select your inbox
   - Click "SMTP Settings"
   - Look for "From Address" field
   - Copy the sandbox domain (it looks like: `hello@sandboxa1b2c3d4.mailosaur.io`)

---

## 2️ SMS Configuration (Vonage)

### Prerequisites
- Vonage API account (https://www.vonage.com/)
- Phone number credit or trial account
- API credentials

### Setup Steps

1. **Create Vonage Account**
   ```
   https://www.vonage.com/communications-apis/sms/
   ```

2. **Get API Credentials**
   - Login to Vonage Dashboard: https://dashboard.nexmo.com/
   - Navigation: Settings → API settings → Copy API Key & API Secret
   - **Do NOT use placeholder credentials** (e.g., "abc123")

3. **Update `.env.auth`**
   ```env
   SMS_PROVIDER=vonage
   VONAGE_API_KEY=your-actual-api-key-here
   VONAGE_API_SECRET=your-actual-api-secret-here
   VONAGE_BRAND=RANIntel
   VONAGE_CODE_LENGTH=6
   ```

4. **Test SMS Sending**
   ```bash
   curl -X POST http://127.0.0.1:8010/auth/signup \
     -H 'Content-Type: application/json' \
     -d '{
       "email":"test@gmail.com",
       "phone":"+21650000000",
       "password":"TestPassword123!",
       "full_name":"Test User",
       "job_profile":"data_analyst_bi",
       "signup_access_key":"7ioEjyYQxObKLmVhcoxmxw"
     }'
   ```

---

## 3️ Fallback Options

### Alternative Email: AWS SES
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-username
SMTP_PASS=your-ses-password
SMTP_FROM=RAN Intelligence <noreply@yourdomain.com>
SMTP_USE_TLS=true
```

### Alternative SMS: Twilio
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC123456789...
TWILIO_AUTH_TOKEN=your-auth-token...
TWILIO_FROM_NUMBER=+1234567890
```

---

## 4️ Test Your Configuration

### Test Email
```bash
# Start backend with new config
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010 --reload

# Signup
curl -X POST http://127.0.0.1:8010/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "email":"your-email@gmail.com",
    "phone":"+21650000000",
    "password":"TestPassword123!",
    "full_name":"Test User",
    "job_profile":"data_analyst_bi",
    "signup_access_key":"7ioEjyYQxObKLmVhcoxmxw"
  }'
```

Expected response:
```json
{
  "user_id": 123,
  "message": "Signup successful. OTP codes sent to email and phone."
}
```

**Check Mailtrap inbox** for the OTP email:
- Go to https://mailtrap.io/inboxes
- Look for email from "RAN Intelligence <your-smtp-from>"

### Test SMS
- Check your phone for SMS from "RANIntel" with OTP code
- If using Vonage sandbox, SMS will be delivered to sandbox numbers only

---

## 5️ Troubleshooting

### Email Not Received
❌ **Error**: `Sending from domain votre-domaine-verifie.com is not allowed`
✅ **Fix**: Update `SMTP_FROM` to use Mailtrap sandbox domain

❌ **Error**: `Could not find sender: <email@domain.com>`
✅ **Fix**: Domain not verified in Mailtrap. Use sandbox domain or verify your domain.

### SMS Not Received
❌ **Error**: `Twilio Messages API not configured`
✅ **Fix**: Add Vonage API credentials (not Twilio), or switch to Twilio if needed

❌ **Error**: `Vonage API authentication failed`
✅ **Fix**: Check VONAGE_API_KEY and VONAGE_API_SECRET are not empty/placeholder

---

## 6️ Development Mode

### Current Settings
```env
AUTH_DEV_MODE=false          # Production mode - OTP codes NOT shown in UI
AUTH_SKIP_OTP=false          # OTP verification REQUIRED
AUTH_NOTIFICATIONS_ENABLED=true
```

### For Testing Without Real SMS/Email
```env
AUTH_DEV_MODE=true           # Show OTP codes in response
AUTH_SKIP_OTP=true           # Don't require OTP verification
# Signup response will include: dev_email_code, dev_phone_code
```

---

## 7️ Current Configuration

### In `.env.auth`
```env
# Email (Mailtrap)
MAILTRAP_API_TOKEN=959bd9db1e76b0eeeca679ce86f71150
SMTP_HOST=live.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=api
SMTP_PASS=959bd9db1e76b0eeeca679ce86f71150
SMTP_FROM=RAN Intelligence <noreply@mailtest.io>  # ← UPDATE THIS!
SMTP_USE_TLS=true

# SMS (Vonage) - NOT CONFIGURED
SMS_PROVIDER=vonage
VONAGE_API_KEY=                                    # ← ADD YOUR KEY
VONAGE_API_SECRET=                                # ← ADD YOUR SECRET
VONAGE_BRAND=RANIntel
VONAGE_CODE_LENGTH=6
```

---

## 📋 Checklist

- [ ] Email domain is verified (use sandbox domain or your domain)
- [ ] Vonage API key is added (not empty)
- [ ] Vonage API secret is added (not empty)
- [ ] AUTH_DEV_MODE=false (production mode enabled)
- [ ] AUTH_SKIP_OTP=false (OTP verification enabled)
- [ ] Backend restarted with new `.env.auth` values
- [ ] Signup test completed successfully
- [ ] OTP email received in Mailtrap inbox
- [ ] OTP SMS received on phone

---

## 🔗 Resources

- Mailtrap Docs: https://mailtrap.io/blog/mailtrap-smtp/
- Vonage SMS API: https://www.vonage.com/communications-apis/sms/
- Twilio Docs: https://www.twilio.com/docs/sms

---

## Questions?

Check the backend logs for detailed error messages:
```
ERROR:src.services.notification_service:Email delivery failed to ...
WARNING:src.services.notification_service:Twilio Messages API not configured
```
