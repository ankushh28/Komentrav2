import { Resend } from 'resend';

const CONTACT_TO = 'admin@komentra.tech';

function fromAddress() {
  return process.env.EMAIL_FROM || 'Komentra <onboarding@resend.dev>';
}

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
    from: fromAddress(),
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
    from: fromAddress(),
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
    workspaceId: escapeHtml(message.workspaceId || ''),
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
      <div style="padding:16px;border-bottom:1px solid #e2e8f0;"><strong>Company / Workspace:</strong> ${safe.company}${safe.workspaceId ? ` <span style="color:#64748b;">(${safe.workspaceId})</span>` : ''}</div>
      <div style="padding:16px;border-bottom:1px solid #e2e8f0;"><strong>Instagram:</strong> ${safe.instagram}</div>
      <div style="padding:16px;border-bottom:1px solid #e2e8f0;"><strong>Topic:</strong> ${safe.topic}</div>
      <div style="padding:16px;line-height:1.7;"><strong>Message:</strong><br />${safe.body}</div>
    </div>
  </div>`;

  return getResend().emails.send({
    from: fromAddress(),
    to: CONTACT_TO,
    replyTo: message.email,
    subject: `[Komentra] ${message.topic} request from ${message.name}`,
    html,
  });
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function pauseEmailCopy(notification) {
  const automationName = notification.automationName || 'Instagram automation';
  const accountWide = notification.scope === 'account';
  const subject = accountWide
    ? `Action needed: @${notification.instagramUsername || 'Instagram'} automations paused`
    : `Action needed: ${automationName} paused`;
  const impact = accountWide
    ? `This pause affects all ${notification.affectedAutomationCount || 1} active automations connected to this Instagram account.`
    : 'This pause affects only this automation.';
  const reset = notification.canReset
    ? 'You can review the warning and manually reset the internal send limit from your dashboard.'
    : 'This safety pause cannot be manually reset. It will resume automatically when the pause expires.';
  return { subject, impact, reset };
}

export function renderAutomationPauseEmail(notification) {
  const copy = pauseEmailCopy(notification);
  const dashboardUrl = safeHttpUrl(notification.dashboardUrl);
  const postUrl = safeHttpUrl(notification.postPermalink);
  const thumbnailUrl = safeHttpUrl(notification.postThumbnail);
  const automationName = escapeHtml(notification.automationName || 'Instagram automation');
  const instagramUsername = escapeHtml(notification.instagramUsername ? `@${notification.instagramUsername}` : 'Instagram account');
  const reason = escapeHtml(notification.reason || 'Automation safety pause');
  const resumeAt = escapeHtml(notification.resumeAtLabel || 'See dashboard for status');
  const impact = escapeHtml(copy.impact);
  const reset = escapeHtml(copy.reset);
  const safeDashboardUrl = escapeHtml(dashboardUrl);
  const safePostUrl = escapeHtml(postUrl);
  const safeThumbnailUrl = escapeHtml(thumbnailUrl);

  const postBlock = postUrl ? `
    <tr><td style="padding:0 32px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr>
          ${thumbnailUrl ? `<td class="post-image" width="112" style="width:112px;padding:12px;vertical-align:middle;"><img src="${safeThumbnailUrl}" width="88" height="88" alt="Instagram post preview" style="display:block;width:88px;height:88px;border-radius:10px;object-fit:cover;"></td>` : ''}
          <td style="padding:16px;vertical-align:middle;"><p style="margin:0 0 8px;font-size:13px;color:#64748b;">Instagram post</p><a href="${safePostUrl}" style="font-size:14px;font-weight:700;color:#0f172a;text-decoration:underline;">View the affected post</a></td>
        </tr>
      </table>
    </td></tr>` : '';

  const html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<style>@media only screen and (max-width:600px){.email-shell{width:100%!important}.email-pad{padding-left:20px!important;padding-right:20px!important}.post-image{display:none!important}.cta{display:block!important;width:auto!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" class="email-shell" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border-collapse:separate;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
    <tr><td class="email-pad" style="padding:28px 32px 20px;border-bottom:1px solid #e2e8f0;"><span style="font-size:22px;font-weight:800;letter-spacing:-.5px;">Komentra</span><span style="float:right;padding:6px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;">PAUSED</span></td></tr>
    <tr><td class="email-pad" style="padding:32px 32px 18px;"><p style="margin:0 0 10px;color:#b45309;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">Automation needs attention</p><h1 style="margin:0 0 12px;font-size:27px;line-height:1.25;">${automationName} has been paused</h1><p style="margin:0;color:#475569;font-size:16px;line-height:1.6;">Komentra paused sending to protect ${instagramUsername}. ${impact}</p></td></tr>
    <tr><td class="email-pad" style="padding:0 32px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;"><tr><td style="padding:18px;"><p style="margin:0 0 6px;color:#9a3412;font-size:13px;font-weight:800;">Reason</p><p style="margin:0;color:#7c2d12;font-size:15px;line-height:1.55;">${reason}</p></td></tr></table></td></tr>
    ${postBlock}
    <tr><td class="email-pad" style="padding:0 32px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr><td style="padding:0 0 12px;color:#64748b;font-size:13px;">Scheduled resume</td><td align="right" style="padding:0 0 12px;font-size:14px;font-weight:700;">${resumeAt}</td></tr></table><p style="margin:0 0 22px;color:#475569;font-size:14px;line-height:1.6;">${reset} Comments skipped while paused are not replayed automatically.</p>${dashboardUrl ? `<a class="cta" href="${safeDashboardUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 20px;border-radius:10px;">Review automation</a>` : ''}</td></tr>
    ${dashboardUrl ? `<tr><td class="email-pad" style="padding:0 32px 28px;color:#94a3b8;font-size:11px;line-height:1.5;word-break:break-all;">Button not working? Open:<br><a href="${safeDashboardUrl}" style="color:#64748b;">${safeDashboardUrl}</a></td></tr>` : ''}
    <tr><td class="email-pad" style="padding:20px 32px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center;">Komentra operational notification</td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = [
    `${notification.automationName || 'Instagram automation'} has been paused`,
    `Instagram account: ${notification.instagramUsername ? `@${notification.instagramUsername}` : 'Instagram account'}`,
    `Reason: ${notification.reason || 'Automation safety pause'}`,
    `Scheduled resume: ${notification.resumeAtLabel || 'See dashboard for status'}`,
    copy.impact,
    copy.reset,
    'Comments skipped while paused are not replayed automatically.',
    postUrl ? `Affected post: ${postUrl}` : '',
    dashboardUrl ? `Review automation: ${dashboardUrl}` : '',
  ].filter(Boolean).join('\n\n');

  return { subject: copy.subject, html, text };
}

export async function sendAutomationPauseEmail(toEmail, notification) {
  const message = renderAutomationPauseEmail(notification);
  return getResend().emails.send({
    from: fromAddress(),
    to: toEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}
