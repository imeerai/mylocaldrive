const nodemailer = require('nodemailer');

// SMTP configuration via environment variables (defaults for Zoho)
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.zoho.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true';

// Create reusable SMTP transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER;
const CONTACT_TO = process.env.CONTACT_TO || 'abbaszameer234@gmail.com';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Send OTP email via Nodemailer
const sendOTPEmail = async (email, otp, type = 'verification', verificationToken) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials not configured');
  }

  const recipient = email;

  const subject = type === 'verification' ? 'Verify Your Email - MyDrive' : 'Reset Your Password - MyDrive';
  const heading = type === 'verification' ? 'Email Verification' : 'Password Reset';
  const message =
    type === 'verification'
      ? 'Welcome to MyDrive! Please verify your email address using the button below to complete your registration.'
      : 'We received a request to reset your password. Tap the button below to continue.';

  const actionUrl = `${APP_URL}/user/verify-otp-link?email=${encodeURIComponent(email)}&type=${encodeURIComponent(type === 'verification' ? 'registration' : type)}&token=${encodeURIComponent(verificationToken)}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%); padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; }
    .content { padding: 40px 30px; }
    .content h2 { color: #1f2937; font-size: 24px; margin: 0 0 20px 0; }
    .content p { color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0; }
    .otp-box { background: #f9fafb; border: 2px dashed #818cf8; border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0; }
    .otp-label { color: #6b7280; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .otp-code { font-size: 36px; font-weight: 700; color: #6366f1; letter-spacing: 8px; font-family: 'Courier New', monospace; }
    .verify-btn { display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; transition: background 0.3s; }
    .verify-btn:hover { background: #4f46e5; }
    .expiry { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 25px 0; }
    .expiry p { color: #92400e; margin: 0; font-size: 14px; }
    .footer { background: #1f2937; padding: 25px 30px; text-align: center; }
    .footer p { color: #9ca3af; font-size: 14px; margin: 5px 0; }
    .footer a { color: #818cf8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🗂️ MyDrive</h1>
    </div>
    <div class="content">
      <h2>${heading}</h2>
      <p>${message}</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${actionUrl}" class="verify-btn" style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; transition: background 0.3s;">
          ${type === 'verification' ? '✓ Verify & Continue' : 'Reset Password'}
        </a>
      </div>

      <div class="expiry">
        <p>⏰ <strong>Important:</strong> This verification link expires in 60 seconds. Please use it immediately.</p>
      </div>

      <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email or contact support if you have concerns.</p>
    </div>
    <div class="footer">
      <p>Powered by <a href="https://imeer.ai" target="_blank">IMEER.ai</a></p>
      <p>&copy; ${new Date().getFullYear()} MyDrive. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    const mailOptions = {
      from: `"MyDrive" <${FROM_EMAIL}>`,
      to: recipient,
      subject: subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    throw new Error('Failed to send email');
  }
};

// Send contact form email via Nodemailer
const sendContactEmail = async (email, senderName, subject, message) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials not configured');
  }

  const contactTo = CONTACT_TO;

  const safeSubject = escapeHtml(subject || 'New contact message');
  const safeMessage = escapeHtml(message || '');
  const safeSender = escapeHtml(senderName || 'MyDrive user');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #0b1224; color: #e5e7eb; }
    .container { max-width: 640px; margin: 0 auto; background: #0f172a; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.55); border: 1px solid #1f2a44; }
    .header { background: linear-gradient(135deg, #111827 0%, #1f2937 45%, #312e81 100%); padding: 32px 26px; text-align: left; }
    .header h1 { margin: 0; color: #e0e7ff; font-size: 26px; font-weight: 800; letter-spacing: -0.01em; }
    .header p { margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px; }
    .content { padding: 34px 30px; background: radial-gradient(circle at 20% 20%, rgba(129, 140, 248, 0.08), transparent 32%), radial-gradient(circle at 80% 0%, rgba(14, 165, 233, 0.08), transparent 30%), #0f172a; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; background: rgba(129, 140, 248, 0.15); color: #c7d2fe; font-size: 12px; letter-spacing: 0.04em; font-weight: 700; text-transform: uppercase; }
    .message-card { background: rgba(17, 24, 39, 0.85); border: 1px solid #1f2937; border-radius: 12px; padding: 24px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02); }
    .separator { height: 1px; background: linear-gradient(to right, transparent, #374151, transparent); margin: 20px 0; }
    .section-label { color: #9ca3af; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
    .from-name { color: #e5e7eb; font-size: 16px; font-weight: 600; margin: 0 0 6px 0; }
    .from-email { margin: 0 0 4px 0; }
    .from-email a { color: #a5b4fc; text-decoration: none; font-size: 14px; }
    .from-date { color: #94a3b8; font-size: 13px; margin: 0; }
    .subject-text { color: #e0e7ff; font-size: 18px; font-weight: 600; margin: 0; line-height: 1.4; }
    .message-text { color: #cbd5e1; font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; margin: 0; }
    .meta { color: #94a3b8; font-size: 13px; margin-top: 20px; }
    .footer { background: #0b1224; padding: 20px 24px; text-align: center; border-top: 1px solid #1f2937; }
    .footer p { color: #94a3b8; font-size: 13px; margin: 6px 0; }
    .footer a { color: #a5b4fc; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="pill">New contact message</div>
      <h1>MyDrive Support</h1>
      <p>Someone reached out through your contact form.</p>
    </div>

    <div class="content">
      <div class="message-card">
        <div class="section-label">From</div>
        <p class="from-name">${safeSender}</p>
        <p class="from-email"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
        <p class="from-date">${new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>

        <div class="separator"></div>

        <div class="section-label">Subject</div>
        <p class="subject-text">${safeSubject}</p>

        <div class="separator"></div>

        <div class="section-label">Message</div>
        <p class="message-text">${safeMessage}</p>
      </div>

      <p class="meta">Reply directly to the sender via ${escapeHtml(email)}.</p>
    </div>

    <div class="footer">
      <p>This notification was sent from your MyDrive contact form.</p>
      <p>Powered by <a href="https://imeer.ai" target="_blank">IMEER.ai</a> • © ${new Date().getFullYear()} MyDrive</p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    const mailOptions = {
      from: `"MyDrive" <${FROM_EMAIL}>`,
      to: contactTo,
      replyTo: email,
      subject: `MyDrive • New message from ${senderName || 'User'}`,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Contact email send error:', error);
    throw new Error('Failed to send email');
  }
};

// Optional: send acknowledgement email to the user
const sendAcknowledgementEmail = async (toEmail, subject) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials not configured');
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #0b1224; color: #e5e7eb; }
    .container { max-width: 560px; margin: 0 auto; background: #0f172a; border-radius: 14px; overflow: hidden; border: 1px solid #1f2937; box-shadow: 0 20px 50px rgba(0,0,0,0.55); }
    .header { background: linear-gradient(135deg, #111827 0%, #1f2937 50%, #312e81 100%); padding: 26px 24px; }
    .header h1 { margin: 0; color: #e0e7ff; font-size: 22px; font-weight: 800; }
    .content { padding: 26px 24px; background: #0f172a; }
    .pill { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: rgba(129, 140, 248, 0.15); color: #c7d2fe; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 700; }
    .card { background: rgba(17, 24, 39, 0.9); border: 1px solid #1f2937; border-radius: 12px; padding: 16px; margin-top: 14px; }
    .card p { margin: 8px 0; color: #cbd5e1; font-size: 14px; line-height: 1.6; }
    .footer { background: #0b1224; padding: 18px 24px; text-align: center; border-top: 1px solid #1f2937; }
    .footer p { color: #94a3b8; font-size: 13px; margin: 6px 0; }
    .footer a { color: #a5b4fc; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="pill">We got your message</div>
      <h1>Thanks for reaching out</h1>
    </div>
    <div class="content">
      <div class="card">
        <p>Hi there,</p>
        <p>We received your request about <strong style="color:#e0e7ff;">${escapeHtml(subject || 'your query')}</strong>. Our team will reply soon. If you need to add more details, just reply to this email.</p>
        <p style="color:#94a3b8; font-size: 13px;">This is an automated confirmation so you know your message arrived safely.</p>
      </div>
    </div>
    <div class="footer">
      <p>MyDrive Support</p>
      <p>Powered by <a href="https://imeer.ai" target="_blank">IMEER.ai</a> • © ${new Date().getFullYear()} MyDrive</p>
    </div>
  </div>
</body>
</html>
  `;

  const mailOptions = {
    from: `"MyDrive" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: `We received your message - MyDrive`,
    html: htmlContent,
  };

  await transporter.sendMail(mailOptions);
  return { success: true };
};

module.exports = { sendOTPEmail, sendContactEmail, sendAcknowledgementEmail };
