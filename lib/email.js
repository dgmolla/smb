/**
 * Email Service
 * Uses Resend API for sending email alerts
 * Set RESEND_API_KEY in environment to enable email alerts
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "alerts@resend.dev"; // Default Resend test domain

/**
 * Send an email using Resend API
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body (optional)
 * @param {string} options.text - Plain text body (optional)
 * @returns {Promise<Object>} Response from Resend
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set - email alerts disabled");
    console.log(`[Email would be sent] To: ${to}, Subject: ${subject}`);
    return { success: false, reason: "API key not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", error);
      return { success: false, reason: error };
    }

    const result = await response.json();
    console.log("Email sent successfully:", result.id);
    return { success: true, id: result.id };
  } catch (error) {
    console.error("Failed to send email:", error.message);
    return { success: false, reason: error.message };
  }
}
