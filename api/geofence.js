// Vercel serverless function: manage geofence locations on wallet passes.
// POST /api/geofence — add/update geofence locations
// GET  /api/geofence — get current geofence locations
//
// POST Body: {
//   locations: [{ latitude, longitude, relevantText }],
//   maxDistance?: number (meters, default ~100m for Apple, ~300m for Google)
// }
//
// In production this would call the Apple / Google backend services.
// For now it demonstrates the API shape and validates input.

export default function handler(req, res) {
  if (req.method === "GET") {
    // Return demo geofence locations.
    return res.status(200).json({
      locations: [
        {
          latitude: 40.7128,
          longitude: -74.006,
          relevantText: "Welcome to ReUp! Show your pass for rewards.",
        },
      ],
      maxDistance: 500,
      note: "Connect this route to your Apple/Google backend services for live data.",
      apple_endpoint: "GET /admin/passes/:serialNumber/geofence",
      google_endpoint: "POST /admin/passes/geofence",
    });
  }

  if (req.method === "POST") {
    const { locations, maxDistance } = req.body ?? {};

    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({
        error: "locations array required. Each entry: { latitude, longitude, relevantText }",
      });
    }

    // Validate each location.
    for (const loc of locations) {
      if (loc.latitude == null || loc.longitude == null) {
        return res.status(400).json({ error: "Each location needs latitude and longitude" });
      }
      if (loc.latitude < -90 || loc.latitude > 90) {
        return res.status(400).json({ error: `Invalid latitude: ${loc.latitude}. Must be -90 to 90.` });
      }
      if (loc.longitude < -180 || loc.longitude > 180) {
        return res.status(400).json({ error: `Invalid longitude: ${loc.longitude}. Must be -180 to 180.` });
      }
    }

    return res.status(200).json({
      status: "geofence_queued",
      locations,
      maxDistance: maxDistance ?? 500,
      note: "Connect this route to your Apple/Google backend services to push live geofences.",
      apple_endpoint: "POST /admin/passes/:serialNumber/geofence",
      apple_broadcast: "POST /admin/geofence/broadcast",
      google_endpoint: "POST /admin/passes/geofence",
      google_broadcast: "POST /admin/geofence/broadcast",
    });
  }

  return res.status(405).json({ error: "Method not allowed. Use GET or POST." });
}
