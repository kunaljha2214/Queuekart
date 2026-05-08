const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for email OTP delivery`);
  }
  return value;
}

async function sendOtpEmail({ toEmail, toName, otp, expiryMinutes = 5 }) {
  const apiKey = getRequiredEnv('BREVO_API_KEY');
  const senderEmail = getRequiredEnv('BREVO_SENDER_EMAIL');
  const senderName = process.env.BREVO_SENDER_NAME || 'QueueKart';

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: toEmail,
          name: toName || toEmail,
        },
      ],
      subject: 'Your QueueKart OTP',
      htmlContent: `
        <p>Hello ${toName || 'there'},</p>
        <p>Your QueueKart OTP is:</p>
        <h2 style="letter-spacing:2px;">${otp}</h2>
        <p>This OTP will expire in ${expiryMinutes} minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      `,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo send failed (${response.status}): ${errorBody}`);
  }
}

module.exports = {
  sendOtpEmail,
};
