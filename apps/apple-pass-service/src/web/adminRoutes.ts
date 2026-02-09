// Admin routes for sending updates and sales specials to all pass holders.
// These are internal endpoints you call from your dashboard / CMS / marketing tool.
// Protected by requireAdminAuth middleware (applied in index.ts).

import { Router } from "express";
import { MemoryStore } from "../storage/memoryStore.js";
import { SqliteStore } from "../storage/sqliteStore.js";
import { ApnsClient } from "../push/apns.js";
import { SessionRecoveryService } from "../recovery/sessionRecovery.js";
import { config } from "../config.js";

type Store = MemoryStore | SqliteStore;

export function adminRoutes(store: Store, apns?: ApnsClient, recovery?: SessionRecoveryService) {
  const r = Router();

  // Helper: send APNs push to all devices registered to a pass.
  // Failed pushes are enqueued for retry when recovery is available.
  async function pushToDevices(serialNumber: string) {
    const pushTokens = store.getPushTokensForPass({
      passTypeIdentifier: config.passTypeIdentifier,
      serialNumber,
    });
    if (pushTokens.length === 0 || !apns) return { pushed: 0, tokens: 0 };

    let succeeded = 0;
    const errors: string[] = [];

    for (const token of pushTokens) {
      const result = await apns.sendEmptyPush(token);
      if (result.success) {
        succeeded++;
      } else {
        errors.push(`${token.slice(0, 8)}...: ${result.error}`);
        if (recovery) {
          recovery.enqueueFailed(token, serialNumber, result.error ?? "unknown");
        }
      }
    }

    return { pushed: succeeded, tokens: pushTokens.length, errors };
  }

  // Update a single pass's fields (e.g., change points, tier, add promo message).
  // POST /admin/passes/:serialNumber/update
  r.post("/passes/:serialNumber/update", async (req, res) => {
    const { serialNumber } = req.params;
    const { fields } = req.body ?? {};

    const pass = store.getPass({
      passTypeIdentifier: config.passTypeIdentifier,
      serialNumber,
    });

    if (!pass) return res.status(404).json({ error: "Pass not found" });
    if (!fields) return res.status(400).json({ error: "fields object required" });

    const passJson = { ...pass.passJson };
    const generic = { ...passJson.generic };

    if (fields.primaryFields) generic.primaryFields = fields.primaryFields;
    if (fields.secondaryFields) generic.secondaryFields = fields.secondaryFields;
    if (fields.auxiliaryFields) generic.auxiliaryFields = fields.auxiliaryFields;
    if (fields.backFields) generic.backFields = fields.backFields;

    passJson.generic = generic;

    store.upsertPass({
      ...pass,
      passJson,
      updatedAt: Date.now(),
    });

    // Send APNs push to notify devices to re-fetch the pass.
    const pushResult = await pushToDevices(serialNumber);

    return res.json({
      status: "updated",
      serialNumber,
      updatedAt: Date.now(),
      registeredDevices: pushResult.tokens,
      pushed: pushResult.pushed,
    });
  });

  // Send a sales special / promo to ALL pass holders at once.
  // Tracked as a recoverable operation so it can resume after a crash.
  // POST /admin/broadcast
  r.post("/broadcast", async (req, res) => {
    const { message, promoCode, discount, expiresAt } = req.body ?? {};

    if (!message) return res.status(400).json({ error: "message required" });

    const allPasses = store.listAllPasses();

    // Track this bulk operation for crash recovery.
    const operationId = recovery
      ? recovery.beginOperation("broadcast", { message, promoCode, discount, expiresAt }, allPasses.length)
      : null;

    let updated = 0;
    let totalPushed = 0;

    try {
      for (const pass of allPasses) {
        const passJson = { ...pass.passJson };
        const generic = { ...passJson.generic };

        const backFields = generic.backFields ?? [];
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

        store.upsertPass({
          ...pass,
          passJson,
          updatedAt: Date.now(),
        });

        // Send APNs push for each pass.
        const pushResult = await pushToDevices(pass.serialNumber);
        totalPushed += pushResult.pushed;
        updated++;

        // Track progress so recovery knows where to resume.
        if (recovery && operationId) {
          recovery.markProgress(operationId, updated);
        }
      }

      if (recovery && operationId) {
        recovery.completeOperation(operationId);
      }
    } catch (err: any) {
      if (recovery && operationId) {
        recovery.failOperation(operationId, err.message);
      }
      throw err;
    }

    return res.json({
      status: "broadcast_sent",
      operationId: operationId ?? undefined,
      passesUpdated: updated,
      devicesPushed: totalPushed,
      message,
      promoCode: promoCode ?? null,
      discount: discount ?? null,
      expiresAt: expiresAt ?? null,
    });
  });

  // ─── GEOFENCING ───────────────────────────────────────────

  // Add a geofence location to a pass.
  r.post("/passes/:serialNumber/geofence", async (req, res) => {
    const { serialNumber } = req.params;
    const { latitude, longitude, relevantText, maxDistance } = req.body ?? {};

    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: "latitude and longitude required" });
    }
    if (!relevantText) {
      return res.status(400).json({ error: "relevantText required (shown on lock screen)" });
    }

    const pass = store.getPass({
      passTypeIdentifier: config.passTypeIdentifier,
      serialNumber,
    });

    if (!pass) return res.status(404).json({ error: "Pass not found" });

    const passJson = { ...pass.passJson };
    const locations = passJson.locations ?? [];

    locations.push({
      latitude: Number(latitude),
      longitude: Number(longitude),
      relevantText,
    });

    passJson.locations = locations;
    if (maxDistance) passJson.maxDistance = Number(maxDistance);

    store.upsertPass({ ...pass, passJson, updatedAt: Date.now() });

    const pushResult = await pushToDevices(serialNumber);

    return res.json({
      status: "geofence_added",
      serialNumber,
      totalLocations: locations.length,
      newLocation: { latitude, longitude, relevantText },
      devicesPushed: pushResult.pushed,
    });
  });

  // Remove a geofence location from a pass by index.
  r.delete("/passes/:serialNumber/geofence/:index", (req, res) => {
    const { serialNumber, index } = req.params;
    const idx = parseInt(index, 10);

    const pass = store.getPass({
      passTypeIdentifier: config.passTypeIdentifier,
      serialNumber,
    });

    if (!pass) return res.status(404).json({ error: "Pass not found" });

    const passJson = { ...pass.passJson };
    const locations = passJson.locations ?? [];

    if (idx < 0 || idx >= locations.length) {
      return res.status(400).json({ error: `Invalid index ${idx}. Pass has ${locations.length} locations.` });
    }

    const removed = locations.splice(idx, 1)[0];
    passJson.locations = locations;

    store.upsertPass({ ...pass, passJson, updatedAt: Date.now() });

    return res.json({
      status: "geofence_removed",
      serialNumber,
      removedLocation: removed,
      remainingLocations: locations.length,
    });
  });

  // Get all geofence locations for a pass.
  r.get("/passes/:serialNumber/geofence", (req, res) => {
    const { serialNumber } = req.params;

    const pass = store.getPass({
      passTypeIdentifier: config.passTypeIdentifier,
      serialNumber,
    });

    if (!pass) return res.status(404).json({ error: "Pass not found" });

    return res.json({
      serialNumber,
      locations: pass.passJson.locations ?? [],
      maxDistance: pass.passJson.maxDistance ?? null,
    });
  });

  // Bulk-add a geofence location to ALL passes.
  // Tracked as a recoverable operation.
  r.post("/geofence/broadcast", async (req, res) => {
    const { latitude, longitude, relevantText, maxDistance } = req.body ?? {};

    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: "latitude and longitude required" });
    }
    if (!relevantText) {
      return res.status(400).json({ error: "relevantText required" });
    }

    const allPasses = store.listAllPasses();

    // Track this bulk operation for crash recovery.
    const operationId = recovery
      ? recovery.beginOperation("bulk_geofence", { latitude, longitude, relevantText, maxDistance }, allPasses.length)
      : null;

    let updated = 0;
    let totalPushed = 0;

    try {
      for (const pass of allPasses) {
        const passJson = { ...pass.passJson };
        const locations = passJson.locations ?? [];

        locations.push({
          latitude: Number(latitude),
          longitude: Number(longitude),
          relevantText,
        });

        passJson.locations = locations;
        if (maxDistance) passJson.maxDistance = Number(maxDistance);

        store.upsertPass({ ...pass, passJson, updatedAt: Date.now() });

        const pushResult = await pushToDevices(pass.serialNumber);
        totalPushed += pushResult.pushed;
        updated++;

        if (recovery && operationId) {
          recovery.markProgress(operationId, updated);
        }
      }

      if (recovery && operationId) {
        recovery.completeOperation(operationId);
      }
    } catch (err: any) {
      if (recovery && operationId) {
        recovery.failOperation(operationId, err.message);
      }
      throw err;
    }

    return res.json({
      status: "geofence_broadcast",
      operationId: operationId ?? undefined,
      passesUpdated: updated,
      devicesPushed: totalPushed,
      location: { latitude, longitude, relevantText },
    });
  });

  // ─── PASSES LIST ────────────────────────────────────────

  r.get("/passes", (_req, res) => {
    const passes = store.listAllPasses().map(p => ({
      serialNumber: p.serialNumber,
      updatedAt: p.updatedAt,
      member: p.passJson?.generic?.primaryFields?.[0]?.value ?? "Unknown",
      tier: p.passJson?.generic?.secondaryFields?.find((f: any) => f.key === "tier")?.value ?? "None",
      geofenceLocations: (p.passJson.locations ?? []).length,
      registeredDevices: store.getPushTokensForPass({
        passTypeIdentifier: p.passTypeIdentifier,
        serialNumber: p.serialNumber,
      }).length,
    }));
    return res.json({ passes });
  });

  return r;
}
