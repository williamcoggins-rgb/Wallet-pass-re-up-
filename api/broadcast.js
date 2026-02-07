// Vercel serverless function: broadcast a sales special / promo to all pass holders.
// POST /api/broadcast
//
// Body: { message, promoCode?, discount?, expiresAt? }
//
// In production this would call the Apple / Google backend services.
// For now it demonstrates the API shape and validates input.

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { message, promoCode, discount, expiresAt } = req.body ?? {};

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  // In production, forward to:
  //   Apple:  POST https://<apple-service>/admin/broadcast
  //   Google: POST https://<google-service>/admin/broadcast
  return res.status(200).json({
    status: "broadcast_queued",
    message,
    promoCode: promoCode ?? null,
    discount: discount ?? null,
    expiresAt: expiresAt ?? null,
    note: "Connect this route to your Apple/Google backend services to send live promos.",
    apple_endpoint: "POST /admin/broadcast",
    google_endpoint: "POST /admin/broadcast",
  });
}
