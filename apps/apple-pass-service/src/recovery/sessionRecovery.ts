//
// Session Recovery Service for Apple Pass operations.
//
// Handles two concerns:
// 1. Operation Recovery — bulk operations (broadcast, geofence broadcast) that
//    were interrupted mid-flight are resumed from where they left off.
// 2. Push Retry — failed APNs push notifications are queued with exponential
//    backoff and retried automatically.
//
import crypto from "node:crypto";
import { SqliteStore } from "../storage/sqliteStore.js";
import { MemoryStore } from "../storage/memoryStore.js";
import { ApnsClient } from "../push/apns.js";
import { config } from "../config.js";

type Store = SqliteStore | MemoryStore;

export interface SessionRecoveryConfig {
  retryIntervalMs?: number;   // How often to process the retry queue (default: 30s)
  maxPushAttempts?: number;    // Max retry attempts per push (default: 5)
}

export class SessionRecoveryService {
  private store: Store;
  private apns: ApnsClient;
  private retryIntervalMs: number;
  private maxPushAttempts: number;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(store: Store, apns: ApnsClient, opts?: SessionRecoveryConfig) {
    this.store = store;
    this.apns = apns;
    this.retryIntervalMs = opts?.retryIntervalMs ?? 30_000;
    this.maxPushAttempts = opts?.maxPushAttempts ?? 5;
  }

  // Generate a unique operation ID.
  static operationId(): string {
    return `op_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  // Calculate next retry delay with exponential backoff: 2^attempt * 5 seconds.
  private nextRetryDelay(attempt: number): number {
    return Math.pow(2, attempt) * 5_000;
  }

  // Start the background retry loop.
  start(): void {
    if (this.retryTimer) return;
    console.log(`[recovery] Starting push retry loop (interval: ${this.retryIntervalMs}ms)`);
    this.retryTimer = setInterval(() => this.processRetryQueue(), this.retryIntervalMs);
    // Run recovery immediately on startup.
    this.recoverIncompleteOperations().catch(err =>
      console.error("[recovery] Error recovering operations:", err)
    );
  }

  stop(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
      console.log("[recovery] Stopped push retry loop");
    }
  }

  // Enqueue a failed push for later retry.
  enqueueFailed(pushToken: string, serialNumber: string, error: string): void {
    this.store.enqueuePushRetry({
      pushToken,
      serialNumber,
      attempts: 0,
      maxAttempts: this.maxPushAttempts,
      nextRetryAt: Date.now() + this.nextRetryDelay(0),
      lastError: error,
      createdAt: Date.now(),
    });
  }

  // Process the retry queue — called on a timer.
  async processRetryQueue(): Promise<{ retried: number; succeeded: number; failed: number }> {
    const now = Date.now();
    const entries = this.store.dequeuePushRetries(now);
    if (entries.length === 0) return { retried: 0, succeeded: 0, failed: 0 };

    console.log(`[recovery] Processing ${entries.length} push retry entries`);
    let succeeded = 0;
    let failed = 0;

    for (const entry of entries) {
      const result = await this.apns.sendEmptyPush(entry.pushToken);

      if (result.success) {
        this.store.removePushRetry(entry.id);
        succeeded++;
      } else {
        const nextAttempt = entry.attempts + 1;
        if (nextAttempt >= entry.maxAttempts) {
          console.warn(`[recovery] Push to ${entry.pushToken.slice(0, 8)}... exhausted after ${nextAttempt} attempts`);
        }
        this.store.updatePushRetry(entry.id, {
          attempts: nextAttempt,
          nextRetryAt: now + this.nextRetryDelay(nextAttempt),
          lastError: result.error,
        });
        failed++;
      }
    }

    console.log(`[recovery] Retry results: ${succeeded} succeeded, ${failed} failed`);
    return { retried: entries.length, succeeded, failed };
  }

  // Begin tracking a bulk operation.
  beginOperation(type: string, payload: any, totalItems: number): string {
    const id = SessionRecoveryService.operationId();
    const now = Date.now();
    this.store.createOperation({
      id,
      type,
      status: "in_progress",
      payload,
      processedItems: 0,
      totalItems,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  // Mark progress on an operation.
  markProgress(operationId: string, processedItems: number): void {
    this.store.updateOperation(operationId, { processedItems });
  }

  // Complete an operation.
  completeOperation(operationId: string): void {
    this.store.updateOperation(operationId, { status: "completed" });
  }

  // Fail an operation.
  failOperation(operationId: string, error: string): void {
    this.store.updateOperation(operationId, { status: "failed", error });
  }

  // On startup, find in_progress operations and attempt to resume them.
  async recoverIncompleteOperations(): Promise<void> {
    const incomplete = this.store.listOperations("in_progress");
    if (incomplete.length === 0) {
      console.log("[recovery] No incomplete operations to recover");
      return;
    }

    console.log(`[recovery] Found ${incomplete.length} incomplete operation(s) — attempting recovery`);

    for (const op of incomplete) {
      try {
        switch (op.type) {
          case "broadcast":
            await this.recoverBroadcast(op);
            break;
          case "bulk_geofence":
            await this.recoverBulkGeofence(op);
            break;
          default:
            console.warn(`[recovery] Unknown operation type "${op.type}" — marking failed`);
            this.failOperation(op.id, `Unknown operation type: ${op.type}`);
        }
      } catch (err: any) {
        console.error(`[recovery] Failed to recover operation ${op.id}:`, err.message);
        this.failOperation(op.id, err.message);
      }
    }
  }

  // Resume a broadcast from where it left off.
  private async recoverBroadcast(op: any): Promise<void> {
    const { message, promoCode, discount, expiresAt } = op.payload;
    const allPasses = this.store.listAllPasses();

    console.log(`[recovery] Resuming broadcast ${op.id} from item ${op.processedItems}/${allPasses.length}`);

    const remaining = allPasses.slice(op.processedItems);
    let processed = op.processedItems;

    for (const pass of remaining) {
      const passJson = { ...pass.passJson };
      const generic = { ...passJson.generic };

      const backFields = generic.backFields ?? [];
      const filtered = backFields.filter((f: any) => f.key !== "promo" && f.key !== "promoCode");
      filtered.push({ key: "promo", label: "Special Offer", value: message });
      if (promoCode) filtered.push({ key: "promoCode", label: "Promo Code", value: promoCode });

      if (discount) {
        generic.secondaryFields = generic.secondaryFields ?? [];
        const idx = generic.secondaryFields.findIndex((f: any) => f.key === "offer");
        const offerField = {
          key: "offer",
          label: "Offer",
          value: discount,
          ...(expiresAt ? { changeMessage: `Sale ends ${expiresAt}` } : {}),
        };
        if (idx >= 0) generic.secondaryFields[idx] = offerField;
        else generic.secondaryFields.push(offerField);
      }

      generic.backFields = filtered;
      passJson.generic = generic;

      this.store.upsertPass({ ...pass, passJson, updatedAt: Date.now() });

      // Push to devices, enqueue failures for retry.
      const pushTokens = this.store.getPushTokensForPass({
        passTypeIdentifier: config.passTypeIdentifier,
        serialNumber: pass.serialNumber,
      });
      for (const token of pushTokens) {
        const result = await this.apns.sendEmptyPush(token);
        if (!result.success) {
          this.enqueueFailed(token, pass.serialNumber, result.error ?? "unknown");
        }
      }

      processed++;
      this.markProgress(op.id, processed);
    }

    this.completeOperation(op.id);
    console.log(`[recovery] Broadcast ${op.id} recovered successfully`);
  }

  // Resume a bulk geofence operation from where it left off.
  private async recoverBulkGeofence(op: any): Promise<void> {
    const { latitude, longitude, relevantText, maxDistance } = op.payload;
    const allPasses = this.store.listAllPasses();

    console.log(`[recovery] Resuming bulk geofence ${op.id} from item ${op.processedItems}/${allPasses.length}`);

    const remaining = allPasses.slice(op.processedItems);
    let processed = op.processedItems;

    for (const pass of remaining) {
      const passJson = { ...pass.passJson };
      const locations = passJson.locations ?? [];

      locations.push({ latitude: Number(latitude), longitude: Number(longitude), relevantText });
      passJson.locations = locations;
      if (maxDistance) passJson.maxDistance = Number(maxDistance);

      this.store.upsertPass({ ...pass, passJson, updatedAt: Date.now() });

      const pushTokens = this.store.getPushTokensForPass({
        passTypeIdentifier: config.passTypeIdentifier,
        serialNumber: pass.serialNumber,
      });
      for (const token of pushTokens) {
        const result = await this.apns.sendEmptyPush(token);
        if (!result.success) {
          this.enqueueFailed(token, pass.serialNumber, result.error ?? "unknown");
        }
      }

      processed++;
      this.markProgress(op.id, processed);
    }

    this.completeOperation(op.id);
    console.log(`[recovery] Bulk geofence ${op.id} recovered successfully`);
  }
}
