import express from "express";
import morgan from "morgan";
import crypto from "node:crypto";
import { config } from "./config.js";
import { SqliteStore } from "./storage/sqliteStore.js";
import { MemoryStore } from "./storage/memoryStore.js";
import { passkitRoutes } from "./web/passkitRoutes.js";
import { adminRoutes } from "./web/adminRoutes.js";
import { recoveryRoutes } from "./web/recoveryRoutes.js";
import { requireAdminAuth } from "./web/authMiddleware.js";
import { ApnsClient } from "./push/apns.js";
import { SessionRecoveryService } from "./recovery/sessionRecovery.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// Use SQLite for persistent storage, fall back to MemoryStore if better-sqlite3 isn't available.
let store: SqliteStore | MemoryStore;
try {
  store = new SqliteStore();
  console.log("Using SQLite persistent storage (data/passes.db)");
} catch (err) {
  console.warn("SQLite unavailable, falling back to in-memory store:", (err as Error).message);
  store = new MemoryStore();
}

// APNs client for sending push notifications to Apple devices.
const apns = new ApnsClient({
  keyPath: process.env.APNS_KEY_PATH ?? "./secrets/apns-auth-key.p8",
  keyId: process.env.APNS_KEY_ID ?? "",
  teamId: config.teamIdentifier,
  passTypeIdentifier: config.passTypeIdentifier,
  production: process.env.NODE_ENV === "production",
});

// Session recovery: resumes interrupted bulk operations and retries failed push notifications.
const recovery = new SessionRecoveryService(store, apns, {
  retryIntervalMs: Number(process.env.RECOVERY_RETRY_INTERVAL_MS ?? 30_000),
  maxPushAttempts: Number(process.env.RECOVERY_MAX_PUSH_ATTEMPTS ?? 5),
});
recovery.start();

// Seed a demo pass record if the database is empty.
const existingPasses = store.listAllPasses();
if (existingPasses.length === 0) {
  const serialNumber = "SERIAL-" + Date.now();
  const authenticationToken = crypto.randomBytes(16).toString("hex");

  store.upsertPass({
    passTypeIdentifier: config.passTypeIdentifier,
    serialNumber,
    authenticationToken,
    updatedAt: Date.now(),
    passJson: {
      formatVersion: 1,
      passTypeIdentifier: config.passTypeIdentifier,
      serialNumber,
      teamIdentifier: config.teamIdentifier,
      organizationName: config.organizationName,
      description: config.description,
      logoText: "ReUp",
      authenticationToken,
      webServiceURL: config.webServiceURL,
      generic: {
        primaryFields: [{ key: "member", label: "Member", value: "Jane Doe" }],
        secondaryFields: [{ key: "tier", label: "Tier", value: "Gold" }]
      },
      barcodes: [
        {
          format: "PKBarcodeFormatQR",
          message: `member:${serialNumber}`,
          messageEncoding: "iso-8859-1"
        }
      ],
      locations: config.defaultLocations,
      maxDistance: 500
    }
  });
  console.log(`Seeded demo pass: ${serialNumber}`);
} else {
  console.log(`Database has ${existingPasses.length} existing pass(es)`);
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// PassKit web service endpoints (Apple device communication — no admin auth).
app.use("/passes", passkitRoutes(store));

// Admin endpoints — protected by API key.
app.use("/admin", requireAdminAuth, adminRoutes(store, apns, recovery));

// Recovery management endpoints — protected by API key.
app.use("/admin/recovery", requireAdminAuth, recoveryRoutes(store, recovery));

// Convenience endpoint to list demo pass info.
app.get("/demo.pkpass", (_req, res) => {
  const passes = store.listAllPasses();
  const demo = passes[0];
  if (!demo) return res.json({ note: "No passes in database yet." });
  res.json({
    note: "Use PassKit endpoints under /passes for real device flows.",
    passTypeIdentifier: demo.passTypeIdentifier,
    serialNumber: demo.serialNumber,
    authenticationToken: demo.authenticationToken,
    hint: "GET /passes/v1/passes/:passTypeIdentifier/:serialNumber with Authorization: ApplePass <token>"
  });
});

app.listen(config.port, () => {
  console.log(`apple-pass-service listening on :${config.port}`);
});
