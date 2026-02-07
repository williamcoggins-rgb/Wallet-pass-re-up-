// Admin routes for sending updates and sales specials to Google Wallet pass holders.
// These are internal endpoints you call from your dashboard / CMS / marketing tool.

import { Router } from "express";
import { GoogleWalletClient } from "./wallet/googleWalletClient.js";

export function adminRoutes(client: GoogleWalletClient) {
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
        await client.notifyUser(passObjectId, notify);
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
      }
    }

    return res.json({
      status: "broadcast_sent",
      total: passObjectIds.length,
      succeeded,
      failed,
      message,
      promoCode: promoCode ?? null,
      discount: discount ?? null,
      expiresAt: expiresAt ?? null,
      results,
    });
  });

  return r;
}
