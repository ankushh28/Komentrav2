import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM || 'Komentra <onboarding@resend.dev>';
const CONTACT_TO = 'admin@komentra.tech';

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required to send email');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

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

  const r = await getResend().emails.send({
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

export async function sendPasswordResetOtpEmail(toEmail, otp, username) {
  const html = `
  <div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px;\">
    <div style=\"text-align: center; margin-bottom: 24px;\">
      <div style=\"display:inline-flex; align-items:center; gap:8px;\">
        <div style=\"width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6,#d946ef);display:flex;align-items:center;justify-content:center;font-size:20px;\">🤖</div>
        <span style=\"font-size:22px;font-weight:800;letter-spacing:-0.5px;\">Komentra</span>
      </div>
    </div>
    <div style=\"background:linear-gradient(135deg,#eef2ff,#fae8ff);padding:32px;border-radius:18px;text-align:center;\">
      <h1 style=\"margin:0 0 8px;font-size:24px;color:#0f172a;\">Reset your password</h1>
      <p style=\"margin:0 0 24px;color:#475569;\">Hey ${username || 'there'} — use this code to reset your password:</p>
      <div style=\"font-size:44px;font-weight:800;letter-spacing:12px;color:#6d28d9;font-family:'SF Mono',Menlo,monospace;background:#fff;padding:20px;border-radius:14px;display:inline-block;\">${otp}</div>
      <p style=\"margin:24px 0 0;color:#64748b;font-size:13px;\">This code expires in 15 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
    <p style=\"margin-top:24px;text-align:center;color:#94a3b8;font-size:12px;\">Komentra - Instagram Comment Automation</p>
  </div>`;

  const r = await getResend().emails.send({
    from: FROM,
    to: toEmail,
    subject: `${otp} is your Komentra password reset code`,
    html,
  });
  return r;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendContactEmail(message) {
  const safe = {
    name: escapeHtml(message.name),
    email: escapeHtml(message.email),
    company: escapeHtml(message.company || 'Not provided'),
    instagram: escapeHtml(message.instagram || 'Not provided'),
    topic: escapeHtml(message.topic),
    body: escapeHtml(message.message).replace(/\n/g, '<br />'),
  };

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:32px;color:#0f172a;">
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:.08em;">Komentra contact request</p>
    <h1 style="margin:0 0 24px;font-size:24px;">${safe.topic} request from ${safe.name}</h1>
    <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="padding:16px;border-bottom:1px solid #e2e8f0;"><strong>Name:</strong> ${safe.name}</div>
      <div style="padding:16px;border-bottom:1px solid #e2e8f0;"><strong>Email:</strong> ${safe.email}</div>
      <div style="padding:16px;border-bottom:1px solid #e2e8f0;"><strong>Company:</strong> ${safe.company}</div>
      <div style="padding:16px;border-bottom:1px solid #e2e8f0;"><strong>Instagram:</strong> ${safe.instagram}</div>
      <div style="padding:16px;border-bottom:1px solid #e2e8f0;"><strong>Topic:</strong> ${safe.topic}</div>
      <div style="padding:16px;line-height:1.7;"><strong>Message:</strong><br />${safe.body}</div>
    </div>
  </div>`;

  return getResend().emails.send({
    from: FROM,
    to: CONTACT_TO,
    replyTo: message.email,
    subject: `[Komentra] ${message.topic} request from ${message.name}`,
    html,
  });
}
