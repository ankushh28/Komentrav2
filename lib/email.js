import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'Komentra <onboarding@resend.dev>';

export async function sendOtpEmail(toEmail, otp, username) {
  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display:inline-flex; align-items:center; gap:8px;">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6,#d946ef);display:flex;align-items:center;justify-content:center;font-size:20px;">🤖</div>
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;">Komentra</span>
      </div>
    </div>
    <div style="background:linear-gradient(135deg,#eef2ff,#fae8ff);padding:32px;border-radius:18px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:24px;color:#0f172a;">Verify your email</h1>
      <p style="margin:0 0 24px;color:#475569;">Hey ${username || 'there'} — use this code to finish creating your account:</p>
      <div style="font-size:44px;font-weight:800;letter-spacing:12px;color:#6d28d9;font-family:'SF Mono',Menlo,monospace;background:#fff;padding:20px;border-radius:14px;display:inline-block;">${otp}</div>
      <p style="margin:24px 0 0;color:#64748b;font-size:13px;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>
    <p style="margin-top:24px;text-align:center;color:#94a3b8;font-size:12px;">Komentra - Instagram Comment Automation</p>
  </div>`;

  const r = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${otp} is your Komentra verification code`,
    html,
  });
  return r;
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
