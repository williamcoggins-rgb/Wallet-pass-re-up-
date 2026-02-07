// Vercel serverless function: update a single pass.
// POST /api/update-pass
//
// Body: { serialNumber, fields: { primaryFields?, secondaryFields?, auxiliaryFields?, backFields? } }
//
// In production this would call the Apple / Google backend services.
// For now it demonstrates the API shape and validates input.

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { serialNumber, fields } = req.body ?? {};

  if (!serialNumber) {
    return res.status(400).json({ error: "serialNumber is required" });
  }
  if (!fields || typeof fields !== "object") {
    return res.status(400).json({ error: "fields object is required" });
  }

  // In production, forward to:
  //   Apple:  POST https://<apple-service>/admin/passes/:serialNumber/update
  //   Google: POST https://<google-service>/admin/passes/update
  return res.status(200).json({
    status: "update_queued",
    serialNumber,
    fields,
    note: "Connect this route to your Apple/Google backend services to push live updates.",
    apple_endpoint: "POST /admin/passes/:serialNumber/update",
    google_endpoint: "POST /admin/passes/update",
  });
}
