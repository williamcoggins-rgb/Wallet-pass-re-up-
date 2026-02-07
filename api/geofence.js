// Vercel serverless function: manage geofence locations.
// POST /api/geofence — add geofence to all passes (broadcast)
// Body: { latitude, longitude, relevantText, maxDistance? }
// Forwards to both Apple and Google backend services.

import { callBackend, verifyAuth } from "./_lib/backend.js";

export default async function handler(req, res) {
  if (req.method === "POST") {
    if (!verifyAuth(req)) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    const { latitude, longitude, relevantText, maxDistance, googlePassObjectIds, googleLocations } = req.body ?? {};

    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: "latitude and longitude required" });
    }
    if (!relevantText) {
      return res.status(400).json({ error: "relevantText required" });
    }

    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({ error: `Invalid latitude: ${latitude}. Must be -90 to 90.` });
    }
    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: `Invalid longitude: ${longitude}. Must be -180 to 180.` });
    }

    const results = {};

    // Forward to Apple backend — broadcasts geofence to all passes.
    if (process.env.APPLE_SERVICE_URL) {
      const apple = await callBackend(process.env.APPLE_SERVICE_URL, "/admin/geofence/broadcast", {
        method: "POST",
        body: { latitude, longitude, relevantText, maxDistance },
      });
      results.apple = apple.data;
    }

    // Forward to Google backend — requires explicit pass object IDs.
    if (process.env.GOOGLE_SERVICE_URL && googlePassObjectIds?.length) {
      const locations = googleLocations || [{ latitude, longitude }];
      const google = await callBackend(process.env.GOOGLE_SERVICE_URL, "/admin/geofence/broadcast", {
        method: "POST",
        body: { passObjectIds: googlePassObjectIds, locations },
      });
      results.google = google.data;
    }

    return res.status(200).json({ status: "geofence_broadcast_sent", results });
  }

  return res.status(405).json({ error: "Method not allowed. Use POST." });
}
