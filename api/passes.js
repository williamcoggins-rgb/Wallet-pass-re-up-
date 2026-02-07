// Vercel serverless function: list all passes (admin overview).
// GET /api/passes
//
// In production this would query the Apple / Google backend services.
// For now it returns a demo response showing the expected data shape.

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  // Demo response — in production, aggregate from Apple + Google backends.
  return res.status(200).json({
    passes: [
      {
        platform: "apple",
        serialNumber: "SERIAL-demo",
        member: "Jane Doe",
        tier: "Gold",
        updatedAt: Date.now(),
        registeredDevices: 0,
      },
      {
        platform: "google",
        objectId: "ISSUER_ID.loyalty_demo",
        member: "Jane Doe",
        tier: "Gold",
        updatedAt: Date.now(),
      },
    ],
    note: "Connect this route to your Apple/Google backend services for live data.",
  });
}
