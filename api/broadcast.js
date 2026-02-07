// Vercel serverless function: broadcast a sales special to all pass holders.
// POST /api/broadcast
// Body: { message, promoCode?, discount?, expiresAt?, googlePassObjectIds? }
// Forwards to Apple and Google backend services.

import { callBackend, verifyAuth } from "./_lib/backend.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  if (!verifyAuth(req)) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  const { message, promoCode, discount, expiresAt, googlePassObjectIds } = req.body ?? {};

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  const results = {};

  // Forward to Apple backend (broadcasts to all passes).
  if (process.env.APPLE_SERVICE_URL) {
    const apple = await callBackend(process.env.APPLE_SERVICE_URL, "/admin/broadcast", {
      method: "POST",
      body: { message, promoCode, discount, expiresAt },
    });
    results.apple = apple.data;
  }

  // Forward to Google backend (requires explicit pass object IDs).
  if (process.env.GOOGLE_SERVICE_URL && googlePassObjectIds?.length) {
    const google = await callBackend(process.env.GOOGLE_SERVICE_URL, "/admin/broadcast", {
      method: "POST",
      body: { passObjectIds: googlePassObjectIds, message, promoCode, discount, expiresAt },
    });
    results.google = google.data;
  }

  return res.status(200).json({ status: "broadcast_sent", message, results });
}
