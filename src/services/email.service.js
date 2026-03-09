// src/services/email.service.js
async function sendEmail(to, name, subject, text) {
  if (!process.env.SENDGRID_API_KEY) return;
  const fromEmail = process.env.EMAIL_FROM;
  if (!fromEmail) return;
  try {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:20px;background:#f7f6f2;color:#1a1a18;">
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2ded5;">
  <div style="margin-bottom:22px;"><span style="font-size:22px;font-weight:800;">Weka<span style="color:#1a6b38">Soko</span></span></div>
  <div style="white-space:pre-wrap;font-size:15px;line-height:1.85;color:#333;">${text.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
  <hr style="margin:28px 0;border:none;border-top:1px solid #e2ded5;"/>
  <p style="font-size:11px;color:#aaa;margin:0;">Weka Soko · Kenya's Smartest Resell Platform · <a href="mailto:${fromEmail}?subject=unsubscribe" style="color:#aaa;">Unsubscribe</a></p>
</div></body></html>`;
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name }] }],
        from: { email: fromEmail, name: "Weka Soko" },
        reply_to: { email: fromEmail, name: "Weka Soko" },
        subject,
        headers: { "List-Unsubscribe": `<mailto:${fromEmail}?subject=unsubscribe>` },
        content: [{ type: "text/plain", value: text }, { type: "text/html", value: html }],
      }),
    });
    if (!res.ok) { const e = await res.text(); console.error("[Email] SendGrid error:", res.status, e); }
    else console.log(`[Email] Sent to ${to} — "${subject}"`);
  } catch (err) { console.error("[Email] failed:", err.message); }
}

module.exports = { sendEmail };
