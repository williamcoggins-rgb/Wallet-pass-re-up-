// Admin routes for sending updates and sales specials to all pass holders.
// These are internal endpoints you call from your dashboard / CMS / marketing tool.

import { Router } from "express";
import { MemoryStore } from "../storage/memoryStore.js";
import { config } from "../config.js";

export function adminRoutes(store: MemoryStore) {
  const r = Router();

  // Update a single pass's fields (e.g., change points, tier, add promo message).
  // POST /admin/passes/:serialNumber/update
  r.post("/passes/:serialNumber/update", (req, res) => {
    const { serialNumber } = req.params;
    const { fields } = req.body ?? {};

    const pass = store.getPass({
      passTypeIdentifier: config.passTypeIdentifier,
      serialNumber,
    });

    if (!pass) return res.status(404).json({ error: "Pass not found" });
    if (!fields) return res.status(400).json({ error: "fields object required" });

    // Merge updated fields into the pass JSON.
    // Supports updating: primaryFields, secondaryFields, auxiliaryFields, backFields
    const passJson = { ...pass.passJson };
    const generic = { ...passJson.generic };

    if (fields.primaryFields) generic.primaryFields = fields.primaryFields;
    if (fields.secondaryFields) generic.secondaryFields = fields.secondaryFields;
    if (fields.auxiliaryFields) generic.auxiliaryFields = fields.auxiliaryFields;
    if (fields.backFields) generic.backFields = fields.backFields;

    passJson.generic = generic;

    // Update the stored pass with new data and a new timestamp.
    // The new timestamp tells Apple devices "this pass changed, re-download it."
    store.upsertPass({
      ...pass,
      passJson,
      updatedAt: Date.now(),
    });

    // In production, you'd send an APNs push to all registered devices here
    // so their phones know to re-fetch the updated pass.
    const pushTokens = store.getPushTokensForPass({
      passTypeIdentifier: config.passTypeIdentifier,
      serialNumber,
    });

    return res.json({
      status: "updated",
      serialNumber,
      updatedAt: Date.now(),
      registeredDevices: pushTokens.length,
      note: pushTokens.length > 0
        ? "APNs push needed to notify devices (not yet wired)"
        : "No devices registered yet — pass will update when next opened",
    });
  });

  // Send a sales special / promo to ALL pass holders at once.
  // POST /admin/broadcast
  r.post("/broadcast", (req, res) => {
    const { message, promoCode, discount, expiresAt } = req.body ?? {};

    if (!message) return res.status(400).json({ error: "message required" });

    const allPasses = store.listAllPasses();
    let updated = 0;

    for (const pass of allPasses) {
      const passJson = { ...pass.passJson };
      const generic = { ...passJson.generic };

      // Add or update the back of the pass with the promo.
      // "backFields" show up when the user flips the card over.
      const backFields = generic.backFields ?? [];

      // Remove previous promo if exists, then add new one.
      const filtered = backFields.filter((f: any) => f.key !== "promo" && f.key !== "promoCode");

      filtered.push({
        key: "promo",
        label: "Special Offer",
        value: message,
      });

      if (promoCode) {
        filtered.push({
          key: "promoCode",
          label: "Promo Code",
          value: promoCode,
        });
      }

      if (discount) {
        // Update a secondary field to show the discount on the front
        generic.secondaryFields = generic.secondaryFields ?? [];
        const existingPromo = generic.secondaryFields.findIndex((f: any) => f.key === "offer");
        const offerField = {
          key: "offer",
          label: "Offer",
          value: discount,
          ...(expiresAt ? { changeMessage: `Sale ends ${expiresAt}` } : {}),
        };
        if (existingPromo >= 0) {
          generic.secondaryFields[existingPromo] = offerField;
        } else {
          generic.secondaryFields.push(offerField);
        }
      }

      generic.backFields = filtered;
      passJson.generic = generic;

      // Mark as updated so devices know to re-fetch.
      store.upsertPass({
        ...pass,
        passJson,
        updatedAt: Date.now(),
      });

      updated++;
    }

    // In production, send APNs push to all registered devices.
    return res.json({
      status: "broadcast_sent",
      passesUpdated: updated,
      message,
      promoCode: promoCode ?? null,
      discount: discount ?? null,
      expiresAt: expiresAt ?? null,
      note: "APNs push needed to notify devices in real-time (not yet wired)",
    });
  });

  // List all passes (admin overview).
  // GET /admin/passes
  r.get("/passes", (_req, res) => {
    const passes = store.listAllPasses().map(p => ({
      serialNumber: p.serialNumber,
      updatedAt: p.updatedAt,
      member: p.passJson?.generic?.primaryFields?.[0]?.value ?? "Unknown",
      tier: p.passJson?.generic?.secondaryFields?.find((f: any) => f.key === "tier")?.value ?? "None",
      registeredDevices: store.getPushTokensForPass({
        passTypeIdentifier: p.passTypeIdentifier,
        serialNumber: p.serialNumber,
      }).length,
    }));
    return res.json({ passes });
  });

  return r;
}
