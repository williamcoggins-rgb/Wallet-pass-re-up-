// Vercel serverless function: list all passes (admin overview).
// GET /api/passes
// Fetches from Apple backend and returns aggregated pass list.

import { callBackend, verifyAuth } from "./_lib/backend.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  if (!verifyAuth(req)) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  const results = { apple: null, google: null };

  // Fetch passes from Apple backend.
  if (process.env.APPLE_SERVICE_URL) {
    const apple = await callBackend(process.env.APPLE_SERVICE_URL, "/admin/passes", { method: "GET" });
    results.apple = apple.data;
  }

  return res.status(200).json(results);
}
