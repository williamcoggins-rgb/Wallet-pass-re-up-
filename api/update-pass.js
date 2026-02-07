// Vercel serverless function: update a single pass.
// POST /api/update-pass
// Body: { serialNumber, fields, googlePassObjectId? }
// Forwards to Apple and/or Google backend services.

import { callBackend, verifyAuth } from "./_lib/backend.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  if (!verifyAuth(req)) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  const { serialNumber, fields, googlePassObjectId, googlePayload } = req.body ?? {};

  if (!serialNumber && !googlePassObjectId) {
    return res.status(400).json({ error: "serialNumber (Apple) or googlePassObjectId (Google) required" });
  }

  const results = {};

  // Forward to Apple backend.
  if (serialNumber && process.env.APPLE_SERVICE_URL) {
    const apple = await callBackend(process.env.APPLE_SERVICE_URL, `/admin/passes/${serialNumber}/update`, {
      method: "POST",
      body: { fields },
    });
    results.apple = apple.data;
  }

  // Forward to Google backend.
  if (googlePassObjectId && process.env.GOOGLE_SERVICE_URL) {
    const google = await callBackend(process.env.GOOGLE_SERVICE_URL, "/admin/passes/update", {
      method: "POST",
      body: { passObjectId: googlePassObjectId, payload: googlePayload },
    });
    results.google = google.data;
  }

  return res.status(200).json({ status: "update_sent", results });
}
