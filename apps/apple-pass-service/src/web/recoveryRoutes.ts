// Admin routes for inspecting and managing session recovery state.
// Protected by requireAdminAuth middleware (applied in index.ts).

import { Router } from "express";
import { SessionRecoveryService } from "../recovery/sessionRecovery.js";
import { MemoryStore } from "../storage/memoryStore.js";
import { SqliteStore } from "../storage/sqliteStore.js";

type Store = MemoryStore | SqliteStore;

export function recoveryRoutes(store: Store, recovery: SessionRecoveryService) {
  const r = Router();

  // Overview of recovery state.
  r.get("/status", (_req, res) => {
    const operations = store.listOperations();
    const retryCount = store.countPushRetries();
    const inProgress = operations.filter(o => o.status === "in_progress");
    const failed = operations.filter(o => o.status === "failed");
    const completed = operations.filter(o => o.status === "completed");

    return res.json({
      operations: {
        total: operations.length,
        inProgress: inProgress.length,
        failed: failed.length,
        completed: completed.length,
      },
      pushRetryQueue: retryCount,
    });
  });

  // List all tracked operations, optionally filtered by status.
  r.get("/operations", (req, res) => {
    const status = req.query.status as string | undefined;
    const operations = store.listOperations(status);
    return res.json({ operations });
  });

  // Get a specific operation by ID.
  r.get("/operations/:id", (req, res) => {
    const op = store.getOperation(req.params.id);
    if (!op) return res.status(404).json({ error: "Operation not found" });
    return res.json(op);
  });

  // Delete a completed or failed operation record.
  r.delete("/operations/:id", (req, res) => {
    const op = store.getOperation(req.params.id);
    if (!op) return res.status(404).json({ error: "Operation not found" });
    if (op.status === "in_progress") {
      return res.status(409).json({ error: "Cannot delete an in-progress operation" });
    }
    store.deleteOperation(req.params.id);
    return res.json({ status: "deleted", id: req.params.id });
  });

  // Manually trigger retry queue processing.
  r.post("/retry-now", async (_req, res) => {
    const result = await recovery.processRetryQueue();
    return res.json({ status: "processed", ...result });
  });

  // Purge exhausted retry entries (those that exceeded max attempts).
  r.delete("/retries/exhausted", (_req, res) => {
    const purged = store.purgeExhaustedRetries();
    return res.json({ status: "purged", count: purged });
  });

  // Manually recover incomplete operations.
  r.post("/recover", async (_req, res) => {
    await recovery.recoverIncompleteOperations();
    return res.json({ status: "recovery_triggered" });
  });

  return r;
}
