// Admin routes for sending updates and sales specials to Google Wallet pass holders.
// These are internal endpoints you call from your dashboard / CMS / marketing tool.
// Failed notifications and location updates are enqueued for automatic retry.

import { Router } from "express";
import { GoogleWalletClient } from "./wallet/googleWalletClient.js";
import { RetryQueue } from "./recovery/retryQueue.js";

export function adminRoutes(client: GoogleWalletClient, retryQueue?: RetryQueue) {
  const r = Router();

  // Update a single pass (patch fields and optionally notify).
  // POST /admin/passes/update
  r.post("/passes/update", async (req, res) => {
    const { passObjectId, payload, notify } = req.body ?? {};

    if (!passObjectId) return res.status(400).json({ error: "passObjectId required" });

    try {
      // Re-upsert the pass with updated fields.
      // The client will patch the existing object.
      const result = await client.createOrUpdatePass({
        userId: passObjectId.split("_").pop() ?? "unknown",
        passKind: passObjectId.split("_").slice(-2, -1)[0] ?? "loyalty",
        payload: payload ?? {},
      });

      // Optionally send a notification to the user's device.
      if (notify && typeof notify === "string") {
        try {
          await client.notifyUser(passObjectId, notify);
        } catch (notifyErr: any) {
          // Enqueue notification for retry if it failed.
          if (retryQueue) {
            retryQueue.enqueue(
              () => client.notifyUser(passObjectId, notify).then(() => {}),
              `notify ${passObjectId}`,
              notifyErr.message,
            );
          }
        }
      }

      return res.json({
        status: "updated",
        ...result,
        notified: !!notify,
      });
    } catch (err: any) {
      console.error("admin update error:", err);
      return res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // Broadcast a promo / sales special to a list of pass holders.
  // Failed notifications are automatically enqueued for retry.
  // POST /admin/broadcast
  r.post("/broadcast", async (req, res) => {
    const { passObjectIds, message, promoCode, discount, expiresAt } = req.body ?? {};

    if (!message) return res.status(400).json({ error: "message required" });
    if (!passObjectIds || !Array.isArray(passObjectIds) || passObjectIds.length === 0) {
      return res.status(400).json({ error: "passObjectIds array required" });
    }

    const results: any[] = [];
    let succeeded = 0;
    let failed = 0;
    let enqueued = 0;

    for (const objectId of passObjectIds) {
      try {
        // Build the notification body with promo details.
        const body = [
          message,
          promoCode ? `Code: ${promoCode}` : null,
          discount ? `Discount: ${discount}` : null,
          expiresAt ? `Expires: ${expiresAt}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        await client.notifyUser(objectId, body);
        results.push({ objectId, status: "notified" });
        succeeded++;
      } catch (err: any) {
        results.push({ objectId, status: "failed", error: err.message });
        failed++;

        // Enqueue for automatic retry.
        if (retryQueue) {
          const notifyBody = [
            message,
            promoCode ? `Code: ${promoCode}` : null,
            discount ? `Discount: ${discount}` : null,
            expiresAt ? `Expires: ${expiresAt}` : null,
          ]
            .filter(Boolean)
            .join(" | ");

          retryQueue.enqueue(
            () => client.notifyUser(objectId, notifyBody).then(() => {}),
            `broadcast notify ${objectId}`,
            err.message,
          );
          enqueued++;
        }
      }
    }

    return res.json({
      status: "broadcast_sent",
      total: passObjectIds.length,
      succeeded,
      failed,
      enqueuedForRetry: enqueued,
      message,
      promoCode: promoCode ?? null,
      discount: discount ?? null,
      expiresAt: expiresAt ?? null,
      results,
    });
  });

  // ─── GEOFENCING ───────────────────────────────────────────

  // Update geofence locations on a single Google Wallet pass.
  // POST /admin/passes/geofence
  // Body: { passObjectId, locations: [{ latitude, longitude }] }
  r.post("/passes/geofence", async (req, res) => {
    const { passObjectId, locations } = req.body ?? {};

    if (!passObjectId) return res.status(400).json({ error: "passObjectId required" });
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: "locations array required (each with latitude, longitude)" });
    }

    try {
      const result = await client.updateLocations(passObjectId, locations);
      return res.json(result);
    } catch (err: any) {
      console.error("geofence update error:", err);
      return res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // Bulk-update geofence locations on multiple passes.
  // Failed updates are enqueued for automatic retry.
  // POST /admin/geofence/broadcast
  // Body: { passObjectIds, locations: [{ latitude, longitude }] }
  r.post("/geofence/broadcast", async (req, res) => {
    const { passObjectIds, locations } = req.body ?? {};

    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: "locations array required" });
    }
    if (!passObjectIds || !Array.isArray(passObjectIds) || passObjectIds.length === 0) {
      return res.status(400).json({ error: "passObjectIds array required" });
    }

    const results: any[] = [];
    let succeeded = 0;
    let failed = 0;
    let enqueued = 0;

    for (const objectId of passObjectIds) {
      try {
        await client.updateLocations(objectId, locations);
        results.push({ objectId, status: "locations_updated" });
        succeeded++;
      } catch (err: any) {
        results.push({ objectId, status: "failed", error: err.message });
        failed++;

        if (retryQueue) {
          retryQueue.enqueue(
            () => client.updateLocations(objectId, locations).then(() => {}),
            `geofence update ${objectId}`,
            err.message,
          );
          enqueued++;
        }
      }
    }

    return res.json({
      status: "geofence_broadcast",
      total: passObjectIds.length,
      succeeded,
      failed,
      enqueuedForRetry: enqueued,
      locationCount: locations.length,
      results,
    });
  });

  // ─── RECOVERY STATUS ──────────────────────────────────────

  // View retry queue status.
  r.get("/recovery/status", (_req, res) => {
    if (!retryQueue) return res.json({ retryQueue: "disabled" });
    return res.json({ retryQueue: retryQueue.status() });
  });

  // Manually trigger retry queue processing.
  r.post("/recovery/retry-now", async (_req, res) => {
    if (!retryQueue) return res.json({ retryQueue: "disabled" });
    const result = await retryQueue.processQueue();
    return res.json({ status: "processed", ...result });
  });

  return r;
}
